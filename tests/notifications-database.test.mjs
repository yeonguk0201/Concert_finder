import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('notification consent, targets, scheduling, leases and access control', async t => {
  const db = new PGlite()
  const a = '00000000-0000-0000-0000-000000000001', b = '00000000-0000-0000-0000-000000000002'
  const admin = '00000000-0000-0000-0000-000000000003'
  const owner = () => db.exec('reset role')
  const role = async id => { await owner(); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated') }
  const rpc = async (name, values = [], placeholders = values.map((_, i) => `$${i + 1}`).join(',')) =>
    (await db.query(`select public.${name}(${placeholders}) as result`, values)).rows[0].result
  const prefs = (ann, ticket) => rpc('set_notification_preferences', [ann, ticket])
  const register = path => rpc('register_push_device', [{ endpoint: `https://fcm.googleapis.com/fcm/send/${path}`, keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) } }, path])
  let d1, d2, band1, band2, concert, schedule
  const count = async status => (await db.query('select count(*)::int as n from private.notification_deliveries where status=$1', [status])).rows[0].n
  const claim = () => rpc('claim_notification_batch')
  const authorize = row => rpc('authorize_notification', [row.id, row.lease_token])
  const finish = (row, outcome, error = null) => rpc('finish_notification', [row.id, row.lease_token, outcome, error])
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`)
    for (const file of ['202610060001_initial.sql','202610070001_admin_review.sql','202610090001_notifications.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    }
    await db.query('insert into auth.users values ($1),($2),($3)', [a,b,admin])
    await db.query('insert into private.admins values ($1)', [admin])
    await t.test('RPC ownership, default opt-out and private encryption keys', async () => {
      await role(a)
      assert.equal((await rpc('notification_settings')).preferences.announcements,false)
      d1 = await register('device-a'); d2 = await register('device-a-second')
      assert.equal(await register('device-a'),d1)
      const settings = await rpc('notification_settings')
      assert.equal(settings.devices.length,2)
      assert.ok(!JSON.stringify(settings).includes('endpoint'))
      await assert.rejects(register('bad path'),/INVALID_SUBSCRIPTION/)
      await assert.rejects(rpc('register_push_device', [{ endpoint:'https://localhost/internal', keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)} },'bad']),/INVALID_SUBSCRIPTION/)
      await assert.rejects(db.query('select * from private.push_devices'),/permission denied/)
      await assert.rejects(claim(),/permission denied/)
      await role(b)
      assert.equal((await rpc('notification_settings')).devices.length,0)
      await assert.rejects(register('device-a'),/DEVICE_OWNED_BY_OTHER_ACCOUNT/)
      await rpc('disable_push_device',[d1])
      await owner()
      assert.equal((await db.query('select active from private.push_devices where id=$1',[d1])).rows[0].active,true)
    })
    await t.test('first publication matches any followed band once per active device; old data stays silent', async () => {
      await owner()
      band1 = (await db.query("insert into public.bands(name,country_code) values ('Band 1','GB') returning id")).rows[0].id
      band2 = (await db.query("insert into public.bands(name,country_code) values ('Band 2','KR') returning id")).rows[0].id
      await role(a); await prefs(true,true)
      await db.query('insert into public.band_follows(band_id) values($1),($2)',[band1,band2])
      await role(b); await db.query('insert into public.band_follows(band_id) values($1)',[band1]); await register('device-b')
      await role(admin)
      const payload = { title:'Mixed festival',format:'festival',status:'published',starts_on:'2099-12-12',announced_on:'2026-10-07',announcement_verified:true,
        sources:[{url:'https://official.example/event',label:'Official',verified_at:new Date().toISOString()}],band_ids:[band1,band2],sessions:[],ticket:{opens_at:new Date(Date.now()+3*3600000).toISOString()} }
      concert = await rpc('admin_save_concert',[payload,null])
      await owner()
      assert.equal(await count('pending'),2)
      schedule = (await db.query('select id from public.ticket_schedules where concert_id=$1',[concert])).rows[0].id
      await role(admin)
      await rpc('admin_save_concert',[{...payload,title:'Historical',initial_import:true},null])
      await owner(); assert.equal(await count('pending'),2)
      const rows = await claim()
      assert.equal(rows.length,2)
      for (const row of rows) { assert.equal((await authorize(row)).concertId,concert); await finish(row,'sent') }
      assert.equal((await claim()).length,0)
    })
    await t.test('lineup additions notify only followers of the added band', async () => {
      await owner()
      const band3 = (await db.query("insert into public.bands(name,country_code) values('New artist','US') returning id")).rows[0].id
      await role(b); await prefs(true,false); await db.query('insert into public.band_follows(band_id) values($1)',[band3])
      await role(admin); await db.query('insert into public.concert_bands(concert_id,band_id) values($1,$2)',[concert,band3])
      await owner(); const batch=await claim(); assert.equal(batch.length,1)
      await role(b); await db.query('delete from public.band_follows where band_id=$1',[band3])
      await owner(); assert.equal(await authorize(batch[0]),null)
      assert.equal(await count('invalidated'),1)
    })
    await t.test('reminders wait until due; within an hour sends soon; repeats never resend', async () => {
      await role(a); await db.query('insert into public.saved_schedules(ticket_schedule_id) values($1)',[schedule])
      await owner(); assert.equal((await claim()).length,0)
      assert.equal(await count('pending'),2)
      await db.query("update public.ticket_schedules set opens_at=clock_timestamp()+interval '30 minutes' where id=$1",[schedule])
      const batch=await claim(); assert.equal(batch.length,2)
      assert.ok(await count('invalidated')>=3)
      for (const row of batch) { assert.ok(await authorize(row)); assert.equal(await authorize(row),null); await finish(row,'sent') }
      assert.equal((await claim()).length,0)
    })
    await t.test('send authorization rechecks save removal, changed time, consent and cancellation', async () => {
      await owner()
      await db.query("update public.ticket_schedules set opens_at=clock_timestamp()+interval '20 minutes' where id=$1",[schedule])
      let batch=await claim(); assert.equal(batch.length,2)
      await role(a); await db.query('delete from public.saved_schedules where ticket_schedule_id=$1',[schedule])
      await owner(); for(const row of batch) assert.equal(await authorize(row),null)
      await role(a); await db.query('insert into public.saved_schedules(ticket_schedule_id) values($1)',[schedule])
      await owner(); batch=await claim(); assert.equal(batch.length,2)
      await db.query("update public.ticket_schedules set opens_at=clock_timestamp()+interval '3 hours' where id=$1",[schedule])
      for(const row of batch) assert.equal(await authorize(row),null)
      assert.equal((await claim()).length,0)
      await db.query("update public.ticket_schedules set opens_at=clock_timestamp()+interval '10 minutes' where id=$1",[schedule])
      batch=await claim(); await role(a); await prefs(false,false); await owner()
      for(const row of batch) assert.equal(await authorize(row),null)
      await role(a); await prefs(true,true); await owner(); batch=await claim()
      await db.query('update public.concerts set cancelled=true where id=$1',[concert])
      for(const row of batch) assert.equal(await authorize(row),null)
      await db.query('update public.concerts set cancelled=false where id=$1',[concert])
      await db.query("update public.ticket_schedules set opens_at=clock_timestamp()-interval '1 minute' where id=$1",[schedule])
      assert.equal((await claim()).length,0)
    })
    await t.test('lease protection, bounded retries and invalid devices', async () => {
      await role(a); await rpc('request_push_test',[d1])
      await assert.rejects(rpc('request_push_test',[d1]),/TEST_RATE_LIMIT/)
      await owner(); let batch=await claim(); assert.equal(batch.length,1)
      let row=batch[0]
      assert.equal(await rpc('authorize_notification',[row.id,'00000000-0000-0000-0000-000000000099']),null)
      assert.equal((await claim()).length,0)
      await authorize(row); await finish(row,'retry','HTTP_503')
      assert.equal((await claim()).length,0)
      for (let i=0;i<2;i++) {
        await db.query("update private.notification_deliveries set due_at=clock_timestamp() where id=$1",[row.id])
        row=(await claim())[0]; assert.ok(await authorize(row)); await finish(row,'retry','HTTP_503')
      }
      assert.equal((await db.query('select status,attempts from private.notification_deliveries where id=$1',[row.id])).rows[0].status,'failed')
      assert.equal((await claim()).length,0)
      await db.exec('delete from private.notification_deliveries where is_test')
      await role(a); await rpc('request_push_test',[d2]); await owner(); row=(await claim())[0]
      await authorize(row); await finish(row,'invalid_device','HTTP_410')
      assert.equal((await db.query('select active from private.push_devices where id=$1',[d2])).rows[0].active,false)
    })
    await t.test('interrupted sends do not duplicate and device revocation prevents sending', async () => {
      await db.exec('delete from private.notification_deliveries where is_test')
      await role(a); await rpc('request_push_test',[d1]); await owner(); let row=(await claim())[0]
      await authorize(row)
      await db.query("update private.notification_deliveries set lease_until=clock_timestamp()-interval '1 second' where id=$1",[row.id])
      assert.equal((await claim()).length,0)
      assert.equal((await db.query('select last_error from private.notification_deliveries where id=$1',[row.id])).rows[0].last_error,'UNKNOWN_OUTCOME')
      await db.exec('delete from private.notification_deliveries where is_test')
      await role(a); await rpc('request_push_test',[d1]); await owner(); row=(await claim())[0]
      await role(a); await rpc('disable_push_device',[d1]); await owner(); assert.equal(await authorize(row),null)
    })
    await t.test('service role can claim; ordinary user cannot authorize/finish; account deletion cascades', async () => {
      await db.exec('set role service_role'); assert.ok(Array.isArray(await claim())); await owner()
      await role(a)
      await assert.rejects(rpc('authorize_notification',[a,b]),/permission denied/)
      await assert.rejects(rpc('finish_notification',[a,b,'sent',null]),/permission denied/)
      await owner(); await db.query('delete from auth.users where id=$1',[a])
      assert.equal((await db.query('select * from private.push_devices where user_id=$1',[a])).rows.length,0)
      assert.equal((await db.query('select * from private.notification_deliveries where user_id=$1',[a])).rows.length,0)
    })
  } finally { await db.close() }
})
