import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chartCandidates, discoverCharts, enrichCoreMetrics, planCore } from '../scripts/artist-core.mjs'
import { newQueue, beginBatch, finishBatch } from '../scripts/lib/artist-review-queue.mjs'

const now = Date.parse('2026-10-22T07:00:00Z')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const row = (n, bucket = 'japanese_solo_unit') => ({ id: id(n), name: `Artist ${n}`, country: bucket === 'overseas_rock_band' ? 'GB' : 'JP',
  type: bucket === 'japanese_solo_unit' ? 'Person' : 'Group', bucket, source_tags: [],
  validation: { identityMatched: true, countryMatched: true, genreMatched: true, scopeMatched: true, sources: [{ url: 'https://official.example/bio', summary: 'Actual identity and genre evidence' }] },
  popularity: { status: 'ranked', source: 'lastfm', metric: 'listeners', listeners: n, mbid: id(n), checked_at: new Date(now).toISOString() } })
const nomination = { name: 'Required artist', musicBrainzId: id(1), bucket: 'japanese_solo_unit', expectedAliases: ['Required artist'] }

test('user nominations survive missing metrics/ID; three buckets are capped without claiming world ranking', () => {
  const rows = Array.from({ length: 280 }, (_, i) => row(i + 2, i < 100 ? 'japanese_solo_unit' : i < 190 ? 'japanese_rock_band' : 'overseas_rock_band'))
  const p = planCore(rows, [nomination], [], now)
  assert.equal(p.selected.length, 200); assert.equal(p.selected[0].metricStatus, 'not_checked'); assert.equal(p.complete, false)
  assert.equal(p.selected.filter(x => x.bucket === 'japanese_solo_unit').length, 80)
  assert.equal(p.selected.filter(x => x.bucket === 'japanese_rock_band').length, 60)
  assert.equal(p.selected.filter(x => x.bucket === 'overseas_rock_band').length, 60)
  assert.equal(p.selected[1].popularity.listeners, 101)
  assert.equal(planCore([], [{ ...nomination, musicBrainzId: null }], [], now).mandatory.length, 1)
})

test('unverified chart identity, wrong country, stale or mismatched metric and protected artists cannot be ranked in', () => {
  const candidates = [row(1), row(2), row(3), row(4), row(5), row(6)]
  candidates[0].validation.genreMatched = false
  candidates[1].country = 'KR'; candidates[2].popularity.mbid = id(99)
  candidates[3].popularity.checked_at = '2026-09-01'; candidates[4].validation.sources = []
  const result = planCore(candidates, [], [{ musicbrainz_id: id(6), curation_status: 'held' }], now)
  assert.deepEqual(result.selected, []); assert.throws(() => planCore([row(1), row(1)], [], [], now), /DUPLICATE/)
})

test('geo geography is listening region, no country/genre or popularity asserted; raw images and keys are dropped', async () => {
  const data = { topartists: { artist: [{ name: 'Name', mbid: id(1), image: 'private-image', listeners: '999' }] } }
  const rows = chartCandidates(data, { method: 'geo.getTopArtists', country: 'Japan', sourceUrl: 'https://www.last.fm/api/show/geo.getTopArtists', checkedAt: new Date(now).toISOString() })
  assert.equal(rows[0].country, undefined); assert.equal(rows[0].popularity.listeners, undefined)
  assert.equal(rows[0].discovery.listeningRegion, 'Japan'); assert.equal(JSON.stringify(rows).includes('private-image'), false)
  await assert.rejects(discoverCharts(null), /KEY_REQUIRED/)
  const result = await enrichCoreMetrics([row(1), { ...row(2), popularity: {} }], null, { now })
  assert.equal(result[0].popularity.status, 'ranked'); assert.equal(result[1].popularity.status, 'key_required')
})

test('core priority applies only at new boundary, never bypasses deferred/manual protection, never refills beyond 40', () => {
  const bands = Array.from({ length: 50 }, (_, i) => ({ id: id(i), musicbrainz_id: id(i + 100), name: `Band ${i}`, aliases: [], country_code: 'JP', curation_status: 'unreviewed', category: 'unclassified', updated_at: new Date(now).toISOString() }))
  const q = newQueue('cloud', now)
  const queueId = q.queueId
  const first = beginBatch(q, { lane: 'cloud', bands, now, priorityMusicBrainzIds: [id(149)] })
  assert.equal(first.artists[0].bandId, id(49)); assert.equal(first.artists.length, 40)
  const same = beginBatch(q, { lane: 'cloud', bands, now, priorityMusicBrainzIds: [id(148)] })
  assert.equal(same.runId, first.runId); assert.equal(same.artists[0].bandId, id(49))
  finishBatch(q, { lane: 'cloud', runId: first.runId, deferPending: true, now })
  bands[48].curation_status = 'held'
  const next = beginBatch(q, { lane: 'cloud', bands, now: now + 3600000, priorityMusicBrainzIds: [id(149), id(148)] })
  assert.ok(next.artists.every(x => ![id(48), id(49)].includes(x.bandId)))
  assert.equal(q.queueId, queueId)
  const small = newQueue('cloud', now)
  assert.throws(() => beginBatch(small, { lane: 'cloud', bands, now, limit: 41 }), /LIMIT_INVALID/)
  const two = beginBatch(small, { lane: 'cloud', bands, now, limit: 2 })
  assert.equal(two.artists.length, 2)
  assert.equal(beginBatch(small, { lane: 'cloud', bands, now, limit: 40 }).artists.length, 2)
})
