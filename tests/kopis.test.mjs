import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { collectKopis, parseKopis, kopisWindows, kopisSource } from '../scripts/kopis.mjs'
import { collectTicketlinkEvidence, parseTicketlinkNotice, supplementBooking, generalSale, ticketlinkProduct } from '../scripts/booking-evidence.mjs'
import { parseConcert } from '../scripts/ualive.mjs'
import { JSDOM } from 'jsdom'

const xml = (content = '', id = 'PF000001') => `<dbs><db><mt20id>${id}</mt20id><prfnm>RADWIMPS Seoul</prfnm><prfpdfrom>2027.01.01</prfpdfrom><prfpdto>2027.01.01</prfpdto><genrenm>대중음악</genrenm><fcltynm>공연장</fcltynm><area>서울특별시</area><prfcast>RADWIMPS, 미등록 가수</prfcast><frstregdt>2026-10-14 12:00:00</frstregdt><updatedate>2026-10-14 13:00:00</updatedate><dtguidance>금요일(19:00)</dtguidance><relates><relate><relatenm>티켓링크</relatenm><relateurl>http://www.ticketlink.co.kr/product/1</relateurl></relate></relates>${content}</db></dbs>`
const sale = '<div>* 선예매 : 2026년 10월 15일 (목) 12PM</div><div>* 일반 예매 : 2026년 10월 16일 (금) 12PM</div>'
const notice = (text = sale, date = '2027년 01월 01일(금)', venue = '공연장') => `<dl class="th_info"><dd id="noticeTitle">RADWIMPS 티켓오픈 안내</dd><dd><a href="/product/1">예매하기</a></dd></dl><dd class="list_cont"><p>공연 기간 : ${date}</p><p>공연 장소 : ${venue}</p>${text}</dd>`
const noticeUrl = 'https://www.ticketlink.co.kr/help/notice/1'
const body = html => new JSDOM(`<main>${html}</main>`).window.document.querySelector('main')

test('KOPIS XML preserves cast, dates, booking links and attribution without inventing announcements or sale times', () => {
  const row = parseKopis(xml(), 'PF000001')
  assert.equal(row.source_url, kopisSource('PF000001'))
  assert.equal(row.payload.starts_on, '2027-01-01')
  assert.equal(row.payload.country_code, 'KR')
  assert.equal(row.payload.announced_on, null)
  assert.equal(row.payload.announcement_verified, false)
  assert.equal(row.payload.ticket.opens_at, null)
  assert.deepEqual(row.payload.sessions, [])
  assert.equal(row.payload.ticket.booking_url, 'https://www.ticketlink.co.kr/product/1')
  assert.deepEqual(row.payload.discovered_artists.map(a => a.name), ['RADWIMPS', '미등록 가수'])
  assert.deepEqual(row.payload.artist_keys, ['radwimps'])
  assert.match(row.payload.sources[0].label, /예술경영지원센터.*KOPIS/)
  assert.equal(parseKopis(xml(), 'PF000001').content_hash, row.content_hash)
  assert.throws(() => parseKopis(xml().replace('2027.01.01', '2027.02.30'), 'PF000001'), /date/)
  for (const region of ['충북', '충남', '전남', '경북', '경남', '전북특별자치도']) assert.equal(parseKopis(xml().replace('서울특별시', region), 'PF000001').payload.country_code, 'KR')
  for (const region of ['해외', '서울도쿄', '미상']) {
    const unknown = parseKopis(xml().replace('서울특별시', region), 'PF000001')
    assert.equal(unknown.payload.country_code, null)
    assert.equal(unknown.payload.city, region)
    assert.ok(unknown.payload.review_reasons.some(s => s.includes(region)))
  }
  assert.throws(() => parseKopis(xml(), 'PF000002'), /ID mismatch/)
  assert.throws(() => parseKopis('<!DOCTYPE dbs [<!ENTITY secret SYSTEM "file:///etc/passwd">]><dbs/>', 'PF000001'), /declaration/)
  assert.throws(() => parseKopis('<response>provider auth error</response>', 'PF000001'), /API error/)
  assert.throws(() => parseKopis('<dbs><db><returncode>02</returncode><errmsg>SERVICE KEY IS NOT REGISTERED ERROR</errmsg></db></dbs>', 'PF000001'), /service key/)
})

test('KOPIS windows obey 31-day API limit across month/leap boundaries', () => {
  const windows = kopisWindows('2028-02-01', '2028-04-01')
  assert.deepEqual(windows, [{ start: '2028-02-01', end: '2028-03-02' }, { start: '2028-03-03', end: '2028-04-01' }])
  assert.throws(() => kopisWindows('2027-02-30', '2027-03-01'), /date/)
  assert.throws(() => kopisWindows('2027-01-01', '2029-01-01'), /range/)
})

test('KOPIS paginates, deduplicates, rotates bounded detail batches and never fetches booking URLs', async () => {
  const ids = Array.from({ length: 100 }, (_, i) => `PF${String(i + 1).padStart(6, '0')}`)
  const calls = [], sleeps = []
  const fetcher = async (url, options) => {
    const u = new URL(url); calls.push(u)
    assert.equal(u.origin, 'https://kopis.or.kr')
    assert.equal(options.redirect, 'error')
    assert.equal(u.searchParams.get('service'), 'test-key')
    if (u.pathname.endsWith('/pblprfr')) {
      assert.equal(u.searchParams.get('shcate'), 'CCCD')
      return new Response(u.searchParams.get('cpage') === '1' ? `<dbs>${ids.map(id => `<db><mt20id>${id}</mt20id></db>`).join('')}</dbs>` : '<dbs/>')
    }
    return new Response(xml('', u.pathname.split('/').at(-1)))
  }
  const result = await collectKopis({ serviceKey: 'test-key', fetcher, sleep: async ms => sleeps.push(ms), today: '2027-01-01', end: '2027-02-01', slot: 1, maxDetails: 2 })
  assert.equal(result.discovery_count, 100)
  assert.deepEqual(result.candidates.map(r => r.payload.kopis_id), ['PF000003', 'PF000004'])
  assert.equal(calls.filter(u => u.pathname.endsWith('/pblprfr')).length, 4)
  assert.match(result.warnings[0], /50/)
  assert.ok(sleeps.every(ms => ms === 1000))
})

test('KOPIS rejects missing keys, API errors and truncated listing budgets; network errors never leak keys', async () => {
  await assert.rejects(collectKopis({ serviceKey: '', fetcher: () => assert.fail('no requests') }), /missing/)
  await assert.rejects(collectKopis({ serviceKey: 'secret-test', sleep: async () => {}, fetcher: async url => { throw new Error(url) } }), error => !error.message.includes('secret-test') && /request failed/.test(error.message))
  await assert.rejects(collectKopis({ serviceKey: 'test', sleep: async () => {}, fetcher: async () => new Response('<error>key invalid</error>') }), /API error/)
  await assert.rejects(collectKopis({ serviceKey: 'test', sleep: async () => {}, fetcher: async () => new Response('<dbs/>'), maxListRequests: 1 }), /budget exceeded/)
})

test('KOPIS records detail failures and stops a failing provider after three consecutive errors', async () => {
  let requests = 0
  const result = await collectKopis({ serviceKey: 'test', today: '2027-01-01', end: '2027-01-01', sleep: async () => {}, fetcher: async url => {
    requests++
    return new Response(new URL(url).pathname.endsWith('/pblprfr') ? '<dbs><db><mt20id>PF000001</mt20id></db><db><mt20id>PF000002</mt20id></db><db><mt20id>PF000003</mt20id></db><db><mt20id>PF000004</mt20id></db></dbs>' : '<dbs/>')
  } })
  assert.equal(requests, 4)
  assert.equal(result.candidates.length, 0)
  assert.equal(result.failures.length, 4)
})

test('ticket notice extracts explicit general sale only, handling noon/midnight and ambiguous times', () => {
  const e = parseTicketlinkNotice(notice(), noticeUrl)
  assert.equal(e.opens_at, '2026-10-16T12:00:00+09:00')
  assert.equal(e.starts_on, '2027-01-01')
  assert.equal(generalSale(body('<p>일반 예매 : 2026.10.16 12AM</p>')).opens_at, '2026-10-16T00:00:00+09:00')
  assert.equal(generalSale(body('<p>일반 예매 : 2026년 10월 16일 오후 8시 30분</p>')).opens_at, '2026-10-16T20:30:00+09:00')
  for (const html of ['<p>선예매 : 2026.10.15 12PM</p>', '<p>티켓 오픈 : 2026.10.15 12PM</p>', '<p>일반 예매 : 10월 16일 12PM</p>', '<p>일반 예매 : 2026.10.16 추후 공지</p>', '<p>일반 예매 변경 : 2026.10.16 12PM</p>']) assert.equal(generalSale(body(html)).opens_at, null)
  assert.match(generalSale(body('<p>일반 예매 : 2026.10.16 12PM</p><p>일반 예매 : 2026.10.17 12PM</p>')).reason, /충돌/)
  assert.throws(() => parseTicketlinkNotice(notice(sale, '2027.01.01 ~ 01.02'), noticeUrl), /range/)
  assert.throws(() => parseTicketlinkNotice(notice().replace('/product/1', '/search?q=band'), noticeUrl), /identity/)
  assert.equal(ticketlinkProduct('https://www.ticketlink.co.kr.evil.test/product/1'), null)
})

test('ticket notice collector observes robots, fixed hosts, redirects and independent page failures', async () => {
  const calls = []
  const result = await collectTicketlinkEvidence([noticeUrl, noticeUrl + '2'], async (url, options) => {
    calls.push(url); assert.equal(options.redirect, 'error')
    return new Response(url.endsWith('robots.txt') ? 'User-agent: *\nAllow: /\nDisallow: /search' : url === noticeUrl ? notice() : '<html>challenge</html>')
  }, async () => {})
  assert.equal(result.evidence.length, 1); assert.equal(result.failures.length, 1)
  assert.equal(calls.length, 3)
  const denied = await collectTicketlinkEvidence([noticeUrl], async url => { assert.ok(url.endsWith('robots.txt')); return new Response('Disallow: /help/') }, async () => {})
  assert.equal(denied.evidence.length, 0); assert.equal(denied.failures.length, 1)
  await assert.rejects(collectTicketlinkEvidence(['https://127.0.0.1/'], () => assert.fail('unsafe fetch')), /allowlist/)
})

test('booking supplementation requires same product, dates and venue; disagreements stay in review', () => {
  const evidence = parseTicketlinkNotice(notice(), noticeUrl)
  const row = supplementBooking(parseKopis(xml(), 'PF000001'), [evidence])
  assert.equal(row.payload.ticket.opens_at, '2026-10-16T03:00:00.000Z')
  assert.ok(row.payload.sources.some(s => s.url === noticeUrl))
  assert.equal(row.payload.announcement_verified, false)
  const unrelated = supplementBooking(parseKopis(xml(), 'PF000001'), [{ ...evidence, booking_url: 'https://www.ticketlink.co.kr/product/2' }])
  assert.equal(unrelated.payload.ticket.opens_at, null)
  for (const changed of [{ ...evidence, starts_on: '2027-02-01' }, { ...evidence, venue: '다른 공연장' }]) {
    const mismatch = supplementBooking(parseKopis(xml(), 'PF000001'), [changed])
    assert.equal(mismatch.payload.ticket.opens_at, null)
    assert.ok(mismatch.payload.review_reasons.some(s => /불일치/.test(s)))
    assert.equal(mismatch.payload.ticket_evidence[0].event_matched, false)
    assert.ok(mismatch.payload.sources.some(s => s.url === noticeUrl))
  }
  const conflict = supplementBooking(parseKopis(xml(), 'PF000001'), [evidence, { ...evidence, source_url: noticeUrl + '2', opens_at: '2026-10-17T12:00:00+09:00' }])
  assert.equal(conflict.payload.ticket.opens_at, null)
  assert.ok(conflict.payload.review_reasons.some(s => /충돌/.test(s)))
  assert.equal(conflict.payload.ticket_evidence.length, 2)
})

test('CLI discovery → notice supplement → stable content hash → report works without exposing API keys', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'encore-kopis-test-'))
  try {
    const code = `
      process.env.KOPIS_SERVICE_KEY = 'test-secret-key';
      process.argv.push('--source=kopis', '--skip-artist-lookup', '--output=report.json');
      globalThis.fetch = async (value, options) => {
        const u = new URL(value);
        if (options.redirect !== 'error') throw new Error('redirect policy');
        if (u.origin === 'https://kopis.or.kr') return new Response(${JSON.stringify(xml())});
        if (u.href === 'https://www.ticketlink.co.kr/robots.txt') return new Response('User-agent: *\\nAllow: /');
        if (u.href === 'https://www.ticketlink.co.kr/help/notice/62400') return new Response(${JSON.stringify(notice())});
        throw new Error('Unexpected fetch');
      };
      await import(${JSON.stringify(new URL('../scripts/collect-catalog.mjs', import.meta.url).href)});
    `
    const { stdout, stderr } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', code], { cwd: directory, encoding: 'utf8' })
    const report = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'))
    assert.equal(report.complete, true)
    const result = report.results[0], row = result.candidates[0]
    assert.equal(result.source, 'kopis'); assert.equal(result.uploaded, false); assert.equal(result.failures.length, 0)
    assert.equal(row.payload.ticket.opens_at, '2026-10-16T03:00:00.000Z')
    assert.equal(row.content_hash, createHash('sha256').update(JSON.stringify(row.payload)).digest('hex'))
    assert.ok(row.payload.sources.some(s => s.url === 'https://www.ticketlink.co.kr/help/notice/62400'))
    assert.ok(!`${stdout}${stderr}`.includes('test-secret-key'))
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('promoter ticket section supplements KOPIS through exact product/date/venue identity', () => {
  const promoter = parseConcert('<h1>RADWIMPS</h1><section><h2>공연 시간</h2>2027. 01. 01.(금) 19:00</section><a href="https://naver.me/test">공연장</a><a href="https://www.ticketlink.co.kr/product/1">예매</a><section><h2>티켓 예매</h2>' + sale + '</section>', 'https://ualive.com/concerts/1')
  assert.equal(promoter.payload.ticket.opens_at, '2026-10-16T12:00:00+09:00')
  const evidence = { source_url: promoter.source_url, ...promoter.payload.ticket, starts_on: promoter.payload.starts_on, ends_on: promoter.payload.ends_on, venue: promoter.payload.venue }
  assert.equal(supplementBooking(parseKopis(xml(), 'PF000001'), [evidence]).payload.ticket.opens_at, '2026-10-16T03:00:00.000Z')
})

test('database accepts KOPIS batches in review, fences unauthorized writes, preserves revisions and disables YES24', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`)
    for (const file of ['202610060001_initial.sql', '202610070001_admin_review.sql', '202610080001_ingestion.sql', '202610090001_notifications.sql', '202610110001_catalog_expansion.sql', '20261011150237_discovered_artist_catalog.sql', '20261012134538_automated_catalog.sql', '20261012135134_artist_management.sql', '20261013070742_artist_curation.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    // Hosted projects can have an explicit anon grant in addition to PUBLIC privileges.
    await db.exec('grant execute on function public.admin_ingest_catalog(text,jsonb,jsonb) to anon')
    await db.exec(await readFile(new URL('../supabase/migrations/20261014125200_kopis_discovery.sql', import.meta.url), 'utf8'))
    assert.equal((await db.query("select has_function_privilege('anon','public.admin_ingest_catalog(text,jsonb,jsonb)','execute') as allowed")).rows[0].allowed, false)
    const row = supplementBooking(parseKopis(xml(), 'PF000001'), [parseTicketlinkNotice(notice(), noticeUrl)])
    const batch = { candidates: [row], failures: [], excluded: [] }
    await db.exec('set role authenticated')
    await assert.rejects(db.query("select public.admin_ingest_catalog('kopis',$1,'[]')", [batch]), /ADMIN_REQUIRED/)
    await assert.rejects(db.query("select public.service_begin_collection('kopis',now())"), /permission denied/)
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)")
    const begin = async () => (await db.query("select public.service_begin_collection('kopis',now()) as id")).rows[0].id
    const finish = async token => db.query("select public.service_complete_collection($1,$2,'[]',1,'catalog-v1')", [token, batch])
    await finish(await begin()); await finish(await begin())
    const stored = (await db.query('select * from public.collection_candidates')).rows[0]
    assert.equal(stored.revision, 1); assert.equal(stored.status, 'pending')
    assert.equal(stored.payload.ticket.opens_at, '2026-10-16T03:00:00.000Z')
    assert.ok(stored.payload.sources.some(s => s.url === noticeUrl))
    assert.equal((await db.query('select count(*)::int as n from public.concerts')).rows[0].n, 0)
    assert.equal((await db.query("select publication_enabled from public.collection_policies where source='kopis'")).rows[0].publication_enabled, false)
    assert.equal((await db.query("select public.service_begin_collection('yes24',now()) as id")).rows[0].id, null)
    for (const bad of ['https://www.kopis.or.kr.evil.test/por/db/pblprfr/pblprfrView.do?mt20Id=PF000001', row.source_url + '&service=secret']) {
      batch.candidates = [{ ...row, source_url: bad }]
      await assert.rejects(db.query("select public.admin_ingest_catalog('kopis',$1,'[]')", [batch]), /INVALID_CANDIDATE/)
    }
  } finally { await db.close() }
})
