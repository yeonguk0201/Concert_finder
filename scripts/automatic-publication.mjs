// The scheduled reviewer supplies only observed normalized facts for its fixed
// batch. Collection and publication share the existing source lease/completion.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { reviewedReleaseRow, assertCurrentKopis } from './publish-reviewed-candidate.mjs'
import { factRegressionReasons } from './collection-fact-guards.mjs'

export function automaticReviewPlan(plan, now = Date.now()) {
  const fresh = value => Number.isFinite(Date.parse(value)) && Date.parse(value) <= now && now - Date.parse(value) <= 3600000
  if (plan?.version !== 1 || plan.source !== 'kopis' || !fresh(plan.checked_at)
    || !Array.isArray(plan.candidates) || plan.candidates.length > 14
    || new Set(plan.candidates.map(r => r.id)).size !== plan.candidates.length) throw Error('AUTOMATIC_REVIEW_PLAN_INVALID')
  for (const r of plan.candidates) if (!/^[a-f0-9-]{36}$/.test(r.id ?? '') || !Number.isSafeInteger(r.revision) || r.revision < 1
    || !/^[a-f0-9]{64}$/.test(r.content_hash ?? '') || !r.payload || !r.kopis_guidance || !fresh(r.checked_at)
    || r.source_use?.verified !== true || !/^https:\/\/[^/@\s]+(?:[/?#]|$)/.test(r.source_use?.basis_url ?? '')) {
    throw Error('AUTOMATIC_REVIEW_PLAN_INVALID')
  }
  return plan
}

export async function readAutomaticPlan(path) {
  if (!path) throw Error('AUTOMATIC_REVIEW_PLAN_REQUIRED')
  return automaticReviewPlan(JSON.parse(await readFile(path, 'utf8')))
}

export async function prepareAutomaticPublication({ client, plan, env = process.env, now = Date.now(), fetcher = fetch }) {
  automaticReviewPlan(plan, now)
  const unwrap = r => { if (r.error) throw Error('AUTOMATIC_REVIEW_API_FAILED'); return r.data }
  const rows = [], holds = []
  for (const review of plan.candidates) {
    const stored = unwrap(await client.from('collection_candidates').select('*').eq('id', review.id).single())
    if (!stored) { holds.push({ candidate_id: review.id, error: 'AUTOMATIC_REVIEW_STALE' }); continue }
    const published = unwrap(await client.from('concert_sources').select('concert_id').eq('url', stored.source_url))
    // Source linkage is authoritative even while candidate.status is pending.
    if (published.length) { holds.push({ source_url: stored.source_url, error: 'ALREADY_PUBLISHED' }); continue }
    try {
      if (stored.revision !== review.revision || stored.content_hash !== review.content_hash) throw Error('AUTOMATIC_REVIEW_STALE')
      reviewedReleaseRow(stored, `${review.id}:${review.revision}`, now)
    } catch {
      // Existing unreviewed facts can be enriched, but manual state/revision
      // cannot be bypassed. Validate the proposed complete row below.
      if (stored.revision !== review.revision || stored.content_hash !== review.content_hash || stored.status !== 'pending'
        || stored.automation_blocked !== false) { holds.push({ source_url: stored.source_url, error: 'AUTOMATIC_REVIEW_STALE' }); continue }
    }
    try {
      if (factRegressionReasons(stored.payload, review.payload).length) throw Error('AUTOMATIC_REVIEW_FACT_REGRESSION')
      const checked = reviewedReleaseRow({ ...stored, payload: review.payload }, `${review.id}:${review.revision}`, now)
      const id = new URL(stored.source_url).searchParams.get('mt20Id')
      const url = new URL(`https://kopis.or.kr/openApi/restful/pblprfr/${id}`)
      url.searchParams.set('service', env.KOPIS_SERVICE_KEY)
      const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw Object.assign(Error(`KOPIS HTTP ${response.status} [detail ${id}]`), { retryable: false })
      assertCurrentKopis({ payload: checked.payload, source_url: stored.source_url }, await response.text(), review.kopis_guidance)
      rows.push({ ...checked, reviewed_content_hash: stored.content_hash, automatic_enrichment: true,
        content_hash: createHash('sha256').update(JSON.stringify(checked.payload)).digest('hex') })
    } catch (error) {
      // Provider errors retain their fixed context for the original cooldown.
      if (/^KOPIS HTTP/.test(error.message)) throw error
      holds.push({ source_url: stored.source_url, error: 'AUTOMATIC_REVIEW_UNVERIFIED' })
    }
  }
  return { rows, holds }
}

export function combineAutomaticBatch(batch, prepared) {
  const replacing = new Set(prepared.rows.map(r => r.source_url))
  batch.candidates = [...batch.candidates.filter(r => !replacing.has(r.source_url)), ...prepared.rows]
  batch.automatic_review_holds = prepared.holds
  return batch
}
