// Do not graft reviewed facts onto a newly collected event. Hold the update for
// review if raw collection would remove/change facts already stored by review.
const instant = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
const sessionKey = s => JSON.stringify([s?.starts_on, instant(s?.starts_at)])
const evidenceKey = e => JSON.stringify([e?.method, e?.sale_type, e?.event_matched,
  e?.source_url, instant(e?.opens_at), e?.publisher_role, e?.source_use_verified, e?.use_basis_url])

export function factRegressionReasons(previous, incoming) {
  if (!previous || typeof previous !== 'object' || Array.isArray(previous)
    || !incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw Error('COLLECTION_FACT_CONTEXT_UNAVAILABLE')
  for (const p of [previous, incoming]) for (const key of ['sessions', 'sources', 'ticket_evidence']) {
    if (p[key] != null && (!Array.isArray(p[key]) || p[key].some(v => !v || typeof v !== 'object' || Array.isArray(v)))) {
      throw Error('COLLECTION_FACT_CONTEXT_UNAVAILABLE')
    }
  }
  const reasons = []
  const hasFacts = previous.announced_at || previous.announcement_verified === true || previous.ticket?.opens_at
    || previous.sessions?.length || previous.ticket_evidence?.length || previous.sources?.some(s => s.verified_at)
  if (hasFacts && ['title', 'format', 'country_code', 'city', 'venue', 'starts_on', 'ends_on']
    .some(key => previous[key] !== incoming[key])) reasons.push('EVENT_CHANGED_WITH_REVIEWED_FACTS')
  if (Array.isArray(previous.sessions) && previous.sessions.length
    && (!Array.isArray(incoming.sessions) || previous.sessions.some(s => !incoming.sessions.some(n => sessionKey(s) === sessionKey(n))))) {
    reasons.push('SESSIONS_REMOVED_OR_CHANGED')
  }
  if (previous.announced_at || previous.announcement_verified === true) {
    const retainedPrecision = previous.announcement_precision === 'day' && previous.announced_at === null
      ? incoming.announcement_precision === 'day' && incoming.announced_at === null
      : Boolean(instant(previous.announced_at)) && instant(incoming.announced_at) === instant(previous.announced_at)
    if (!retainedPrecision
      || incoming.announced_on !== previous.announced_on
      || previous.announcement_verified === true && incoming.announcement_verified !== true) reasons.push('ANNOUNCEMENT_REMOVED_OR_CHANGED')
  }
  if (previous.ticket?.opens_at && (!instant(previous.ticket.opens_at)
    || instant(incoming.ticket?.opens_at) !== instant(previous.ticket.opens_at))) reasons.push('SALE_REMOVED_OR_CHANGED')
  if (Array.isArray(previous.ticket_evidence) && previous.ticket_evidence.some(e =>
    !Array.isArray(incoming.ticket_evidence) || !incoming.ticket_evidence.some(n => evidenceKey(e) === evidenceKey(n)
      && (!e.verified_at || instant(n.verified_at))))) {
    reasons.push('SALE_EVIDENCE_REMOVED_OR_CHANGED')
  }
  if (Array.isArray(previous.sources) && previous.sources.some(s => s.verified_at
    && (!Array.isArray(incoming.sources) || !incoming.sources.some(n => n.url === s.url && instant(n.verified_at))))) {
    reasons.push('SOURCE_VERIFICATION_REMOVED')
  }
  return reasons
}

export async function assertCollectionFactsPreserved(client, batch) {
  const rows = new Map(batch.candidates.map(c => [c.source_url, c]))
  if (rows.size !== batch.candidates.length) throw Error('COLLECTION_FACT_CONTEXT_UNAVAILABLE')
  const urls = [...rows.keys()], review = []
  for (let offset = 0; offset < urls.length; offset += 20) {
    const chunk = urls.slice(offset, offset + 20)
    const r = await client.from('collection_candidates').select('source_url,payload').in('source_url', chunk)
    if (r.error || !Array.isArray(r.data)) throw Error('COLLECTION_FACT_CONTEXT_UNAVAILABLE')
    const seen = new Set()
    for (const old of r.data) {
      if (!chunk.includes(old.source_url) || seen.has(old.source_url)) throw Error('COLLECTION_FACT_CONTEXT_UNAVAILABLE')
      seen.add(old.source_url)
      const reasons = factRegressionReasons(old.payload, rows.get(old.source_url).payload)
      if (reasons.length) review.push({ source_url: old.source_url, reasons })
    }
  }
  if (review.length) throw Object.assign(Error('COLLECTION_FACT_REGRESSION'), { review })
}

export async function quarantineCollectionFactRegressions(client, batch) {
  try { await assertCollectionFactsPreserved(client, batch) }
  catch (error) {
    if (error.message !== 'COLLECTION_FACT_REGRESSION') throw error
    const blocked = new Set(error.review.map(r => r.source_url))
    batch.fact_review = [...(batch.fact_review ?? []), ...error.review]
    batch.failures.push(...error.review.map(r => ({ ...r, error: 'COLLECTION_FACT_REGRESSION' })))
    batch.candidates = batch.candidates.filter(c => !blocked.has(c.source_url))
  }
  return batch
}
