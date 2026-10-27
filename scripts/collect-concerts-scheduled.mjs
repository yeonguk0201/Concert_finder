import { mkdir, readFile, writeFile, open } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const project = 'https://czjrzylvnewfjnfwjhwf.supabase.co'
const hour = 3600000

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
  fetcher = fetch, now = Date.now() } = {}) {
  if (env.SUPABASE_URL !== project || !env.SUPABASE_SERVICE_ROLE_KEY || !env.KOPIS_SERVICE_KEY) throw new Error('COLLECTION_CONFIGURATION_REQUIRED')
  const directory = join(root, '.local/concert-collection')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  let previous = {}
  try { previous = JSON.parse(await readFile(join(directory, 'latest.json'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw new Error('COLLECTION_CHECKPOINT_UNREADABLE') }
  const query = async path => {
    let response
    try { response = await fetcher(`${project}/rest/v1/${path}`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }, redirect: 'error', signal: AbortSignal.timeout(20000) }) }
    catch { throw new Error('COLLECTION_PREFLIGHT_UNAVAILABLE') }
    if (!response.ok) throw new Error(`COLLECTION_PREFLIGHT_HTTP_${response.status}`)
    return response.json()
  }
  const policies = await query('collection_policies?source=eq.kopis&select=source,collection_enabled,publication_enabled,live_after')
  const runs = await query('collection_runs?source=eq.kopis&state=neq.legacy&select=id,state,started_at,created_at,finished_at,candidate_count,published_count,review_count,attempts&order=created_at.desc&limit=1')
  if (!Array.isArray(policies) || policies.length !== 1 || !Array.isArray(runs)) throw new Error('COLLECTION_PREFLIGHT_INVALID')
  const decision = collectionDecision({ policy: policies[0], latest: runs[0], now, nextAttemptAt: previous.nextAttemptAt })
  if (decision !== 'collect') return { source: 'kopis', skipped: decision, latestRun: runs[0]?.id ?? null }
  // Publication activation is a separate release decision, never part of collection.
  if (policies[0].publication_enabled || policies[0].live_after !== null) throw new Error('COLLECTION_PUBLICATION_POLICY_CHANGED')
  const noticeFile = join(directory, 'no-notices.json'), outputFile = join(directory, `report-${randomUUID()}.json`)
  await writeFile(noticeFile, '[]\n', { encoding: 'utf8', mode: 0o600 })
  const log = await open(join(directory, 'execution.log'), 'w', 0o600)
  let code
  try {
    code = await new Promise((done, reject) => {
      const child = spawn(process.execPath, ['--use-env-proxy', join(root, 'scripts/collect-catalog.mjs'), '--source=kopis',
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
