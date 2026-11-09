import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { runSource } from './collection-runner.mjs'
import { collectKopis } from './kopis.mjs'
import { parseKopisApiFacts } from './kopis-api-facts.mjs'
import { factRegressionReasons } from './collection-fact-guards.mjs'

const project = 'https://czjrzylvnewfjnfwjhwf.supabase.co'
const hash = /^[a-f0-9]{32}$/
const unwrap = r => { if (r.error) throw Object.assign(Error('API_PUBLICATION_READ_FAILED'), { retryable: false }); return r.data }

export function apiFirstCollectionCompatible(policy, capabilities, executorMd5, factsMd5) {
  return policy?.source === 'kopis' && policy.collection_enabled === true && policy.publication_enabled === true
    && policy.live_after === null && policy.adapter_version === 'catalog-v1'
    && capabilities?.contract === 'publication-facts-v4' && capabilities.api_facts_contract === 'kopis-api-facts-v1'
    && hash.test(executorMd5 ?? '') && hash.test(factsMd5 ?? '')
    && capabilities.executor_md5 === executorMd5 && capabilities.api_facts_md5 === factsMd5
}

function assertSourceUse(config, now) {
  let url
  try { url = new URL(config?.basis_url) } catch { /* Fail closed below. */ }
  if (!config || config.source !== 'kopis' || config.facts_only !== true
    || Object.keys(config).sort().join(',') !== 'basis_url,facts_only,source,verified_at'
    || url?.protocol !== 'https:' || !['kopis.or.kr', 'www.kopis.or.kr'].includes(url.hostname)
    || url.username || url.password || url.port || !Number.isFinite(Date.parse(config.verified_at))
    || Date.parse(config.verified_at) > now) throw Object.assign(Error('API_SOURCE_USE_REQUIRED'), { retryable: false })
}

// One ordinary Node invocation, one existing source lease. There are no AI
// calls, external notices, artist writers, or per-performance review files.
export async function runApiFirstPublication({ client, env = process.env, fetcher = fetch,
  sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => new Date().toISOString(), collectionOptions = {} }) {
  if (env.SUPABASE_URL !== project || !env.KOPIS_SERVICE_KEY || env.KOPIS_API_FIRST_PUBLICATION !== '1') {
    throw Error('API_COLLECTION_CONFIGURATION_REQUIRED')
  }
  const preflight = async () => {
    const policy = unwrap(await client.from('collection_policies').select('*').eq('source', 'kopis').single())
    const capabilities = unwrap(await client.rpc('service_publication_capabilities', {}))
    if (!apiFirstCollectionCompatible(policy, capabilities, env.KOPIS_PUBLICATION_EXECUTOR_MD5, env.KOPIS_API_FACTS_MD5)) {
      throw Object.assign(Error('API_PUBLICATION_CONTRACT_CHANGED'), { retryable: false })
    }
    const context = unwrap(await client.rpc('service_kopis_api_context', {}))
    if (!Array.isArray(context?.catalog) || !Array.isArray(context?.approvals)) throw Object.assign(Error('API_ARTIST_CONTEXT_REQUIRED'), { retryable: false })
    assertSourceUse(context.source_use, Date.parse(now()))
    return context
  }
  await preflight()
  return runSource({ client, source: 'kopis', now, sleep, collect: async () => {
    const context = await preflight()
    const batch = await collectKopis({ ...collectionOptions, serviceKey: env.KOPIS_SERVICE_KEY, fetcher, sleep,
      parseDetail: (xml, id, observedAt) => parseKopisApiFacts(xml, id,
        { ...context, sourceUse: context.source_use, observedAt, now: Date.parse(now()) }) })
    const existing = new Map(), urls = batch.candidates.map(r => r.source_url)
    for (let offset = 0; offset < urls.length; offset += 20) {
      const chunk = urls.slice(offset, offset + 20)
      const rows = unwrap(await client.from('collection_candidates').select('*').in('source_url', chunk))
      if (!Array.isArray(rows)) throw Object.assign(Error('API_CANDIDATE_CONTEXT_REQUIRED'), { retryable: false })
      for (const row of rows) {
        if (!chunk.includes(row.source_url) || existing.has(row.source_url) || !Number.isSafeInteger(row.revision)
          || row.revision < 1 || !/^[a-f0-9]{64}$/.test(row.content_hash ?? '') || !row.payload) {
          throw Object.assign(Error('API_CANDIDATE_CONTEXT_REQUIRED'), { retryable: false })
        }
        existing.set(row.source_url, row)
      }
    }
    const ready = [], holds = []
    for (const row of batch.candidates) {
      const previous = existing.get(row.source_url), reasons = [...row.payload.review_reasons]
      if (previous) {
        if (previous.automation_blocked !== false || previous.status !== 'pending') reasons.push('ADMIN_OVERRIDE')
        reasons.push(...factRegressionReasons(previous.payload, row.payload))
        if ((previous.payload.artist_keys ?? []).some(k => !row.payload.artist_keys.includes(k))
          || (previous.payload.band_ids ?? []).some(id => !row.payload.band_ids.includes(id))) reasons.push('ARTIST_LINK_REMOVAL_REQUIRES_REVIEW')
      }
      if (reasons.length) { holds.push({ source_url: row.source_url, reasons: [...new Set(reasons)] }); continue }
      const { api_first_preview: _preview, proposed_contract_ready: _ready, ...release } = row
      if (previous) Object.assign(release, { api_expected_revision: previous.revision, api_expected_hash: previous.content_hash })
      ready.push(release)
    }
    return { ...batch, candidates: ready, holds, publication_contract: 'kopis-api-facts-v1',
      expected_executor_md5: env.KOPIS_PUBLICATION_EXECUTOR_MD5, expected_api_facts_md5: env.KOPIS_API_FACTS_MD5 }
  }, upload: async (batch, token, attempts) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await client.rpc('service_complete_collection', { run_token: token, batch, identities: [],
          attempt_count: attempts, adapter_version: 'catalog-v1' })
        if (!response.error) return response.data
        // Retry only transport/transient failures, with the same batch and run.
        if (!['PGRST000', 'PGRST001', 'PGRST002', '08006', '40001', '40P01'].includes(response.error.code)) throw Error('API_COMPLETION_FAILED')
      } catch (error) {
        if (error.message === 'API_COMPLETION_FAILED' || attempt === 3) throw Error('API_COMPLETION_FAILED')
      }
      if (attempt < 3) await sleep(attempt * 1000)
    }
    throw Error('API_COMPLETION_FAILED')
  } })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // The scheduler owns recent-run/cooldown/checkpoint guards. Direct standalone
  // execution would skip them, so expose this module only through that runner.
  const output = process.argv.find(a => a.startsWith('--output='))?.slice(9)
  if (output) await writeFile(output, JSON.stringify({ complete: false, error: 'USE_EXISTING_SCHEDULED_RUNNER' }) + '\n', 'utf8')
  console.error('USE_EXISTING_SCHEDULED_RUNNER'); process.exitCode = 1
}

export const apiFirstClient = (env, fetcher) => createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, options = {}) => fetcher(input,
    { ...options, redirect: 'error', signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) }) } })
