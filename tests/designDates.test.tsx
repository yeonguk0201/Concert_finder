import { expect, test } from 'vitest'
import { koreaDay, monthDays, performsOn, shiftMonth } from '../src/designDates'
import { concerts } from '../src/data'

test('calendar matches ticket times in Korea across UTC midnight', () => {
  expect(koreaDay('2026-10-22T15:00:00Z')).toBe('2026-10-23')
  expect(koreaDay('2026-10-22T14:59:59Z')).toBe('2026-10-22')
  expect(koreaDay('')).toBe('')
  expect(koreaDay('2026-10-23')).toBe('2026-10-23')
})
test('recommendations include every festival day and exclude cancelled and unavailable events', () => {
  const festival = { ...concerts[0], date: '2026-10-23', endsOn: '2026-10-25' }
  expect(performsOn(festival, '2026-10-24')).toBe(true)
  expect(performsOn(festival, '2026-10-25')).toBe(true)
  expect(performsOn(festival, '2026-10-26')).toBe(false)
  expect(performsOn({ ...festival, cancelled: true }, '2026-10-24')).toBe(false)
  expect(performsOn({ ...festival, unavailable: true }, '2026-10-24')).toBe(false)
  expect(performsOn({ ...festival, date: '' }, '2026-10-24')).toBe(false)
})
test('calendar pads complete weeks and navigates leap years and year boundaries', () => {
  const days = monthDays('2028-02')
  expect(days.filter(Boolean)).toHaveLength(29)
  expect(days.length % 7).toBe(0)
  expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  expect(shiftMonth('2026-01', -1)).toBe('2025-12')
})
