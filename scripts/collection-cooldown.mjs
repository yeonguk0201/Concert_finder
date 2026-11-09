const hour = 3600000
const timestamp = v => typeof v === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v))
const safeHttpError = /^KOPIS HTTP (\d{3}) \[(list \d{8}-\d{8} page=\d+|detail PF\d{6})\]$/

function http400Fingerprint(error) {
  const match = safeHttpError.exec(error ?? '')
  // Rolling list dates change daily; they must not reset the same page failure.
  return match?.[1] === '400' ? `HTTP400:${match[2].replace(/^list \d{8}-\d{8}/, 'list')}` : null
}

export function collectionCooldown({ previous = {}, error = null, errors = [], skipped = false, now = Date.now() }) {
  if (!Array.isArray(errors)) throw Error('COLLECTION_CHECKPOINT_UNREADABLE')
  const priorContexts = { ...(previous.http400Contexts ?? {}) }
  if (previous.http400Contexts != null && (typeof previous.http400Contexts !== 'object'
    || Array.isArray(previous.http400Contexts))) throw Error('COLLECTION_CHECKPOINT_UNREADABLE')
  for (const [key, value] of Object.entries(priorContexts)) {
    if (!/^HTTP400:(?:list page=\d+|detail PF\d{6})$/.test(key)
      || !Number.isSafeInteger(value) || value < 1 || value > 3) throw Error('COLLECTION_CHECKPOINT_UNREADABLE')
  }
  const priorFingerprint = previous.http400Fingerprint ?? http400Fingerprint(previous.error)
  if (priorFingerprint && !/^HTTP400:(?:list page=\d+|detail PF\d{6})$/.test(priorFingerprint)) throw Error('COLLECTION_CHECKPOINT_UNREADABLE')
  const priorStreak = previous.http400Streak ?? (priorFingerprint ? 1 : 0)
  if (!Number.isSafeInteger(priorStreak) || priorStreak < 0 || priorStreak > 3) throw Error('COLLECTION_CHECKPOINT_UNREADABLE')
  if (priorFingerprint && priorStreak && priorContexts[priorFingerprint] == null) priorContexts[priorFingerprint] = priorStreak
  if (skipped) {
    return { cooldownVersion: 2,
      http400Fingerprint: priorFingerprint, http400Streak: priorStreak, http400Contexts: priorContexts,
      nextAttemptAt: new Date(Math.max(now + hour, Date.parse(previous.nextAttemptAt) || 0)).toISOString() }
  }
  const safeErrors = [error, ...errors].filter(value => typeof value === 'string' && safeHttpError.test(value))
  // A source attempt counts once per request context, even if failures repeat inside it.
  const contexts = [...new Set(safeErrors.map(http400Fingerprint).filter(Boolean))].sort()
  const http400Contexts = Object.fromEntries(contexts.map(key => [key, Math.min((priorContexts[key] ?? 0) + 1, 3)]))
  const http400Streak = Math.max(0, ...Object.values(http400Contexts))
  const fingerprint = contexts.find(key => http400Contexts[key] === http400Streak) ?? null
  const otherPermanent = safeErrors.some(value => {
    const code = Number(safeHttpError.exec(value)[1])
    return code >= 400 && code < 500 && ![400, 429].includes(code)
  })
  const hours = Math.max(http400Streak ? [1, 6, 24][http400Streak - 1] : 1, otherPermanent ? 24 : 1)
  return { cooldownVersion: 2, http400Fingerprint: fingerprint, http400Streak, http400Contexts,
    nextAttemptAt: new Date(now + hours * hour).toISOString() }
}

export function migrateHttp400Cooldown(previous) {
  if (previous.cooldownVersion != null || previous.failed !== true || !http400Fingerprint(previous.error)) return previous
  const checkedAt = Date.parse(previous.checkedAt)
  if (!Number.isFinite(checkedAt)) throw Error('COLLECTION_CHECKPOINT_UNREADABLE')
  return { ...previous, ...collectionCooldown({ error: previous.error, now: checkedAt }),
    cooldownMigration: { from: 'legacy-http4xx-24h', previousNextAttemptAt: previous.nextAttemptAt } }
}


export function assertApiCheckpoint(previous) {
  if (!previous || typeof previous !== 'object' || Array.isArray(previous) || previous.cooldownVersion !== 2
    || !timestamp(previous.nextAttemptAt)) throw Error('API_COLLECTION_CHECKPOINT_UNCONFIRMED')
  try { collectionCooldown({ previous, skipped: true }) }
  catch { throw Error('API_COLLECTION_CHECKPOINT_UNCONFIRMED') }
}

export function apiCollectionCheckpoint(previous, result, { now = Date.now(), confirmed = false, latestRun = null, receiptUnconfirmed = false } = {}) {
  assertApiCheckpoint(previous)
  const errors = [result.error, ...(result.failures ?? []).map(r => r.error)]
  const httpError = errors.find(e => safeHttpError.test(e ?? ''))
  const cooldown = collectionCooldown({ previous, error: result.error, errors, now })
  const unknownHistory = !previous.http400Fingerprint && (previous.http400Streak ?? 0) > 0
  const uncertain = receiptUnconfirmed || !confirmed && !httpError || unknownHistory
  return { ...previous, ...cooldown, checkedAt: new Date(now).toISOString(), source: 'kopis',
    failed: !confirmed || Boolean(result.error) || Boolean(result.failures?.length), uploaded: confirmed,
    candidates: result.candidates?.length ?? 0, held: result.holds?.length ?? 0,
    published: confirmed ? latestRun?.published_count ?? 0 : 0, latestRun,
    error: httpError ?? (result.error ? 'API_COLLECTION_FAILED' : !confirmed ? 'COLLECTION_RESULT_UNCONFIRMED' : null),
    http400Errors: [...new Set(errors.filter(e => http400Fingerprint(e)))],
    nextAttemptAt: new Date(Math.max(Date.parse(cooldown.nextAttemptAt), Date.parse(previous.nextAttemptAt),
      uncertain ? now + 24 * hour : 0)).toISOString() }
}
