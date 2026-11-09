import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stateFiles, readOriginal, encodeBundle, decodeBundle, restoreOriginal, runPersistentScheduler, stateStore } from '../scripts/concert-scheduler-state.mjs'
import { apiCollectionCheckpoint } from '../scripts/collection-cooldown.mjs'
const now = Date.parse('2026-11-09T00:00:00Z'), hour = 3600000
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'durable-concert-')), directory = join(root, 'original')
  await mkdir(directory)
  for (const name of stateFiles) await writeFile(join(directory, name), JSON.stringify(name === 'latest.json'
    ? { source: 'kopis', cooldownVersion: 2, nextAttemptAt: new Date(now).toISOString(),
      http400Contexts: { 'HTTP400:list page=1': 1 }, http400Streak: 1, http400Fingerprint: 'HTTP400:list page=1' }
    : { original: name, fixedBatch: ['preserve'], notificationFingerprint: 'unchanged' }) + '\n', 'utf8')
  return { root, directory, bundle: await readOriginal(directory) }
}
test('original UTF-8 bytes and four digests survive private compressed transport and exact restore', async () => {
  const { root, directory, bundle } = await fixture()
  try {
    const restored = join(root, 'restored')
    await restoreOriginal(restored, decodeBundle(encodeBundle(bundle)))
    for (const name of stateFiles) assert.deepEqual(await readFile(join(restored, name)), await readFile(join(directory, name)))
    await assert.rejects(restoreOriginal(restored, bundle), /ALREADY_EXISTS/)
    const damaged = structuredClone(bundle); damaged.files['latest.json'].text += ' '
    assert.throws(() => encodeBundle(damaged), /STATE_INVALID/)
    assert.throws(() => decodeBundle(Buffer.from('damaged gzip')), /STATE_INVALID/)
    await rm(join(directory, 'review-checkpoint.json'))
    await assert.rejects(readOriginal(directory), /ENOENT/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('paused or unconfirmed durable owner never starts collection or restores a replacement checkpoint', async () => {
  const { root, bundle } = await fixture()
  try {
    const calls = [], store = { read: async () => bundle, write: async () => calls.push('write') }
    const verify = async () => { calls.push('verify'); return {} }
    const execute = async () => assert.fail('paused')
    assert.equal((await runPersistentScheduler({ root, store, verify, execute, env: { KOPIS_API_SCHEDULER_ENABLED: 'true' } })).skipped, 'scheduler_paused')
    bundle.phase = 'idle'
    assert.equal((await runPersistentScheduler({ root, store, verify, execute, env: {} })).skipped, 'scheduler_paused')
    bundle.phase = 'executing'
    await assert.rejects(runPersistentScheduler({ root, store, verify, execute, env: { KOPIS_API_SCHEDULER_ENABLED: 'true' } }), /PREVIOUS_EXECUTION_UNCONFIRMED/)
    assert.deepEqual(calls, ['verify','verify','verify'])
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('durable intent precedes the existing scheduler and latest is persisted with all review state unchanged', async () => {
  const { root, bundle } = await fixture(); bundle.phase = 'idle'
  const writes = [], store = { read: async () => bundle, write: async (before, after) => {
    assert.equal(after.generation, before.generation + 1); writes.push(structuredClone(after))
  } }
  try {
    const execute = async () => {
      assert.equal(writes.length, 1); assert.equal(writes[0].phase, 'executing')
      const path = join(root, '.local/concert-collection/latest.json')
      const saved = JSON.parse(await readFile(path, 'utf8'))
      const next = apiCollectionCheckpoint(saved, { error: 'KOPIS HTTP 400 [list 20261110-20261210 page=1]' }, { now })
      await writeFile(path, JSON.stringify(next), 'utf8')
      return { failed: true }
    }
    await runPersistentScheduler({ root, store, verify: async () => ({}), execute, env: { KOPIS_API_SCHEDULER_ENABLED: 'true' } })
    assert.equal(writes.length, 2); assert.equal(writes[1].phase, 'idle')
    const latest = JSON.parse(writes[1].files['latest.json'].text)
    assert.equal(Date.parse(latest.nextAttemptAt) - now, 6 * hour)
    for (const name of stateFiles.slice(1)) assert.deepEqual(writes[1].files[name], bundle.files[name])
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('runner failure or persistence failure leaves executing state and does not replay collection', async () => {
  for (const failure of ['runner', 'persist']) {
    const { root, bundle } = await fixture(); bundle.phase = 'idle'; let persisted, executions = 0
    const store = { read: async () => bundle, write: async (_, after) => {
      if (after.phase === 'idle') throw Error('storage unavailable')
      persisted = after
    } }
    try {
      await assert.rejects(runPersistentScheduler({ root, store, verify: async () => ({}), env: { KOPIS_API_SCHEDULER_ENABLED: 'true' }, execute: async () => {
        executions++; if (failure === 'runner') throw Error('run unknown'); return { skipped: 'cooldown' }
      } }))
      assert.equal(executions, 1); assert.equal(persisted.phase, 'executing')
    } finally { await rm(root, { recursive: true, force: true }) }
  }
})
test('private storage is mandatory; bootstrap cannot replace an existing object and writes must read back', async () => {
  const { root, bundle } = await fixture()
  try {
    const objects = new Map(), options = []
    const storage = {
      getBucket: async () => ({ data: { id: 'concert-scheduler-state', public: false } }),
      from: () => ({ upload: async (key, bytes, settings) => {
        options.push(settings)
        if (objects.has(key) && !settings.upsert) return { error: { message: 'exists' } }
        objects.set(key, bytes); return { data: {} }
      }, download: async key => ({ data: new Blob([objects.get(key)]) }) }) }
    const store = stateStore({ storage }); await store.initialize(bundle)
    assert.deepEqual(await store.read(), bundle)
    await assert.rejects(store.initialize(bundle), /STORAGE_UNAVAILABLE/)
    assert.equal(options[0].upsert, false); assert.equal(options[0].cacheControl, '0')
    storage.getBucket = async () => ({ data: { id: 'concert-scheduler-state', public: true } })
    await assert.rejects(store.read(), /PRIVATE_STORAGE_REQUIRED/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('API cooldown preserves every overlapping error context, rolling list dates, future holds and unknown recovery', () => {
  let previous = { source: 'kopis', cooldownVersion: 2, nextAttemptAt: new Date(now).toISOString(),
    http400Contexts: { 'HTTP400:list page=1': 1, 'HTTP400:detail PF000001': 2 }, http400Streak: 2, http400Fingerprint: 'HTTP400:detail PF000001' }
  const result = apiCollectionCheckpoint(previous, { failures: [{ error: 'KOPIS HTTP 400 [list 20261110-20261210 page=1]' },
    { error: 'KOPIS HTTP 400 [detail PF000001]' }] }, { now, confirmed: true })
  assert.equal(result.http400Contexts['HTTP400:list page=1'], 2)
  assert.equal(result.http400Contexts['HTTP400:detail PF000001'], 3)
  assert.equal(Date.parse(result.nextAttemptAt) - now, 24 * hour)
  previous = { ...previous, nextAttemptAt: new Date(now + 30 * hour).toISOString() }
  assert.equal(apiCollectionCheckpoint(previous, {}, { now, confirmed: true }).nextAttemptAt, previous.nextAttemptAt)
  assert.equal(Date.parse(apiCollectionCheckpoint(previous, {}, { now, receiptUnconfirmed: true }).nextAttemptAt) - now, 30 * hour)
})
