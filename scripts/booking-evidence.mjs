import { JSDOM } from 'jsdom'
import { getText, checkRobots, pause } from './collection-http.mjs'

// Only these public pages are fetched; booking links are identifiers, never fetch targets.
export function ticketlinkProduct(value) {
  try {
    const u = new URL(value)
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port
      || !['www.ticketlink.co.kr', 'm.ticketlink.co.kr', 'ticketlink.co.kr'].includes(u.hostname)
      || !/^\/product\/\d+\/?$/.test(u.pathname) || u.search || u.hash) return null
    return `https://www.ticketlink.co.kr/product/${u.pathname.match(/\d+/)[0]}`
  } catch { return null }
}
export function noticeUrl(value) {
  try {
    const u = new URL(value, 'https://www.ticketlink.co.kr')
    return u.origin === 'https://www.ticketlink.co.kr' && !u.username && !u.password
      && /^\/help\/notice\/\d+$/.test(u.pathname) && !u.search && !u.hash ? u.href : null
  } catch { return null }
}
function lines(element) {
  const clone = element.cloneNode(true)
  for (const node of clone.querySelectorAll('script,style')) node.remove()
  for (const node of clone.querySelectorAll('br')) node.replaceWith('\n')
  for (const node of clone.querySelectorAll('p,div,li')) node.append('\n')
  return clone.textContent.split(/\n/).map(s => s.replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean)
}
function dateParts(text) {
  const matches = [...text.matchAll(/(\d{4})\s*(?:년|[.-])\s*(\d{1,2})\s*(?:월|[.-])\s*(\d{1,2})\s*일?/g)]
  return matches.map(m => {
    const day = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
    if (!Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) throw new Error('Invalid evidence date')
    return { day, end: m.index + m[0].length }
  })
}
// A generic "ticket open"/Offers.validFrom may be a presale. Require an explicit general sale label.
export function generalSale(element) {
  const candidates = lines(element).filter(s => /일반\s*(?:예매|티켓|판매)|general\s*(?:sale|on.?sale)/i.test(s))
  const values = []
  for (const line of candidates) {
    if (/선예매|추첨|응모|변경|취소|연기|미정/.test(line)) return { opens_at: null, reason: '일반 예매 일정 예외: 원문 검수 필요' }
    const dates = dateParts(line)
    if (dates.length !== 1) return { opens_at: null, reason: '일반 예매 날짜 미확정: 원문 검수 필요' }
    const time = line.slice(dates[0].end).match(/(?:\([^)]*\)\s*)?(?:(오전|오후)\s*)?(\d{1,2})(?::(\d{2})|\s*시(?:\s*(\d{1,2})\s*분)?|\s*(AM|PM))\s*(AM|PM)?/i)
    if (!time) return { opens_at: null, reason: '일반 예매 시각 미확정: 원문 검수 필요' }
    let hour = Number(time[2]); const minute = Number(time[3] ?? time[4] ?? 0)
    const meridiem = (time[1] ?? time[5] ?? time[6] ?? '').toUpperCase()
    if (meridiem && (hour < 1 || hour > 12)) throw new Error('Invalid general sale time')
    if (meridiem) hour = hour % 12 + (['오후', 'PM'].includes(meridiem) ? 12 : 0)
    if (hour > 23 || minute > 59) throw new Error('Invalid general sale time')
    values.push({ opens_at: `${dates[0].day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`, line })
  }
  if (new Set(values.map(v => v.opens_at)).size > 1) return { opens_at: null, reason: '일반 예매 시각 충돌: 원문 검수 필요' }
  return values[0] ?? { opens_at: null }
}
export function applyOfficialOpening(payload, element) {
  if (!element) return
  const sale = generalSale(element)
  if (sale.reason) payload.review_reasons.push(sale.reason)
  if (sale.opens_at) {
    payload.ticket.opens_at = sale.opens_at
    payload.ticket_evidence = [{ source_url: payload.sources[0].url, opens_at: sale.opens_at, line: sale.line }]
  }
}
export function parseTicketlinkNotice(html, url) {
  if (noticeUrl(url) !== url) throw new Error('Unsupported notice URL')
  const d = new JSDOM(html).window.document
  const body = d.querySelector('.list_cont'), title = d.querySelector('#noticeTitle')?.textContent.trim()
  if (!body || !title) throw new Error('Ticketlink notice layout changed')
  const text = lines(body)
  const period = text.filter(s => /^공연\s*(?:기간|일자|일정)\s*[:：]/.test(s))
  const venue = text.filter(s => /^공연\s*장소\s*[:：]/.test(s))
  const products = [...new Set([...d.querySelectorAll('.th_info a[href]')].map(a => ticketlinkProduct(new URL(a.getAttribute('href'), url).href)).filter(Boolean))]
  if (period.length !== 1 || venue.length !== 1 || products.length !== 1) throw new Error('Notice event identity ambiguous')
  const dates = dateParts(period[0])
  if (!dates.length || dates.length > 2 || (dates[1] && dates[1].day < dates[0].day)) throw new Error('Notice performance dates ambiguous')
  if (dates.length === 1 && /[~～–]|\d/.test(period[0].slice(dates[0].end))) throw new Error('Notice abbreviated date range requires review')
  const sale = generalSale(body)
  // Changes/cancellations require a reviewer; do not reuse an old sale time.
  const changed = /취소|연기|변경/.test(`${title} ${period[0]}`)
  return { source_url: url, title, booking_url: products[0], starts_on: dates[0].day, ends_on: dates.at(-1).day,
    venue: venue[0].replace(/^공연\s*장소\s*[:：]\s*/, '').trim(),
    opens_at: changed ? null : sale.opens_at, line: sale.line,
    reason: changed ? '공연 변경 공지: 원문 검수 필요' : sale.reason }
}
export async function collectTicketlinkEvidence(urls, fetcher = fetch, sleep = pause) {
  const links = [...new Set(urls)]
  if (links.length > 50 || links.some(u => noticeUrl(u) !== u)) throw new Error('Invalid notice allowlist')
  const evidence = [], failures = []
  if (!links.length) return { evidence, failures }
  const robots = await getText('https://www.ticketlink.co.kr/robots.txt', fetcher)
  if (/<html/i.test(robots)) throw new Error('Invalid ticketlink robots response')
  for (const url of links) {
    try {
      checkRobots(robots, [new URL(url).pathname])
      await sleep(1000)
      evidence.push(parseTicketlinkNotice(await getText(url, fetcher), url))
    } catch (error) { failures.push({ source_url: url, error: error.message }) }
  }
  return { evidence, failures }
}
const normalizeVenue = s => s?.normalize('NFKC').toLowerCase().replace(/[\s·._-]/g, '')
export function supplementBooking(row, evidence) {
  const p = row.payload
  const products = new Set([p.ticket.booking_url, ...(p.booking_links ?? []).map(l => l.url)].map(ticketlinkProduct).filter(Boolean))
  const related = evidence.filter(e => products.has(ticketlinkProduct(e.booking_url)))
  const matches = related.filter(e => e.starts_on === p.starts_on && e.ends_on === p.ends_on
    && normalizeVenue(e.venue) && normalizeVenue(e.venue) === normalizeVenue(p.venue))
  if (related.length !== matches.length) p.review_reasons.push('같은 예매 상품의 공연일·장소 불일치: 변경 공지 검수 필요')
  for (const e of matches) if (e.reason) p.review_reasons.push(e.reason)
  const timed = matches.filter(e => e.opens_at)
  const values = [...new Set([...timed.map(e => e.opens_at), ...(p.ticket.opens_at ? [p.ticket.opens_at] : [])].map(s => new Date(s).toISOString()))]
  if (values.length > 1) {
    p.ticket.opens_at = null
    p.review_reasons.push('공식 출처 간 일반 예매 시각 충돌: 검수 필요')
  } else if (values.length === 1 && related.length === matches.length && !matches.some(e => e.reason)) {
    p.ticket.opens_at = values[0]
    p.ticket.booking_url = timed[0]?.booking_url ?? p.ticket.booking_url
  }
  p.ticket_evidence = [...(p.ticket_evidence ?? []), ...related.map(e => ({ source_url: e.source_url, opens_at: e.opens_at,
    starts_on: e.starts_on, ends_on: e.ends_on, venue: e.venue, event_matched: matches.includes(e), line: e.line ?? null, reason: e.reason ?? null }))]
  for (const e of related) if (!p.sources.some(s => s.url === e.source_url)) p.sources.push({ url: e.source_url, label: '예매 일정 비교 공식 공지', verified_at: null })
  p.review_reasons = [...new Set(p.review_reasons)]
  return row
}
