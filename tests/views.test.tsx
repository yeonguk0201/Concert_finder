import { expect, test } from 'vitest'
import { concerts, bands } from '../src/data'
import { hasOverseasBand, imminentTickets, isUpcoming, recommendedArtists, sortConcerts } from '../src/catalogViews'
const now = new Date('2026-10-07T00:00:00Z')
test('views put unknown dates last, exclude past/cancelled tickets, match mixed festivals and use KST days', () => {
  const base = concerts[0]
  const rows = [{ ...base, id:'past', ticketAt:'2026-10-01T00:00:00Z' }, { ...base, id:'future', ticketAt:'2026-10-08T00:00:00Z' }, { ...base, id:'unknown', date:'', ticketAt:'', announcedAt:'' }]
  expect(imminentTickets(rows, now).map(c => c.id)).toEqual(['future'])
  expect(imminentTickets([{ ...rows[1], cancelled:true }], now)).toEqual([])
  expect(sortConcerts(rows,'announcement',now).at(-1)?.id).toBe('unknown')
  expect(hasOverseasBand({ ...base, type:'페스티벌', bandIds:['oasis','silicagel'] },bands)).toBe(true)
  expect(isUpcoming({ ...base, date:'2026-10-07' }, new Date('2026-10-07T16:00:00Z'))).toBe(false)
})

test('recommendations prefer recent announcements and upcoming shows, with unique weekly discovery', () => {
  const base = concerts[0]
  const catalogue = Array.from({ length: 9 }, (_, index) => ({ ...bands[0], id: `artist-${index}` }))
  const events = [
    { ...base, id: 'recent', bandIds: ['artist-7', 'unapproved'], date: '2026-12-01', announcedAt: '2026-11-08' },
    { ...base, id: 'imminent', bandIds: ['artist-8', 'artist-7'], date: '2026-11-16', announcedAt: '' },
    { ...base, id: 'cancelled', bandIds: ['artist-0'], date: '2026-11-17', announcedAt: '2026-11-09', cancelled: true },
    { ...base, id: 'ended', bandIds: ['artist-1'], date: '2026-11-08', announcedAt: '2026-11-08' },
    { ...base, id: 'later', bandIds: ['artist-6'], date: '2026-12-31', announcedAt: '' },
  ]
  const ids = (day: string) => recommendedArtists(catalogue, events, day).map(band => band.id)
  const picks = ids('2026-11-09')
  expect(ids('2026-11-15')).toEqual(picks)
  expect(ids('2026-11-16')).not.toEqual(picks)
  expect(new Set(picks).size).toBe(3)
  // With two active artists both take the concert slots, ahead of the rotating discovery pick.
  expect(recommendedArtists(catalogue, events.slice(0, 4), '2026-11-09').map(band => band.id).slice(0, 2))
    .toEqual(['artist-7', 'artist-8'])
  expect(recommendedArtists(catalogue, [], '2026-11-09')).not.toEqual(recommendedArtists(catalogue, [], '2026-11-16'))
})
