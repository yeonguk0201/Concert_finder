import { readFile, writeFile, mkdir, rename, open, unlink, realpath } from 'node:fs/promises'
import { dirname, resolve, relative, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'
import { PROJECT, newQueue, validateQueue, beginBatch, recordStage, finishBatch,
  offerHandoff, acceptHandoff } from './lib/artist-review-queue.mjs'
import { applyQueuedCuration, registerServiceBatch, SERVICE_AUTHORITY } from './lib/artist-review-apply.mjs'

export async function loadReviewEnvironment(env = process.env, root = process.cwd(), { requireProject = true } = {}) {
  // Load just these server keys. Do not load arbitrary configuration or replace an injected proxy binding.
  for (const name of ['.env.push.local', 'env.push.local']) {
    let raw
    try { raw = await readFile(resolve(root, name), 'utf8') } catch (error) { if (error.code === 'ENOENT') continue; throw error }
    const parsed = parseEnv(raw)
    for (const key of ['YOUTUBE_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
      if (env[key] === undefined && parsed[key] !== undefined) env[key] = parsed[key]
    }
    break
  }
  if (requireProject && env.SUPABASE_URL !== `https://${PROJECT}.supabase.co`) throw new Error('PROJECT_CONFIGURATION_REQUIRED')
  return env
}

export async function readReviewCatalog({ env = process.env, fetcher = fetch } = {}) {
  if (env.SUPABASE_URL !== `https://${PROJECT}.supabase.co` || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('PROJECT_CONFIGURATION_REQUIRED')
  const all = [], seen = new Set()
  for (let offset = 0; offset < 100000; offset += 500) {
    const query = new URLSearchParams({ select: 'id,name,aliases,country_code,musicbrainz_id,category,curation_status,updated_at',
      order: 'id.asc', limit: '500', offset: String(offset) })
    let response
    try { response = await fetcher(`${env.SUPABASE_URL}/rest/v1/bands?${query}`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      redirect: 'error', signal: AbortSignal.timeout(20000),
    }) } catch { throw new Error('CATALOG_READ_FAILED') }
    if (!response.ok) throw new Error('CATALOG_READ_FAILED')
    const rows = await response.json()
    if (!Array.isArray(rows) || rows.some(row => !row.id || seen.has(row.id))) throw new Error('CATALOG_READ_FAILED')
    rows.forEach(row => seen.add(row.id)); all.push(...rows)
    if (rows.length < 500) return all
  }
  throw new Error('CATALOG_PAGINATION_LIMIT')
}

export async function checkLegacyReviewIdle(env, fetcher = fetch) {
  if (env.SUPABASE_URL !== `https://${PROJECT}.supabase.co` || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('PROJECT_CONFIGURATION_REQUIRED')
  let response
  try { response = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/service_artist_review_readiness`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }, body: '{}', redirect: 'error', signal: AbortSignal.timeout(20000),
  }) } catch { throw new Error('REVIEW_LOCK_CHECK_FAILED') }
  if (!response.ok) throw new Error('REVIEW_LOCK_CHECK_FAILED')
  const result = await response.json()
  if (!['idle', 'ready', 'busy'].includes(result?.state)) throw new Error('REVIEW_LOCK_CHECK_FAILED')
  if (result.state === 'busy' || result.reason === 'lease_recovery') throw new Error('LEGACY_REVIEW_NOT_FINISHED')
}

export async function integratedServiceAvailable(client) {
  // Read-only probe: a missing deployment must preserve the existing queue/auth path.
  const zero = '00000000-0000-0000-0000-000000000000'
  const { error } = await client.rpc('service_integrated_review_receipt', { run_id: zero, band_id: zero })
  if (!error) return true
  if (['PGRST202', '42883'].includes(error.code)) return false
  throw new Error('SERVICE_READINESS_FAILED')
}

function noSecrets(value, env) {
  const body = JSON.stringify(value)
  if (Object.entries(env).some(([key, secret]) => /SECRET|TOKEN|API_KEY|SERVICE_ROLE_KEY/.test(key)
    && typeof secret === 'string' && secret.length > 8 && body.includes(secret))) throw new Error('SECRET_IN_ARTIFACT')
  // Tokens/caches are not valid queue fields even when they do not match this machine's current secrets.
  const walk = item => {
    if (!item || typeof item !== 'object') return
    for (const [key, child] of Object.entries(item)) {
      if (/^(authorization|access_token|refresh_token|apikey|api_key|secret|token|cache|thumbnails|html)$/i.test(key)) throw new Error('SECRET_OR_CACHE_FIELD')
      walk(child)
    }
  }
  walk(value)
}

export async function runQueueCommand(args, { cwd = process.cwd(), env = process.env, output = console.log,
  now = Date.now(), fetcher = fetch, serverGuard = checkLegacyReviewIdle } = {}) {
  const [command, ...options] = args
  if (!['init', 'begin', 'context', 'checkpoint', 'apply', 'finish', 'status', 'handoff', 'accept', 'snapshot'].includes(command)
    || options.some(arg => !/^--(owner|input|state|output|to|direction|authority-key)=.+$/.test(arg) && arg !== '--defer-pending')
    || new Set(options.map(arg => arg.split('=')[0])).size !== options.length) throw new Error('ARGUMENT_INVALID')
  const opt = (key, fallback) => options.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback
  const lane = opt('owner')
  if (!['local', 'cloud'].includes(lane)) throw new Error('OWNER_REQUIRED')
  // Redaction also covers checkpoint/handoff commands launched in a fresh local process.
  await loadReviewEnvironment(env, cwd, { requireProject: false })
  const serviceClient = async () => {
    await loadReviewEnvironment(env, cwd)
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher },
    })
    return await integratedServiceAvailable(client) ? client : null
  }
  const root = resolve(cwd, '.local/artist-review-queue')
  const local = name => {
    const file = resolve(cwd, name), rel = relative(root, file)
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('IGNORED_PATH_REQUIRED')
    return file
  }
  await mkdir(root, { recursive: true })
  if (await realpath(root) !== root) throw new Error('SYMLINK_PATH_REJECTED')
  const statePath = local(opt('state', '.local/artist-review-queue/state.json'))
  // Only direct files in the guarded directory: no symlinked child directories.
  const checked = file => { if (dirname(file) !== root) throw new Error('IGNORED_PATH_REQUIRED'); return file }
  checked(statePath)
  const read = async file => {
    checked(file)
    if (await realpath(file) !== file) throw new Error('SYMLINK_PATH_REJECTED')
    const raw = await readFile(file, 'utf8')
    if (Buffer.byteLength(raw, 'utf8') > 20000000) throw new Error('INPUT_TOO_LARGE')
    const data = JSON.parse(raw); noSecrets(data, env); return data
  }
  const save = async (file, value) => {
    checked(file); noSecrets(value, env)
    const tmp = `${file}.${randomUUID()}.tmp`
    await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await rename(tmp, file)
  }
  let lock
  try { lock = await open(`${statePath}.lock`, 'wx', 0o600) }
  catch (error) { if (error.code === 'EEXIST') throw new Error('QUEUE_BUSY'); throw error }
  try {
    let queue
    try { queue = validateQueue(await read(statePath)) } catch (error) { if (error.code !== 'ENOENT') throw error }
    const input = () => {
      if (!opt('input')) throw new Error('INPUT_REQUIRED')
      return read(local(opt('input')))
    }
    const out = name => {
      const file = checked(local(opt('output', `.local/artist-review-queue/${name}`)))
      if (file === statePath || file === (opt('input') ? local(opt('input')) : null)) throw new Error('OUTPUT_PATH_CONFLICT')
      return file
    }
    let result
    if (command === 'snapshot') {
      const vars = await loadReviewEnvironment(env, cwd)
      const bands = await readReviewCatalog({ env: vars, fetcher })
      await save(out('catalog.json'), bands); result = { catalog: bands.length, applied: false }
    } else if (command === 'init') {
      if (queue) throw new Error('QUEUE_ALREADY_EXISTS')
      queue = newQueue(lane, now); await save(statePath, queue); result = { owner: lane, queueId: queue.queueId }
    } else if (command === 'accept') {
      queue = acceptHandoff(await input(), { lane, previous: queue })
      await save(statePath, queue); result = { owner: lane, queueId: queue.queueId, revision: queue.revision }
    } else {
      if (!queue) throw new Error('QUEUE_INIT_OR_HANDOFF_REQUIRED')
      if (command === 'status') result = { owner: queue.owner, revision: queue.revision, transfer: queue.transfer,
        activeRun: queue.active?.runId ?? null, selected: queue.active?.artists.length ?? 0, tracked: Object.keys(queue.entries).length }
      if (command === 'begin') {
        const batchPath = out('batch.json')
        await serverGuard(await loadReviewEnvironment(env, cwd), fetcher)
        const bands = queue.active ? [] : await input()
        const service = env.SUPABASE_SERVICE_ROLE_KEY ? await serviceClient() : null
        const authorityKey = opt('authority-key', service ? SERVICE_AUTHORITY : env.ARTIST_REVIEW_ADMIN_ACCESS_TOKEN
          ? createHash('sha256').update(env.ARTIST_REVIEW_ADMIN_ACCESS_TOKEN).digest('hex') : null)
        result = beginBatch(queue, { lane, bands, now, direction: opt('direction', 'forward'), authorityKey })
        // State is authoritative if writing the convenience batch file fails.
        await save(statePath, queue)
        if (service) await registerServiceBatch(service, queue)
        await save(batchPath, result)
        result = { state: result.state, runId: result.runId, selected: result.artists?.length ?? 0, reason: result.reason, resumed: result.resumed ?? false }
      }
      if (command === 'checkpoint') {
        const record = await input()
        if (record.stage === 'approval' && record.status === 'complete') throw new Error('APPLY_COMMAND_REQUIRED')
        result = recordStage(queue, { ...record, lane, now })
        await save(statePath, queue); result = { status: result.status, applied: result.applied }
      }
      if (command === 'context') {
        const { bandId } = await input()
        if (queue.owner !== lane || queue.transfer || !queue.active?.artists.some(row => row.bandId === bandId)) throw new Error('TARGET_NOT_SELECTED')
        const client = await serviceClient()
        if (!client) throw new Error('SERVICE_PATH_NOT_INSTALLED')
        await registerServiceBatch(client, queue)
        const { data, error } = await client.rpc('service_integrated_review_context', { run_id: queue.active.runId, band_id: bandId })
        if (error || !data?.band) throw new Error('REVIEW_CONTEXT_FAILED')
        await save(out('context.json'), data); result = { bandId, identities: data.identities.length }
      }
      if (command === 'apply') {
        const record = await input()
        let adminClient = null, relationReader = null
        const accessToken = env.ARTIST_REVIEW_ADMIN_ACCESS_TOKEN
        if (accessToken) {
          await loadReviewEnvironment(env, cwd)
          if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('PROJECT_CONFIGURATION_REQUIRED')
          const { createClient } = await import('@supabase/supabase-js')
          adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${accessToken}` } },
          })
          relationReader = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        }
        const service = env.SUPABASE_SERVICE_ROLE_KEY ? await serviceClient() : null
        if (service) await registerServiceBatch(service, queue)
        const outcome = await applyQueuedCuration(queue, { ...record, lane, now, adminClient, relationReader, accessToken, serviceClient: service })
        await save(statePath, queue); await save(out('batch.json'), queue.active)
        result = { status: outcome.status, applied: outcome.applied }
      }
      if (command === 'finish') {
        const report = finishBatch(queue, { lane, runId: queue.active?.runId, deferPending: options.includes('--defer-pending'), now })
        // Write report before clearing the persisted active batch: safe to retry after a crash.
        await save(out('latest-report.json'), report); await save(statePath, queue)
        result = { selected: report.selected, apiCalls: report.apiCalls, remaining: report.remaining, authorityWaiting: report.authorityWaiting }
      }
      if (command === 'handoff') {
        const packet = queue.transfer && queue.owner === lane && queue.transfer.to === opt('to')
          ? structuredClone(queue) : offerHandoff(queue, { lane, to: opt('to'), now })
        // Revoke this copy before publishing the transfer. Repeat can recover the pending packet.
        await save(statePath, queue); await save(out('handoff.json'), packet)
        result = { from: lane, to: packet.transfer.to, transferId: packet.transfer.id, revision: packet.revision }
      }
    }
    output(JSON.stringify(result)); return result
  } finally { await lock.close(); await unlink(`${statePath}.lock`) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runQueueCommand(process.argv.slice(2)).catch(error => {
    console.error(JSON.stringify({ error: /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'QUEUE_COMMAND_FAILED' }))
    process.exitCode = 1
  })
}
