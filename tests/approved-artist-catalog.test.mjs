import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('approved-only RLS and profiles preserve admin review, existing follows and restoration', async () => {
  const db = new PGlite()
  const admin='00000000-0000-4000-8000-000000000099', user='00000000-0000-4000-8000-000000000098'
  const ids=Array.from({length:4},(_,i)=>`00000000-0000-4000-8000-00000000000${i+1}`)
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;`)
    for(const name of ['202610060001_initial','202610070001_admin_review','202610080001_ingestion','202610090001_notifications','202610110001_catalog_expansion','20261011150237_discovered_artist_catalog','20261012134538_automated_catalog','20261012135134_artist_management','20261013070742_artist_curation'])
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8'))
    await db.exec('create table public.catalog_signal(id int primary key,revision bigint); insert into public.catalog_signal values(1,0)')
    await db.exec(await readFile(new URL('../supabase/migrations/20261015122525_artist_official_channels.sql',import.meta.url),'utf8'))
    for (const name of ['202610160001_artist_review_runner','20261016151915_admin_artist_review_status','20261017160310_artist_review_readiness'])
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20261019170609_approved_artist_catalog.sql',import.meta.url),'utf8'))
    await db.query('insert into auth.users values ($1),($2)',[admin,user])
    await db.query('insert into private.admins values ($1)',[admin])
    const statuses=['approved','unreviewed','held','excluded']
    for(let i=0;i<4;i++) await db.query('insert into public.bands(id,name,country_code,curation_status) values($1,$2,$3,$4)',[ids[i],`Artist ${i}`,'JP',statuses[i]])
    // A previously followed row stays in the owner list even when no longer public.
    await db.query('insert into public.band_follows(user_id,band_id) values($1,$2)',[user,ids[1]])
    await db.query("select set_config('test.uid',$1,false)",[admin])
    const mbid=ids[0], channel='https://www.youtube.com/channel/UC'+'a'.repeat(22)
    await db.query('update public.bands set musicbrainz_id=$1 where id=$1',[mbid])
    const version=(await db.query("select to_jsonb(b)->>'updated_at' as v from public.bands b where id=$1",[ids[0]])).rows[0].v
    await db.query('select public.admin_save_artist_channel($1,$2,null,$3)',[ids[0],version,{musicBrainzId:mbid,websiteUrl:'https://official.example.com',channelUrl:channel,verification:'verified',locked:false,evidence:[{kind:'official_artist_page',url:'https://official.example.com/bio',identityMatched:true,linkedChannelUrl:channel,checkedAt:new Date().toISOString()}]}])
    await db.exec('set role anon')
    assert.deepEqual((await db.query('select id from public.bands')).rows.map(r=>r.id),[ids[0]])
    await assert.rejects(db.query('select public.admin_catalog()'),/permission denied|ADMIN_REQUIRED/)
    await db.exec('reset role')
    await db.query("select set_config('test.uid',$1,false)",[user])
    await db.exec('set role authenticated')
    assert.deepEqual((await db.query('select id from public.bands')).rows.map(r=>r.id),[ids[0]])
    assert.equal((await db.query('select public.artist_official_profiles() as d')).rows[0].d.length,1)
    await db.query('insert into public.band_follows(user_id,band_id) values($1,$2)',[user,ids[0]])
    for(const id of ids.slice(1)) await assert.rejects(db.query('insert into public.band_follows(user_id,band_id) values($1,$2)',[user,id]),/row-level security/)
    await db.query('delete from public.band_follows where user_id=$1 and band_id=$2',[user,ids[1]])
    await db.exec('reset role')
    await db.query("select set_config('test.uid',$1,false)",[admin])
    await db.exec('set role authenticated')
    assert.equal((await db.query('select id from public.bands')).rows.length,4)
    assert.equal((await db.query('select public.admin_catalog() as d')).rows[0].d.bands.length,4)
    await db.exec('reset role')
    await db.query("update public.bands set curation_status='unreviewed' where id=$1",[ids[0]])
    await db.query("select set_config('test.uid',$1,false)",[user])
    await db.exec('set role authenticated')
    assert.equal((await db.query('select * from public.bands')).rows.length,0)
    assert.equal((await db.query('select public.artist_official_profiles() as d')).rows[0].d.length,0)
    assert.equal((await db.query('select * from public.band_follows')).rows.length,1)
    await db.exec('reset role')
    await db.query("update public.bands set curation_status='approved' where id=$1",[ids[0]])
    await db.exec('set role authenticated')
    assert.equal((await db.query('select * from public.bands')).rows.length,1)
    assert.equal((await db.query('select * from public.band_follows')).rows.length,1)
  } finally { await db.close() }
})
