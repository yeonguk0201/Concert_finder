export function kstDay(now = new Date()) {
  return now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}
export function candidatePeriod(payload, today = kstDay()) {
  if (!payload.starts_on) return 'unknown'
  return (payload.ends_on ?? payload.starts_on) < today ? 'past' : 'upcoming'
}
export function filterPastCandidates(result, { includePast = false, today = kstDay() } = {}) {
  result.excluded ??= []
  result.candidates = result.candidates.filter(row => {
    const period = candidatePeriod(row.payload, today)
    row.payload.collection_period = period
    if (period !== 'past' || includePast) return true
    result.excluded.push({ source_url: row.source_url, reason: `종료된 공연: ${row.payload.ends_on ?? row.payload.starts_on}` })
    return false
  })
  return result
}
