import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('band starter import is repeatable, preserves aliases/IDs and never creates concerts', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`)
    await db.exec(await readFile(new URL('../supabase/migrations/202610060001_initial.sql', import.meta.url), 'utf8'))
    const id = '00000000-0000-0000-0000-000000000001'
    await db.query(`insert into public.bands(id,name,aliases,country_code,description)
      values ($1,'잔나비','{}','KR','기존 검수 정보')`, [id])
    const sql = await readFile(new URL('../supabase/manual/register-band-starter-catalog.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    const first = (await db.query('select id, name from public.bands order by id')).rows
    assert.equal(first.length, 16)
    await db.exec(sql)
    assert.deepEqual((await db.query('select id, name from public.bands order by id')).rows, first)
    assert.equal((await db.query('select description from public.bands where id=$1', [id])).rows[0].description, '기존 검수 정보')
    assert.equal((await db.query("select * from public.bands where aliases @> array['킹누']")).rows.length, 1)
    assert.equal((await db.query('select * from public.concerts')).rows.length, 0)
    assert.equal((await db.query('select * from public.ticket_schedules')).rows.length, 0)
  } finally { await db.close() }
})
