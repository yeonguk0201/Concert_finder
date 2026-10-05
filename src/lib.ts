import type { Concert } from './data'

export function formatDate(value: string, time = false) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', ...(time ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) }).format(new Date(value))
}
export function calendarFile(concert: Concert) {
  const start = new Date(concert.ticketAt)
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ENCORE//Concert Finder//KO', 'BEGIN:VEVENT', `UID:${concert.id}-ticket@encore.local`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + 30 * 60_000))}`, `SUMMARY:${escape(`[샘플] ${concert.title} 티켓 오픈`)}`, `DESCRIPTION:${escape('가상의 샘플 일정입니다. 실제 예매 일정이 아닙니다.')}`, 'END:VEVENT', 'END:VCALENDAR', '']
  // RFC 5545: fold content lines at 75 octets without splitting UTF-8 characters.
  return lines.map(line => { let output = ''; let width = 0; for (const char of line) { const bytes = new TextEncoder().encode(char).length; if (width + bytes > 75) { output += '\r\n '; width = 1 } output += char; width += bytes } return output }).join('\r\n')
}
export function readIds(key: string, fallback: string[], validIds: string[]) {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && validIds.includes(id)) : fallback } catch { return fallback }
}
