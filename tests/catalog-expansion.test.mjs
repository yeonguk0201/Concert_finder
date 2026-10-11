import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { artists, matchArtist, matchProfile, artworkUrl } from '../scripts/catalog-policy.mjs'
import { parseMintpaper, parseRadwimps } from '../scripts/official-adapters.mjs'
import { getText, checkRobots } from '../scripts/collection-http.mjs'

test('identity policy uses exact reviewed aliases/profile IDs and excludes arbitrary URLs', () => {
  assert.equal(matchArtist('ＲＡＤＷＩＭＰＳ').key, 'radwimps')
  assert.equal(matchArtist('Kenny G'), null)
  assert.equal(matchArtist('My Chemical Romance tribute'), null)
  assert.equal(matchProfile('https://www.instagram.com/thornapple_official/?x=1').key, 'thornapple')
  assert.equal(matchProfile('https://evil.test/thornapple_official'), null)
  for (const url of ['http://127.0.0.1/a.jpg','https://resource.ualive.com.evil.test/a.jpg','https://resource.ualive.com/a.svg','https://user@resource.ualive.com/a.jpg']) assert.equal(artworkUrl(url, 'https://ualive.com/concerts/397'), null)
})
test('festival uses event-linked cover and target lineup profiles, never all performers or CMS times', () => {
  const data = { 'Festival:172': { title:'Festival',place:'Olympic Park',startDate:'2026-10-17T03:00:00Z',endDate:'2026-10-18T03:00:00Z',coverImage:{__ref:'UploadFile:1'},lineup:[{banners:[{link:artists.find(a=>a.key==='thornapple').profile},{link:'https://www.instagram.com/pop_singer'}]}] }, 'UploadFile:1':{url:'https://mintpaper.s3.ap-northeast-2.amazonaws.com/poster.jpg'} }
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({props:{apolloState:{data}}})}</script>`
  const row = parseMintpaper(html,'https://www.mintpaper.co.kr/festivals/172')
  assert.deepEqual(row.payload.artist_keys,['thornapple'])
  assert.equal(row.payload.starts_on,'2026-10-17'); assert.deepEqual(row.payload.sessions,[])
  assert.equal(row.payload.announced_on,null); assert.equal(row.payload.artwork.display_approved,false)
  assert.equal(row.content_hash,parseMintpaper(html,row.source_url).content_hash)
  assert.throws(()=>parseMintpaper('<h1>Changed</h1>',row.source_url),/layout/)
})
test('Japanese artist route keeps global tours out and Korean ambiguous dates in review', () => {
  const page = text => `<div class="p-article__head"><time datetime="2025-05-22"></time><h2 class="title">Festival</h2></div><div class="p-article__body">${text}</div>`
  assert.equal(parseRadwimps(page('Tokyo 2026'), 'https://radwimps.jp/live/1/'),null)
  const row = parseRadwimps(page('Nanji Hangang Park 2025年9月6日・7日'), 'https://radwimps.jp/live/1/')
  assert.equal(row.payload.starts_on,null); assert.equal(row.payload.announced_on,'2025-05-22')
  assert.deepEqual(row.payload.artist_keys,['radwimps'])
})
test('HTTP limits apply while reading; robots wildcards and exclusions fail closed', async () => {
  await assert.rejects(getText('https://ualive.com',async()=>new Response('a'.repeat(2000001))),/too large/)
  assert.throws(()=>checkRobots('User-agent: *\nDisallow: /*concert*',['/concerts/1']),/disallowed/)
  assert.throws(()=>checkRobots('Disallow: /',['/festivals']),/disallowed/)
  checkRobots('Disallow: /wp-admin/',['/live/1/'])
})
test('multi-source ingestion registers identities once, preserves existing follows and rejects unauthorized writes', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`)
    for (const file of ['202610060001_initial.sql','202610070001_admin_review.sql','202610080001_ingestion.sql','202610110001_catalog_expansion.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'))
    const user='00000000-0000-0000-0000-000000000001'
    await db.query('insert into auth.users values ($1)',[user])
    await db.query("insert into public.bands(name,country_code) values ('쏜애플','KR')")
    const existing=(await db.query('select id from public.bands')).rows[0].id
    await db.query('insert into public.band_follows(user_id,band_id) values($1,$2)',[user,existing])
    const batch={candidates:[{source_url:'https://www.mintpaper.co.kr/festivals/172',payload:{title:'Festival',artist_keys:['thornapple']},content_hash:'a'.repeat(64)}],failures:[],excluded:[]}
    const ingest=()=>db.query("select public.admin_ingest_catalog('mintpaper',$1,$2)",[batch,artists])
    await db.exec('set role authenticated'); await assert.rejects(ingest(),/ADMIN_REQUIRED/); await db.exec('reset role')
    await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)")
    await ingest(); await ingest()
    const row=(await db.query('select * from public.collection_candidates')).rows[0]
    assert.equal(row.revision,1); assert.deepEqual(row.payload.band_ids,[existing]); assert.equal(row.payload.initial_import,true)
    assert.equal((await db.query('select * from public.band_follows')).rows.length,1)
    assert.equal((await db.query('select * from public.bands')).rows.length,artists.length)
    assert.equal((await db.query('select * from public.concerts')).rows.length,0)
    batch.candidates[0].source_url='https://evil.test/festivals/1'; await assert.rejects(ingest(),/INVALID_CANDIDATE/)
  } finally { await db.close() }
})
