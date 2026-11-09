import { readFile, writeFile, mkdir, rename, lstat } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { apiFirstClient, apiFirstCollectionCompatible } from './api-first-publication.mjs'
import { assertApiCheckpoint } from './collection-cooldown.mjs'

export const stateFiles = ['latest.json', 'review-checkpoint.json', 'review-batch-current.json', 'schedule-observation.json']
export const bucketName = 'concert-scheduler-state'
const currentKey = 'kopis/current.json.gz'
const owner = 'github-actions-kopis-api-v1'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = code => { throw Error(code) }
const json = text => { try { return JSON.parse(text) } catch { fail('SCHEDULER_STATE_INVALID') } }
const limit = 32 * 1024 * 1024
export function validateBundle(bundle) {
  if (!bundle || bundle.version !== 1 || bundle.owner !== owner || !['paused', 'idle', 'executing'].includes(bundle.phase)
    || !Number.isSafeInteger(bundle.generation) || bundle.generation < 1 || !Number.isFinite(Date.parse(bundle.updated_at))
    || !bundle.files || Object.keys(bundle.files).sort().join() !== [...stateFiles].sort().join()) fail('SCHEDULER_STATE_INVALID')
  for (const name of stateFiles) {
    const file = bundle.files[name]
    if (typeof file?.text !== 'string' || Buffer.byteLength(file.text) > limit || sha(file.text) !== file.sha256) fail('SCHEDULER_STATE_INVALID')
    json(file.text)
  }
  const latest = json(bundle.files['latest.json'].text)
  if (latest.source !== 'kopis') fail('SCHEDULER_STATE_INVALID')
  assertApiCheckpoint(latest)
  return bundle
}
export function encodeBundle(bundle) {
  const text = JSON.stringify(validateBundle(bundle))
  if (Buffer.byteLength(text) > limit) fail('SCHEDULER_STATE_TOO_LARGE')
  const bytes = gzipSync(text)
  if (bytes.length > 6 * 1024 * 1024) fail('SCHEDULER_STATE_TOO_LARGE')
  return bytes
}
export function decodeBundle(bytes) {
  try {
    if (bytes.length > 6 * 1024 * 1024) fail('SCHEDULER_STATE_TOO_LARGE')
    return validateBundle(json(new TextDecoder('utf-8', { fatal: true }).decode(gunzipSync(bytes, { maxOutputLength: limit }))))
  } catch { fail('SCHEDULER_STATE_INVALID') }
}
export function bundleSummary(bundle) {
  validateBundle(bundle)
  return { owner: bundle.owner, phase: bundle.phase, generation: bundle.generation,
    state_sha256: sha(encodeBundle(bundle)), files: Object.fromEntries(stateFiles.map(n => [n, bundle.files[n].sha256])) }
}
export async function readOriginal(directory, previous = null) {
  const files = {}
  for (const name of stateFiles) {
    const path = join(directory, name)
    if (!(await lstat(path)).isFile()) fail('SCHEDULER_ORIGINAL_STATE_REQUIRED')
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path))
    files[name] = { text, sha256: sha(text) }
  }
  return validateBundle({ version: 1, owner, phase: previous?.phase ?? 'paused', generation: previous?.generation ?? 1,
    updated_at: new Date().toISOString(), files })
}
export async function restoreOriginal(directory, bundle) {
  validateBundle(bundle)
  // Restore exact bytes to a clean temporary runner; never merge/reset existing state.
  try { await lstat(directory); fail('SCHEDULER_STATE_ALREADY_EXISTS') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const staging = `${directory}-${randomUUID()}.tmp`
  await mkdir(staging, { recursive: true, mode: 0o700 })
  for (const name of stateFiles) await writeFile(join(staging, name), bundle.files[name].text, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  await rename(staging, directory)
}
function unwrap(response) { if (response.error) fail('SCHEDULER_STORAGE_UNAVAILABLE'); return response.data }
export function stateStore(client) {
  const storage = client.storage.from(bucketName)
  const bucket = async () => {
    const data = unwrap(await client.storage.getBucket(bucketName))
    if (data?.id !== bucketName || data.public !== false) fail('SCHEDULER_PRIVATE_STORAGE_REQUIRED')
  }
  const read = async () => {
    await bucket()
    const blob = unwrap(await storage.download(currentKey))
    return decodeBundle(Buffer.from(await blob.arrayBuffer()))
  }
  const put = async (key, bundle, upsert) => {
    await bucket()
    unwrap(await storage.upload(key, encodeBundle(bundle), { upsert, contentType: 'application/gzip', cacheControl: '0' }))
    const blob = unwrap(await storage.download(key))
    if (sha(Buffer.from(await blob.arrayBuffer())) !== sha(encodeBundle(bundle))) fail('SCHEDULER_PERSISTENCE_UNCONFIRMED')
  }
  return { read,
    initialize: async bundle => {
      validateBundle(bundle)
      if (bundle.phase !== 'paused' || bundle.generation !== 1) fail('SCHEDULER_BOOTSTRAP_PAUSED_REQUIRED')
      // upsert=false: an existing owner/state is never replaced by bootstrap.
      await put('kopis/original.json.gz', bundle, false)
      await put(currentKey, bundle, false)
    },
    write: async (previous, next) => {
      if (next.generation !== previous.generation + 1) fail('SCHEDULER_STATE_CONFLICT')
      const actual = await read()
      if (sha(encodeBundle(actual)) !== sha(encodeBundle(previous))) fail('SCHEDULER_STATE_CONFLICT')
      // GitHub workflow concurrency is the single writer, not a client-side CAS.
      await put(`kopis/journal/${next.generation}-${sha(encodeBundle(next))}.json.gz`, next, false)
      await put(currentKey, next, true)
    } }
}
export async function verifyConnection(client, env) {
  const policy = unwrap(await client.from('collection_policies').select('*').eq('source', 'kopis').single())
  const capabilities = unwrap(await client.rpc('service_publication_capabilities', {}))
  if (!apiFirstCollectionCompatible(policy, capabilities, env.KOPIS_PUBLICATION_EXECUTOR_MD5, env.KOPIS_API_FACTS_MD5)) fail('API_PUBLICATION_CONTRACT_CHANGED')
  const context = unwrap(await client.rpc('service_kopis_api_context', {}))
  if (context?.source_use?.facts_only !== true || context.source_use.source !== 'kopis') fail('API_SOURCE_USE_REQUIRED')
  return { contract: capabilities.contract, executor_md5: capabilities.executor_md5, api_facts_md5: capabilities.api_facts_md5,
    publication: policy.publication_enabled, live_after: policy.live_after, source_use: context.source_use }
}
export async function runPersistentScheduler({ root, env = process.env, store, execute, verify }) {
  const original = await store.read()
  validateBundle(original)
  const connection = await verify()
  if (env.KOPIS_API_SCHEDULER_ENABLED !== 'true' || original.phase === 'paused') {
    return { skipped: 'scheduler_paused', ...bundleSummary(original), connection }
  }
  if (original.phase !== 'idle') fail('SCHEDULER_PREVIOUS_EXECUTION_UNCONFIRMED')
  const directory = join(root, '.local/concert-collection')
  await restoreOriginal(directory, original)
  const active = { ...original, phase: 'executing', generation: original.generation + 1, updated_at: new Date().toISOString() }
  await store.write(original, active)
  // Persist the intent before the existing runner can acquire any source lease.
  let result, error
  try { result = await execute() } catch (caught) { error = caught }
  if (error) fail('SCHEDULER_EXECUTION_UNCONFIRMED') // marker deliberately stays executing
  const next = await readOriginal(directory, active)
  for (const name of stateFiles.slice(1)) if (next.files[name].sha256 !== original.files[name].sha256) fail('SCHEDULER_REVIEW_STATE_CHANGED')
  Object.assign(next, { phase: 'idle', generation: active.generation + 1 })
  await store.write(active, next)
  return { result, ...bundleSummary(next), connection }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  try {
    const client = apiFirstClient(process.env, fetch), store = stateStore(client)
    if (process.argv.includes('--bootstrap-original')) {
      const bundle = await readOriginal(join(root, '.local/concert-collection'))
      await store.initialize(bundle)
      console.log(JSON.stringify(bundleSummary(await store.read())))
    } else {
      const executeMode = process.argv.includes('--execute')
      // Workflow-only execution: local/AI callers cannot take over the durable owner.
      if (executeMode && (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REF !== 'refs/heads/main'
        || process.env.CONCERT_SCHEDULER_OWNER !== owner)) fail('SCHEDULER_OWNER_REQUIRED')
      const env = { ...process.env, KOPIS_API_SCHEDULER_ENABLED: executeMode ? process.env.KOPIS_API_SCHEDULER_ENABLED : 'false' }
      const result = await runPersistentScheduler({ root, env, store, verify: () => verifyConnection(client, env), execute: async () => {
        return new Promise((done, reject) => {
          const child = spawn(process.execPath, ['--use-env-proxy', join(root, 'scripts/collect-concerts-scheduled.mjs')],
            { cwd: root, env, stdio: ['ignore', 'inherit', 'inherit'] })
          child.once('error', () => reject(Error('SCHEDULER_PROCESS_START_FAILED')))
          child.once('exit', code => code === 0 ? done({ runner_exit: 0 }) : reject(Error('SCHEDULER_EXECUTION_UNCONFIRMED')))
        })
      } })
      console.log(JSON.stringify(result))
    }
  } catch (error) { console.error(/^[A-Z0-9_]+$/.test(error.message) ? error.message : 'SCHEDULER_STATE_UNAVAILABLE'); process.exitCode = 1 }
}
