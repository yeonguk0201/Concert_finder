import type { Concert } from './data'

/** Calendar cells and timestamps use the same Korean calendar day. */
export function koreaDay(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

export function performsOn(concert: Concert, day: string) {
  const start = koreaDay(concert.date)
  const end = koreaDay(concert.endsOn || concert.date)
  return Boolean(day && start && !concert.cancelled && !concert.unavailable && start <= day && end >= day)
}

export function monthDays(month: string) {
  const [year, number] = month.split('-').map(Number)
  const offset = new Date(Date.UTC(year, number - 1, 1)).getUTCDay()
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate()
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1
    return day < 1 || day > count ? '' : `${month}-${String(day).padStart(2, '0')}`
  })
}

export function shiftMonth(month: string, amount: number) {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 1 + amount, 1)).toISOString().slice(0, 7)
}

export function dayLabel(day: string) {
  return `${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일`
}
