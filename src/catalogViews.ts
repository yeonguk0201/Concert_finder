import type { Band, Concert } from './data'
import { matchesArtistSearch } from './artistSearch'
export type ConcertOrder = 'announcement' | 'performance' | 'ticket'
export function matchesArtist(band: Band, query: string) {
  return matchesArtistSearch(band, query)
}
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
// A date without a time can cover separate shows at the same venue.
export function distinctConcerts(concerts: Concert[], saved: ReadonlySet<string>): Concert[] {
  const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
  const priority = (concert: Concert) => Number(saved.has(concert.id)) * 4
    + Number(Boolean(concert.ticketScheduleId)) * 2 + Number(Boolean(concert.ticketAt || concert.bookingUrl))
  const listings: Concert[] = []
  const indexes = new Map<string, number[]>()
  for (const concert of concerts) {
    const { date, endsOn, city, venue, title, cancelled, type, bandIds, sources } = concert
    if (!date || !city || city === '지역 미정' || !venue || venue === '장소 미정') {
      listings.push(concert)
      continue
    }
    const key = JSON.stringify([normalize(title), date, endsOn || date, normalize(city), normalize(venue),
      Boolean(cancelled), type, [...bandIds].sort()])
    const matches = indexes.get(key) ?? []
    const duplicate = matches.find(index => date.includes('T') || sources?.some(source =>
      listings[index].sources?.some(existing => existing.url === source.url)))
    if (duplicate === undefined) {
      indexes.set(key, [...matches, listings.length])
      listings.push(concert)
    } else if (priority(concert) > priority(listings[duplicate])) {
      listings[duplicate] = concert
    }
  }
  return listings
}
export function imminentTickets(concerts: Concert[], now = new Date()) {
  return sortConcerts(concerts.filter(c => isUpcoming(c, now) && Date.parse(c.ticketAt) > now.getTime()), 'ticket', now)
}
