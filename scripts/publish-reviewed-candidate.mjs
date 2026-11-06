// The existing scheduled source runner calls this only after a separately
// approved silent release. Reuse its lease and completion RPC; never recollect
// raw pages or register artists in order to publish an already reviewed row.
import { createClient } from '@supabase/supabase-js'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runSource } from './collection-runner.mjs'
import { JSDOM } from 'jsdom'

export function reviewedReleaseRow(row, reference, now = Date.now()) {
  const match = /^([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}):([1-9][0-9]*)$/.exec(reference ?? '')
  const p = row?.payload
  if (!match || row.id !== match[1] || row.revision !== Number(match[2]) || row.status !== 'pending'
    || row.automation_blocked !== false || !/^[a-f0-9]{64}$/.test(row.content_hash ?? '')
    || !/^https:\/\/www[.]kopis[.]or[.]kr\/por\/db\/pblprfr\/pblprfrView[.]do[?]mt20Id=PF[0-9]{6}$/.test(row.source_url ?? '')) throw Error('REVIEWED_RELEASE_REVISION_CHANGED')
  if (!p || p.cancelled !== false || p.initial_import !== true || p.announcement_verified !== true
    || !Array.isArray(p.review_reasons) || p.review_reasons.length || !p.sessions?.length
    || !p.artist_keys?.length || p.artist_keys.length !== p.band_ids?.length
    || !p.ticket?.opens_at || !p.ticket_evidence?.length || !p.sources?.length
    || p.discovered_artists?.some(a => !a.key || !a.band_id)) throw Error('REVIEWED_RELEASE_FACTS_INCOMPLETE')
  for (const s of p.sources) {
    const checked = Date.parse(s.verified_at)
    if (!Number.isFinite(checked) || checked > now || now - checked > 90 * 86400000) throw Error('REVIEWED_RELEASE_OBSERVATION_STALE')
  }
  return { source_url: row.source_url, content_hash: row.content_hash, payload: structuredClone(p),
    reviewed_revision: row.revision, reviewed_content_hash: row.content_hash }
}

export function assertCurrentKopis(row, xml, guidance) {
  if (!guidance || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('REVIEWED_RELEASE_SOURCE_CHANGED')
  const d = new JSDOM(xml, { contentType: 'text/xml' }).window.document
  if (d.querySelectorAll('db').length !== 1) throw Error('REVIEWED_RELEASE_SOURCE_CHANGED')
  const field = name => d.querySelector(name)?.textContent.trim()
  const p = row.payload
  const names = p.discovered_artists.map(a => a.name).sort()
  const actualNames = [...new Set((field('prfcast') ?? '').split(/[,，\n]/).map(n => n.trim()).filter(Boolean))].sort()
  if (field('mt20id') !== new URL(row.source_url).searchParams.get('mt20Id') || field('genrenm') !== '대중음악'
    || !['공연예정', '공연중'].includes(field('prfstate')) || field('prfnm') !== p.title || field('fcltynm') !== p.venue
    || field('area') !== p.city || field('prfpdfrom')?.replaceAll('.', '-') !== p.starts_on
    || field('prfpdto')?.replaceAll('.', '-') !== p.ends_on || field('dtguidance') !== guidance
    || (field('festival') === 'Y' ? 'festival' : 'solo') !== p.format
    || p.ticket.price_description != null && field('pcseguidance') !== p.ticket.price_description
    || JSON.stringify(names) !== JSON.stringify(actualNames)) throw Error('REVIEWED_RELEASE_SOURCE_CHANGED')
}

export async function runReviewedPublication({ client, env = process.env, now = Date.now(), fetcher = fetch }) {
  const unwrap = r => { if (r.error) throw Error('REVIEWED_RELEASE_API_FAILED'); return r.data }
  const policy = async () => {
    const p = unwrap(await client.from('collection_policies').select('*').eq('source', 'kopis').single())
    if (!p.collection_enabled || p.publication_enabled !== true || p.live_after !== null
      || p.adapter_version !== 'catalog-v1') throw Error('REVIEWED_RELEASE_POLICY_UNCONFIRMED')
    return p
  }
  await policy()
  const capabilities = unwrap(await client.rpc('service_publication_capabilities', {}))
  if (capabilities.contract !== 'publication-facts-v3' || capabilities.reviewed_release !== true
    || !/^[a-f0-9]{32}$/.test(env.KOPIS_PUBLICATION_EXECUTOR_MD5 ?? '')
    || capabilities.executor_md5 !== env.KOPIS_PUBLICATION_EXECUTOR_MD5) throw Error('REVIEWED_RELEASE_EXECUTOR_CHANGED')
  const reference = env.KOPIS_REVIEWED_CANDIDATE
  if (!/^[a-f0-9-]{36}:[1-9][0-9]*$/.test(reference ?? '') || !env.KOPIS_REVIEWED_GUIDANCE
    || !env.KOPIS_SERVICE_KEY) throw Error('REVIEWED_RELEASE_TARGET_REQUIRED')
  return runSource({ client, source: 'kopis', collect: async () => {
    try {
    // Recheck after acquiring the original source lease. The server locks and
    // compares the exact stored revision/hash/payload again before ingestion.
    await policy()
    const row = unwrap(await client.from('collection_candidates').select('*').eq('id', reference.split(':')[0]).single())
    const candidate = reviewedReleaseRow(row, reference, now)
    const id = new URL(row.source_url).searchParams.get('mt20Id')
    const url = new URL(`https://kopis.or.kr/openApi/restful/pblprfr/${id}`)
    url.searchParams.set('service', env.KOPIS_SERVICE_KEY)
    const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw Object.assign(Error('REVIEWED_RELEASE_SOURCE_UNAVAILABLE'), { retryable: false })
    assertCurrentKopis(row, await response.text(), env.KOPIS_REVIEWED_GUIDANCE)
    return { candidates: [candidate], failures: [], excluded: [], source_verified_at: new Date().toISOString() }
    } catch (error) { throw Object.assign(error, { retryable: false }) }
  }, upload: async (batch, token, attempts) => unwrap(await client.rpc('service_complete_collection', {
    run_token: token, batch, identities: [], attempt_count: attempts, adapter_version: 'catalog-v1',
  })) })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.env.SUPABASE_URL !== 'https://czjrzylvnewfjnfwjhwf.supabase.co') throw Error('PROJECT_MISMATCH')
    const output = process.argv.find(a => a.startsWith('--output='))?.slice(9)
    if (!output) throw Error('REVIEWED_RELEASE_OUTPUT_REQUIRED')
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } })
    const result = await runReviewedPublication({ client })
    await writeFile(output, JSON.stringify({ checked_at: new Date().toISOString(), complete: true,
      results: [{ source: 'kopis', ...result, uploaded: !result.skipped }] }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
  } catch { console.error('REVIEWED_RELEASE_FAILED'); process.exitCode = 1 }
}
