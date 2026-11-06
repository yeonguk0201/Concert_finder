import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planPublicationPilot } from '../scripts/prepare-publication-pilot.mjs'

// Fictional candidate, no production writes or externally certified evidence.
const now = Date.parse('2028-09-10T00:00:00Z')
function input() {
  return { version: 1, candidateId: 'fictional', snapshot: { version: 1, observedAt: '2028-09-09T23:59:00Z',
    sources: [{ source: 'kopis', policy: { collection_enabled: true, publication_enabled: false, live_after: null, adapter_version: 'catalog-v1' },
      adapterVersion: 'catalog-v1', adapterVerified: false, runnerCompatible: false, activeLease: false,
      permission: { state: 'unverified' }, candidates: [{ id: 'fictional', revision: 3, source_url: 'https://www.kopis.or.kr/fake',
        automation_blocked: false, context: { identityApproved: false, duplicateFree: true, changeReviewed: false },
        payload: { title: 'Fictional event', format: 'solo', city: '인천', venue: 'Fictional Arena', country_code: 'KR',
          starts_on: '2029-01-06', ends_on: '2029-01-06', cancelled: false, initial_import: true, sessions: [] } }] }] } }
}
const previous = { candidateId: 'fictional', revision: 3, lastNotified: { at: '2028-09-01T00:00:00Z' } }
test('fresh repeated observations suppress unchanged notices without rewriting last notification', () => {
  const i = input(), before = structuredClone(i), first = planPublicationPilot(i, { previous, now })
  assert.equal(first.status, 'BLOCKED_NOT_READY')
  assert.ok(first.tasks.some(t => t.code === 'ARTIST_IDENTITY_OR_APPROVAL_UNVERIFIED' && t.owner === 'artist'))
  i.snapshot.observedAt = '2028-09-10T00:00:00Z'
  const second = planPublicationPilot(i, { previous: first, now })
  assert.equal(second.notify, false)
  assert.deepEqual(second.lastNotified, previous.lastNotified)
  i.snapshot.observedAt = before.snapshot.observedAt
  assert.deepEqual(i, before)
})
test('missing checkpoint, stale/future snapshots, mismatched target and regressed revision are rejected', () => {
  assert.throws(() => planPublicationPilot(input(), { now }), /CHECKPOINT/)
  for (const observedAt of ['2028-09-09T00:00:00Z', '2028-09-11T00:00:00Z']) {
    const i = input(); i.snapshot.observedAt = observedAt
    assert.throws(() => planPublicationPilot(i, { previous, now }), /SNAPSHOT/)
  }
  assert.throws(() => planPublicationPilot(input(), { previous: { ...previous, revision: 4 }, now }), /REVISION/)
  assert.throws(() => planPublicationPilot(input(), { previous: { candidateId: 'other' }, now }), /CHECKPOINT/)
})
test('press interpretation cannot remove unresolved source, identity, session or sale DB blockers', () => {
  const i = input(); i.pressEvidence = { sourceUrl: 'https://news.livenationentertainment.com/news/fictional-tour',
    eventTitle: 'Fictional event', noticeDate: '2028-09-01', checkedAt: '2028-09-09T00:00:00Z', performanceYear: 2029,
    performanceRows: ['Sat, Jan 06 — Seoul — Fictional Arena'],
    saleLine: 'The general onsale for all dates will begin Friday, September 8 at 12pm local time.' }
  const result = planPublicationPilot(i, { previous, now })
  assert.equal(result.press.interpretedGeneralSale.opens_at, '2028-09-08T12:00:00+09:00')
  assert.equal(result.status, 'BLOCKED_NOT_READY')
  assert.equal(result.operationallyApplied, false)
  for (const code of ['SOURCE_USE_UNVERIFIED', 'ARTIST_IDENTITY_OR_APPROVAL_UNVERIFIED', 'SESSIONS_UNVERIFIED', 'GENERAL_SALE_UNVERIFIED']) assert.ok(result.tasks.some(t => t.code === code))
  const first = result
  i.snapshot.sources[0].candidates[0].revision++
  assert.equal(planPublicationPilot(i, { previous: first, now }).notify, true)
})
