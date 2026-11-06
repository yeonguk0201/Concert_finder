import { test } from 'node:test'
import assert from 'node:assert/strict'
import { automaticReviewPlan, prepareAutomaticPublication, combineAutomaticBatch } from '../scripts/automatic-publication.mjs'

test('automatic review is fresh and bounded; completed and stale rows do not stop the remaining fixed batch', async () => {
  const now = new Date().toISOString(), id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const source = n => `https://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20Id=PF12345${n}`
  const payload = { title: 'Fictional', city: '서울', venue: '가상', country_code: 'KR', format: 'solo',
    starts_on: '2027-01-01', ends_on: '2027-01-01', cancelled: false, initial_import: true,
    announcement_verified: true, announced_on: now.slice(0, 10), announced_at: null, announcement_precision: 'day',
    review_reasons: [], sessions: [{ starts_on: '2027-01-01', starts_at: '2027-01-01T19:00:00+09:00' }],
    artist_keys: ['fictional'], band_ids: [id(9)], discovered_artists: [{ key: 'fictional', band_id: id(9), name: 'Fictional' }],
    sources: [{ url: source(3), verified_at: now }], ticket: { opens_at: now }, ticket_evidence: [{ method: 'api' }] }
  const stored = [1, 2, 3].map(n => ({ id: id(n), revision: 2, content_hash: 'a'.repeat(64), status: 'pending',
    automation_blocked: false, source_url: source(n), payload: structuredClone(payload) }))
  const plan = { version: 1, source: 'kopis', checked_at: now, candidates: stored.map(s => ({ id: s.id, revision: s.revision,
    content_hash: s.content_hash, payload: s.payload, checked_at: now, kopis_guidance: '가상19:00', source_use: { verified: true, basis_url: 'https://official.example/terms' } })) }
  automaticReviewPlan(plan)
  assert.throws(() => automaticReviewPlan({ ...plan, checked_at: '2000-01-01' }), /PLAN_INVALID/)
  assert.throws(() => automaticReviewPlan({ ...plan, candidates: [...plan.candidates, plan.candidates[0]] }), /PLAN_INVALID/)
  stored[1].revision++
  const client = { from(_table) { let value; return { select() { return this }, eq(key, v) { value = v; return this },
    single: async () => ({ data: stored.find(s => s.id === value) }), then(resolve) { return Promise.resolve({ data: value === source(1) ? [{ concert_id: id(8) }] : [] }).then(resolve) } } } }
  let requests = 0
  const xml = '<dbs><db><mt20id>PF123453</mt20id><genrenm>대중음악</genrenm><prfstate>공연예정</prfstate><prfnm>Fictional</prfnm><fcltynm>가상</fcltynm><area>서울</area><prfpdfrom>2027.01.01</prfpdfrom><prfpdto>2027.01.01</prfpdto><dtguidance>가상19:00</dtguidance><prfcast>Fictional</prfcast></db></dbs>'
  const prepared = await prepareAutomaticPublication({ client, plan, env: { KOPIS_SERVICE_KEY: 'fictional' }, fetcher: async () => { requests++; return new Response(xml) } })
  assert.equal(requests, 1); assert.equal(prepared.rows.length, 1); assert.equal(prepared.rows[0].reviewed_revision, 2)
  assert.equal(prepared.rows[0].reviewed_content_hash, 'a'.repeat(64)); assert.equal(prepared.rows[0].automatic_enrichment, true)
  assert.deepEqual(prepared.holds.map(h => h.error), ['ALREADY_PUBLISHED', 'AUTOMATIC_REVIEW_STALE'])
  const combined = combineAutomaticBatch({ candidates: [{ source_url: source(3) }, { source_url: source(4) }] }, prepared)
  assert.equal(combined.candidates.length, 2); assert.equal(combined.candidates[1].automatic_enrichment, true)
  await assert.rejects(prepareAutomaticPublication({ client, plan, env: { KOPIS_SERVICE_KEY: 'fictional' },
    fetcher: async () => new Response('', { status: 400 }) }), /KOPIS HTTP 400 \[detail PF123453\]/)
})
