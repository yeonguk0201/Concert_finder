import { expect, test } from 'vitest'
import { concerts, bands } from '../src/data'
import { hasOverseasBand, imminentTickets, isUpcoming, sortConcerts } from '../src/catalogViews'
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
