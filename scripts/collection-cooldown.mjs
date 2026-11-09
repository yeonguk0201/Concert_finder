import { createHash } from 'node:crypto'
const hour = 3600000
const timestamp = v => typeof v === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v))

export function assertApiCheckpoint(previous) {
  if (!previous || typeof previous !== 'object' || Array.isArray(previous) || previous.cooldownVersion !== 2
    || !timestamp(previous.nextAttemptAt)
    || previous.http400Streak != null && (!Number.isSafeInteger(previous.http400Streak) || previous.http400Streak < 0 || previous.http400Streak > 3)
    || previous.http400Fingerprint != null && !/^[a-f0-9]{64}$/.test(previous.http400Fingerprint)) throw Error('API_COLLECTION_CHECKPOINT_UNCONFIRMED')
}

export function apiCollectionCheckpoint(previous, result, { now = Date.now(), confirmed = false, latestRun = null, receiptUnconfirmed = false } = {}) {
  assertApiCheckpoint(previous)
  const errors = [result.error, ...(result.failures ?? []).map(r => r.error)]
  const httpError = errors.find(e => /^KOPIS HTTP [45]\d\d \[(list \d{8}-\d{8} page=\d+|detail PF\d{6})\]$/.test(e ?? ''))
  let delay = hour, streak = previous.http400Streak ?? 0, fingerprint = previous.http400Fingerprint ?? null
  if (httpError?.startsWith('KOPIS HTTP 400 ')) {
    const current = createHash('sha256').update(httpError).digest('hex')
    // A historic streak without its fingerprint cannot prove a fresh 1h retry.
    streak = !fingerprint && streak > 0 ? 3 : current === fingerprint ? Math.min(3, streak + 1) : 1
    fingerprint = current
    delay = [hour, 6 * hour, 24 * hour][streak - 1]
  } else if (!confirmed && !httpError || httpError && !httpError.startsWith('KOPIS HTTP 429 ')
    && /^KOPIS HTTP 4/.test(httpError)) delay = 24 * hour
  else if (!httpError && !result.error && !(result.failures?.length)) { streak = 0; fingerprint = null }
  if (receiptUnconfirmed) delay = Math.max(delay, 24 * hour)
  return { ...previous, cooldownVersion: 2, checkedAt: new Date(now).toISOString(), source: 'kopis',
    failed: !confirmed || Boolean(result.error) || Boolean(result.failures?.length), uploaded: confirmed,
    candidates: result.candidates?.length ?? 0, held: result.holds?.length ?? 0,
    published: confirmed ? latestRun?.published_count ?? 0 : 0, latestRun,
    error: httpError ?? (result.error ? 'API_COLLECTION_FAILED' : !confirmed ? 'COLLECTION_RESULT_UNCONFIRMED' : null),
    http400Streak: streak, http400Fingerprint: fingerprint,
    nextAttemptAt: new Date(Math.max(now + delay, Date.parse(previous.nextAttemptAt))).toISOString() }
}
