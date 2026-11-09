import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { normalizeKopisSessions, linkKopisCast, parseKopisApiFacts } from '../scripts/kopis-api-facts.mjs'
import { collectKopis } from '../scripts/kopis.mjs'

// Fictional data. No API requests, DB writes, or operational state files.
const observedAt = '2027-01-01T00:00:00.000Z', now = Date.parse(observedAt)
const band = { id: '00000000-0000-4000-8000-000000000001', name: 'Fixture Band', aliases: ['가상 밴드'], country_code: 'KR', curation_status: 'approved' }
const approval = { identity_key: 'mb:00000000-0000-4000-8000-000000000002', band_id: band.id }
const context = { observedAt, now, catalog: [band], approvals: [approval],
  sourceUse: { source: 'kopis', facts_only: true, basis_url: 'https://www.kopis.or.kr/fixture-terms', verified_at: observedAt } }
const xml = (guidance = '목요일(19:30), 토요일 ~ 일요일(19:00)', cast = 'Fixture Band', state = '공연예정', id = 'PF000001') => `<dbs><db>
  <mt20id>${id}</mt20id><prfnm>Fictional concert ${id}</prfnm><prfpdfrom>2027.01.14</prfpdfrom><prfpdto>2027.01.17</prfpdto>
  <genrenm>대중음악</genrenm><fcltynm>가상 공연장</fcltynm><area>서울특별시</area><prfcast>${cast}</prfcast>
  <prfstate>${state}</prfstate><dtguidance>${guidance}</dtguidance><frstregdt>2026-10-01 12:00:00</frstregdt>
  <updatedate>2026-12-01 12:00:00</updatedate><poster>https://external.example/poster.jpg</poster><sty>External full body</sty>
  <relates><relate><relatenm>Booking</relatenm><relateurl>https://nol.yanolja.com/ticket/products/123</relateurl></relate></relates>
  </db></dbs>`

test('API-first facts accept missing announcement and sale with all required context; no fabricated facts or external products', () => {
  const row = parseKopisApiFacts(xml(), 'PF000001', context), p = row.payload
  assert.equal(row.proposed_contract_ready, true)
  assert.equal(row.api_first_preview, true)
  assert.deepEqual(p.review_reasons, [])
  assert.equal(p.announced_on, null); assert.equal(p.announced_at, null); assert.equal(p.announcement_verified, false)
  assert.equal(p.ticket.opens_at, null); assert.equal(p.ticket.booking_url, null)
  assert.deepEqual(p.booking_links, []); assert.deepEqual(p.ticket_evidence, [])
  assert.equal(p.initial_import, true)
  assert.deepEqual(p.sessions.map(s => s.starts_on), ['2027-01-14', '2027-01-16', '2027-01-17'])
  assert.equal(p.sessions[0].starts_at, '2027-01-14T19:30:00+09:00')
  assert.equal(p.sources[0].verified_at, observedAt)
  assert.deepEqual(p.artist_keys, [approval.identity_key]); assert.deepEqual(p.band_ids, [band.id])
  assert.equal(p.discovered_artists[0].band_id, band.id)
  assert.equal(p.api_observation.id, p.kopis_id)
  assert.ok(!/external.example|External full body|nol.yanolja.com/.test(JSON.stringify(row)))
  assert.equal(parseKopisApiFacts(xml(), 'PF000001', context).content_hash, row.content_hash)
  assert.equal('reviewed_revision' in row, false); assert.equal('automatic_enrichment' in row, false)
})

test('explicit full dates and multiple times normalize across leap-day and month boundaries', () => {
  assert.deepEqual(normalizeKopisSessions('2028.02.29(14:00, 19:30), 2028-03-01(18:00)', '2028-02-29', '2028-03-01')
    .map(s => s.starts_at), ['2028-02-29T14:00:00+09:00', '2028-02-29T19:30:00+09:00', '2028-03-01T18:00:00+09:00'])
  assert.equal(normalizeKopisSessions('금요일(00:00)', '2027-01-01', '2027-01-01')[0].starts_at, '2027-01-01T00:00:00+09:00')
})

test('ambiguous periods, partial dates, exceptions, trailing text, duplicates and invalid clock/calendar values are held', () => {
  for (const guidance of ['', '19:00', '매일 19:00', '2027.01.14 ~ 2027.01.17', '1월 14일(19:00)',
    '목요일(19:00) 단, 공휴일 제외', '목요일(19:00),', '목요일(24:00)', '목요일(19:60)',
    '목요일(19:00,19:00)', '목요일(19:00), 목요일(20:00)', '토요일~일요일(19:00), 일요일(19:00)',
    '일요일~토요일(19:00)', '2027.02.30(19:00)', '2027.01.18(19:00)', '수요일(19:00)',
    '2027.01.14(19:00), 목요일(19:00)', '목요일(7:00)']) {
    assert.throws(() => normalizeKopisSessions(guidance, '2027-01-14', '2027-01-17'), /SESSIONS_UNVERIFIED/, guidance)
  }
  for (const dates of [['2027-02-30', '2027-03-01'], ['2027-01-17', '2027-01-14'], ['2027-01-01', '2029-01-01']]) {
    assert.throws(() => normalizeKopisSessions('목요일(19:00)', ...dates), /SESSIONS_UNVERIFIED/)
  }
})

test('whole cast must match unique approved identities; one representative never approves the rest', () => {
  const row = parseKopisApiFacts(xml(undefined, 'Fixture Band, Unregistered guest'), 'PF000001', context)
  assert.equal(row.proposed_contract_ready, false)
  assert.deepEqual(row.payload.discovered_artists.map(c => c.name), ['Fixture Band', 'Unregistered guest'])
  assert.ok(row.payload.review_reasons.includes('ARTIST_OR_GENRE_UNVERIFIED'))
  assert.equal(parseKopisApiFacts(xml(undefined, '가상 밴드'), 'PF000001', context).proposed_contract_ready, true)
  const collision = { ...band, id: '00000000-0000-4000-8000-000000000003', curation_status: 'excluded' }
  assert.deepEqual(linkKopisCast('Fixture Band', { catalog: [band, collision], approvals: [approval] }).reasons, ['ARTIST_AMBIGUOUS'])
  for (const change of [{ approvals: [] }, { catalog: [{ ...band, curation_status: 'held' }] },
    { approvals: [approval, { ...approval, band_id: collision.id }] }, { catalog: [{ ...band, country_code: null }] }]) {
    assert.equal(parseKopisApiFacts(xml(), 'PF000001', { ...context, ...change }).proposed_contract_ready, false)
  }
  assert.ok(linkKopisCast('', context).reasons.includes('CAST_MISSING'))
  assert.ok(linkKopisCast('Fixture Band 외 다수', context).reasons.length)
  assert.throws(() => linkKopisCast('Fixture Band', { catalog: [band, band] }), /ARTIST_CONTEXT_INVALID/)
  assert.throws(() => linkKopisCast('Fixture Band', { catalog: [band], approvals: [{ ...approval, identity_key: '' }] }), /ARTIST_CONTEXT_INVALID/)
})

test('observation must be actual and fresh; source-use configuration cannot be inferred from API access', () => {
  for (const value of [undefined, '2027-01-01', '2027-01-01T00:00:01Z', '2026-12-31T22:59:59Z']) {
    assert.throws(() => parseKopisApiFacts(xml(), 'PF000001', { ...context, observedAt: value }), /API_OBSERVATION_REQUIRED/)
  }
  for (const sourceUse of [null, { ...context.sourceUse, facts_only: false }, { ...context.sourceUse, source: 'nol' },
    { ...context.sourceUse, basis_url: 'https://kopis.or.kr.evil.test/terms' },
    { ...context.sourceUse, basis_url: 'https://user@kopis.or.kr/terms' }, { ...context.sourceUse, verified_at: '2027-01-02T00:00:00Z' },
    { ...context.sourceUse, verified_at: '2026-02-30T00:00:00Z' }]) {
    assert.ok(parseKopisApiFacts(xml(), 'PF000001', { ...context, sourceUse }).payload.review_reasons.includes('SOURCE_USE_UNVERIFIED'))
  }
})

test('manual blocks, changed source, reviewed facts and artist links survive raw recollection as holds', () => {
  const previous = { ...parseKopisApiFacts(xml(), 'PF000001', context), status: 'pending', automation_blocked: false }
  for (const state of ['공연취소', '공연완료', '']) {
    const row = parseKopisApiFacts(xml(undefined, undefined, state), 'PF000001', context)
    assert.ok(row.payload.review_reasons.includes('CANCELLED_OR_UNKNOWN'))
    assert.notEqual(row.payload.cancelled, false)
  }
  for (const change of [{ automation_blocked: true }, { status: 'dismissed' }, { source_url: 'https://wrong.example' }]) {
    assert.ok(parseKopisApiFacts(xml(), 'PF000001', { ...context, previous: { ...previous, ...change } })
      .payload.review_reasons.includes('ADMIN_OVERRIDE_OR_CONTEXT_CHANGED'))
  }
  const reviewed = structuredClone(previous)
  Object.assign(reviewed.payload, { announced_on: '2026-12-01', announced_at: null, announcement_precision: 'day', announcement_verified: true })
  reviewed.payload.ticket.opens_at = '2027-01-02T12:00:00+09:00'
  const before = JSON.stringify(reviewed)
  const result = parseKopisApiFacts(xml(), 'PF000001', { ...context, previous: reviewed })
  assert.ok(result.payload.review_reasons.includes('ANNOUNCEMENT_REMOVED_OR_CHANGED'))
  assert.ok(result.payload.review_reasons.includes('SALE_REMOVED_OR_CHANGED'))
  assert.equal(JSON.stringify(reviewed), before)
  assert.ok(parseKopisApiFacts(xml('목요일(20:00)'), 'PF000001', { ...context, previous })
    .payload.review_reasons.includes('SESSIONS_REMOVED_OR_CHANGED'))
  assert.ok(parseKopisApiFacts(xml(), 'PF000001', { ...context, previous, approvals: [] })
    .payload.review_reasons.includes('ARTIST_LINK_REMOVAL_REQUIRES_REVIEW'))
})

test('one held candidate does not stop another normal candidate in API collection', async () => {
  const calls = []
  const result = await collectKopis({ serviceKey: 'fixture-secret', today: '2027-01-01', end: '2027-01-01', sleep: async () => {},
    parseDetail: (body, id) => parseKopisApiFacts(body, id, context), fetcher: async url => {
      const u = new URL(url); calls.push(u)
      if (u.pathname.endsWith('/pblprfr')) return new Response('<dbs><db><mt20id>PF000001</mt20id></db><db><mt20id>PF000002</mt20id></db></dbs>')
      const id = u.pathname.split('/').at(-1)
      return new Response(xml(id === 'PF000001' ? '추후 공지' : undefined, undefined, undefined, id))
    } })
  assert.equal(result.candidates.length, 2); assert.deepEqual(result.failures, [])
  assert.deepEqual(result.candidates.map(r => r.proposed_contract_ready), [false, true])
  assert.ok(calls.every(u => u.origin === 'https://kopis.or.kr'))
})

test('preview scope rejects upload and non-API modes before reading environment or making requests', async () => {
  for (const args of [[], ['--source=kopis'], ['--facts-only', '--source=kopis', '--upload']]) {
    await assert.rejects(promisify(execFile)(process.execPath, ['scripts/collect-catalog.mjs', '--api-first-preview', ...args], { encoding: 'utf8' }),
      error => /API_FIRST_PREVIEW_SCOPE_REQUIRED|FACTS_ONLY_KOPIS_PREVIEW_REQUIRED/.test(error.stderr))
  }
})

test('CLI preview uses only API reads with no AI, external notices, cache, review plan, DB or checkpoint files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kopis-api-first-'))
  try {
    const preload = join(directory, 'mock.mjs')
    await writeFile(preload, `
      import assert from 'node:assert/strict'
      const timer = globalThis.setTimeout
      globalThis.setTimeout = (fn, ms, ...args) => timer(fn, Math.min(ms, 1), ...args)
      globalThis.fetch = async url => {
        const u = new URL(url)
        assert.equal(u.origin, 'https://kopis.or.kr')
        return new Response(u.pathname.endsWith('/pblprfr') ? '<dbs><db><mt20id>PF000001</mt20id></db></dbs>' : ${JSON.stringify(xml())})
      }
    `, 'utf8')
    const { stdout } = await promisify(execFile)(process.execPath, ['--import', pathToFileURL(preload).href,
      resolve('scripts/collect-catalog.mjs'), '--source=kopis', '--facts-only', '--api-first-preview', '--include-past'],
    { cwd: directory, encoding: 'utf8', env: { ...process.env, KOPIS_SERVICE_KEY: 'fixture-secret', KOPIS_AUTOMATIC_PUBLICATION: '1', KOPIS_AUTOMATIC_REVIEW_FILE: '/nonexistent-review-plan' } })
    const report = JSON.parse(stdout), row = report.results[0].candidates[0]
    assert.equal(report.complete, true); assert.equal(report.results[0].uploaded, false)
    assert.equal(row.api_first_preview, true); assert.equal(row.proposed_contract_ready, false)
    assert.ok(row.payload.review_reasons.includes('SOURCE_USE_UNVERIFIED'))
    assert.equal(row.payload.announced_on, null); assert.equal(row.payload.ticket.opens_at, null)
    assert.equal(row.payload.sessions.length, 3)
    assert.ok(!stdout.includes('fixture-secret'))
    assert.deepEqual(await readdir(directory), ['mock.mjs'])
  } finally { await rm(directory, { recursive: true, force: true }) }
})
