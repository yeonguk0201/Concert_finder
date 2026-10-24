import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PGlite } from '@electric-sql/pglite'
import { createArtistResolver, discoveredArtist, enrichArtists } from '../scripts/artist-discovery.mjs'
import { readCollectionArtists, createCatalogArtistResolver, assertCollectionLinksPreserved } from '../scripts/collection-artist-links.mjs'
import { runSource } from '../scripts/collection-runner.mjs'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const band = { id: id(1), name: 'Fictional Rock', aliases: ['가상 록', '架空ロック'], country_code: 'JP', musicbrainz_id: id(2), curation_status: 'approved' }
const identity = { key: `mb:${id(2)}`, name: band.name, aliases: [], country: 'JP', truncated: false }
const candidate = (keys = []) => ({ source_url: 'https://ticket.yes24.com/Perf/1', content_hash: 'a'.repeat(64),
  payload: { artist_keys: keys, review_reasons: [], discovered_artists: [discoveredArtist('가상 록', 'https://ticket.yes24.com/Perf/1')] } })
const priorReader = data => ({ from: table => ({ select: projection => {
  assert.equal(table, 'collection_candidates'); assert.equal(projection, 'source_url,artist_keys:payload->artist_keys,band_ids:payload->band_ids')
  return { in: async () => ({ data }) }
} }) })

test('approved multilingual aliases share one canonical provider lookup and require the matching MBID', async () => {
  let requests = 0
  const provider = createArtistResolver({ sleep: async () => {}, fetcher: async url => {
    assert.ok(decodeURIComponent(url).includes(band.name)); requests++
    return new Response(JSON.stringify({ artists: [{ id: id(2), name: band.name, country: 'JP' }], count: 1 }))
  } })
  const resolve = createCatalogArtistResolver([band], provider)
  const row = candidate()
  row.payload.discovered_artists.push(discoveredArtist('架空ロック', row.source_url))
  const result = { candidates: [row] }
  await enrichArtists(result, resolve)
  assert.equal(requests, 1)
  assert.deepEqual(row.payload.artist_keys, [identity.key])
  assert.ok(row.payload.discovered_artists.every(c => c.key === identity.key))
  assert.deepEqual(band.aliases, ['가상 록', '架空ロック'])
})

test('catalog collisions, protected/unreviewed rows and missing MBIDs do not become name-only connections', async () => {
  let calls = 0
  const provider = async () => { calls++; return [identity] }
  for (const rows of [[band, { ...band, id: id(3), curation_status: 'excluded' }],
    [{ ...band, curation_status: 'held' }], [{ ...band, curation_status: 'unreviewed' }], [{ ...band, musicbrainz_id: null }]]) {
    await assert.rejects(createCatalogArtistResolver(rows, provider)('가상 록'), /ARTIST_CATALOG_/)
  }
  assert.equal(calls, 0)
})

test('reviewed credits receive the shared request budget before unknown credits without rearranging the cast', async () => {
  const queries = []
  const provider = createArtistResolver({ maxRequests: 1, sleep: async () => {}, fetcher: async url => {
    queries.push(decodeURIComponent(url))
    return new Response(JSON.stringify({ artists: [{ id: id(2), name: band.name, country: 'JP' }], count: 1 }))
  } })
  const row = candidate()
  row.payload.discovered_artists.unshift(discoveredArtist('Unknown cast', row.source_url))
  await enrichArtists({ candidates: [row] }, createCatalogArtistResolver([band], provider))
  assert.equal(queries.length, 1); assert.ok(queries[0].includes(band.name))
  assert.equal(row.payload.discovered_artists[0].name, 'Unknown cast')
  assert.equal(row.payload.discovered_artists[1].key, identity.key)
  assert.match(row.payload.discovered_artists[0].reason, /한도/)
})

test('provider ambiguity, truncation, country/ID conflicts and duplicate DB MBIDs stay unresolved', async () => {
  for (const matches of [[], [identity, { ...identity, key: `mb:${id(3)}` }], [{ ...identity, truncated: true }],
    [{ ...identity, country: 'US' }], [{ ...identity, key: `mb:${id(3)}` }]]) {
    const row = candidate()
    await enrichArtists({ candidates: [row] }, createCatalogArtistResolver([band], async () => matches))
    assert.deepEqual(row.payload.artist_keys, []); assert.match(row.payload.discovered_artists[0].reason, /충돌/)
  }
  await assert.rejects(createCatalogArtistResolver([band, { ...band, id: id(3), name: 'Other', aliases: [] }], async () => [identity])('가상 록'), /CONFLICT/)
  await assert.rejects(createCatalogArtistResolver([{ ...band, curation_status: 'excluded' }], async () => [identity])('Provider-only alias'), /CONFLICT/)
})

test('unknown artists retain the existing discovery path and skip mode cannot fabricate catalog matches', async () => {
  const queried = []
  assert.deepEqual(await createCatalogArtistResolver([], async name => { queried.push(name); return [identity] })('Unknown'), [identity])
  assert.deepEqual(queried, ['Unknown'])
  const row = candidate()
  await enrichArtists({ candidates: [row] }, createCatalogArtistResolver([band], null))
  assert.deepEqual(row.payload.artist_keys, []); assert.match(row.payload.discovered_artists[0].reason, /생략/)
})

test('catalog reads paginate in stable order without dropping protected artists; partial/error reads fail closed', async () => {
  const rows = Array.from({ length: 501 }, (_, n) => ({ ...band, id: id(n + 10), curation_status: n === 500 ? 'held' : 'approved' }))
  const calls = []
  const fake = read => ({ from: () => ({ select: fields => {
    assert.equal(fields, 'id,name,aliases,country_code,musicbrainz_id,curation_status')
    return { order: key => { assert.equal(key, 'id'); return { range: async (lo, hi) => { calls.push([lo, hi]); return read(lo, hi) } } } }
  } }) })
  assert.equal((await readCollectionArtists(fake((lo, hi) => ({ data: rows.slice(lo, hi + 1) }))))[500].curation_status, 'held')
  assert.deepEqual(calls, [[0, 499], [500, 999]])
  await assert.rejects(readCollectionArtists(fake(() => ({ error: { message: 'private' } }))), /CONTEXT_UNAVAILABLE/)
  await assert.rejects(readCollectionArtists(fake(() => ({ data: [band, band] }))), /CONTEXT_UNAVAILABLE/)
})

test('pre-upload guard permits additions but blocks empty, partial, and changed identities without copying old keys', async () => {
  const old = { source_url: candidate().source_url, artist_keys: [identity.key, 'other'], band_ids: [id(1), id(3)] }
  await assertCollectionLinksPreserved(priorReader([old]), { candidates: [candidate(['other', identity.key, 'new'])] })
  for (const keys of [[], [identity.key], ['new']]) {
    const row = candidate(keys), before = structuredClone(row)
    await assert.rejects(assertCollectionLinksPreserved(priorReader([old]), { candidates: [row] }), error => {
      assert.equal(error.message, 'COLLECTION_IDENTITY_REGRESSION')
      assert.deepEqual(error.review, [{ source_url: row.source_url, reason: 'ARTIST_LINK_REMOVAL_REQUIRES_REVIEW', previous_key_count: 2, incoming_key_count: keys.length }])
      return true
    })
    assert.deepEqual(row, before)
  }
  await assert.rejects(assertCollectionLinksPreserved(priorReader([{ ...old, artist_keys: [] }]), { candidates: [candidate()] }), /IDENTITY_REGRESSION/)
  await assertCollectionLinksPreserved(priorReader([]), { candidates: [candidate()] })
})

test('regression closes the existing source lease as a failure without retrying collection or invoking completion', async () => {
  const calls = []; let collections = 0
  const prior = priorReader([{ source_url: candidate().source_url, artist_keys: [identity.key], band_ids: [id(1)] }])
  const client = { ...prior, rpc: async (name, args) => { calls.push({ name, args }); return { data: id(99) } } }
  await assert.rejects(runSource({ client, source: 'kopis', collect: async () => { collections++; return { candidates: [candidate()] } },
    upload: async batch => { await assertCollectionLinksPreserved(client, batch); throw Error('must never complete') },
    sleep: async () => { throw Error('must not retry') } }), /COLLECTION_IDENTITY_REGRESSION/)
  assert.equal(collections, 1)
  assert.deepEqual(calls.map(c => c.name), ['service_begin_collection', 'service_fail_collection'])
  assert.equal(calls[1].args.failure_code, 'COLLECTION_IDENTITY_REGRESSION')
})

test('guarded ingestion preserves the actual SQL candidate revision/payload when lookup is lost', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`)
    for (const file of ['202610060001_initial.sql', '202610070001_admin_review.sql', '202610080001_ingestion.sql', '202610110001_catalog_expansion.sql', '20261011150237_discovered_artist_catalog.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    }
    await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)")
    const registered = { ...identity, genre: '장르 미검수', evidence: `https://musicbrainz.org/artist/${id(2)}` }
    const first = { candidates: [candidate([identity.key])], failures: [], excluded: [] }
    await db.query("select public.admin_ingest_catalog('yes24',$1,$2)", [first, [registered]])
    const before = (await db.query('select payload,revision from public.collection_candidates')).rows
    const reader = { from: () => ({ select: () => ({ in: async (_key, urls) => ({ data: (await db.query(
      "select source_url,payload->'artist_keys' as artist_keys,payload->'band_ids' as band_ids from public.collection_candidates where source_url=any($1)", [urls])).rows }) }) }) }
    const next = { candidates: [candidate()], failures: [], excluded: [] }
    await assert.rejects(async () => {
      await assertCollectionLinksPreserved(reader, next)
      await db.query("select public.admin_ingest_catalog('yes24',$1,'[]')", [next])
    }, /IDENTITY_REGRESSION/)
    assert.deepEqual((await db.query('select payload,revision from public.collection_candidates')).rows, before)
    assert.equal((await db.query('select count(*)::int as n from public.concerts')).rows[0].n, 0)
    await assertCollectionLinksPreserved(reader, first)
    await db.query("select public.admin_ingest_catalog('yes24',$1,$2)", [first, [registered]])
    assert.deepEqual((await db.query('select payload,revision from public.collection_candidates')).rows, before)
  } finally { await db.close() }
})

async function checkUploadMode(mode, hasLinks = true) {
  const directory = await mkdtemp(join(tmpdir(), 'concert-link-cli-'))
  const url = 'https://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20Id=PF000001'
  const xml = '<dbs><db><mt20id>PF000001</mt20id><prfnm>Fictional Seoul</prfnm><prfpdfrom>2027.01.01</prfpdfrom><prfpdto>2027.01.01</prfpdto><genrenm>대중음악</genrenm><fcltynm>가상 공연장</fcltynm><area>서울특별시</area><prfcast>가상 록</prfcast></db></dbs>'
  const code = `
    import { writeFile } from 'node:fs/promises';
    process.env.KOPIS_SERVICE_KEY='fictional-kopis-binding';
    process.env.SUPABASE_URL='https://czjrzylvnewfjnfwjhwf.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY='fictional-service-binding';
    delete process.env.CATALOG_SCHEDULED_AT;
    process.argv.push('--source=kopis','--upload',${JSON.stringify(mode)},'--output=report.json');
    const calls=[];
    globalThis.fetch=async (value,options)=>{
      const u=new URL(value);
      if(u.hostname==='kopis.or.kr') return new Response(${JSON.stringify(xml)});
      const name=u.pathname.split('/').at(-1); calls.push(name);
      if(name==='service_begin_collection') return new Response(JSON.stringify(${JSON.stringify(id(99))}));
      if(name==='bands') return new Response('[]');
      if(name==='collection_candidates') return new Response(JSON.stringify([{source_url:${JSON.stringify(url)},artist_keys:${JSON.stringify(hasLinks ? [identity.key] : [])},band_ids:${JSON.stringify(hasLinks ? [id(1)] : [])}}]));
      if(name==='service_fail_collection') return new Response('null');
      if(name==='service_complete_collection') {
        const request=JSON.parse(options.body);
        if(${JSON.stringify(mode)}!=='--concerts-only' || request.identities.length!==0) throw Error('Artist writer violation');
        return new Response(JSON.stringify({published:0,review:1}));
      }
      throw Error('Unexpected fetch');
    };
    await import(${JSON.stringify(new URL('../scripts/collect-catalog.mjs', import.meta.url).href)});
    await writeFile('calls.json',JSON.stringify(calls),'utf8');
  `
  try {
    const execution = promisify(execFile)(process.execPath, ['--input-type=module', '-e', code], { cwd: directory, encoding: 'utf8' })
    if (hasLinks) await assert.rejects(execution, error => {
      assert.equal(error.code, 1)
      assert.doesNotMatch(error.stdout + error.stderr, /fictional-kopis-binding|fictional-service-binding/)
      return true
    })
    else {
      const { stdout, stderr } = await execution
      assert.doesNotMatch(stdout + stderr, /fictional-kopis-binding|fictional-service-binding/)
    }
    const report = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'))
    const result = report.results[0]
    assert.equal(result.error, hasLinks ? 'COLLECTION_IDENTITY_REGRESSION' : undefined); assert.equal(result.uploaded, !hasLinks)
    assert.equal(result.candidates.length, 1); assert.deepEqual(result.candidates[0].payload.artist_keys, [])
    if (hasLinks) assert.deepEqual(result.identity_link_review, [{ source_url: url, reason: 'ARTIST_LINK_REMOVAL_REQUIRES_REVIEW', previous_key_count: 1, incoming_key_count: 0 }])
    const calls = JSON.parse(await readFile(join(directory, 'calls.json'), 'utf8'))
    assert.equal(calls.includes('service_fail_collection'), hasLinks); assert.equal(calls.includes('service_complete_collection'), !hasLinks)
  } finally { await rm(directory, { recursive: true, force: true }) }
}

test('upload CLI in skip mode blocks completion and retains a review draft', () => checkUploadMode('--skip-artist-lookup'))
test('concert-only mode cannot bypass link-regression protection', () => checkUploadMode('--concerts-only'))
test('concert-only mode preserves its empty identity payload on successful completion', () => checkUploadMode('--concerts-only', false))
