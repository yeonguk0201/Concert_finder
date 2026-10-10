import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { createAccountDeletionHandler } from '../supabase/functions/_shared/account-deletion.mjs'

test('deletion endpoint rejects unauthenticated, mismatched and unconfirmed requests without deleting', async () => {
  const deleted = []
  const handler = createAccountDeletionHandler({ authenticate: async token => token === 'valid' ? { id: 'a' } : null, deleteUser: async id => deleted.push(id) })
  const request = (token, body = { expectedUserId: 'a', confirmation: '계정 삭제' }, method = 'POST') => new Request('https://example.test/delete', {
    method, headers: token ? { authorization: `Bearer ${token}` } : {}, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  })
  assert.equal((await handler(request(null))).status, 401)
  assert.equal((await handler(request('expired'))).status, 401)
  assert.equal((await handler(request('valid', { expectedUserId: 'b', confirmation: '계정 삭제' }))).status, 409)
  assert.equal((await handler(request('valid', { expectedUserId: 'a' }))).status, 400)
  assert.equal((await handler(request(null, null, 'GET'))).status, 405)
  assert.equal((await handler(request(null, null, 'OPTIONS'))).status, 204)
  assert.deepEqual(deleted, [])
  const success = await handler(request('valid'))
  assert.equal(success.status, 200)
  assert.deepEqual(await success.json(), { deleted: true })
  assert.deepEqual(deleted, ['a'])
  const failing = createAccountDeletionHandler({ authenticate: async () => ({ id: 'a' }), deleteUser: async () => { throw new Error('secret') } })
  const failure = await failing(request('valid'))
  assert.equal(failure.status, 503)
  assert.ok(!(await failure.text()).includes('secret'))
})

test('auth deletion cascades private delivery attempts, devices and saves; another user and catalog survive', async () => {
  const db = new PGlite()
  const a = '00000000-0000-0000-0000-000000000001', b = '00000000-0000-0000-0000-000000000002'
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`)
    for (const file of ['202610060001_initial.sql','202610070001_admin_review.sql','202610080001_ingestion.sql','202610080002_realtime.sql','202610090001_notifications.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    }
    await db.query('insert into auth.users values ($1),($2)', [a,b])
    const band = (await db.query("insert into public.bands(name,country_code) values('Deletion probe','KR') returning id")).rows[0].id
    const concert = (await db.query("insert into public.concerts(title,format) values('Probe','solo') returning id")).rows[0].id
    const schedule = (await db.query('insert into public.ticket_schedules(concert_id) values($1) returning id',[concert])).rows[0].id
    for (const user of [a,b]) {
      await db.query('insert into public.band_follows(user_id,band_id) values($1,$2)',[user,band])
      await db.query('insert into public.saved_schedules(user_id,ticket_schedule_id) values($1,$2)',[user,schedule])
      await db.query('insert into public.notification_preferences(user_id,announcements,ticket_reminders) values($1,true,true)',[user])
      const device = (await db.query("insert into private.push_devices(user_id,endpoint,p256dh,auth_key,label) values($1,$2,'key','key','probe') returning id",[user,`https://example.test/${user}`])).rows[0].id
      const delivery = (await db.query("insert into private.notification_deliveries(user_id,device_key,due_at,is_test) values($1,$2,now(),true) returning id",[user,device])).rows[0].id
      await db.query("insert into private.notification_attempts(delivery_id,attempt,outcome) values($1,1,'sent')",[delivery])
    }
    await db.query('insert into private.admins values($1)',[a])
    await db.query('delete from auth.users where id=$1',[a])
    for (const table of ['public.band_follows','public.saved_schedules','public.notification_preferences','public.account_signals','private.push_devices','private.notification_deliveries']) {
      assert.deepEqual((await db.query(`select user_id from ${table}`)).rows.map(r=>r.user_id),[b],table)
    }
    assert.equal((await db.query('select * from private.notification_attempts')).rows.length,1)
    assert.equal((await db.query('select * from private.admins')).rows.length,0)
    assert.equal((await db.query('select * from public.concerts')).rows.length,1)
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a])
    await db.exec('set role authenticated')
    assert.equal((await db.query('select * from public.saved_schedules')).rows.length,0)
    await assert.rejects(db.query('insert into public.band_follows(band_id) values($1)',[band]),/foreign key/)
  } finally { await db.close() }
})
