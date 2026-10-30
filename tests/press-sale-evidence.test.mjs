import { test } from 'node:test'
import assert from 'node:assert/strict'
import { preparePressSaleEvidence } from '../scripts/press-sale-evidence.mjs'

// Fictional notice. These fixtures do not certify any production source or show.
const fixture = () => ({ sourceUrl: 'https://news.livenationentertainment.com/news/fictional-tour',
  eventTitle: 'Fictional Tour', noticeDate: '2028-09-01', performanceYear: 2029,
  performanceRows: ['Sat, Jan 06 — Seoul — Fictional Arena', 'Mon, Jan 08 — Seoul — Fictional Arena'],
  saleLine: 'The general onsale for all dates will begin Friday, September 8 at 12pm local time.' })
test('contextual noon preserves original evidence and cannot certify publication', () => {
  const input = fixture(), original = structuredClone(input), result = preparePressSaleEvidence(input)
  assert.equal(result.interpretedGeneralSale.opens_at, '2028-09-08T12:00:00+09:00')
  assert.equal(result.originalSaleLine, input.saleLine)
  assert.deepEqual(result.performanceDays, ['2029-01-06', '2029-01-08'])
  assert.equal(result.noticeExactTimestamp, null)
  for (const key of ['readyToApply', 'publicationPermissionCertified', 'artistIdentityCertified', 'sessionStartTimesVerified', 'presaleAbsenceVerified']) assert.equal(result[key], false)
  assert.deepEqual(input, original)
})
test('midnight uses12am without changing the calendar day', () => {
  const input = fixture(); input.saleLine = input.saleLine.replace('12pm', '12am')
  assert.equal(preparePressSaleEvidence(input).interpretedGeneralSale.opens_at, '2028-09-08T00:00:00+09:00')
})
test('presale, exceptions, missing local-time context and weekday conflicts fail closed', () => {
  for (const line of [fixture().saleLine.replace('general onsale', 'presale'),
    fixture().saleLine.replace('all dates', 'US dates'), fixture().saleLine.replace('local time', 'ET'),
    fixture().saleLine.replace('Friday', 'Thursday'), fixture().saleLine + ' Except Korea.',
    fixture().saleLine.replace('September 8', 'February 31'), fixture().saleLine.replace('12pm', '13pm')]) {
    assert.throws(() => preparePressSaleEvidence({ ...fixture(), saleLine: line }), /PRESS_/)
  }
})
test('unverified year rollover, mismatched locations, repeated sessions and unsafe sources are rejected', () => {
  const cases = [
    { noticeDate: '2028-09-09' }, { noticeDate: '2028-02-30' },
    { performanceRows: ['Sat, Jan 06 — Tokyo — Fictional Arena'] },
    { performanceRows: [fixture().performanceRows[0], fixture().performanceRows[0]] },
    { performanceRows: [fixture().performanceRows[0], 'Mon, Jan 08 — Seoul — Another Arena'] },
    { sourceUrl: 'https://news.livenationentertainment.com.evil.example/news/fictional-tour' },
    { sourceUrl: fixture().sourceUrl + '?token=not-a-real-token' },
  ]
  for (const change of cases) assert.throws(() => preparePressSaleEvidence({ ...fixture(), ...change }), /PRESS_/)
})
