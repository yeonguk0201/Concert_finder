import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('admin RPC: access, atomic review/publication, conflict, stable saves and history', async () => {
  const db = new PGlite()
  const admin = '00000000-0000-0000-0000-000000000003'
  const user = '00000000-0000-0000-0000-000000000001'
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`)
    for (const file of ['202610060001_initial.sql', '202610070001_admin_review.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    }
    await db.query('insert into auth.users values ($1),($2)', [admin, user])
    await db.query('insert into private.admins values ($1)', [admin])
    const role = async id => {
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? ''])
      await db.exec(`set role ${id ? 'authenticated' : 'anon'}`)
    }
    const rpc = async (payload, version = null) => (await db.query('select public.admin_save_concert($1::jsonb,$2::timestamptz) as id', [JSON.stringify(payload), version])).rows[0].id
    const load = async () => (await db.query('select public.admin_catalog() as data')).rows[0].data
    await role(user)
    assert.equal((await db.query('select public.is_catalog_admin() as allowed')).rows[0].allowed, false)
    await assert.rejects(load(), /ADMIN_REQUIRED/)
    await assert.rejects(rpc({}), /ADMIN_REQUIRED/)
    await assert.rejects(db.query("select public.admin_save_band('Attack','KR','{}')"), /ADMIN_REQUIRED/)
    await assert.rejects(db.query('select * from private.catalog_history'), /permission denied/)
    await role(null)
    await assert.rejects(load(), /permission denied/)
    await role(admin)
    const band = (await db.query("select public.admin_save_band('Official band','GB','{별칭}') as id")).rows[0].id
    const draft = { title: 'Official show', format: 'solo', status: 'draft', announcement_verified: false,
      sources: [], band_ids: [band], sessions: [], ticket: { opens_at: null } }
    const id = await rpc(draft)
    let record = (await load()).concerts[0]
    const ticketId = record.ticket.id
    assert.equal(record.first_published_at, null)
    await role(user)
    assert.equal((await db.query('select * from public.concerts')).rows.length, 0)
    assert.equal((await db.query('select * from public.ticket_schedules')).rows.length, 0)
    await role(admin)
    await assert.rejects(rpc({ ...record, title: 'Should roll back', status: 'published', sources: [{ url: 'https://official.example/show', label: 'Official', verified_at: '2026-10-06T00:00:00Z' }] }, record.updated_at), /Publication requires/)
    record = (await load()).concerts[0]
    assert.equal(record.title, draft.title)
    assert.equal(record.sources.length, 0)
    assert.equal((await load()).history.length, 1)
    await rpc({ ...record, status: 'review' }, record.updated_at)
    record = (await load()).concerts[0]
    assert.equal(record.status, 'review')
    const published = { ...record, status: 'published', starts_on: '2026-12-12', announced_on: '2026-10-06', announcement_verified: true,
      sources: [{ url: 'https://official.example/show', label: 'Official', verified_at: '2026-10-06T00:00:00Z' }] }
    await rpc(published, record.updated_at)
    record = (await load()).concerts[0]
    const firstPublication = record.first_published_at
    await role(user)
    assert.equal((await db.query('select * from public.concerts')).rows.length, 1)
    await db.query('insert into public.saved_schedules(ticket_schedule_id) values ($1)', [ticketId])
    await role(admin)
    const stale = structuredClone(record)
    await rpc({ ...record, ticket: { ...record.ticket, opens_at: '2026-11-01T10:00:00+09:00' } }, record.updated_at)
    record = (await load()).concerts[0]
    assert.equal(record.ticket.id, ticketId)
    assert.equal(record.ticket.revision, 2)
    assert.equal(record.first_published_at, firstPublication)
    await assert.rejects(rpc({ ...stale, title: 'Stale edit' }, stale.updated_at), /EDIT_CONFLICT/)
    await assert.rejects(db.query('delete from public.concert_sources where concert_id = $1', [id]), /Publication requires/)
    await assert.rejects(db.query('delete from public.concert_bands where concert_id = $1', [id]), /Publication requires/)
    assert.equal((await load()).concerts[0].sources.length, 1)
    await rpc({ ...record, cancelled: true, status: 'withdrawn' }, record.updated_at)
    record = (await load()).concerts[0]
    const history = (await load()).history
    assert.equal(history.length, 5)
    assert.equal(history[0].before_record.ticket.revision, 2)
    assert.equal(history[0].after_record.cancelled, true)
    assert.equal(record.first_published_at, firstPublication)
    await role(user)
    assert.equal((await db.query('select * from public.concerts')).rows.length, 0)
    assert.equal((await db.query('delete from public.saved_schedules returning *')).rows.length, 1)
  } finally { await db.close() }
})
