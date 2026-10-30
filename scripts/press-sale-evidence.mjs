// Offline preparation only. No fetching, policy certification, DB writes or sends.
// Preserve the original English line alongside its contextual interpretation.
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
function date(year, month, day) {
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const time = Date.parse(value)
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw Error('PRESS_DATE_INVALID')
  return value
}
export function preparePressSaleEvidence(input) {
  let url
  try { url = new URL(input?.sourceUrl) } catch { throw Error('PRESS_SOURCE_INVALID') }
  if (url.origin !== 'https://news.livenationentertainment.com' || !/^\/news\/[a-z0-9-]+$/.test(url.pathname)
    || url.search || url.hash || url.username || url.password) throw Error('PRESS_SOURCE_INVALID')
  if (typeof input.eventTitle !== 'string' || !input.eventTitle.trim()
    || !/^\d{4}-\d{2}-\d{2}$/.test(input.noticeDate ?? '')
    || !Number.isInteger(input.performanceYear) || input.performanceYear < 2000 || input.performanceYear > 2100
    || !Array.isArray(input.performanceRows) || !input.performanceRows.length) throw Error('PRESS_CONTEXT_INVALID')
  const [year, month, day] = input.noticeDate.split('-').map(Number)
  date(year, month, day)
  const rows = input.performanceRows.map(row => {
    if (typeof row !== 'string') throw Error('PRESS_CONTEXT_INVALID')
    const m = row.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), ([A-Z][a-z]{2}) (\d{1,2}) — Seoul — (.+)$/)
    if (!m || !m[4].trim()) throw Error('PRESS_KOREA_ROW_UNCONFIRMED')
    const monthIndex = months.findIndex(name => name.slice(0, 3) === m[2])
    const day = date(input.performanceYear, monthIndex + 1, Number(m[3]))
    if (weekdays[new Date(day).getUTCDay()].slice(0, 3) !== m[1]) throw Error('PRESS_WEEKDAY_CONFLICT')
    return { day, venue: m[4], originalLine: row }
  })
  if (new Set(rows.map(r => r.day)).size !== rows.length || new Set(rows.map(r => r.venue)).size !== 1) throw Error('PRESS_SESSIONS_AMBIGUOUS')
  const line = input.saleLine
  const m = typeof line === 'string' && line.match(/^The general onsale for all dates will begin (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), ([A-Z][a-z]+) (\d{1,2}) at (\d{1,2})(?::(\d{2}))?(am|pm) local time\.$/)
  if (!m) throw Error('PRESS_GENERAL_SALE_UNCONFIRMED')
  const saleDay = date(year, months.indexOf(m[2]) + 1, Number(m[3]))
  const delay = Date.parse(saleDay) - Date.parse(input.noticeDate)
  if (delay < 0 || delay > 90 * 86400000) throw Error('PRESS_YEAR_CONTEXT_UNCONFIRMED')
  if (weekdays[new Date(saleDay).getUTCDay()] !== m[1]) throw Error('PRESS_WEEKDAY_CONFLICT')
  const hour = Number(m[4]), minute = Number(m[5] ?? 0)
  if (hour < 1 || hour > 12 || minute > 59) throw Error('PRESS_TIME_INVALID')
  if (rows.some(row => row.day < saleDay)) throw Error('PRESS_SALE_AFTER_PERFORMANCE')
  const localHour = hour % 12 + (m[6] === 'pm' ? 12 : 0)
  return { version: 1, sourceUrl: input.sourceUrl, eventTitle: input.eventTitle,
    originalSaleLine: line, noticeDate: input.noticeDate, noticeExactTimestamp: null,
    performanceDays: rows.map(r => r.day).sort(), originalPerformanceRows: [...input.performanceRows],
    interpretedGeneralSale: { opens_at: `${saleDay}T${String(localHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`,
      timezone: 'Asia/Seoul', yearBasis: 'notice calendar year; upcoming sale within 90 days; weekday checked',
      timezoneBasis: 'explicit all-dates local-time sale and individual Seoul rows', derived: true },
    readyToApply: false, publicationPermissionCertified: false, artistIdentityCertified: false,
    sessionStartTimesVerified: false, presaleAbsenceVerified: false,
    remaining: ['source use permission or applicable public license', 'event identity and all artist approvals',
      'exact session starts', 'original announcement timestamp and presale review', 'supported adapter and operational readback'] }
}
