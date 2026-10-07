import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
test('signals cover publication, withdrawal, removal and owner-only access without private payloads', async () => {
  const db = new PGlite(), a='00000000-0000-0000-0000-000000000001', b='00000000-0000-0000-0000-000000000002'
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`)
    for (const file of ['202610060001_initial.sql','202610070001_admin_review.sql','202610080002_realtime.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    await db.query('insert into auth.users values ($1),($2)',[a,b])
    const counter = async () => Number((await db.query('select revision from public.catalog_signal')).rows[0].revision)
    const band=(await db.query("insert into public.bands(name,country_code) values('Band','GB') returning id")).rows[0].id
    const initial=await counter()
    const concert=(await db.query("insert into public.concerts(title,format) values('Draft','solo') returning id")).rows[0].id
    assert.equal(await counter(),initial)
    await db.exec(await readFile(new URL('../supabase/manual/register-mcr-korea-2026.sql',import.meta.url),'utf8'))
    assert.ok(await counter()>initial)
    const published=(await db.query("select id from public.concerts where status='published'")).rows[0].id
    const before=await counter()
    await db.query("update public.concerts set status='withdrawn' where id=$1",[published])
    assert.ok(await counter()>before)
    await db.query('insert into public.band_follows(user_id,band_id) values($1,$2)',[a,band])
    await db.query('delete from public.band_follows where user_id=$1',[a])
    assert.equal(Number((await db.query('select revision from public.account_signals')).rows[0].revision),2)
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]); await db.exec('set role authenticated')
    assert.equal((await db.query('select * from public.account_signals')).rows.length,0)
    await assert.rejects(db.exec('update public.catalog_signal set revision=999'),/permission denied/)
    await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]); await db.exec('set role authenticated')
    assert.equal((await db.query('select * from public.account_signals')).rows.length,1)
    await db.exec('reset role'); await db.query('delete from auth.users where id=$1',[a]); await db.query('delete from public.concerts where id=$1',[concert])
    assert.equal((await db.query('select * from public.account_signals')).rows.length,0)
  } finally { await db.close() }
})
