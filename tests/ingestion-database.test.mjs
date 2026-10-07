import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
test('candidate ingestion enforces admin access, deduplicates, tracks changes and conflicts', async () => {
  const db = new PGlite()
  const admin = '00000000-0000-0000-0000-000000000003', user = '00000000-0000-0000-0000-000000000001'
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`)
    for (const file of ['202610060001_initial.sql','202610070001_admin_review.sql','202610080001_ingestion.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    await db.query('insert into auth.users values ($1),($2)', [admin,user])
    await db.query('insert into private.admins values ($1)', [admin])
    const role = async id => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated') }
    const row = { source_url: 'https://ualive.com/concerts/397', payload: { title: 'Real source candidate' }, content_hash: 'a'.repeat(64) }
    const ingest = async value => db.query('select public.admin_ingest_ualive($1)', [{ candidates:[value], failures:[] }])
    await role(user); await assert.rejects(ingest(row), /ADMIN_REQUIRED/)
    assert.equal((await db.query('select * from public.collection_candidates')).rows.length,0)
    await role(admin); await ingest(row); await ingest(row)
    let candidate = (await db.query('select * from public.collection_candidates')).rows[0]
    assert.equal(candidate.revision,1)
    await db.query("select public.admin_resolve_candidate($1,1,'reviewed')", [candidate.id])
    await ingest(row)
    assert.equal((await db.query('select * from public.collection_candidates')).rows[0].status,'reviewed')
    await ingest({ ...row, payload:{title:'Updated'}, content_hash:'b'.repeat(64) })
    candidate = (await db.query('select * from public.collection_candidates')).rows[0]
    assert.equal(candidate.revision,2); assert.equal(candidate.status,'pending'); assert.equal(candidate.previous_payload.title,row.payload.title)
    await assert.rejects(db.query("select public.admin_resolve_candidate($1,1,'reviewed')", [candidate.id]), /EDIT_CONFLICT/)
    assert.equal((await db.query('select * from public.concerts')).rows.length,0)
    await role(user)
    assert.equal((await db.query('select * from public.collection_candidates')).rows.length,0)
    assert.equal((await db.query('select * from public.collection_runs')).rows.length,0)
  } finally { await db.close() }
})
