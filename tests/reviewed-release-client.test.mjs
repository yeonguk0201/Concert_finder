import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reviewedReleaseRow, runReviewedPublication, assertCurrentKopis } from '../scripts/publish-reviewed-candidate.mjs'

// Entirely fictional observations. No operational client, keys or source calls.
function fixture() {
  const id = '00000000-0000-4000-8000-000000000001', now = new Date().toISOString()
  const day = new Date(Date.now() + 100 * 86400000).toISOString().slice(0, 10)
  const url = 'https://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20Id=PF123456'
  const key = 'mb:00000000-0000-4000-8000-000000000002'
  const row = { id, revision: 3, status: 'pending', automation_blocked: false, source_url: url, content_hash: 'a'.repeat(64),
    payload: { title: 'Fictional reviewed concert', format: 'solo', country_code: 'KR', city: '서울', venue: '가상 공연장',
      starts_on: day, ends_on: day, cancelled: false, initial_import: true, announcement_verified: true,
      announced_on: now.slice(0, 10), announced_at: null, announcement_precision: 'day', review_reasons: [],
      sessions: [{ starts_on: day, starts_at: `${day}T19:00:00+09:00` }], artist_keys: [key], band_ids: [id],
      discovered_artists: [{ name: 'Fictional band', key, band_id: id }], sources: [{ url, verified_at: now }],
      ticket: { opens_at: now, price_description: null }, ticket_evidence: [{ method: 'api', verified_at: now }] } }
  const env = { KOPIS_SERVICE_KEY: 'fictional', KOPIS_PUBLICATION_EXECUTOR_MD5: 'b'.repeat(32),
    KOPIS_REVIEWED_CANDIDATE: `${id}:3`, KOPIS_REVIEWED_GUIDANCE: '가상 회차 19:00' }
  const xml = `<dbs><db><mt20id>PF123456</mt20id><genrenm>대중음악</genrenm><prfstate>공연예정</prfstate>
    <prfnm>Fictional reviewed concert</prfnm><fcltynm>가상 공연장</fcltynm><area>서울</area>
    <prfpdfrom>${day}</prfpdfrom><prfpdto>${day}</prfpdto><dtguidance>가상 회차 19:00</dtguidance><prfcast>Fictional band</prfcast></db></dbs>`
  const policy = { collection_enabled: true, publication_enabled: true, live_after: null, adapter_version: 'catalog-v1' }
  const capabilities = { contract: 'publication-facts-v3', reviewed_release: true, executor_md5: 'b'.repeat(32) }
  const calls = []
  const client = { from(table) { return { select() { return this }, eq() { return this },
    async single() { return { data: table === 'collection_policies' ? policy : row } } } },
  async rpc(name, args) {
    calls.push({ name, args })
    if (name === 'service_publication_capabilities') return { data: capabilities }
    if (name === 'service_begin_collection') return { data: '00000000-0000-4000-8000-000000000099' }
    if (name === 'service_complete_collection') return { data: { published: 1, review: 0 } }
    if (name === 'service_fail_collection') return { data: null }
    throw Error('UNEXPECTED_RPC')
  } }
  return { row, env, xml, policy, capabilities, calls, client }
}
test('reviewed client retains exact revision and payload and performs one source read under one lease', async () => {
  const f = fixture(), before = structuredClone(f.row)
  let requests = 0
  const result = await runReviewedPublication({ client: f.client, env: f.env, fetcher: async url => {
    requests++; assert.equal(url.hostname, 'kopis.or.kr'); return new Response(f.xml)
  } })
  assert.deepEqual(result.publication, { published: 1, review: 0 }); assert.equal(requests, 1)
  assert.deepEqual(f.calls.map(c => c.name), ['service_publication_capabilities', 'service_begin_collection', 'service_complete_collection'])
  assert.deepEqual(f.calls[2].args.identities, [])
  assert.equal(f.calls[2].args.batch.candidates[0].reviewed_revision, 3)
  assert.deepEqual(f.calls[2].args.batch.candidates[0].payload, before.payload)
  assert.deepEqual(f.row, before)
})
test('OFF, live policy, missing target and drifted capabilities stop before the source lease', async () => {
  for (const change of [f => { f.policy.publication_enabled = false }, f => { f.policy.live_after = new Date().toISOString() },
    f => { f.capabilities.reviewed_release = false }, f => { f.capabilities.executor_md5 = 'c'.repeat(32) },
    f => { delete f.env.KOPIS_REVIEWED_CANDIDATE }, f => { delete f.env.KOPIS_REVIEWED_GUIDANCE }]) {
    const f = fixture(); change(f)
    await assert.rejects(runReviewedPublication({ client: f.client, env: f.env, fetcher: () => assert.fail('source must not be called') }))
    assert.equal(f.calls.some(c => c.name === 'service_begin_collection'), false)
  }
})
test('source cancellation or changed lineup, venue or guidance cannot complete or retry a release', async () => {
  for (const replace of [['공연예정', '공연취소'], ['Fictional band', 'Another fictional band'], ['가상 공연장', '다른 공연장'], ['19:00', '20:00']]) {
    const f = fixture(); let requests = 0
    await assert.rejects(runReviewedPublication({ client: f.client, env: f.env,
      fetcher: async () => { requests++; return new Response(f.xml.replace(...replace)) } }))
    assert.equal(requests, 1)
    assert.deepEqual(f.calls.map(c => c.name), ['service_publication_capabilities', 'service_begin_collection', 'service_fail_collection'])
  }
})
test('stale evidence, protected decisions and changed revisions stay blocked', () => {
  const f = fixture()
  for (const change of [r => { r.revision++ }, r => { r.automation_blocked = true }, r => { r.status = 'dismissed' },
    r => { r.payload.sources[0].verified_at = '2000-01-01T00:00:00Z' }]) {
    const row = structuredClone(f.row); change(row)
    assert.throws(() => reviewedReleaseRow(row, f.env.KOPIS_REVIEWED_CANDIDATE))
  }
  assert.throws(() => assertCurrentKopis(f.row, '<!DOCTYPE x><dbs/>', f.env.KOPIS_REVIEWED_GUIDANCE))
})
