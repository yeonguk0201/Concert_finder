import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { newQueue, beginBatch, recordStage, finishBatch, offerHandoff, acceptHandoff,
  MAX_ARTISTS, PROJECT } from '../scripts/lib/artist-review-queue.mjs'
import { runQueueCommand, loadReviewEnvironment, readReviewCatalog, checkLegacyReviewIdle, integratedServiceAvailable } from '../scripts/artist-review-queue.mjs'
import { runRefresh } from '../scripts/refresh-artist-channels.mjs'
import { applyQueuedCuration, registerServiceBatch, SERVICE_AUTHORITY } from '../scripts/lib/artist-review-apply.mjs'

const now = Date.parse('2026-10-19T00:00:00Z'), hour = 3600000, day = 24 * hour
const id = i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const bands = (n = 45) => Array.from({ length: n }, (_, i) => ({ id: id(i), name: `Band ${String(i).padStart(3, '0')}`,
  aliases: [], country_code: 'JP', musicbrainz_id: id(i + 1000), category: 'unclassified', curation_status: 'unreviewed', updated_at: '2026-10-01T00:00:00.123456Z' }))
const proof = { decision: 'keep', summary: 'Official identity and rock activity verified', sources: [{ url: 'https://official.example/artist', checkedAt: new Date(now).toISOString(), excerpt: 'Official artist rock biography' }] }
const record = (queue, batch, bandId, stage, extra = {}) => recordStage(queue, { lane: queue.owner, runId: batch.runId, bandId, stage, reason: 'test', now, ...extra })
const proposal = b => ({ target_band_id: b.id, expected_updated_at: b.updated_at, artist_name: b.name,
  country: b.country_code, artist_category: 'jpop', artist_aliases: b.aliases, review_status: 'approved', reason: 'Verified actual J-pop activity', evidence_url: 'https://official.example/artist' })

test('one frozen list caps ALL work at 40, including failures; resume never refills it', () => {
  const q = newQueue('cloud', now), catalog = bands()
  const batch = beginBatch(q, { lane: 'cloud', bands: catalog, now })
  assert.equal(batch.artists.length, MAX_ARTISTS)
  for (const row of batch.artists) record(q, batch, row.bandId, 'research', { status: 'deferred' })
  const again = beginBatch(q, { lane: 'cloud', bands: bands(100), now: now + hour })
  assert.equal(again.runId, batch.runId); assert.deepEqual(again.artists.map(r => r.bandId), batch.artists.map(r => r.bandId))
  assert.throws(() => record(q, batch, id(40), 'research', { status: 'complete', proof }), /TARGET_NOT_SELECTED/)
  assert.throws(() => finishBatch(q, { lane: 'cloud', runId: batch.runId, now }), /BATCH_INCOMPLETE/)
  finishBatch(q, { lane: 'cloud', runId: batch.runId, now, deferPending: true })
  assert.equal(beginBatch(q, { lane: 'cloud', bands: catalog, now: now + hour }).reason, 'schedule_window')
  const next = beginBatch(q, { lane: 'cloud', bands: catalog, now: now + 5 * hour })
  assert.equal(next.artists.length, 5)
  assert.deepEqual(next.artists.map(r => r.bandId), catalog.slice(40, 45).map(r => r.id))
})

test('due failures get first priority, wait age beats reverse name order, protected states stay untouched', () => {
  const q = newQueue('local', now), catalog = bands(4)
  const first = beginBatch(q, { lane: 'local', bands: catalog.slice(0, 1), now })
  finishBatch(q, { lane: 'local', runId: first.runId, now, deferPending: true })
  catalog[2].curation_status = 'held'; catalog[3].curation_status = 'excluded'
  const next = beginBatch(q, { lane: 'local', bands: catalog, now: now + day, direction: 'reverse' })
  assert.deepEqual(next.artists.map(r => r.bandId), [id(0), id(1)])
  assert.equal(next.artists[0].priority, 1)
})

test('real completed research is reused, authority wait is not genre failure, auth change schedules apply only', () => {
  const q = newQueue('cloud', now), catalog = bands(1), batch = beginBatch(q, { lane: 'cloud', bands: catalog, now })
  record(q, batch, id(0), 'research', { status: 'complete', proof })
  record(q, batch, id(0), 'approval', { status: 'authority_wait', proposal: proposal(catalog[0]) })
  record(q, batch, id(0), 'channels', { status: 'complete', proof: { ...proof, decision: 'verified' },
    applied: true, verification: { version: 'profile-version-after-readback', readBack: true, checkedAt: new Date(now).toISOString() } })
  const report = finishBatch(q, { lane: 'cloud', runId: batch.runId, now })
  assert.equal(report.authorityWaiting, 1)
  assert.equal(beginBatch(q, { lane: 'cloud', bands: catalog, now: now + 5 * hour }).reason, 'no_work')
  const apply = beginBatch(q, { lane: 'cloud', bands: catalog, now: now + 6 * hour, authorityKey: 'verified-user-session-generation-2' })
  assert.deepEqual(apply.artists[0].tasks, ['approval'])
  assert.throws(() => record(q, apply, id(0), 'approval', { status: 'complete', proposal: proposal(catalog[0]) }), /READBACK_REQUIRED/)
})

test('proof expiry and changed identity/version invalidate reuse; approved artists get channels only', () => {
  const q = newQueue('local', now), catalog = bands(1), batch = beginBatch(q, { lane: 'local', bands: catalog, now })
  record(q, batch, id(0), 'research', { status: 'complete', proof })
  finishBatch(q, { lane: 'local', runId: batch.runId, now, deferPending: true })
  const changed = [{ ...catalog[0], updated_at: '2026-10-19T00:00:00.000001Z' }]
  const fresh = beginBatch(q, { lane: 'local', bands: changed, now: now + 5 * hour })
  assert.ok(fresh.artists[0].tasks.includes('research'))
  finishBatch(q, { lane: 'local', runId: fresh.runId, now: now + 5 * hour, deferPending: true })
  const approved = [{ ...changed[0], curation_status: 'approved' }]
  const channels = beginBatch(q, { lane: 'local', bands: approved, now: now + 10 * hour })
  assert.deepEqual(channels.artists[0].tasks, ['channels'])
  assert.throws(() => record(q, channels, id(0), 'research', { status: 'complete', proof }), /TASK_NOT_SELECTED/)
})

test('checkpoint retries are idempotent, malformed proof/proposals cannot fake completed writes', () => {
  const q = newQueue('local', now), catalog = bands(1), batch = beginBatch(q, { lane: 'local', bands: catalog, now })
  assert.throws(() => record(q, batch, id(0), 'research', { status: 'complete' }), /PROOF_REQUIRED/)
  assert.throws(() => record(q, batch, id(0), 'research', { status: 'complete', proof: { ...proof, sources: [{ ...proof.sources[0], url: 'https://official.example/?key=secret' }] } }), /SOURCE_INVALID/)
  record(q, batch, id(0), 'research', { status: 'complete', proof, apiCalls: 2 })
  record(q, batch, id(0), 'research', { status: 'complete', proof, apiCalls: 2 })
  assert.equal(batch.apiCalls, 2)
  assert.throws(() => record(q, batch, id(0), 'research', { status: 'deferred' }), /CHECKPOINT_CONFLICT/)
  assert.throws(() => record(q, batch, id(0), 'approval', { status: 'authority_wait', proposal: { ...proposal(catalog[0]), artist_aliases: ['changed'] } }), /PROPOSAL_INVALID/)
})

test('handoff revokes source, requires ended batch, preserves five-hour gate and rejects stale re-import', () => {
  const q = newQueue('local', now), catalog = bands(45), batch = beginBatch(q, { lane: 'local', bands: catalog, now })
  assert.throws(() => offerHandoff(q, { lane: 'local', to: 'cloud', now }), /BATCH_INCOMPLETE/)
  finishBatch(q, { lane: 'local', runId: batch.runId, now, deferPending: true })
  const packet = offerHandoff(q, { lane: 'local', to: 'cloud', now })
  assert.throws(() => beginBatch(q, { lane: 'local', bands: catalog, now: now + 5 * hour }), /HANDOFF_REQUIRED/)
  const cloud = acceptHandoff(packet, { lane: 'cloud' })
  assert.equal(beginBatch(cloud, { lane: 'cloud', bands: catalog, now: now + hour }).reason, 'schedule_window')
  const next = beginBatch(cloud, { lane: 'cloud', bands: catalog, now: now + 5 * hour })
  assert.equal(next.artists.length, 5)
  assert.throws(() => acceptHandoff(packet, { lane: 'cloud', previous: cloud }), /HANDOFF_STALE/)
  assert.throws(() => acceptHandoff(packet, { lane: 'local' }), /HANDOFF_INVALID/)
})

async function workspace(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'artist-queue-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  const root = join(cwd, '.local/artist-review-queue'); await mkdir(root, { recursive: true })
  const cmd = args => runQueueCommand(args, { cwd, now, env: { SUPABASE_URL: `https://${PROJECT}.supabase.co` }, serverGuard: async () => {}, output: () => {} })
  return { cwd, root, cmd }
}

test('CLI persists/reloads frozen batches and handoff; handles a pre-existing lock without doing work', async t => {
  const { root, cmd } = await workspace(t)
  await writeFile(join(root, 'catalog.json'), JSON.stringify(bands()), 'utf8')
  await cmd(['init', '--owner=local'])
  const first = await cmd(['begin', '--owner=local', '--input=.local/artist-review-queue/catalog.json'])
  const second = await cmd(['begin', '--owner=local'])
  assert.equal(first.runId, second.runId); assert.equal(second.selected, 40)
  await assert.rejects(cmd(['handoff', '--owner=local', '--to=cloud']), /BATCH_INCOMPLETE/)
  await cmd(['finish', '--owner=local', '--defer-pending'])
  await cmd(['handoff', '--owner=local', '--to=cloud'])
  const copy = await readFile(join(root, 'handoff.json'), 'utf8')
  await cmd(['handoff', '--owner=local', '--to=cloud'])
  assert.equal(await readFile(join(root, 'handoff.json'), 'utf8'), copy)
  await cmd(['accept', '--owner=cloud', '--input=.local/artist-review-queue/handoff.json'])
  await assert.rejects(cmd(['begin', '--owner=local', '--input=.local/artist-review-queue/catalog.json']), /HANDOFF_REQUIRED/)
  await writeFile(join(root, 'state.json.lock'), '', 'utf8')
  await assert.rejects(cmd(['status', '--owner=cloud']), /QUEUE_BUSY/)
})

test('CLI rejects symlinks, path escape, secrets, cache payload and destructive output paths', async t => {
  const { cwd, root, cmd } = await workspace(t)
  await cmd(['init', '--owner=local'])
  await assert.rejects(cmd(['status', '--owner=local', '--state=../outside.json']), /IGNORED_PATH_REQUIRED/)
  await writeFile(join(root, 'bad.json'), JSON.stringify({ access_token: 'hidden' }), 'utf8')
  await assert.rejects(cmd(['accept', '--owner=local', '--input=.local/artist-review-queue/bad.json']), /SECRET_OR_CACHE_FIELD/)
  await symlink(join(root, 'bad.json'), join(root, 'link.json'))
  await assert.rejects(cmd(['accept', '--owner=local', '--input=.local/artist-review-queue/link.json']), /SYMLINK_PATH_REJECTED/)
  await writeFile(join(root, 'catalog.json'), JSON.stringify(bands(1)), 'utf8')
  await assert.rejects(cmd(['begin', '--owner=local', '--input=.local/artist-review-queue/catalog.json', '--output=.local/artist-review-queue/state.json']), /OUTPUT_PATH_CONFLICT/)
  const state = JSON.parse(await readFile(join(root, 'state.json'), 'utf8'))
  assert.equal(state.project, PROJECT)
  const env = { ARTIST_REVIEW_RUNNER_SECRET: 'private-value-1234567890' }
  await writeFile(join(root, 'bad.json'), JSON.stringify({ summary: env.ARTIST_REVIEW_RUNNER_SECRET }), 'utf8')
  await assert.rejects(runQueueCommand(['accept', '--owner=local', '--input=.local/artist-review-queue/bad.json'], { cwd, env, output: () => {} }), /SECRET_IN_ARTIFACT/)
})

test('loads UTF-8 env fallback once without replacing existing bindings; wrong project makes no request', async t => {
  const { cwd } = await workspace(t)
  await writeFile(join(cwd, 'env.push.local'), 'YOUTUBE_API_KEY="파일키"\nSUPABASE_URL=https://czjrzylvnewfjnfwjhwf.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=example\nUNRELATED=ignore\n', 'utf8')
  const env = { YOUTUBE_API_KEY: 'injected' }
  await loadReviewEnvironment(env, cwd)
  assert.equal(env.YOUTUBE_API_KEY, 'injected'); assert.equal(env.UNRELATED, undefined)
  let calls = 0
  await assert.rejects(readReviewCatalog({ env: { ...env, SUPABASE_URL: 'https://wrong.supabase.co' }, fetcher: () => { calls++ } }), /PROJECT_CONFIGURATION_REQUIRED/)
  assert.equal(calls, 0)
  assert.equal((await readReviewCatalog({ env, fetcher: async () => new Response(JSON.stringify(bands())) })).length, 45)
})

test('channel refresh uses the same 40 selected IDs and rejects out-of-batch imports before RPC/API writes', async () => {
  const q = newQueue('local', now), catalog = bands(45), selection = beginBatch(q, { lane: 'local', bands: catalog, now })
  const manifest = { version: 1, artists: catalog.map(b => ({ bandId: b.id, musicBrainzId: b.musicbrainz_id,
    name: b.name, identityVersion: b.updated_at, curationStatus: b.curation_status, channelUrl: 'https://www.youtube.com/channel/UC' + 'a'.repeat(22),
    profileVersion: 'v1', verification: 'candidate', evidence: [] })) }
  const calls = [], client = { rpc: async (name, args) => {
    calls.push({ name, args })
    if (name === 'service_apply_artist_channel') Object.assign(manifest.artists.find(row => row.bandId === args.result.bandId), args.result)
    return name === 'service_artist_channel_manifest' ? { data: structuredClone(manifest) } : { error: null }
  } }
  await assert.rejects(runRefresh(client, { selection, manifest, now }), /TARGET_NOT_SELECTED/)
  assert.equal(calls.length, 0)
  const report = await runRefresh(client, { selection, now })
  assert.equal(report.artists, 40); assert.equal(report.apiCalls, 0)
  assert.equal(report.readBack, 40)
  assert.equal(calls.filter(c => c.name === 'service_apply_artist_channel').length, 40)
  assert.ok(calls.filter(c => c.name === 'service_apply_artist_channel').every(c => selection.artists.some(row => row.bandId === c.args.result.bandId)))
  await assert.rejects(runRefresh(client, { selection: { ...selection, artists: [...selection.artists, { ...selection.artists[0], bandId: id(44) }] }, now }), /SELECTION_INVALID/)
})

test('legacy server lease check blocks active/expired runs and never claims a new legacy batch', async () => {
  const env = { SUPABASE_URL: `https://${PROJECT}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: 'test' }
  for (const result of [{ state: 'busy', reason: 'lease_active' }, { state: 'ready', reason: 'lease_recovery' }]) {
    await assert.rejects(checkLegacyReviewIdle(env, async (url, options) => {
      assert.ok(url.endsWith('/rpc/service_artist_review_readiness')); assert.equal(options.body, '{}')
      return new Response(JSON.stringify(result))
    }), /LEGACY_REVIEW_NOT_FINISHED/)
  }
  await checkLegacyReviewIdle(env, async () => new Response(JSON.stringify({ state: 'idle', reason: 'no_work' })))
})

test('missing service migration keeps legacy authorization available; other failures are surfaced', async () => {
  assert.equal(await integratedServiceAvailable({ rpc: async () => ({ data: null, error: null }) }), true)
  assert.equal(await integratedServiceAvailable({ rpc: async () => ({ error: { code: 'PGRST202' } }) }), false)
  await assert.rejects(integratedServiceAvailable({ rpc: async () => ({ error: { code: '42501' } }) }), /SERVICE_READINESS_FAILED/)
})

test('authenticated apply preserves names, verifies current version and actual actor history; no auth saves proposal only', async () => {
  const setup = () => {
    const q = newQueue('local', now), catalog = bands(1), batch = beginBatch(q, { lane: 'local', bands: catalog, now })
    record(q, batch, id(0), 'research', { status: 'complete', proof })
    return { q, catalog, args: { lane: 'local', runId: batch.runId, bandId: id(0), proposal: proposal(catalog[0]), now } }
  }
  const missing = setup()
  assert.equal((await applyQueuedCuration(missing.q, missing.args)).status, 'authority_wait')
  assert.equal(missing.q.entries[id(0)].stages.research.status, 'complete')
  const { q, catalog, args } = setup(), calls = []
  let updated = false
  const after = { ...catalog[0], curation_status: 'approved', category: 'jpop', curation_reason: args.proposal.reason,
    curation_evidence_url: args.proposal.evidence_url, updated_at: '2026-10-19T00:00:00.000001Z' }
  const adminClient = { auth: { getUser: async token => { assert.equal(token, 'real-session'); return { data: { user: { id: 'real-admin' } } } } },
    rpc: async (name, input) => {
      calls.push({ name, input })
      if (name === 'admin_catalog') return { data: { bands: [updated ? after : catalog[0]] } }
      if (name === 'admin_curate_artist') { updated = true; return { error: null } }
      return { data: [{ actor_id: 'real-admin', after_record: after }] }
    } }
  await assert.rejects(applyQueuedCuration(q, { ...args, adminClient, accessToken: 'real-session' }), /APPROVAL_REQUIREMENTS_REQUIRED/)
  assert.ok(!calls.some(c => c.name === 'admin_curate_artist'))
  const requirements = Object.fromEntries(['identityMatched', 'countryMatched', 'genreMatched', 'classificationMatched', 'externalIdentityLinked', 'publicationEffectUnderstood'].map(key => [key, true]))
  const relationReader = { from: () => ({ select: () => ({ eq: async () => ({ count: 2, error: null }) }) }) }
  const result = await applyQueuedCuration(q, { ...args, adminClient, relationReader, accessToken: 'real-session', requirements })
  assert.equal(result.applied, true); assert.equal(q.entries[id(0)].band.curation_status, 'approved')
  assert.deepEqual(calls.find(c => c.name === 'admin_curate_artist').input.artist_aliases, [])
  const stale = setup()
  await assert.rejects(applyQueuedCuration(stale.q, { ...stale.args, adminClient, accessToken: 'real-session', requirements }), /EDIT_CONFLICT/)
})

test('scoped channel writes without matching read-back are never reported as applied', async () => {
  const q = newQueue('local', now), b = bands(1)[0]
  const selection = beginBatch(q, { lane: 'local', bands: [b], now })
  const manifest = { version: 1, artists: [{ bandId: b.id, musicBrainzId: b.musicbrainz_id, name: b.name,
    identityVersion: b.updated_at, curationStatus: 'unreviewed', profileVersion: 'original', channelUrl: 'https://www.youtube.com/channel/UC' + 'a'.repeat(22), verification: 'candidate', evidence: [] }] }
  const client = { rpc: async name => name === 'service_artist_channel_manifest' ? { data: structuredClone(manifest) } : { error: null } }
  const result = await runRefresh(client, { selection, now })
  assert.equal(result.applied, 0); assert.equal(result.readBack, 0); assert.equal(result.ok, false)
  assert.equal(result.errors.CHANNEL_READBACK_FAILED, 1); assert.equal(result.photosAvailable, 0)
})

test('service apply needs per-requirement evidence, verifies receipt and publication, and keeps registration immutable', async () => {
  const q = newQueue('local', now), catalog = bands(1)
  const batch = beginBatch(q, { lane: 'local', bands: catalog, now, authorityKey: SERVICE_AUTHORITY })
  record(q, batch, id(0), 'research', { status: 'complete', proof })
  const p = proposal(catalog[0]), args = { lane: 'local', runId: batch.runId, bandId: id(0), proposal: p, now }
  const keys = ['identityMatched','countryMatched','genreMatched','classificationMatched','externalIdentityLinked','publicationEffectUnderstood']
  const requirements = Object.fromEntries(keys.map(key => [key, true]))
  const approvalEvidence = Object.fromEntries(keys.map(key => [key, { summary: `Verified ${key}`, sourceUrls: [proof.sources[0].url] }]))
  const after = { ...catalog[0], curation_status: 'approved', category: 'jpop', curation_reason: p.reason,
    curation_evidence_url: p.evidence_url, updated_at: '2026-10-19T00:00:00.000001Z' }
  let publicationApproved = false
  const registrations = [], writes = []
  const serviceClient = {
    rpc: async (name, input) => {
      if (name === 'service_begin_integrated_review') { registrations.push(input); return { error: null } }
      if (name === 'service_apply_integrated_review') { writes.push(input); return { data: { runId: batch.runId, after } } }
      return { data: { runId: batch.runId, before: catalog[0], after, relations: [2,2], publicationApproved } }
    },
    from: table => ({ select: () => ({ eq: () => table === 'bands' ? { single: async () => ({ data: after }) } : Promise.resolve({ count: 2 }) }) }),
  }
  await registerServiceBatch(serviceClient, q)
  await assert.rejects(applyQueuedCuration(q, { ...args, requirements, serviceClient }), /APPROVAL_REQUIREMENTS_REQUIRED/)
  assert.equal(writes.length, 0)
  await assert.rejects(applyQueuedCuration(q, { ...args, requirements, approvalEvidence, serviceClient }), /CURATION_WRITE_UNCONFIRMED/)
  assert.equal(q.entries[id(0)].stages.approval.status, 'pending')
  publicationApproved = true
  assert.equal((await applyQueuedCuration(q, { ...args, requirements, approvalEvidence, serviceClient })).applied, true)
  assert.equal(q.active.artists[0].identityVersion, after.updated_at)
  await registerServiceBatch(serviceClient, q)
  assert.deepEqual(registrations[0], registrations[1])
  assert.equal((await applyQueuedCuration(q, { ...args, requirements, approvalEvidence, serviceClient })).applied, true)
  assert.equal(writes.length, 2) // Failed read-back retried; completed local checkpoint did not write again.
})

test('approval-only batch accepts fresh supplemental sources while preserving reused investigation', async () => {
  const q = newQueue('local', now), catalog = bands(1)
  const first = beginBatch(q, { lane: 'local', bands: catalog, now })
  record(q, first, id(0), 'research', { status: 'complete', proof })
  record(q, first, id(0), 'approval', { status: 'authority_wait', proposal: proposal(catalog[0]) })
  record(q, first, id(0), 'channels', { status: 'complete', proof: { ...proof, decision: 'no_official_channel' } })
  finishBatch(q, { lane: 'local', runId: first.runId, now })
  const batch = beginBatch(q, { lane: 'local', bands: catalog, now: now + 5*hour, authorityKey: SERVICE_AUTHORITY })
  assert.deepEqual(batch.artists[0].tasks, ['approval'])
  const url = 'https://label.example/profile'
  const approvalProof = { ...proof, sources: [...proof.sources, { url, checkedAt: new Date(now).toISOString(), summary: 'Country and identity verified.' }] }
  const keys = ['identityMatched','countryMatched','genreMatched','classificationMatched','externalIdentityLinked','publicationEffectUnderstood']
  const requirements = Object.fromEntries(keys.map(key => [key,true]))
  const approvalEvidence = Object.fromEntries(keys.map(key => [key,{summary:'Actually verified',sourceUrls:[url]}]))
  const args = { lane:'local',runId:batch.runId,bandId:id(0),proposal:proposal(catalog[0]),requirements,approvalEvidence,approvalProof,now:now+5*hour }
  const serviceClient = { rpc: async (name,input) => {
    assert.equal(name,'service_apply_integrated_review'); assert.equal(input.proof.sources[1].url,url)
    return {error:{message:'EDIT_CONFLICT'}}
  } }
  await assert.rejects(applyQueuedCuration(q,{...args,serviceClient}),/EDIT_CONFLICT/)
  assert.deepEqual(q.entries[id(0)].stages.research.proof,proof)
  await assert.rejects(applyQueuedCuration(q,{...args,serviceClient,approvalProof:{...approvalProof,decision:'hold'}}),/DECISION_CONFLICT/)
})

test('reusing old proof never extends its original 90-day expiration', () => {
  const q = newQueue('local', now), batch = beginBatch(q, { lane: 'local', bands: bands(1), now })
  const oldProof = { ...proof, sources: [{ ...proof.sources[0], checkedAt: new Date(now - 80 * day).toISOString() }] }
  const saved = record(q, batch, id(0), 'research', { status: 'complete', proof: oldProof })
  assert.equal(Date.parse(saved.validUntil), now + 10 * day)
  assert.equal(Date.parse(saved.lastSuccessfulAt), now - 80 * day)
})
