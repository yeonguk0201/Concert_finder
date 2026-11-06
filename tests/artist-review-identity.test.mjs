import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { newQueue, beginBatch, recordStage, PROJECT } from '../scripts/lib/artist-review-queue.mjs'
import { prepareIdentityJournal } from '../scripts/lib/artist-identity-journal.mjs'
import { applyQueuedIdentity, identityRegistrationTargets, checkIdentitySelection } from '../scripts/lib/artist-review-identity.mjs'
import { applyQueuedCuration } from '../scripts/lib/artist-review-apply.mjs'
import { runQueueCommand, publicIdentitySearchReader } from '../scripts/artist-review-queue.mjs'

const now = Date.parse('2026-10-24T15:00:00Z')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const source = { url: 'https://fixture.example/artist', checkedAt: new Date(now).toISOString(), summary: 'Fictional official profile' }
const band = n => ({ id: id(n), name: `Fixture ${n}`, aliases: [], country_code: 'JP', musicbrainz_id: id(n + 1000),
  category: 'unclassified', curation_status: 'unreviewed', updated_at: '2026-10-23T00:00:00Z' })
function fixture(operation = 'register') {
  const before = operation === 'aliases' ? band(1) : null
  const mutation = { operation, name: 'Fixture 1', country: 'JP', musicBrainzId: id(1001), aliases: ['仮の名前'],
    requirements: { identityMatched: true, countryMatched: true, sameIdentityAliases: true },
    proof: { decision: 'keep', summary: 'Fictional identity only', sources: [source] } }
  const catalog = before ? [before] : []
  const work = [{ bandId: id(1), mutation }]
  const queue = newQueue('cloud', now)
  beginBatch(queue, { lane: 'cloud', bands: catalog, identityWork: work, now })
  const targets = identityRegistrationTargets(queue.active)
  const journal = prepareIdentityJournal({ runId: queue.active.runId, targets, work, catalog, now })
  const after = { ...band(1), aliases: mutation.aliases, updated_at: new Date(now).toISOString() }
  const receipt = { runId: queue.active.runId, mutation, before, after, relations: [0, 0] }
  let stored = null, writes = 0, uncertain = false, searchConflict = false
  const client = {
    rpc: async name => {
      if (name === 'service_integrated_identity_receipt') return { data: stored }
      if (name === 'service_mutate_integrated_artist') {
        writes++; stored = receipt
        if (uncertain) throw Error('private response')
        return { data: receipt }
      }
      if (name === 'service_integrated_review_context') return { data: { identities: [{ key: `mb:${mutation.musicBrainzId}` }] } }
      throw Error('unexpected RPC')
    },
    from: table => ({ select: () => ({ eq: () => table === 'bands'
      ? { single: async () => ({ data: after }) } : Promise.resolve({ count: 0 }) }) }),
  }
  return { queue, journal, client, work, catalog, receipt, after,
    args: () => ({ lane: 'cloud', journal, bandId: id(1), client, now,
      searchReader: async () => searchConflict ? [id(1), id(2)] : [id(1)] }),
    writes: () => writes, uncertain: () => { uncertain = true }, conflict: value => { searchConflict = value } }
}

test('register and aliases use a single frozen mutation and verify receipt, DB and public names', async () => {
  for (const operation of ['register', 'aliases']) {
    const f = fixture(operation), targets = identityRegistrationTargets(f.queue.active)
    const tasks = structuredClone(f.queue.active.artists[0].tasks)
    const r = await applyQueuedIdentity(f.queue, f.args())
    assert.equal(r.applied, true); assert.equal(r.verification.publicSearchVerified, true)
    assert.equal(f.writes(), 1); assert.deepEqual(identityRegistrationTargets(f.queue.active), targets)
    assert.deepEqual(f.queue.active.artists[0].tasks, tasks)
    assert.equal(f.queue.entries[id(1)].band.updated_at, f.after.updated_at)
    assert.equal(f.queue.active.artists[0].recorded.approval.reason, 'IDENTITY_APPROVAL_NEXT_BATCH')
    await applyQueuedIdentity(f.queue, f.args()); assert.equal(f.writes(), 1)
    await assert.rejects(applyQueuedCuration(f.queue, { lane: 'cloud', runId: f.queue.active.runId, bandId: id(1), now }), /IDENTITY_APPROVAL_NEXT_BATCH/)
  }
})

test('a lost mutation response leaves the queue intact; the next invocation recovers without another write', async () => {
  const f = fixture(), original = JSON.stringify(f.queue)
  f.uncertain()
  await assert.rejects(applyQueuedIdentity(f.queue, f.args()), /IDENTITY_WRITE_UNCONFIRMED/)
  assert.equal(JSON.stringify(f.queue), original); assert.equal(f.writes(), 1)
  await applyQueuedIdentity(f.queue, f.args())
  assert.equal(f.writes(), 1); assert.equal(f.queue.active.artists[0].originalIdentityVersion, null)
  checkIdentitySelection(f.queue, 'cloud', f.journal, now)
})

test('ambiguous public search preserves the original state and can recover the existing receipt later', async () => {
  const f = fixture(), original = JSON.stringify(f.queue)
  f.conflict(true)
  await assert.rejects(applyQueuedIdentity(f.queue, f.args()), /IDENTITY_PUBLIC_SEARCH_PENDING/)
  assert.equal(JSON.stringify(f.queue), original); assert.equal(f.writes(), 1)
  f.conflict(false); await applyQueuedIdentity(f.queue, f.args()); assert.equal(f.writes(), 1)
})

test('JSONB key ordering in a real server receipt does not change the frozen mutation', async () => {
  const f = fixture()
  const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)])) : value
  f.receipt.mutation = reorder(f.receipt.mutation)
  assert.equal((await applyQueuedIdentity(f.queue, f.args())).applied, true)
})

test('identity retry and provider-stage delays survive a new selection', () => {
  const f = fixture('aliases')
  f.queue.active = null
  const delay = new Date(now + 86400000).toISOString()
  f.queue.entries[id(1)].stages.identity.nextAttemptAt = delay
  assert.throws(() => beginBatch(f.queue, { lane: 'cloud', bands: f.catalog, identityWork: f.work, now }), /IDENTITY_RETRY_NOT_DUE/)
  f.queue.entries[id(1)].stages.identity.nextAttemptAt = null
  f.queue.entries[id(1)].stages.research.status = 'deferred'
  f.queue.entries[id(1)].stages.research.nextAttemptAt = delay
  const batch = beginBatch(f.queue, { lane: 'cloud', bands: f.catalog, identityWork: f.work, now })
  assert.ok(batch.artists[0].tasks.includes('identity'))
  assert.ok(!batch.artists[0].tasks.includes('research'))
  assert.equal(f.queue.entries[id(1)].stages.research.nextAttemptAt, delay)
})

test('whole-selection drift and incomplete proof block all mutation RPCs', async () => {
  for (const change of [f => { f.queue.owner = 'local' }, f => { f.queue.active.artists[0].identityMutation.aliases.push('changed') },
    f => { f.journal.targets[0].mutation.requirements.identityMatched = false }]) {
    const f = fixture(); change(f)
    await assert.rejects(applyQueuedIdentity(f.queue, f.args()))
    assert.equal(f.writes(), 0)
  }
  const f = fixture()
  assert.throws(() => recordStage(f.queue, { lane: 'cloud', runId: f.queue.active.runId, bandId: id(1),
    stage: 'research', status: 'complete', reason: 'premature', proof: f.work[0].mutation.proof, now }), /IDENTITY_REQUIRED/)
})

test('ordinary reviews, registration and aliases share the same maximum of forty selected artists', () => {
  const f = fixture(), queue = newQueue('cloud', now), catalog = Array.from({ length: 50 }, (_, n) => band(n + 2))
  const work = [...f.work, { bandId: id(2), mutation: { ...f.work[0].mutation, operation: 'aliases', name: 'Fixture 2', musicBrainzId: id(1002), aliases: ['Other alias'] } }]
  const batch = beginBatch(queue, { lane: 'cloud', bands: catalog, identityWork: work, now })
  assert.equal(batch.artists.length, 40)
  assert.equal(batch.artists.filter(a => a.identityMutation).length, 2)
  const again = beginBatch(queue, { lane: 'cloud', bands: [], identityWork: [], now })
  assert.equal(again.runId, batch.runId); assert.equal(again.artists.length, 40)
})

test('public search matches the actual substring search and fails closed on anonymous read errors', async () => {
  const rows = [{ id: id(1), name: 'ＡＤＯ', aliases: ['가수 이름'] }, { id: id(2), name: 'Shadow', aliases: [] }]
  const fake = result => ({ from: () => ({ select: () => ({ in: () => ({ order: () => ({ range: async () => result }) }) }) }) })
  const search = publicIdentitySearchReader(fake({ data: rows }))
  assert.deepEqual(await search('a d o'), [id(1), id(2)])
  assert.deepEqual(await search('가수이름'), [id(1)])
  await assert.rejects(publicIdentitySearchReader(fake({ error: { message: 'private' } }))('ADO'), /SEARCH_UNAVAILABLE/)
})

test('CLI persists the immutable journal before registration and recovers a failed server registration', async () => {
  const f = fixture(), root = await mkdtemp(join(tmpdir(), 'identity-cli-'))
  const local = join(root, '.local/artist-review-queue')
  await mkdir(local, { recursive: true })
  const statePath = join(local, 'state.json')
  await writeFile(statePath, JSON.stringify(newQueue('cloud', now)), 'utf8')
  await writeFile(join(local, 'catalog.json'), JSON.stringify(f.catalog), 'utf8')
  await writeFile(join(local, 'work.json'), JSON.stringify({ version: 1, work: f.work }), 'utf8')
  const registrations = []; let failRegistration = true, receipt = null, writes = 0, anonymousReads = 0
  const env = { SUPABASE_URL: `https://${PROJECT}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: 'fictional-service-binding', SUPABASE_ANON_KEY: 'fictional-public-binding' }
  const fetcher = async (url, options) => {
    const path = new URL(url), name = path.pathname.split('/').at(-1)
    if (name === 'bands') {
      if (options.headers.get('apikey') === env.SUPABASE_ANON_KEY) {
        anonymousReads++; return new Response(JSON.stringify([f.after]), { status: 200 })
      }
      return new Response(JSON.stringify(f.after), { status: 200 })
    }
    if (['concert_bands', 'band_follows'].includes(name)) return new Response(null, { status: 200, headers: { 'content-range': '0-0/0' } })
    if (name === 'service_mutate_integrated_artist') {
      writes++; receipt = { ...f.receipt, runId: registrations[0].run_id }
      return new Response(JSON.stringify(receipt), { status: 200 })
    }
    if (name === 'service_integrated_identity_receipt') return new Response(JSON.stringify(receipt), { status: 200 })
    if (name === 'service_integrated_review_context') return new Response(JSON.stringify({ identities: [{ key: `mb:${id(1001)}` }] }), { status: 200 })
    if (name === 'service_finish_integrated_review') return new Response(JSON.stringify({ runId: registrations[0].run_id, finishedAt: new Date(now).toISOString() }), { status: 200 })
    if (name === 'service_begin_integrated_review') {
      const request = JSON.parse(options.body), queue = JSON.parse(await readFile(statePath, 'utf8'))
      const journal = JSON.parse(await readFile(join(local, `identity-${queue.active.runId}.json`), 'utf8'))
      assert.deepEqual(request.targets, journal.targets); registrations.push(request)
      return new Response(JSON.stringify(failRegistration ? { message: 'private' } : null), { status: failRegistration ? 500 : 200 })
    }
    return new Response('null', { status: 200 })
  }
  const invoke = args => runQueueCommand([...args, '--role=artist'], { cwd: root, env, now, fetcher, serverGuard: async () => {} })
  try {
    await assert.rejects(invoke(['begin', '--owner=cloud', '--input=.local/artist-review-queue/catalog.json', '--identity-file=.local/artist-review-queue/work.json']), /SERVICE_REGISTRATION_FAILED/)
    const queue = JSON.parse(await readFile(statePath, 'utf8'))
    const journalPath = join(local, `identity-${queue.active.runId}.json`), bytes = await readFile(journalPath, 'utf8')
    failRegistration = false
    await invoke(['begin', '--owner=cloud'])
    assert.deepEqual(registrations[1], registrations[0]); assert.equal(await readFile(journalPath, 'utf8'), bytes)
    await rm(journalPath)
    await assert.rejects(invoke(['begin', '--owner=cloud']), /JOURNAL_MISSING/)
    assert.equal(registrations.length, 2)
    // Restore only this isolated fixture's exact saved journal, then exercise
    // the real CLI and Supabase HTTP clients with fake HTTP responses.
    await writeFile(journalPath, bytes, 'utf8')
    await writeFile(join(local, 'identity-input.json'), JSON.stringify({ bandId: id(1) }), 'utf8')
    await invoke(['identity', '--owner=cloud', '--input=.local/artist-review-queue/identity-input.json'])
    assert.equal(writes, 1); assert.equal(anonymousReads, 1)
    const saved = JSON.parse(await readFile(statePath, 'utf8'))
    assert.equal(saved.active.artists[0].originalIdentityVersion, null)
    assert.equal(saved.active.artists[0].recorded.identity.applied, true)
    assert.equal(saved.active.artists[0].recorded.approval.reason, 'IDENTITY_APPROVAL_NEXT_BATCH')
    await invoke(['finish', '--owner=cloud', '--defer-pending'])
    assert.equal(JSON.parse(await readFile(statePath, 'utf8')).active, null)
  } finally { await rm(root, { recursive: true, force: true }) }
})
