import { readFile, mkdir, writeFile, rename, open, unlink, realpath, lstat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { LEASE_RESERVE_MS, leaseRemaining, watchReviewLease } from './lib/review-lease.mjs'

async function launchWatchdog(path, runId, env) {
  const child = spawn(process.execPath, ['--use-env-proxy', new URL(import.meta.url).pathname, 'watch', `--state=${path}`, `--run=${runId}`],
    { env, stdio: 'ignore', detached: true })
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
  child.unref()
}

const serverCodes = new Set(['UNAUTHORIZED', 'RUN_EXPIRED', 'LEASE_LOST', 'TARGET_NOT_CLAIMED', 'TARGET_DISABLED',
  'EDIT_CONFLICT', 'MANUAL_DECISION', 'INVALID_RESULT', 'OFFICIAL_EVIDENCE_REQUIRED', 'CHANNEL_EVIDENCE_REQUIRED',
  'CHANNEL_LOCKED', 'CHANNEL_ID_CHANGED', 'CHECKPOINT_CONFLICT', 'RUN_NOT_FOUND', 'SOURCE_UNAVAILABLE',
  'SOURCE_MISMATCH', 'YOUTUBE_KEY_REQUIRED', 'YOUTUBE_ACTION_REQUIRED', 'CHANNEL_NOT_FOUND', 'REVIEW_DB_FAILED'])

export async function runReviewCommand(args, { env = process.env, fetcher = fetch, output = console.log,
  startWatchdog = launchWatchdog, wallNow = Date.now } = {}) {
  const [action, ...options] = args
  if (!['begin', 'checkpoint', 'defer', 'finish', 'notices', 'close', 'guard', 'queue'].includes(action)
    || options.some(x => !/^--(state|input|after)=.+/.test(x))) throw new Error('ARGUMENT_INVALID')
  const option = key => options.find(x => x.startsWith(`--${key}=`))?.slice(key.length + 3)
  const root = resolve('.local/artist-review')
  const localPath = value => {
    const path = resolve(value)
    if (!path.startsWith(root + '/')) throw new Error('IGNORED_PATH_REQUIRED')
    return path
  }
  const path = localPath(option('state') ?? `${root}/run.json`)
  const safeExisting = async file => {
    if (await realpath(file) !== resolve(file)) throw new Error('SYMLINK_PATH_REJECTED')
  }
  const base = env.ARTIST_REVIEW_ENDPOINT
  const secret = env.ARTIST_REVIEW_RUNNER_SECRET
  // Cloud bindings can be proxy placeholders; only the server validates the actual secret strength.
  if (base !== 'https://czjrzylvnewfjnfwjhwf.supabase.co/functions/v1/artist-review-runner' || !secret?.trim()) throw new Error('RUNNER_CONFIGURATION_REQUIRED')
  const save = async state => {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await rename(temporary, path)
  }
  await mkdir(dirname(path), { recursive: true })
  await safeExisting(dirname(path))
  try { if ((await lstat(path)).isSymbolicLink()) throw new Error('SYMLINK_PATH_REJECTED') } catch (error) { if (error.code !== 'ENOENT') throw error }
  const lock = await open(`${path}.lock`, 'wx', 0o600)
  try {
  let state
  try { state = JSON.parse(await readFile(path, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (action === 'begin' && (!state || state.finished)) {
    state = { runId: randomUUID(), finished: false }
    // Persist the idempotency ID before making a possibly ambiguous network request.
    await save(state)
  }
  if (!state?.runId && action !== 'queue') throw new Error('BEGIN_REQUIRED')
  let watchdogStopped = false
  if (state?.runId) {
    try { watchdogStopped = JSON.parse(await readFile(`${path}.${state.runId}.closed.json`, 'utf8')).stop === true }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  if (state?.finished && ['checkpoint', 'defer', 'guard'].includes(action)) {
    const stopped = { stop: true, researchAllowed: false, notify: false }
    output(JSON.stringify(stopped)); return stopped
  }
  if (action === 'guard') {
    const remainingMs = leaseRemaining(state, wallNow())
    if (!watchdogStopped && remainingMs > LEASE_RESERVE_MS) {
      const budget = { researchAllowed: !state.finished && remainingMs > LEASE_RESERVE_MS, remainingMs, notify: false }
      output(JSON.stringify(budget)); return budget
    }
  }
  let body = { action: action === 'guard' ? 'close' : action, runId: state?.runId ?? randomUUID() }
  if (action === 'queue') body.afterId = option('after') ?? null
  if (['checkpoint', 'defer'].includes(action) && state.response?.leaseUntil
    && (watchdogStopped || leaseRemaining(state, wallNow()) <= LEASE_RESERVE_MS)) body = { action: 'close', runId: state.runId }
  if (action === 'notices' && option('input')) {
    await safeExisting(localPath(option('input')))
    const record = JSON.parse(await readFile(localPath(option('input')), 'utf8'))
    body.acknowledge = record.acknowledge
  }
  if ((action === 'checkpoint' || action === 'defer') && body.action !== 'close') {
    if (!option('input')) throw new Error('INPUT_REQUIRED')
    await safeExisting(localPath(option('input')))
    const record = JSON.parse(await readFile(localPath(option('input')), 'utf8'))
    body = action === 'defer' ? { ...body, bandId: record.bandId, reason: record.reason }
      : { ...body, bandId: record.bandId, expectedVersion: record.expectedVersion, result: record.result }
  }
  const serialized = JSON.stringify(body)
  if ([secret, env.SUPABASE_SERVICE_ROLE_KEY, env.YOUTUBE_API_KEY].some(value => value?.length > 8 && serialized.includes(value))) throw new Error('SECRET_IN_PAYLOAD')
  const response = await fetcher(base, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(body.action === 'close' ? 20000 : 120000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` }, body: serialized })
  const data = await response.json()
  if (!response.ok) {
    // Do not echo server text, request URLs/headers, input documents or credentials.
    if (data.error === 'RUN_EXPIRED' || data.error === 'LEASE_LOST') await save({ ...state, finished: true })
    throw new Error(serverCodes.has(data.error) ? data.error : 'RUNNER_REQUEST_FAILED')
  }
  if (action === 'begin') {
    await save({ ...state, receivedAt: wallNow(), finished: ['idle', 'busy'].includes(data.state), response: data })
    if (data.state === 'running' && data.targets?.length) await startWatchdog(path, state.runId, env)
    output(JSON.stringify(data)) // Target snapshots/proofs only; no API metadata or credentials.
  } else if (action === 'finish' || body.action === 'close') {
    if (data.state === 'finished') await save({ runId: state.runId, finished: true })
    output(JSON.stringify({ ...data, stop: body.action === 'close' }))
  } else output(JSON.stringify(action === 'notices' ? data : { ...data, notify: false }))
  return body.action === 'close' ? { ...data, stop: true } : data
  } finally { await lock.close(); await unlink(`${path}.lock`) }
}

async function watchdogMain(args) {
  const path = args.find(x => x.startsWith('--state='))?.slice(8)
  const runId = args.find(x => x.startsWith('--run='))?.slice(6)
  if (!path || !/^[a-f0-9-]{36}$/i.test(runId ?? '') || !resolve(path).startsWith(resolve('.local/artist-review') + '/') || await realpath(path) !== resolve(path)) throw new Error('WATCHDOG_ARGUMENT_INVALID')
  const env = process.env
  if (env.ARTIST_REVIEW_ENDPOINT !== 'https://czjrzylvnewfjnfwjhwf.supabase.co/functions/v1/artist-review-runner' || !env.ARTIST_REVIEW_RUNNER_SECRET) throw new Error('RUNNER_CONFIGURATION_REQUIRED')
  await watchReviewLease({ runId,
    readState: async () => JSON.parse(await readFile(path, 'utf8')),
    close: async id => {
      const response = await fetch(env.ARTIST_REVIEW_ENDPOINT, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ARTIST_REVIEW_RUNNER_SECRET}` },
        body: JSON.stringify({ action: 'close', runId: id }) })
      if (!response.ok) throw new Error('LEASE_CLOSE_FAILED')
      return response.json()
    },
    writeMarker: async value => {
      const marker = `${path}.${runId}.closed.json`, temporary = `${marker}.${randomUUID()}.tmp`
      await writeFile(temporary, JSON.stringify(value) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      await rename(temporary, marker)
    },
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const main = process.argv[2] === 'watch' ? watchdogMain(process.argv.slice(3)) : runReviewCommand(process.argv.slice(2))
  main.catch(error => {
    const code = serverCodes.has(error.message) || ['RUNNER_CONFIGURATION_REQUIRED', 'BEGIN_REQUIRED',
      'SYMLINK_PATH_REJECTED', 'IGNORED_PATH_REQUIRED', 'SECRET_IN_PAYLOAD'].includes(error.message)
      ? error.message : 'RUNNER_REQUEST_FAILED'
    console.error(JSON.stringify({ error: code, notify: false }))
    process.exitCode = 1 // The task persists a defer/checks the outbox; command errors are not user notifications.
  })
}
