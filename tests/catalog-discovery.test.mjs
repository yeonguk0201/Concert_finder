import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { yes24Links, parseYes24, collectYes24 } from '../scripts/yes24.mjs'
import { discoveredArtist, createArtistResolver, musicbrainzMatches, enrichArtists } from '../scripts/artist-discovery.mjs'
import { filterPastCandidates, candidatePeriod } from '../scripts/candidate-policy.mjs'
import { parseConcert } from '../scripts/ualive.mjs'

const mbid = '00000000-0000-4000-8000-000000000001'
const artist = { id: mbid, name: 'New Band', country: 'JP', aliases: [{ name: '새 밴드' }], disambiguation: 'Japanese group' }
const event = { '@type': 'Event', name: 'New Band in Seoul', startDate: '2027-01-01', endDate: '2027-01-02', location: { name: 'Venue', address: { addressCountry: 'KR', addressRegion: '서울' } }, performer: { name: ['New Band', '새 밴드'] }, offers: { validFrom: '2026-10-12T12:00' } }
const html = e => `<script type="application/ld+json">${JSON.stringify(e)}</script>`

test('ticket discovery canonicalizes IDs and extracts official dates and unregistered credits', () => {
  assert.deepEqual(yes24Links('<a href="/Perf/123">a</a><a href="/English/Perf/123?x=1">b</a><a href="https://evil.test/Perf/456">c</a>'), ['https://ticket.yes24.com/Perf/123'])
  const row = parseYes24(html(event), 'https://ticket.yes24.com/Perf/123')
  assert.equal(row.payload.starts_on, '2027-01-01')
  assert.equal(row.payload.ends_on, '2027-01-02')
  assert.equal(row.payload.sessions.length, 0)
  assert.equal(row.payload.ticket.opens_at, null)
  assert.deepEqual(row.payload.discovered_artists.map(a => a.name), ['New Band', '새 밴드'])
  assert.deepEqual(row.payload.artist_keys, [])
  assert.throws(() => parseYes24(html({ ...event, startDate: '2026-02-30' }), row.source_url), /date/)
  assert.throws(() => parseYes24(html({ ...event, location: { name: 'Tokyo', address: { addressCountry: 'JP' } } }), row.source_url), /Korean/)
  assert.throws(() => parseYes24(html([event, event]), row.source_url), /layout/)
})

test('unknown ualive artists remain in the payload instead of being discarded', () => {
  const row = parseConcert('<h1>New Band</h1><section><h2>공연 시간</h2>2027. 01. 01.(금) 19:00</section><section><h2>출연진</h2><img alt="New Band"></section>', 'https://ualive.com/concerts/123')
  assert.equal(row.payload.discovered_artists[0].name, 'New Band')
  assert.deepEqual(row.payload.artist_keys, [])
})

test('date policy keeps ongoing festivals and separates ambiguous dates without inventing future dates', () => {
  const result = { candidates: [
    { source_url: 'old', payload: { starts_on: '2026-10-10' } },
    { source_url: 'ongoing', payload: { starts_on: '2026-10-10', ends_on: '2026-10-12' } },
    { source_url: 'unknown', payload: { starts_on: null, announced_on: '2024-01-01' } },
  ] }
  filterPastCandidates(result, { today: '2026-10-12' })
  assert.deepEqual(result.candidates.map(r => r.source_url), ['ongoing', 'unknown'])
  assert.equal(result.excluded.length, 1)
  assert.equal(candidatePeriod(result.candidates[1].payload, '2026-10-12'), 'unknown')
})

test('artist resolver preserves ambiguity and caches successful lookups but never cached failures', async () => {
  assert.equal(musicbrainzMatches({ artists: [artist] }, '새 밴드').length, 1)
  assert.equal(musicbrainzMatches({ artists: [artist] }, 'Other artist').length, 0)
  assert.equal(musicbrainzMatches({ artists: [artist, { ...artist, id: '00000000-0000-4000-8000-000000000002' }] }, 'New Band').length, 2)
  let calls = 0
  const cache = {}, sleeps = []
  const resolve = createArtistResolver({ cache, sleep: async ms => sleeps.push(ms), fetcher: async (url, options) => {
    assert.equal(new URL(url).hostname, 'musicbrainz.org')
    assert.match(options.headers['User-Agent'], /EncoreCatalog/)
    calls++; return new Response(JSON.stringify({ artists: [artist] }))
  } })
  assert.equal((await resolve('New Band'))[0].key, `mb:${mbid}`)
  await resolve('New Band'); assert.equal(calls, 1)
  await resolve('새 밴드'); assert.equal(calls, 2); assert.ok(sleeps[1] >= 1000)
  const result = { candidates: [{ payload: { artist_keys: [], review_reasons: [], discovered_artists: [discoveredArtist('New Band', 'https://ticket.yes24.com/Perf/1'), discoveredArtist('Other', 'https://ticket.yes24.com/Perf/1')] } }] }
  const identities = await enrichArtists(result, async name => { if (name === 'Other') throw new Error('503'); return resolve(name) })
  assert.equal(identities.length, 1)
  assert.deepEqual(result.candidates[0].payload.artist_keys, [`mb:${mbid}`])
  assert.equal(result.candidates[0].payload.discovered_artists[1].name, 'Other')
  assert.match(result.candidates[0].payload.discovered_artists[1].reason, /실패/)
})

test('source discovery uses J-LIVE only for links and reports independent detail failures', async () => {
  const result = await collectYes24(async url => new Response(url.endsWith('robots.txt') ? 'User-agent: *\nAllow: /' : url.endsWith('/Perf/1') ? html(event) : url.endsWith('/Perf/2') ? 'broken' : '<a href="https://ticket.yes24.com/English/Perf/1">a</a><a href="https://ticket.yes24.com/Perf/2">b</a>'), async () => {})
  assert.equal(result.candidates.length, 1)
  assert.equal(result.failures.length, 1)
  assert.equal(result.discovery_count, 2)
  await assert.rejects(collectYes24(async () => new Response('User-agent: *\nDisallow: /'), async () => {}), /listing size/)
})

test('artist lookup budget and repeated provider errors stop extra requests while retaining credits', async () => {
  let calls = 0
  const limited = createArtistResolver({ maxRequests: 1, sleep: async () => {}, fetcher: async () => { calls++; return new Response('{"artists":[]}') } })
  await limited('First'); await assert.rejects(limited('Second'), /BUDGET/)
  assert.equal(calls, 1)
  const failing = createArtistResolver({ sleep: async () => {}, fetcher: async () => { calls++; return new Response('', { status: 503 }) } })
  await assert.rejects(failing('One'), /503/)
  await assert.rejects(failing('Two'), /503/)
  await assert.rejects(failing('Three'), /unavailable/)
  assert.equal(calls, 3)
})

test('new ingestion retains unresolved candidates and registers a discovered external ID idempotently without publication', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`)
    for (const file of ['202610060001_initial.sql', '202610070001_admin_review.sql', '202610080001_ingestion.sql', '202610110001_catalog_expansion.sql', '20261011150237_discovered_artist_catalog.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    const row = parseYes24(html(event), 'https://ticket.yes24.com/Perf/1')
    const batch = { candidates: [row], failures: [], excluded: [] }
    await db.exec('set role authenticated')
    await assert.rejects(db.query("select public.admin_ingest_catalog('yes24',$1,'[]')", [batch]), /ADMIN_REQUIRED/)
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)")
    await db.query("select public.admin_ingest_catalog('yes24',$1,'[]')", [batch])
    assert.equal((await db.query('select count(*)::int as count from public.collection_candidates')).rows[0].count, 1)
    assert.deepEqual((await db.query('select payload from public.collection_candidates')).rows[0].payload.band_ids, [])
    const identities = await enrichArtists(batch, async () => musicbrainzMatches({ artists: [artist] }, 'New Band'))
    await db.query("select public.admin_ingest_catalog('yes24',$1,$2)", [batch, identities])
    await db.query("select public.admin_ingest_catalog('yes24',$1,$2)", [batch, identities])
    assert.equal((await db.query('select count(*)::int as count from public.bands')).rows[0].count, 1)
    assert.equal((await db.query('select count(*)::int as count from public.concerts')).rows[0].count, 0)
    const candidate = (await db.query('select payload,revision from public.collection_candidates')).rows[0]
    assert.equal(candidate.payload.band_ids.length, 1)
    assert.equal(candidate.payload.initial_import, true)
    assert.equal(candidate.revision, 2)
    const runsBefore = (await db.query('select count(*)::int as count from public.collection_runs')).rows[0].count
    assert.equal((await db.query('select public.service_import_artist($1) as id', [identities[0]])).rows[0].id, candidate.payload.band_ids[0])
    // A provider registration has no dependency on a published concert or ticket.
    const follower = '00000000-0000-4000-8000-000000000099'
    await db.query('insert into auth.users(id) values ($1)', [follower])
    await db.query('insert into public.band_follows(user_id,band_id) values ($1,$2)', [follower, candidate.payload.band_ids[0]])
    await db.query('select public.service_import_artist($1)', [identities[0]])
    assert.equal((await db.query('select count(*)::int as count from public.band_follows where user_id=$1 and band_id=$2', [follower,candidate.payload.band_ids[0]])).rows[0].count, 1)
    assert.equal((await db.query('select count(*)::int as count from public.concerts')).rows[0].count, 0)
    assert.equal((await db.query('select count(*)::int as count from public.collection_runs')).rows[0].count, runsBefore)
    await assert.rejects(db.query('select public.service_import_artist($1)', [{ ...identities[0], evidence: 'https://evil.test/' }]), /INVALID_IDENTITY/)
    assert.equal((await db.query("select public.service_artist_search_cache('get','query:new',null) as result")).rows[0].result, null)
    assert.equal((await db.query("select public.service_artist_search_cache('reserve','query:new',null) as result")).rows[0].result, true)
    assert.equal((await db.query("select public.service_artist_search_cache('reserve','query:other',null) as result")).rows[0].result, false)
    await db.query("select public.service_artist_search_cache('store','query:new',$1)", [[identities[0]]])
    await db.query("select public.service_artist_search_cache('store','query:new',$1)", [[identities[0]]])
    assert.equal((await db.query("select public.service_artist_search_cache('get','query:new',null) as result")).rows[0].result[0].key, `mb:${mbid}`)
    await db.exec('set role authenticated')
    await assert.rejects(db.query("select public.service_artist_search_cache('get','query:new',null)"), /permission denied/)
    await assert.rejects(db.query('select public.service_import_artist($1)', [identities[0]]), /permission denied/)
    await db.exec('reset role')
  } finally { await db.close() }
})
