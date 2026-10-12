import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('curated seed is idempotent and manual photo/alias updates enforce rights, conflicts, and administrator access', async () => {
  const db = new PGlite()
  try {
    const user='00000000-0000-4000-8000-000000000099'
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select '${user}'::uuid $$;`)
    for(const file of ['202610060001_initial.sql','202610070001_admin_review.sql','202610080001_ingestion.sql','202610110001_catalog_expansion.sql','20261011150237_discovered_artist_catalog.sql','20261012135134_artist_management.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'))
    await db.query('insert into auth.users values ($1)',[user]); await db.query('insert into private.admins values ($1)',[user])
    await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)")
    const manifest=JSON.parse(await readFile(new URL('../supabase/manual/starter-artists.json',import.meta.url),'utf8'))
    assert.ok(manifest.identities.length>=20)
    for(const identity of manifest.identities) {
      await db.query('select public.service_seed_artist($1)',[identity])
      await db.query('select public.service_seed_artist($1)',[identity])
    }
    assert.equal((await db.query('select count(*)::int as n from public.bands')).rows[0].n,manifest.identities.length)
    assert.equal((await db.query('select count(*)::int as n from public.concerts')).rows[0].n,0)
    const ado=(await db.query("select * from public.bands where name='Ado'")).rows[0]
    assert.ok(ado.musicbrainz_id); assert.ok(ado.aliases.includes('아도'))
    await db.query('insert into public.band_follows(user_id,band_id) values ($1,$2)',[user,ado.id])
    const photo={url:'https://images.example.com/ado.png',source:'https://artist.example.com/photo',author:'Artist',license:'Permission',licenseUrl:'https://artist.example.com/terms',usageBasis:'Permission includes display and crop'}
    const save=(version,p=photo,mode='manual')=>db.query('select public.admin_update_artist($1,$2,$3,$4,$5)',[ado.id,version,['아도','Ado JP'],p,mode])
    await assert.rejects(save(ado.updated_at,{...photo,author:''}),/PHOTO_RIGHTS_REQUIRED/)
    for(const url of ['http://example.com/a.jpg','https://127.0.0.1/a.jpg','https://localhost/a.jpg','https://user@example.com/a.jpg','https://example.com:443/a.jpg','javascript:alert(1)']) await assert.rejects(save(ado.updated_at,{...photo,url}),/INVALID_PHOTO_URL/)
    await save(ado.updated_at)
    let current=(await db.query('select * from public.bands where id=$1',[ado.id])).rows[0]
    assert.equal(current.photo_mode,'manual'); assert.equal(current.representative_photo.author,'Artist')
    await assert.rejects(save(ado.updated_at),/EDIT_CONFLICT/)
    await save(current.updated_at,{...photo,url:'https://images.example.com/replacement.png'})
    current=(await db.query('select * from public.bands where id=$1',[ado.id])).rows[0]
    await save(current.updated_at,null,'hidden')
    current=(await db.query('select * from public.bands where id=$1',[ado.id])).rows[0]
    assert.equal(current.representative_photo,null); assert.equal(current.photo_mode,'hidden')
    assert.equal((await db.query('select count(*)::int as n from private.artist_management_history')).rows[0].n,3)
    assert.equal((await db.query('select count(*)::int as n from public.band_follows')).rows[0].n,1)
    // Same name/country with another identity is not silently merged.
    const identity=manifest.identities.find(a=>a.name==='Ado')
    const other={...identity,key:'mb:00000000-0000-4000-8000-000000000001',evidence:'https://musicbrainz.org/artist/00000000-0000-4000-8000-000000000001'}
    assert.equal((await db.query('select public.service_seed_artist($1) as id',[other])).rows[0].id,null)
    await db.exec('delete from private.admins; set role authenticated')
    await assert.rejects(save(current.updated_at),/ADMIN_REQUIRED/)
    await assert.rejects(db.query('select public.service_seed_artist($1)',[identity]),/permission denied/)
    await db.query("update public.bands set photo_mode='manual' where id=$1",[ado.id])
    assert.equal((await db.query('select photo_mode from public.bands where id=$1',[ado.id])).rows[0].photo_mode,'hidden')
  } finally {await db.close()}
})
