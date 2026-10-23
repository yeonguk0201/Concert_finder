import { JSDOM } from 'jsdom'
import { generalSale } from './booking-evidence.mjs'
import { candidate, basePayload } from './official-adapters.mjs'
import { getText, checkRobots, pause } from './collection-http.mjs'

export function nolProduct(value) {
  try {
    const u = new URL(value)
    if (u.origin !== 'https://nol.yanolja.com' || u.username || u.password || u.search || u.hash
      || !/^\/ticket\/products\/\d+$/.test(u.pathname)) return null
    return u.href
  } catch { return null }
}

export function bookingWindows(lines, sourceUrl) {
  const windows = [], problems = []
  for (const line of lines) {
    const general = /일반\s*(?:예매|판매|티켓)|general\s*(?:sale|on.?sale)/i.test(line)
    const presale = /선예매|사전\s*예매|pre-?sale/i.test(line)
    if (!general && !presale) continue
    if (general && presale) { problems.push('혼합 예매 구분: 원문 검수 필요'); continue }
    const element = new JSDOM('<p></p>').window.document.querySelector('p')
    // Reuse the strict absolute-date/time parser, retaining the actual source line.
    element.textContent = presale ? line.replace(/선예매|사전\s*예매|pre-?sale/ig, '일반 예매') : line
    const parsed = generalSale(element)
    if (!parsed.opens_at) { problems.push(parsed.reason ?? '예매 시각 미확정'); continue }
    windows.push({ kind: general ? 'general' : 'presale', opens_at: parsed.opens_at, source_url: sourceUrl, line })
  }
  const unique = [...new Map(windows.map(w => [`${w.kind}:${w.opens_at}`, w])).values()]
  const conflict = ['general', 'presale'].some(kind => unique.filter(w => w.kind === kind).length > 1)
  if (conflict) problems.push('같은 예매 구분의 시각 충돌: 자동 적용 금지')
  return { windows: unique, problems, conflict }
}

// Discovery only. No automatic identity, publication, account, or notification mutation.
export function parseNolProduct(html, url) {
  if (nolProduct(url) !== url) throw Error('NOL_URL_INVALID')
  const d = new JSDOM(html).window.document
  for (const node of d.querySelectorAll('script,style,nav,footer,[hidden],[aria-hidden="true"]')) node.remove()
  const title = d.querySelector('h1')?.textContent.trim()
  if (!title) throw Error('NOL_LAYOUT_CHANGED')
  for (const node of d.querySelectorAll('br')) node.replaceWith('\n')
  for (const node of d.querySelectorAll('p,li,div,section,h1,h2,h3,dt,dd')) node.append('\n')
  const text = d.body.textContent, lines = text.split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const ranges = [...text.matchAll(/(\d{4})\.(\d{2})\.(\d{2})\s*[~～]\s*(\d{4})\.(\d{2})\.(\d{2})/g)]
  if (ranges.length !== 1) throw Error('NOL_PERFORMANCE_RANGE_AMBIGUOUS')
  const [start, end] = [ranges[0].slice(1, 4).join('-'), ranges[0].slice(4, 7).join('-')]
  if ([start, end].some(s => !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) || end < start) throw Error('NOL_PERFORMANCE_DATE_INVALID')
  const payload = basePayload(title, url, 'NOL 공식 예매처')
  Object.assign(payload, { starts_on: start, ends_on: end })
  payload.ticket.booking_url = url
  const sales = bookingWindows(lines, url)
  payload.booking_windows = sales.windows
  payload.review_reasons = [...sales.problems, '공식 아티스트 신원·개별 회차·발표 시각·출처 운영 정책 확인 필요']
  const general = sales.windows.filter(w => w.kind === 'general')
  if (!sales.conflict && general.length === 1) {
    payload.ticket.opens_at = general[0].opens_at
    payload.ticket_evidence = [{ source_url: url, opens_at: general[0].opens_at, line: general[0].line }]
  }
  // A range does not prove daily shows. Venue/city/announcement remain unknown without separate evidence.
  return candidate(url, payload, [], payload.review_reasons)
}

export async function collectNolProducts(urls, { fetcher = fetch, sleep = pause } = {}) {
  if (!Array.isArray(urls) || urls.length > 40 || urls.some(u => nolProduct(u) !== u)) throw Error('NOL_SELECTION_INVALID')
  const selected = [...new Set(urls)], candidates = [], failures = []
  if (!selected.length) return { candidates, failures }
  const robots = await getText('https://nol.yanolja.com/robots.txt', fetcher)
  if (/<html/i.test(robots)) throw Error('NOL_ROBOTS_INVALID')
  checkRobots(robots, selected.map(u => new URL(u).pathname))
  for (const url of selected) {
    await sleep(1000)
    try { candidates.push(parseNolProduct(await getText(url, fetcher), url)) }
    catch (e) { failures.push({ source_url: url, error: /^[A-Z_]+$/.test(e.message) ? e.message : 'NOL_FETCH_OR_PARSE_FAILED' }) }
  }
  return { candidates, failures }
}
