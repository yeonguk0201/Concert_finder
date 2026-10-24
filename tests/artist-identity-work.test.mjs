import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recoverIdentityWork, recoverIdentityJournal } from '../scripts/lib/artist-identity-work.mjs'
import { prepareIdentityJournal } from '../scripts/lib/artist-identity-journal.mjs'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const now = Date.parse('2026-10-22T12:00:00Z')
function fixture() {
  const before = { id: id(1), name: 'Fixture Artist', aliases: ['Original'], country_code: 'JP', musicbrainz_id: id(2),
    category: 'jpop', curation_status: 'approved', updated_at: '2026-10-21T00:00:00Z' }
  const mutation = { operation: 'aliases', musicBrainzId: id(2), name: before.name, country: 'JP', aliases: ['仮の名前'],
    requirements: { identityMatched: true, countryMatched: true, sameIdentityAliases: true },
    proof: { decision: 'keep', summary: 'Fictional fixture', sources: [{ url: 'https://fixture.example/artist', checkedAt: '2026-10-22T11:00:00Z', summary: 'Fictional source' }] } }
  const after = { ...before, aliases: [...before.aliases, ...mutation.aliases], updated_at: '2026-10-22T11:01:00Z' }
  const target = { bandId: id(1), expectedUpdatedAt: before.updated_at, mutation }
  const queue = { owner: 'cloud', transfer: null, active: { runId: id(9), artists: [{ bandId: id(1), identityVersion: before.updated_at }] } }
  const searched = []
  return { queue, lane: 'cloud', runId: id(9), target, now, searched,
    receiptReader: async () => ({ runId: id(9), mutation, before, after, relations: [2, 3] }),
    bandReader: async () => after, relationReader: async () => [2, 3], identityReader: async () => [{ key: `mb:${id(2)}` }],
    searchReader: async name => { searched.push(name); return [id(1)] } }
}
test('receipt recovery verifies names in public search without modifying the queue', async () => {
  const f = fixture(), original = JSON.stringify(f.queue)
  const r = await recoverIdentityWork(f)
  assert.equal(r.verified, true); assert.equal(r.publicSearchVerified, true)
  assert.deepEqual(f.searched, ['Fixture Artist', 'Original', '仮の名前'])
  assert.equal(JSON.stringify(f.queue), original)
})
test('wrong owner, transfer, version, missing selection and over-limit batches never call readers', async () => {
  for (const mutate of [f => { f.queue.owner = 'local' }, f => { f.queue.transfer = { to: 'local' } },
    f => { f.target.expectedUpdatedAt = 'newer' }, f => { f.queue.active = null },
    f => { f.queue.active.artists = Array.from({ length: 41 }, (_, i) => ({ bandId: id(i + 100) })) }]) {
    const f = fixture(); let calls = 0; mutate(f); f.receiptReader = async () => { calls++; return null }
    await assert.rejects(recoverIdentityWork(f), /SELECTION_INVALID/); assert.equal(calls, 0)
  }
})
test('absent receipts stop recovery without attempting a write or later readback', async () => {
  const f = fixture(); f.receiptReader = async () => null; f.bandReader = async () => { throw Error('must not read') }
  assert.equal((await recoverIdentityWork(f)).state, 'not_applied'); assert.deepEqual(f.searched, [])
})
test('receipt success alone cannot hide public search failures or ambiguous aliases', async () => {
  for (const ids of [[], [id(5)], [id(1), id(5)]]) {
    const f = fixture(); f.searchReader = async () => ids
    const r = await recoverIdentityWork(f)
    assert.equal(r.state, 'search_pending'); assert.equal(r.verified, false); assert.equal(r.receiptVerified, true)
  }
})
test('retained aliases must resolve uniquely even when omitted from the additive mutation', async () => {
  const f = fixture()
  f.searchReader = async name => name === 'Original' ? [id(1), id(5)] : [id(1)]
  const original = JSON.stringify(f.queue)
  const r = await recoverIdentityWork(f)
  assert.equal(r.state, 'search_pending'); assert.equal(r.verified, false)
  assert.equal(r.receiptVerified, true); assert.deepEqual(r.missingNames, ['Original'])
  assert.equal(JSON.stringify(f.queue), original)
})
test('readback checks preserve relationships and linked identity', async () => {
  const f = fixture(); f.relationReader = async () => [1, 3]
  await assert.rejects(recoverIdentityWork(f), /READBACK_FAILED/)
  const g = fixture(); g.identityReader = async () => []
  await assert.rejects(recoverIdentityWork(g), /LINK_UNCONFIRMED/)
})
test('incomplete proof is not repaired by credentials, and reader errors are redacted', async () => {
  const f = fixture(); f.target.mutation.requirements.countryMatched = false
  await assert.rejects(recoverIdentityWork(f), /PROOF_REQUIRED/)
  const g = fixture(); g.receiptReader = async () => { throw Error('sensitive response') }
  await assert.rejects(recoverIdentityWork(g), e => e.message === 'IDENTITY_RECEIPT_UNAVAILABLE')
})

async function journalFixture() {
  const f = fixture(), receipt = await f.receiptReader()
  const targets = [{ bandId: f.target.bandId, expectedUpdatedAt: f.target.expectedUpdatedAt },
    { bandId: id(3), expectedUpdatedAt: f.target.expectedUpdatedAt }]
  f.queue.active.artists.push({ bandId: id(3), identityVersion: f.target.expectedUpdatedAt })
  f.journal = prepareIdentityJournal({ runId: f.runId, targets,
    work: [{ bandId: f.target.bandId, mutation: f.target.mutation }], catalog: [receipt.before], now })
  return f
}
test('journal recovery checks the entire frozen selection and preserves queue and journal bytes', async () => {
  const f = await journalFixture(), before = JSON.stringify([f.queue, f.journal])
  // Apply/checkpoint may advance a version; the original registration is immutable.
  f.queue.active.artists[0].originalIdentityVersion = f.target.expectedUpdatedAt
  f.queue.active.artists[0].identityVersion = '2026-10-22T11:01:00Z'
  const snapshot = JSON.stringify([f.queue, f.journal])
  const result = await recoverIdentityJournal(f)
  assert.equal(result.complete, true); assert.equal(result.selected, 2)
  assert.equal(result.results.length, 1); assert.equal(result.results[0].publicSearchVerified, true)
  assert.equal(result.fingerprint, f.journal.fingerprint)
  assert.equal(JSON.stringify([f.queue, f.journal]), snapshot)
  assert.notEqual(before, snapshot)
})
test('a later ordinary review target mismatch blocks every journal reader', async () => {
  for (const change of [f => { f.queue.active.artists[1].identityVersion = '2026-10-20T00:00:00Z' },
    f => { f.queue.active.artists[1].bandId = id(8) },
    f => { f.queue.active.artists.pop() }, f => { f.queue.active.runId = id(8) },
    f => { f.queue.owner = 'local' }, f => { f.queue.transfer = { to: 'local' } }]) {
    const f = await journalFixture(); let calls = 0
    change(f); f.receiptReader = async () => { calls++; return null }
    await assert.rejects(recoverIdentityJournal(f), /SELECTION_INVALID/)
    assert.equal(calls, 0)
  }
})
test('a tampered journal cannot reach receipt recovery', async () => {
  const f = await journalFixture(); let calls = 0
  f.journal.targets[0].mutation.aliases.push('tampered')
  f.receiptReader = async () => { calls++; return null }
  await assert.rejects(recoverIdentityJournal(f), /JOURNAL_CONFLICT/)
  assert.equal(calls, 0)
})
test('missing receipt and ambiguous retained alias remain unfinished in journal recovery', async () => {
  const absent = await journalFixture(); absent.receiptReader = async () => null
  const a = await recoverIdentityJournal(absent)
  assert.equal(a.complete, false); assert.equal(a.results[0].state, 'not_applied')
  const ambiguous = await journalFixture()
  ambiguous.searchReader = async name => name === 'Original' ? [id(1), id(8)] : [id(1)]
  const b = await recoverIdentityJournal(ambiguous)
  assert.equal(b.complete, false); assert.equal(b.results[0].state, 'search_pending')
  assert.deepEqual(b.results[0].missingNames, ['Original'])
})
test('journal recovery exposes only fixed error codes without claiming completion', async () => {
  const f = await journalFixture()
  f.bandReader = async () => { throw Error('secret provider response') }
  const result = await recoverIdentityJournal(f)
  assert.equal(result.complete, false)
  assert.equal(result.results[0].code, 'IDENTITY_READBACK_UNAVAILABLE')
  assert.doesNotMatch(JSON.stringify(result), /secret provider response/)
})
