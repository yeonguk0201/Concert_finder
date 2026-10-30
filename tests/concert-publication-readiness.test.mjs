import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessPublicationReadiness } from '../scripts/concert-publication-readiness.mjs'

const now = Date.parse('2026-10-28T12:00:00Z')
const url = 'https://ualive.com/concerts/123'
function snapshot() {
  return { version: 1, observedAt: '2026-10-28T11:59:00Z', sources: [{ source: 'ualive',
    permission: { state: 'allowed', method: 'api', scopes: ['publication', 'concert_facts', 'source_links'], checkedAt: '2026-10-28T10:00:00Z', sourceUrls: ['https://ualive.com/terms'] },
    adapterVerified: true, runnerCompatible: true, adapterVersion: 'catalog-v1', activeLease: false,
    policy: { collection_enabled: true, publication_enabled: false, live_after: null, adapter_version: 'catalog-v1' },
    candidates: [{ id: 'fixture', revision: 1, source_url: url, automation_blocked: false,
      context: { identityApproved: true, duplicateFree: true, changeReviewed: true }, payload: {
        title: 'Fictional official show', format: 'solo', city: '서울', venue: '가상 공연장', country_code: 'KR', cancelled: false,
        starts_on: '2027-01-14', ends_on: '2027-01-14', sessions: [{ starts_on: '2027-01-14', starts_at: '2027-01-14T19:00:00+09:00' }],
        announcement_verified: true, announced_on: '2026-10-28', announced_at: '2026-10-28T19:00:00+09:00', review_reasons: [],
        sources: [{ url, verified_at: '2026-10-28T11:00:00Z' }], ticket: { opens_at: '2026-10-29T12:00:00+09:00' },
        ticket_evidence: [{ source_url: url, opens_at: '2026-10-29T12:00:00+09:00', line: '일반 예매: 2026년 10월 29일 오후 12시' }],
      } }],
  }, { source: 'reissue_nol', permission: { state: 'denied' } }] }
}
const assess = s => assessPublicationReadiness(s, { now })

test('a verified official source can launch independently while NOL is optional and absent permission stays excluded', () => {
  const s = snapshot(), before = structuredClone(s), r = assess(s)
  assert.equal(r.status, 'PARTIAL_LAUNCH_AVAILABLE')
  assert.equal(r.sources[0].status, 'READY_FOR_ACTIVATION')
  assert.equal(r.sources[1].status, 'EXCLUDED_OPTIONAL')
  assert.equal(r.nolRequiredForLaunch, false)
  assert.deepEqual(s, before)
  s.sources[0].policy.publication_enabled = true
  assert.equal(assess(s).sources[0].status, 'ACTIVE_VERIFIED')
})

test('source approval, runner compatibility and live observation cannot be inferred from metadata or NOL exclusion', () => {
  for (const [field, value, reason] of [['permission', null, 'SOURCE_USE_UNVERIFIED'], ['adapterVerified', false, 'ADAPTER_UNVERIFIED'],
    ['runnerCompatible', false, 'RUNNER_NOT_PUBLICATION_COMPATIBLE'], ['activeLease', true, 'SOURCE_LEASE_NOT_IDLE']]) {
    const s = snapshot(); s.sources[0][field] = value
    assert.equal(assess(s).status, 'NO_VERIFIED_SOURCE_READY')
    assert.ok(assess(s).sources[0].blockers.includes(reason))
  }
  const s = snapshot(); s.observedAt = '2026-10-27T00:00:00Z'
  assert.throws(() => assess(s), /SNAPSHOT_INVALID/)
  s.observedAt = '2026-10-29T00:00:00Z'
  assert.throws(() => assess(s), /SNAPSHOT_INVALID/)
})

test('missing or malformed event facts, ambiguous identities, manual blocks and duplicates remain candidate-specific', () => {
  const cases = [
    r => { r.automation_blocked = true }, r => { r.context.identityApproved = false }, r => { r.context.duplicateFree = false },
    r => { r.context.changeReviewed = false }, r => { r.payload.cancelled = true }, r => { r.payload.city = null },
    r => { r.payload.sessions = [] }, r => { r.payload.sessions[0].starts_on = '2027-01-15' },
    r => { r.payload.announced_at = null }, r => { r.payload.announced_on = '2026-10-27' },
    r => { r.payload.announced_at = '2026-02-31T12:00:00+09:00'; r.payload.announced_on = '2026-03-03' },
    r => { r.payload.review_reasons.push('실제 근거 미완료') }, r => { r.payload.sources[0].verified_at = null },
    r => { r.payload.starts_on = '2027-02-30' },
  ]
  for (const change of cases) {
    const s = snapshot(), source = s.sources[0]
    const unverified = structuredClone(source.candidates[0]); unverified.id = 'unverified'; change(unverified)
    source.candidates.push(unverified)
    const out = assess(s).sources[0]
    assert.equal(out.eligible, 1)
    assert.equal(out.candidates[1].eligible, false)
  }
})

test('wheelchair, presale, wrong time and mismatched event evidence cannot certify a general sale', () => {
  for (const line of ['휠체어석 2026년 10월 29일 오후 12시', '선예매: 2026년 10월 29일 오후 12시', '일반 예매: 2026년 10월 30일 오후 12시']) {
    const s = snapshot(); s.sources[0].candidates[0].payload.ticket_evidence[0].line = line
    assert.ok(assess(s).sources[0].candidates[0].reasons.includes('GENERAL_SALE_UNVERIFIED'))
  }
  const s = snapshot(); s.sources[0].candidates[0].payload.ticket_evidence[0].event_matched = false
  assert.equal(assess(s).sources[0].eligible, 0)
})

test('NOL evidence stays excluded independently of the booking destination', () => {
  for (const change of [p => { p.sources.push({ url: 'https://nol.yanolja.com/ticket/products/123' }) },
    p => { p.ticket_evidence[0].source_url = 'https://tickets.interpark.com/notice/123' }]) {
    const s = snapshot(); change(s.sources[0].candidates[0].payload)
    assert.ok(assess(s).sources[0].candidates[0].reasons.includes('OPTIONAL_NOL_DEPENDENCY'))
    assert.equal(assess(s).status, 'NO_VERIFIED_SOURCE_READY')
  }
})

test('a NOL booking destination alone is a link, never a grant to acquire NOL material', () => {
  const s = snapshot(), p = s.sources[0].candidates[0].payload
  p.ticket.booking_url = 'https://nol.yanolja.com/ticket/products/123'
  const before = structuredClone(s)
  assert.equal(assess(s).sources[0].eligible, 1)
  assert.deepEqual(s, before)
  p.ticket_evidence[0].source_url = p.ticket.booking_url
  assert.ok(assess(s).sources[0].candidates[0].reasons.includes('OPTIONAL_NOL_DEPENDENCY'))
})

test('API fact/link scope is explicit; publication or HTML/image permission cannot substitute for it', () => {
  for (const change of [p => { delete p.method }, p => { p.method = 'html' },
    p => { p.scopes = ['publication'] }, p => { p.scopes.push('images') }, p => { p.scopes.push('external_body') }]) {
    const s = snapshot(); change(s.sources[0].permission)
    assert.ok(assess(s).sources[0].blockers.includes('SOURCE_USE_SCOPE_UNVERIFIED'))
    assert.equal(assess(s).status, 'NO_VERIFIED_SOURCE_READY')
  }
})

test('past openings and initial backfill are silent; future eligible rows still require the existing consent worker', () => {
  const s = snapshot(), source = s.sources[0]
  assert.equal(assess(s).sources[0].candidates[0].notificationMode, 'SILENT_BACKFILL')
  source.policy.live_after = '2026-10-27T00:00:00Z'
  assert.equal(assess(s).sources[0].candidates[0].notificationMode, 'EXISTING_CONSENT_WORKER_ONLY')
  source.candidates[0].payload.ticket.opens_at = '2026-10-22T12:00:00+09:00'
  assert.equal(assess(s).sources[0].candidates[0].notificationMode, 'SILENT_BACKFILL')
})
