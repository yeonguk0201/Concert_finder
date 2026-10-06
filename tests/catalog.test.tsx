import { expect, test } from 'vitest'
import { mapBands, mapConcerts, unavailableConcert } from '../src/catalog'
import { calendarFile, formatDate } from '../src/lib'

test('production mapping keeps unknown times unknown and supports a mixed festival', () => {
  const bands = mapBands([{ id: 'kr', name: 'Same name', aliases: ['별칭'], country_code: 'KR', description: null }, { id: 'gb', name: 'Same name', aliases: [], country_code: 'GB', description: null }])
  expect(bands[0].id).not.toBe(bands[1].id)
  const [concert] = mapConcerts([{ id: 'festival', title: 'Mixed festival', format: 'festival', city: null, venue: null, starts_on: '2026-12-12', ends_on: '2026-12-13', announced_on: '2026-10-06', cancelled: false,
    concert_bands: [{ band_id: 'kr' }, { band_id: 'gb' }], ticket_schedules: [{ id: 'ticket', opens_at: null, price_description: null, booking_url: null }], concert_sources: [] }], bands)
  expect(concert.type).toBe('페스티벌')
  expect(concert.ticketAt).toBe('')
  expect(formatDate(concert.ticketAt, true)).toBe('미정')
  expect(formatDate(concert.date, true)).not.toMatch(/00:00/)
  expect(() => calendarFile(concert, false)).toThrow()
  expect(() => calendarFile(unavailableConcert('hidden'), false)).toThrow()
  const calendar = calendarFile({ ...concert, ticketAt: '2026-11-01T20:00:00+09:00' }, false)
  expect(calendar).toContain('DTSTART:20261101T110000Z')
  expect(calendar).not.toContain('[샘플]')
})
