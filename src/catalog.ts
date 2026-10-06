import type { Band, Concert } from './data'

export type BandRow = { id: string; name: string; aliases: string[]; country_code: string; description: string | null }
type TicketRow = { id: string; opens_at: string | null; price_description: string | null; booking_url: string | null }
export type ConcertRow = {
  id: string; title: string; format: string; city: string | null; venue: string | null;
  starts_on: string | null; ends_on: string | null; announced_on: string | null; cancelled: boolean;
  concert_bands: { band_id: string }[];
  ticket_schedules: TicketRow | TicketRow[] | null;
  concert_sources: { url: string; label: string; verified_at: string | null }[];
}
export function mapBands(rows: BandRow[]): Band[] {
  const regions = new Intl.DisplayNames(['ko'], { type: 'region' })
  return rows.map(row => ({ id: row.id, name: row.name, aliases: row.aliases, countryCode: row.country_code,
    country: regions.of(row.country_code) ?? row.country_code, genre: row.description ?? '밴드', color: '#cde99c', initials: row.name.slice(0, 2) }))
}
export function mapConcerts(rows: ConcertRow[], bands: Band[]): Concert[] {
  return rows.map(row => {
    const ticket = Array.isArray(row.ticket_schedules) ? row.ticket_schedules[0] : row.ticket_schedules
    const bandIds = row.concert_bands.map(item => item.band_id)
    return { id: row.id, title: row.title, bandIds,
      type: row.format === 'festival' ? '페스티벌' : bands.some(b => bandIds.includes(b.id) && b.countryCode !== 'KR') ? '내한' : '국내',
      date: row.starts_on ?? '', endsOn: row.ends_on ?? undefined, venue: row.venue ?? '장소 미정', city: row.city ?? '지역 미정',
      announcedAt: row.announced_on ?? '', ticketAt: ticket?.opens_at ?? '', price: ticket?.price_description ?? '미정',
      ticketScheduleId: ticket?.id, cancelled: row.cancelled, palette: 'lime', headline: row.title,
      description: row.cancelled ? '취소된 공연입니다. 공식 출처에서 변경 내용을 확인해 주세요.' : '공식 출처에서 최신 공연 정보를 확인해 주세요.',
      sources: row.concert_sources.filter(s => s.verified_at).map(s => ({ url: s.url, label: s.label })), bookingUrl: ticket?.booking_url ?? undefined,
    }
  })
}
export function unavailableConcert(ticketScheduleId: string): Concert {
  return { id: `unavailable-${ticketScheduleId}`, ticketScheduleId, title: '공개 중단 또는 삭제된 공연', bandIds: [], type: '국내',
    date: '', ticketAt: '', announcedAt: '', city: '미정', venue: '미정', price: '미정', palette: 'sage', headline: '공개 중단',
    description: '지금은 공연 정보를 조회할 수 없습니다. 저장 목록에서 삭제할 수 있습니다.', unavailable: true }
}
