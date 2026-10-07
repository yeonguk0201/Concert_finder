import type { Band, Concert } from './data'
export type ConcertOrder = 'announcement' | 'performance' | 'ticket'
export function isUpcoming(concert: Concert, now = new Date()) {
  const today = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  return !concert.cancelled && (!(concert.endsOn || concert.date) || (concert.endsOn || concert.date).slice(0,10) >= today)
}
export function hasOverseasBand(concert: Concert, bands: Band[]) {
  return bands.some(b => concert.bandIds.includes(b.id) && b.countryCode !== 'KR' && b.country !== '한국')
}
export function sortConcerts(concerts: Concert[], order: ConcertOrder, now = new Date()) {
  const field = (c: Concert) => order === 'announcement' ? c.announcedAt : order === 'performance' ? c.date : Date.parse(c.ticketAt) > now.getTime() ? c.ticketAt : ''
  return [...concerts].sort((a,b) => {
    const left = field(a), right = field(b)
    if (!left || !right) return left ? -1 : right ? 1 : a.id.localeCompare(b.id)
    const difference = order === 'ticket' ? Date.parse(left) - Date.parse(right) : left.localeCompare(right)
    return (order === 'announcement' ? -difference : difference) || a.id.localeCompare(b.id)
  })
}
export function imminentTickets(concerts: Concert[], now = new Date()) {
  return sortConcerts(concerts.filter(c => isUpcoming(c, now) && Date.parse(c.ticketAt) > now.getTime()), 'ticket', now)
}
