import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('photo bucket caps PNG size, denies all direct client writes and lists only for administrators', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create schema storage; create schema private;
      grant usage on schema storage,private to anon,authenticated;
      create function private.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin',true),'')='true' $$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant select,insert,update,delete on storage.objects to anon,authenticated;`)
    await db.exec(await readFile(new URL('../supabase/migrations/20261014135754_artist_photo_storage.sql',import.meta.url),'utf8'))
    assert.deepEqual((await db.query('select public,file_size_limit::int,allowed_mime_types from storage.buckets')).rows,[{public:true,file_size_limit:2097152,allowed_mime_types:['image/png']}])
    await db.exec("insert into storage.objects(bucket_id,name) values('artist-photos','band/photo.png'),('private-bucket','secret'); set role anon")
    assert.equal((await db.query('select * from storage.objects')).rows.length,0)
    await assert.rejects(db.exec("insert into storage.objects(bucket_id,name) values('artist-photos','bad')"),/row-level security/)
    await db.exec('reset role; set role authenticated')
    assert.equal((await db.query('select * from storage.objects')).rows.length,0)
    await db.exec("select set_config('test.admin','true',false)")
    assert.equal((await db.query('select * from storage.objects')).rows.length,1)
    await assert.rejects(db.exec("insert into storage.objects(bucket_id,name) values('artist-photos','bad')"),/row-level security/)
    await db.exec("delete from storage.objects; update storage.objects set name='changed'; reset role")
    assert.equal((await db.query("select count(*)::int as n from storage.objects where name='band/photo.png'")).rows[0].n,1)
  } finally { await db.close() }
})
