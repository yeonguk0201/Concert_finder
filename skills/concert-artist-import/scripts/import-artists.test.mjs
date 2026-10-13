import test from 'node:test'
import assert from 'node:assert/strict'
import { candidate, collect, database, importCandidates, musicbrainz, queries, validateManifest } from './import-artists.mjs'

const id = 'a74b1b7f-71a5-4011-9441-d0b5e4122711'
const bandId = 'b74b1b7f-71a5-4011-9441-d0b5e4122711'
const artist = (overrides = {}) => ({ id, name: 'Example', country: 'JP', type: 'Group', tags: [{ name: 'rock' }], aliases: [{ name: '別名' }], ...overrides })
const manifest = () => ({ version: 1, queries, cursors: queries.map(() => ({ offset: 0, done: false })), candidates: [] })

test('J-pop accepts solo/group, rock accepts groups; nationality or type alone is insufficient', () => {
  assert.ok(candidate(artist()))
  assert.ok(candidate(artist({ type: 'Person', tags: [{ name: 'j-pop' }], country: 'US' })))
  assert.equal(candidate(artist({ type: 'Person' })), null)
  assert.equal(candidate(artist({ tags: [] })), null)
  assert.equal(candidate(artist({ tags: [{ name: 'jazz' }] })), null)
  assert.equal(candidate(artist({ country: '' })), null)
  assert.equal(candidate(artist({ id: 'invalid' })), null)
})

test('partial-page checkpoint resumes without dropping remaining artists and deduplicates IDs', async () => {
  const state = manifest()
  const another = artist({ id: 'c74b1b7f-71a5-4011-9441-d0b5e4122711' })
  const pages = async url => ({ count: 2, artists: Number(url.searchParams.get('offset')) === 0 ? [artist(), another] : [another] })
  await collect(state, 1, pages, async () => {})
  assert.equal(state.cursors[0].offset, 1)
  assert.equal(state.cursors[0].done, false)
  await collect(state, 2, pages, async () => {})
  assert.equal(state.candidates.length, 2)
  assert.equal(state.cursors[0].offset, 2)
  assert.ok(validateManifest(state))
})

test('provider failure leaves page cursor unchanged', async () => {
  const state = manifest()
  await assert.rejects(collect(state, 10, async () => { throw new Error('503') }, async () => {}))
  assert.equal(state.cursors[0].offset, 0)
  assert.equal(state.candidates.length, 0)
})

test('invalid manifest and altered target are rejected before writes', () => {
  const state = manifest()
  state.candidates.push({ ...candidate(artist()), type: 'Person' })
  assert.throws(() => validateManifest(state), /INVALID_CANDIDATE/)
  assert.throws(() => database({ SUPABASE_URL: 'https://other.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test' }), /TARGET_OR_CREDENTIALS_INVALID/)
})

test('existing approved, held and excluded artists never trigger writes', async () => {
  for (const status of ['approved', 'held', 'excluded']) {
    const report = await importCandidates([candidate(artist())], async (path, body) => {
      assert.equal(body, undefined)
      return [{ id: bandId, musicbrainz_id: id, curation_status: status }]
    }, async () => {})
    assert.equal(report.results[0].status, status === 'approved' ? 'existing' : 'blocked')
  }
})

test('successful import verifies identity, records unreviewed and sends no approval fields', async () => {
  const report = await importCandidates([candidate(artist())], async (path, body) => {
    if (body) {
      assert.equal(path, 'rpc/service_import_artist')
      assert.equal(body.identity.genre, '장르 미검수')
      assert.equal(body.identity.curation_status, undefined)
      assert.equal(body.identity.category, undefined)
      return bandId
    }
    return path.includes('id=eq.') ? [{ id: bandId, musicbrainz_id: id, curation_status: 'unreviewed' }] : []
  }, async () => {})
  assert.equal(report.results[0].status, 'registered_or_reused')
  assert.equal(report.results[0].curation_status, 'unreviewed')
})

test('ambiguous names and blocked imports are recorded without bypass', async () => {
  for (const outcome of ['conflict', 'blocked']) {
    const report = await importCandidates([candidate(artist())], async (path, body) => {
      if (!body) return []
      if (outcome === 'blocked') throw new Error('ARTIST_NOT_AVAILABLE')
      return null
    }, async () => {})
    assert.equal(report.results[0].status, outcome === 'blocked' ? 'blocked' : 'identity_conflict')
    assert.equal(report.stopped, false)
  }
})

test('uncertain write or failed readback stops further imports and persists failure', async () => {
  for (const fail of ['write', 'readback']) {
    let writes = 0
    let saved
    const report = await importCandidates([candidate(artist()), candidate(artist({ id: 'c74b1b7f-71a5-4011-9441-d0b5e4122711' }))], async (path, body) => {
      if (!body) return []
      writes++
      if (fail === 'write') throw new Error('secret-like arbitrary response')
      return bandId
    }, async value => { saved = structuredClone(value) })
    assert.equal(writes, 1)
    assert.equal(report.stopped, true)
    assert.equal(saved.results[0].status, 'failed')
    assert.equal(saved.results[0].write_may_have_committed, true)
    assert.ok(!JSON.stringify(saved).includes('secret-like'))
  }
})

test('read retry is bounded and shared gate failure prevents provider requests', async () => {
  let calls = 0
  await assert.rejects(musicbrainz(new URL('https://musicbrainz.org/ws/2/artist/'), {
    fetcher: async () => { calls++; return new Response('', { status: 503 }) }, wait: async () => {},
  }), /PROVIDER_HTTP_503/)
  assert.equal(calls, 3)
  calls = 0
  await assert.rejects(musicbrainz(new URL('https://musicbrainz.org/ws/2/artist/'), {
    db: async () => false, fetcher: async () => { calls++ }, wait: async () => {},
  }), /SHARED_GATE_BUSY/)
  assert.equal(calls, 0)
})
