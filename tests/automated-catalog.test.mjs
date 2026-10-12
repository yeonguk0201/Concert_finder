import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { runSource } from '../scripts/collection-runner.mjs'

test('source runner retries collection, respects leases, and records terminal failures', async () => {
  const calls = [], sleeps = []
  const client = { rpc: async (name, args) => { calls.push([name,args]); return { data: 'token' } } }
  let attempts = 0
  const row = await runSource({ client, source: 'yes24', collect: async () => {
    if (++attempts < 3) throw new Error('503')
    return { candidates: [], failures: [] }
  }, upload: async (_, token, count) => { assert.equal(token,'token'); assert.equal(count,3); return { published: 0 } }, sleep: async ms => sleeps.push(ms) })
  assert.equal(row.attempts,3); assert.deepEqual(sleeps,[5000,10000])
  const locked = await runSource({ client: { rpc: async () => ({ data: null }) }, source: 'yes24', collect: () => assert.fail('locked') })
  assert.equal(locked.skipped,'locked_or_disabled')
  await assert.rejects(runSource({ client, source: 'yes24', collect: async () => { throw new Error('secret URL') }, sleep: async () => {} }), /secret URL/)
  assert.equal(calls.at(-1)[0],'service_fail_collection')
  assert.equal(calls.at(-1)[1].failure_code,'COLLECTION_OR_UPLOAD_FAILED')
})

test('database publication enforces approval, leases, deduplication, overrides and historical silence', async () => {
  const db = new PGlite()
  try {
    const user='00000000-0000-4000-8000-000000000099'
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select '${user}'::uuid $$;`)
    for (const file of ['202610060001_initial.sql','202610070001_admin_review.sql','202610080001_ingestion.sql','202610090001_notifications.sql','202610110001_catalog_expansion.sql','20261011150237_discovered_artist_catalog.sql','20261012134538_automated_catalog.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'))
    }
    await db.query('insert into auth.users values ($1)',[user])
    await db.query('insert into private.admins values ($1)',[user])
    await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)")
    const identity={ key:'mb:00000000-0000-4000-8000-000000000001',name:'Verified Band',country:'JP',aliases:['검증 밴드'],genre:'장르 미검수',evidence:'https://musicbrainz.org/artist/00000000-0000-4000-8000-000000000001' }
    await db.query('select public.service_import_artist($1)',[identity])
    const band=(await db.query('select id from public.bands')).rows[0].id
    await db.query('insert into public.band_follows(user_id,band_id) values ($1,$2)',[user,band])
    await db.query('insert into public.notification_preferences(user_id,announcements) values ($1,true)',[user])
    const today=(await db.query("select (now() at time zone 'Asia/Seoul')::date::text as day")).rows[0].day
    const row={source_url:'https://ticket.yes24.com/Perf/123',content_hash:'a'.repeat(64),payload:{
      title:'Verified Seoul',format:'solo',country_code:'KR',starts_on:'2027-12-01',ends_on:'2027-12-01',announced_on:today,
      announcement_verified:true,artist_keys:[identity.key],review_reasons:[],sources:[{url:'https://ticket.yes24.com/Perf/123',verified_at:new Date().toISOString()}],sessions:[],ticket:{}
    }}
    const batch={candidates:[row],failures:[],excluded:[]}
    const begin=async (source='yes24') => (await db.query('select public.service_begin_collection($1,now()) as id',[source])).rows[0].id
    const finish=async token => (await db.query("select public.service_complete_collection($1,$2,'[]',1,'catalog-v1') as result",[token,batch])).rows[0].result
    let token=await begin()
    assert.equal(await begin(),null)
    assert.equal((await finish(token)).published,0)
    assert.equal((await db.query('select reason from public.collection_decisions')).rows[0].reason,'PUBLICATION_DISABLED')
    await db.query("select public.admin_collection_policy('yes24',true,true,false)")
    token=await begin(); assert.equal((await finish(token)).review,1)
    assert.equal((await db.query('select reason from public.collection_decisions order by decided_at desc limit 1')).rows[0].reason,'ARTIST_OR_GENRE_UNVERIFIED')
    await db.query('select public.admin_approve_band($1,$2)',[band,'https://official.example/biography'])
    token=await begin(); assert.equal((await finish(token)).published,1)
    assert.equal((await finish(token)).published,1) // lost response replay
    assert.equal((await db.query('select count(*)::int as n from public.concerts')).rows[0].n,1)
    assert.equal((await db.query('select initial_import from private.publication_changes')).rows[0].initial_import,true)
    // Live mode still suppresses old announcements, while verified new dates queue once per device.
    await db.query("update public.collection_policies set live_after=now()-interval '2 days' where source='yes24'")
    for(const suffix of ['one','two']) await db.query('insert into private.push_devices(user_id,endpoint,p256dh,auth_key,label) values ($1,$2,$3,$4,$5)',[user,`https://fcm.googleapis.com/fcm/send/auto-${suffix}`,'A'.repeat(87),'B'.repeat(22),'auto'])
    token=await begin(); assert.deepEqual(await finish(token),{published:0,review:0})
    const fresh=structuredClone(row)
    fresh.source_url='https://ticket.yes24.com/Perf/789'; fresh.payload.title='Different verified performance'
    fresh.payload.starts_on='2028-01-01'; fresh.payload.ends_on='2028-01-01'
    fresh.payload.sources=[{url:fresh.source_url,verified_at:new Date().toISOString()}]
    batch.candidates=[fresh]
    token=await begin();assert.equal((await finish(token)).published,1);await finish(token)
    assert.equal((await db.query('select count(*)::int as n from private.notification_deliveries')).rows[0].n,2)
    assert.equal((await db.query('select count(*)::int as n from private.publication_changes where not initial_import')).rows[0].n,1)
    batch.candidates=[row]
    // Important changes and administrator withdrawals never overwrite the existing concert.
    row.payload.starts_on='2027-12-02'; row.payload.ends_on='2027-12-02'; row.content_hash='b'.repeat(64)
    token=await begin(); assert.equal((await finish(token)).review,1)
    assert.equal((await db.query('select starts_on::text as day from public.concerts')).rows[0].day,'2027-12-01')
    const candidate=(await db.query('select id,revision from public.collection_candidates where source_url=$1',[row.source_url])).rows[0]
    await db.query("select public.admin_resolve_candidate($1,$2,'dismissed')",[candidate.id,candidate.revision])
    row.content_hash='c'.repeat(64)
    token=await begin(); await finish(token)
    assert.equal((await db.query('select reason from public.collection_decisions order by decided_at desc limit 1')).rows[0].reason,'ADMIN_OVERRIDE')
    // Cross-source duplicate conservatively stays in review, without merging concerts.
    row.source_url='https://ualive.com/concerts/123'; row.payload.sources=[{url:row.source_url,verified_at:new Date().toISOString()}]
    await db.query("select public.admin_collection_policy('ualive',true,true,false)")
    token=await begin('ualive'); assert.equal((await finish(token)).review,1)
    assert.equal((await db.query('select reason from public.collection_decisions order by decided_at desc limit 1')).rows[0].reason,'POSSIBLE_DUPLICATE_OR_CONFLICT')
    // A malformed row is isolated; it does not discard the rest of a valid upload.
    row.source_url='https://ualive.com/concerts/456'; row.payload.starts_on='garbage'
    token=await begin('ualive'); assert.equal((await finish(token)).review,1)
    assert.equal((await db.query('select reason from public.collection_decisions order by decided_at desc limit 1')).rows[0].reason,'INVALID_CANDIDATE_FIELDS')
    // Expired workers are fenced out by a new token.
    token=await begin('ualive')
    await db.query("update private.collection_leases set expires_at=now()-interval '1 second'")
    const replacement=await begin('ualive'); assert.notEqual(replacement,token)
    await assert.rejects(finish(token),/LEASE_LOST/)
    await db.query("select public.service_fail_collection($1,3,'FAILED')",[replacement])
    await db.query("select public.admin_collection_policy('ualive',false,false,false)")
    assert.equal(await begin('ualive'),null)
    const health=(await db.query('select public.admin_collection_health() as data')).rows[0].data
    assert.equal(health.find(row=>row.source==='ualive').attention_required,false)
    assert.equal(health.find(row=>row.source==='radwimps').attention_required,true)
    await db.exec('delete from private.admins; set role authenticated')
    await assert.rejects(begin(),/permission denied/)
    await assert.rejects(db.query("select public.admin_collection_policy('yes24',true,true,true)"),/ADMIN_REQUIRED/)
    await assert.rejects(db.query('select public.admin_approve_artist($1,$2)',[identity.key,'https://evil.example']),/ADMIN_REQUIRED/)
    await assert.rejects(db.query('select public.admin_approve_band($1,$2)',[band,'https://evil.example']),/ADMIN_REQUIRED/)
    assert.equal((await db.query('select * from public.collection_decisions')).rows.length,0)
  } finally { await db.close() }
})
