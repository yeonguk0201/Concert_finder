import { mkdir, readFile, writeFile, open, rename } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { apiFirstCollectionCompatible, apiFirstClient, runApiFirstPublication } from './api-first-publication.mjs'
import { assertApiCheckpoint, apiCollectionCheckpoint } from './collection-cooldown.mjs'

const project = 'https://czjrzylvnewfjnfwjhwf.supabase.co'
const hour = 3600000

// Release opt-in is separate from policy ON. The operator pins the deployed
// executor after review; missing/mismatched contracts keep the old ON guard.
export function publicationCollectionCompatible(policy, capabilities, expectedMd5) {
  return policy?.source === 'kopis' && policy.collection_enabled === true
    && policy.publication_enabled === true && policy.live_after === null
    && /^[a-f0-9]{32}$/.test(expectedMd5 ?? '')
    && capabilities?.contract === 'publication-facts-v3'
    && capabilities.reviewed_release === true
    && capabilities.executor_md5 === expectedMd5
}

export function collectionDecision({ policy, latest, now, nextAttemptAt }) {
  if (!policy?.collection_enabled) return 'policy_off'
  if (nextAttemptAt && Date.parse(nextAttemptAt) > now) return 'cooldown'
  if (latest) {
    const started = Date.parse(latest.started_at ?? latest.created_at)
    if (!Number.isFinite(started) || started > now) return 'clock_or_state_unconfirmed'
    if (now - started < hour) return 'recent_attempt'
  }
  return 'collect'
}

export async function runScheduledCollection({ root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), env = process.env,
  fetcher = fetch, now = Date.now(), apiExecutor = runApiFirstPublication } = {}) {
  if (env.SUPABASE_URL !== project || !env.SUPABASE_SERVICE_ROLE_KEY || !env.KOPIS_SERVICE_KEY) throw new Error('COLLECTION_CONFIGURATION_REQUIRED')
  const directory = join(root, '.local/concert-collection')
  const apiFirst = env.KOPIS_API_FIRST_PUBLICATION === '1'
  // This checkout may be a new environment without the original checkpoint.
  // API-first activation must never silently initialize a replacement state.
  if (!apiFirst) await mkdir(directory, { recursive: true, mode: 0o700 })
  let previous = {}, previousText
  try { previousText = await readFile(join(directory, 'latest.json'), 'utf8'); previous = JSON.parse(previousText) }
  catch (error) { if (apiFirst || error.code !== 'ENOENT') throw new Error('COLLECTION_CHECKPOINT_UNREADABLE') }
  if (apiFirst) assertApiCheckpoint(previous)
  const query = async (path, body) => {
    let response
    try { response = await fetcher(`${project}/rest/v1/${path}`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(20000) }) }
    catch { throw new Error('COLLECTION_PREFLIGHT_UNAVAILABLE') }
    if (!response.ok) throw new Error(`COLLECTION_PREFLIGHT_HTTP_${response.status}`)
    return response.json()
  }
  const policies = await query(`collection_policies?source=eq.kopis&select=source,collection_enabled,publication_enabled,live_after${apiFirst ? ',adapter_version' : ''}`)
  const runs = await query('collection_runs?source=eq.kopis&state=neq.legacy&select=id,state,started_at,created_at,finished_at,candidate_count,published_count,review_count,attempts&order=created_at.desc&limit=1')
  if (!Array.isArray(policies) || policies.length !== 1 || !Array.isArray(runs)) throw new Error('COLLECTION_PREFLIGHT_INVALID')
  const decision = collectionDecision({ policy: policies[0], latest: runs[0], now, nextAttemptAt: previous.nextAttemptAt })
  if (decision !== 'collect') return { source: 'kopis', skipped: decision, latestRun: runs[0]?.id ?? null }
  if (apiFirst) {
    const capabilities = await query('rpc/service_publication_capabilities', {})
    if (!apiFirstCollectionCompatible(policies[0], capabilities, env.KOPIS_PUBLICATION_EXECUTOR_MD5, env.KOPIS_API_FACTS_MD5)) {
      throw Error('API_PUBLICATION_CONTRACT_CHANGED')
    }
    let result
    try { result = await apiExecutor({ client: apiFirstClient(env, fetcher), env, fetcher }) }
    catch (error) {
      // Only the fixed provider error shape is retained, never SDK/provider URLs.
      result = { error: /^KOPIS HTTP [45]\d\d \[(list \d{8}-\d{8} page=\d+|detail PF\d{6})\]$/.test(error.message)
        ? error.message : 'API_COLLECTION_FAILED', run_id: error.run_id ?? null }
    }
    if (result.skipped) return { source: 'kopis', skipped: result.skipped }
    const runId = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(result.run_id ?? '') ? result.run_id : null
    let current = []
    try { current = runId ? await query(`collection_runs?source=eq.kopis&id=eq.${runId}&select=id,state,finished_at,candidate_count,published_count,review_count,attempts`) : [] }
    catch { result.error = 'COLLECTION_RESULT_UNCONFIRMED' }
    const confirmed = !result.error && current.length === 1 && Boolean(current[0].finished_at)
      && ['success', 'partial'].includes(current[0].state) && current[0].candidate_count === result.candidates?.length
      && current[0].published_count === result.publication?.published && current[0].review_count === result.publication?.review
    const receiptRecorded = current.length === 1 && Boolean(current[0].finished_at)
      && ['success', 'partial', 'failed', 'expired'].includes(current[0].state)
    const status = apiCollectionCheckpoint(previous, result, { confirmed, latestRun: current[0] ?? null,
      receiptUnconfirmed: !receiptRecorded, now: Date.now() })
    if (await readFile(join(directory, 'latest.json'), 'utf8') !== previousText) throw Error('COLLECTION_CHECKPOINT_CHANGED')
    const temporary = join(directory, `latest-${randomUUID()}.tmp`)
    await writeFile(temporary, JSON.stringify(status, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, join(directory, 'latest.json'))
    return status
  }
  // Publication activation is a separate release decision, never part of collection.
  if (policies[0].publication_enabled || policies[0].live_after !== null) {
    // Only silent backfill is supported here. live_after remains a separate
    // release; this runner cannot authorize live notifications.
    if (policies[0].live_after !== null || !/^[a-f0-9]{32}$/.test(env.KOPIS_PUBLICATION_EXECUTOR_MD5 ?? '')) {
      throw new Error('COLLECTION_PUBLICATION_POLICY_CHANGED')
    }
    const capabilities = await query('rpc/service_publication_capabilities', {})
    if (!publicationCollectionCompatible(policies[0], capabilities, env.KOPIS_PUBLICATION_EXECUTOR_MD5)) {
      throw new Error('COLLECTION_PUBLICATION_CONTRACT_UNCONFIRMED')
    }
    if (env.KOPIS_AUTOMATIC_PUBLICATION === '1') {
      if (capabilities.continuous_review !== true || !env.KOPIS_AUTOMATIC_REVIEW_FILE) throw new Error('COLLECTION_AUTOMATIC_REVIEW_REQUIRED')
    } else if (!/^[a-f0-9-]{36}:[1-9][0-9]*$/.test(env.KOPIS_REVIEWED_CANDIDATE ?? '') || !env.KOPIS_REVIEWED_GUIDANCE) {
      throw new Error('COLLECTION_REVIEWED_TARGET_REQUIRED')
    }
  }
  const noticeFile = join(directory, 'no-notices.json'), outputFile = join(directory, `report-${randomUUID()}.json`)
  await writeFile(noticeFile, '[]\n', { encoding: 'utf8', mode: 0o600 })
  const log = await open(join(directory, 'execution.log'), 'w', 0o600)
  let code
  try {
    code = await new Promise((done, reject) => {
      const entry = policies[0].publication_enabled && env.KOPIS_AUTOMATIC_PUBLICATION !== '1' ? 'publish-reviewed-candidate.mjs' : 'collect-catalog.mjs'
      const child = spawn(process.execPath, ['--use-env-proxy', join(root, 'scripts', entry), '--source=kopis',
        '--concerts-only', '--upload', `--notice-file=${noticeFile}`, `--output=${outputFile}`],
      { cwd: directory, env, stdio: ['ignore', log.fd, log.fd] })
      child.once('error', () => reject(new Error('COLLECTION_PROCESS_START_FAILED')))
      child.once('exit', done)
    })
  } finally { await log.close() }
  let report
  try { report = JSON.parse(await readFile(outputFile, 'utf8')) } catch { throw new Error('COLLECTION_RESULT_UNCONFIRMED') }
  const result = report.results?.find(row => row.source === 'kopis')
  // Only this adapter's fixed, secret-free HTTP error shape is retained in status.
  const httpError = /^KOPIS HTTP (\d{3}) \[(list \d{8}-\d{8} page=\d+|detail PF\d{6})\]$/.exec(result?.error ?? '')
  let failed = code !== 0 || !report.complete || !result || Boolean(result.error) || Boolean(result.failures?.length)
  const permanent = httpError && Number(httpError[1]) >= 400 && Number(httpError[1]) < 500 && httpError[1] !== '429'
  const runId = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(result?.run_id ?? '') ? result.run_id : null
  const current = runId ? await query(`collection_runs?source=eq.kopis&id=eq.${runId}&select=id,state,started_at,created_at,finished_at,candidate_count,published_count,review_count,attempts`) : []
  const confirmed = result?.uploaded === true && current.length === 1 && current[0].finished_at
    && ['success', 'partial'].includes(current[0].state) && current[0].candidate_count === result.candidates.length
  if (result?.uploaded === true && !confirmed) failed = true
  const status = { checkedAt: new Date().toISOString(), source: 'kopis', failed, uploaded: result?.uploaded === true,
    skipped: result?.skipped ?? null, candidates: result?.candidates?.length ?? 0, failureCount: result?.failures?.length ?? 0,
    error: httpError ? `KOPIS HTTP ${httpError[1]} [${httpError[2]}]` : result?.error ? 'COLLECTION_FAILED'
      : result?.uploaded === true && !confirmed ? 'COLLECTION_RESULT_UNCONFIRMED' : null,
    latestRun: current[0] ?? null, nextAttemptAt: new Date(Date.now() + (permanent ? 24 * hour : hour)).toISOString() }
  await writeFile(join(directory, 'latest.json'), JSON.stringify(status, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
  return status
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await runScheduledCollection())) }
  catch (error) { console.error(/^[A-Z0-9_]+$/.test(error.message) ? error.message : 'COLLECTION_RUNNER_FAILED'); process.exitCode = 1 }
}
