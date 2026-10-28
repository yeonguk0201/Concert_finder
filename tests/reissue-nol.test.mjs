import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { linkReissueNol, collectReissueNol } from '../scripts/reissue-nol.mjs'
import { nolSessions } from '../scripts/nol.mjs'
import { runSource } from '../scripts/collection-runner.mjs'

// Synthetic DOM, not a captured production page. Schedule facts separately
// checked in NOL on 2026-10-22; these fixtures do not certify selectors or terms.
const entry = { announcementUrl: 'https://reissuerecords.net/2026/10/22/kenshi-yonezu-2026-2027-world-tour-ghost/',
  productUrl: 'https://nol.yanolja.com/ticket/products/26015024', artistKey: 'mb:00000000-0000-4000-8000-000000000001',
  artistNames: ['米津玄師', '요네즈 켄시'], city: '인천', venue: '인스파이어 아레나', timezone: 'Asia/Seoul' }
const international = 'https://world.nol.com/en/ticket/products/26015024'
const notice = `<article><h1>米津玄師 WORLD TOUR</h1><time datetime="2026-10-22T09:00:00+09:00"></time>
  <section><h2>Korea 한국</h2><p>인천 인스파이어 아레나</p>
  <p>공연 2027.01.14 19:30</p><p>공연 2027.01.16 19:00</p><p>공연 2027.01.17 19:00</p>
  <a href="${international}">TICKET</a></section><section><h2>Japan</h2><p>공연 2027.01.15 18:00</p></section></article>`
const product = `<h1>요네즈 켄시 내한공연</h1><p>인천 인스파이어 아레나</p><p>2027.01.14 ~ 2027.01.17</p>
  <section id="venue"><h2>장소</h2><h3>인스파이어 아레나</h3><span>인천광역시 중구 공항문화로 127(운서동)</span></section>
  <p>일반 예매: 2026년 10월 22일 (목) 오후 12시 ~</p>
  <p>공연 일시: 2027년 1월 14일 (목) 오후 7시 30분, 1월 16일 (토) 오후 7시, 1월 17일 (일) 오후 7시</p>
  <a href="${international}">For international users</a>`

test('linked source cross-checks actual individual dates, international product ID, sales and release gate', () => {
  const row = linkReissueNol(notice, product, entry)
  assert.equal(row.payload.sessions.length, 3)
  assert.deepEqual(row.payload.sessions.map(s => s.starts_on), ['2027-01-14', '2027-01-16', '2027-01-17'])
  assert.equal(row.payload.sessions[0].starts_at, '2027-01-14T19:30:00+09:00')
  assert.equal(row.payload.ticket.opens_at, '2026-10-22T12:00:00+09:00')
  assert.deepEqual(row.payload.review_reasons, ['LIVE_LAYOUT_AND_TERMS_UNVERIFIED'])
  assert.equal(row.payload.announcement_verified, false)
  assert.ok(linkReissueNol(notice.replace('26015024', '9999'), product, entry).payload.review_reasons.includes('OFFICIAL_PRODUCT_LINK_MISSING'))
  assert.ok(linkReissueNol(notice, product.replace('오후 12시', '오후 1시'), entry).content_hash !== row.content_hash)
  assert.ok(linkReissueNol(notice, product.replace('내한공연', '내한공연 공연 취소'), entry).payload.cancelled)
  assert.throws(() => nolSessions('공연 일시: 2027년 2월 30일 오후 7시'), /INVALID/)
  assert.throws(() => nolSessions('공연 일시: 1월 14일 오후 7시'), /YEAR_REQUIRED/)
})

test('modified and ambiguous timestamps never become the initial announcement', () => {
  for (const marker of ['itemprop="dateModified"', 'class="updated"', 'class="modified"']) {
    const row = linkReissueNol(notice.replace('<time datetime=', `<time ${marker} datetime=`), product, entry)
    assert.equal(row.payload.announced_at, null)
    assert.ok(row.payload.review_reasons.includes('ANNOUNCEMENT_TIME_UNCONFIRMED'))
  }
  const ambiguous = notice.replace('</time>', '</time><time datetime="2026-10-21T12:00:00+09:00"></time>')
  assert.equal(linkReissueNol(ambiguous, product, entry).payload.announced_at, null)
})

test('observed tour format uses its explicit year header and city rows, not a continuous date range', () => {
  const tour = `<main><h1>米津玄師 WORLD TOUR</h1><p>2026 |</p><p>12/26(Sat) Taipei TAIPEI DOME</p>
    <p>2027 |</p><p>01/14(Thu) Seoul INSPIRE ARENA</p><p>01/16(Sat) Seoul INSPIRE ARENA</p><p>01/17(Sun) Seoul INSPIRE ARENA</p>
    <a href="${international}">TICKET</a></main>`
  const row = linkReissueNol(tour, product, { ...entry, tourCity: 'Seoul', venueNames: ['INSPIRE ARENA', '인스파이어 아레나'] })
  assert.equal(row.payload.city, '인천'); assert.equal(row.payload.sessions.length, 3)
  assert.deepEqual(row.payload.review_reasons, ['ANNOUNCEMENT_TIME_UNCONFIRMED', 'LIVE_LAYOUT_AND_TERMS_UNVERIFIED'])
  assert.ok(linkReissueNol(tour.replace('<p>2027 |</p>', ''), product,
    { ...entry, tourCity: 'Seoul', venueNames: ['INSPIRE ARENA', '인스파이어 아레나'] }).payload.review_reasons.includes('PERFORMANCE_SESSIONS_UNCONFIRMED'))
})

test('captured live detail resolves its sibling title without borrowing an unrelated heading', async () => {
  const announcement = await readFile(new URL('./fixtures/reissue-nol/reissue-detail.html', import.meta.url), 'utf8')
  const ticket = await readFile(new URL('./fixtures/reissue-nol/nol-product.html', import.meta.url), 'utf8')
  // This is only a parser test key, never a verified identity or an upload input.
  const observedEntry = { ...entry, artistNames: ['KENSHI YONEZU', '요네즈 켄시'],
    tourCity: 'Seoul', venueNames: ['INSPIRE ARENA', '인스파이어 아레나'] }
  const row = linkReissueNol(announcement, ticket, observedEntry)
  assert.equal(row.payload.title, 'KENSHI YONEZU 2026-2027 WORLD TOUR / GHOST')
  assert.equal(row.payload.city, '인천')
  assert.equal(row.payload.country_code, 'KR')
  assert.deepEqual(row.payload.sessions.map(s => s.starts_at), [
    '2027-01-14T19:30:00+09:00', '2027-01-16T19:00:00+09:00', '2027-01-17T19:00:00+09:00',
  ])
  assert.equal(row.payload.ticket.opens_at, '2026-10-22T12:00:00+09:00')
  assert.equal(row.payload.announced_at, null) // Displayed date is not a publication timestamp.
  assert.equal(row.payload.announcement_verified, false)
  assert.deepEqual(row.payload.review_reasons, ['ANNOUNCEMENT_TIME_UNCONFIRMED', 'LIVE_LAYOUT_AND_TERMS_UNVERIFIED'])
  assert.throws(() => linkReissueNol(announcement.replace('single single_news single_detail', 'unrelated'), ticket, observedEntry), /LAYOUT_CHANGED/)
  assert.throws(() => linkReissueNol(announcement.replace('<h1>', '<h1>Unrelated</h1><h1>'), ticket, observedEntry), /LAYOUT_CHANGED/)
  assert.ok(linkReissueNol(announcement.replaceAll('26015024', '9999'), ticket, observedEntry)
    .payload.review_reasons.includes('OFFICIAL_PRODUCT_LINK_MISSING'))
  for (const changed of [ticket.replace('id="venue"', 'id="unrelated"'),
    ticket.replace('인천광역시', '서울특별시'), ticket.replace('<h3 ', '<h4 '),
    ticket.replace('>장소</h2>', '>회사 주소</h2>'), ticket + '<section id="venue"></section>']) {
    const blocked = linkReissueNol(announcement, changed, observedEntry).payload
    assert.equal(blocked.country_code, null)
    assert.ok(blocked.review_reasons.includes('KOREA_COUNTRY_UNCONFIRMED'))
  }
})

test('collection uses common source lease, robots and bounded links; a blocked path never uploads', async () => {
  const fetcher = async url => new Response(url.endsWith('robots.txt') ? 'User-agent: *\nAllow: /' : url === entry.productUrl ? product : notice)
  const result = await collectReissueNol([entry], { fetcher, sleep: async () => {} })
  assert.equal(result.candidates.length, 1); assert.equal(result.failures.length, 0)
  let fetched = false
  const locked = await runSource({ client: { rpc: async () => ({ data: null }) }, source: 'reissue_nol', collect: () => { fetched = true } })
  assert.equal(locked.skipped, 'locked_or_disabled'); assert.equal(fetched, false)
  await assert.rejects(collectReissueNol([entry], { fetcher: async () => new Response('User-agent: *\nDisallow: /'), sleep: async () => {} }), /disallowed/)
  await assert.rejects(collectReissueNol([{ ...entry, productUrl: entry.productUrl + '?token=secret' }]), /LINKS_INVALID/)
})

test('existing collection RPC ingests Reissue/NOL with initial silence, immutable overrides and no new identity writer', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`)
    for (const n of ['202610060001_initial', '202610070001_admin_review', '202610080001_ingestion', '202610090001_notifications',
      '202610110001_catalog_expansion', '20261011150237_discovered_artist_catalog', '20261012134538_automated_catalog',
      '20261012135134_artist_management', '20261013070742_artist_curation', '20261014125200_kopis_discovery']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${n}.sql`, import.meta.url), 'utf8'))
    }
    await db.exec(await readFile(new URL('../supabase/migrations/20261022101423_reissue_nol_collection.sql', import.meta.url), 'utf8'))
    await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`)
    const begin = async () => (await db.query("select public.service_begin_collection('reissue_nol',clock_timestamp()) as token")).rows[0].token
    assert.equal(await begin(), null)
    const policy = (await db.query("select collection_enabled,publication_enabled,live_after from public.collection_policies where source='reissue_nol'")).rows[0]
    assert.deepEqual(policy, { collection_enabled: false, publication_enabled: false, live_after: null })
    await db.exec("update public.collection_policies set collection_enabled=true where source='reissue_nol'")
    const band = (await db.query('select public.service_import_artist($1) as id', [{ key: entry.artistKey, name: '요네즈 켄시', aliases: [], country: 'JP', genre: '장르 미검수', evidence: 'https://musicbrainz.org/artist/' + entry.artistKey.slice(3) }])).rows[0].id
    const row = linkReissueNol(notice, product, entry), batch = { candidates: [row], failures: [], excluded: [] }
    const finish = async (token, input = batch, identities = []) => (await db.query('select public.service_complete_collection($1,$2,$3,1,$4) as result', [token, input, identities, 'reissue-nol-review-v1'])).rows[0].result
    let token = await begin()
    await assert.rejects(finish(token, batch, [{ name: 'unexpected writer' }]), /INVALID_BATCH/)
    assert.equal((await finish(token)).published, 0)
    assert.equal((await finish(token)).published, 0)
    const saved = (await db.query('select * from public.collection_candidates')).rows[0]
    assert.deepEqual(saved.payload.band_ids, [band]); assert.equal(saved.payload.initial_import, true)
    token = await begin(); await finish(token)
    assert.equal((await db.query('select revision from public.collection_candidates')).rows[0].revision, 1)
    await db.exec("update public.collection_candidates set automation_blocked=true,status='dismissed'")
    token = await begin(); await finish(token, { ...batch, candidates: [linkReissueNol(notice, product.replace('오후 12시', '오후 1시'), entry)] })
    assert.equal((await db.query('select automation_blocked from public.collection_candidates')).rows[0].automation_blocked, true)
    assert.equal((await db.query('select count(*)::int n from public.concerts')).rows[0].n, 0)
    assert.equal((await db.query('select count(*)::int n from private.notification_deliveries')).rows[0].n, 0)
    assert.equal((await db.query('select count(*)::int n from public.bands')).rows[0].n, 1)
    // Even source publication ON and a caller-forged clean payload cannot remove
    // the server release gate. A different URL avoids the manual override above.
    await db.exec("update public.collection_policies set publication_enabled=true where source='reissue_nol'")
    const forged = { ...row, source_url: row.source_url.replace(/\/$/, '-forged/') }
    forged.payload = { ...row.payload, country_code: 'KR', announcement_verified: true,
      announced_on: new Date().toISOString().slice(0, 10), review_reasons: [] }
    token = await begin()
    assert.equal((await finish(token, { ...batch, candidates: [forged] })).published, 0)
    assert.equal((await db.query('select reason from public.collection_decisions where run_id=$1', [token])).rows[0].reason, 'PARSER_REVIEW_REQUIRED')
    assert.equal((await db.query('select count(*)::int n from public.concerts')).rows[0].n, 0)
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const grants = (await db.query(`select
        has_function_privilege($1, 'public.admin_ingest_catalog(text,jsonb,jsonb)', 'execute') as wrapper,
        has_function_privilege($1, 'private.ingest_catalog_before_reissue(text,jsonb,jsonb)', 'execute') as original`, [role])).rows[0]
      assert.equal(grants.wrapper, role !== 'anon')
      assert.equal(grants.original, false)
    }
    // Other deployed source ingestion still goes through its original body.
    await db.query("select public.admin_ingest_catalog('ualive',$1,'[]')", [{ candidates: [], failures: [], excluded: [] }])
    assert.equal((await db.query("select collection_enabled from public.collection_policies where source='yes24'")).rows[0].collection_enabled, false)
  } finally { await db.close() }
})
