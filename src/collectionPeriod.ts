export function candidatePeriod(payload: { starts_on: string | null; ends_on?: string | null }, today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })) {
  if (!payload.starts_on) return 'unknown'
  return (payload.ends_on ?? payload.starts_on) < today ? 'past' : 'upcoming'
}
