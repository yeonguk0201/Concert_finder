import { JSDOM } from 'jsdom'
import { basePayload, candidate } from './official-adapters.mjs'
import { discoveredArtist } from './artist-discovery.mjs'
import { getText, pause } from './collection-http.mjs'

// The www API host redirects to this canonical HTTPS origin.
const api = 'https://kopis.or.kr/openApi/restful/pblprfr'
export const kopisSource = id => {
  if (!/^PF\d{6}$/.test(id)) throw new Error('Invalid KOPIS ID')
  return `https://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20Id=${id}`
}
function records(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Unsupported KOPIS XML declaration')
  let d
  try { d = new JSDOM(xml, { contentType: 'text/xml' }).window.document } catch { throw new Error('Invalid KOPIS XML') }
  if (d.documentElement.tagName !== 'dbs') throw new Error('KOPIS API error or unexpected response')
  return [...d.documentElement.children].map(e => {
    if (e.tagName !== 'db') throw new Error('Unexpected KOPIS record')
    if (e.querySelector('returncode')) throw new Error('KOPIS API rejected the request: check service key and quota')
    return e
  })
}
const field = (e, tag) => [...e.children].find(c => c.tagName === tag)?.textContent.trim() ?? ''
function day(value) {
  if (!/^\d{4}[-.]\d{2}[-.]\d{2}$/.test(value)) throw new Error('Invalid KOPIS date')
  const iso = value.replaceAll('.', '-')
  if (!Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0, 10) !== iso) throw new Error('Invalid KOPIS date')
  return iso
}
function bookingLink(value) {
  try {
    const u = new URL(value)
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port
      || !['www.ticketlink.co.kr', 'm.ticketlink.co.kr', 'ticketlink.co.kr', 'ticket.yes24.com', 'tickets.interpark.com', 'ticket.interpark.com', 'nol.yanolja.com', 'ticket.melon.com'].includes(u.hostname)) return null
    u.protocol = 'https:'
    return u.href
  } catch { return null }
}
export function parseKopis(xml, expectedId) {
  const rows = records(xml)
  if (rows.length !== 1) throw new Error('KOPIS detail count mismatch')
  const e = rows[0], id = field(e, 'mt20id')
  if (id !== expectedId) throw new Error('KOPIS detail ID mismatch')
  const source = kopisSource(id)
  if (field(e, 'genrenm') !== '대중음악') throw new Error('Not a popular music performance')
  const title = field(e, 'prfnm'), venue = field(e, 'fcltynm'), area = field(e, 'area')
  if (!title || !venue || !area) throw new Error('KOPIS event fields missing')
  if (!/^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청북|충청남|전라북|전북|전라남|경상북|경상남|제주)/.test(area)) throw new Error('Korean region not confirmed')
  const p = basePayload(title, source, '출처: (재)예술경영지원센터 공연예술통합전산망(KOPIS)')
  p.starts_on = day(field(e, 'prfpdfrom')); p.ends_on = day(field(e, 'prfpdto'))
  if (p.ends_on < p.starts_on) throw new Error('Invalid KOPIS date range')
  p.venue = venue; p.city = area; p.country_code = 'KR'
  p.format = field(e, 'festival') === 'Y' ? 'festival' : 'solo'
  p.ticket.price_description = field(e, 'pcseguidance') || null
  p.booking_links = [...e.querySelectorAll('relates > relate')].map(r => ({ label: field(r, 'relatenm'), url: bookingLink(field(r, 'relateurl')) })).filter(r => r.url)
  p.ticket.booking_url = p.booking_links.length === 1 ? p.booking_links[0].url : null
  p.discovered_artists = [...new Set(field(e, 'prfcast').split(/[,，\n]/).map(n => n.trim()).filter(Boolean))].map(n => discoveredArtist(n, source)).filter(Boolean)
  p.kopis_id = id
  // API registration/update timestamps and performance times are not announcements or sale times.
  return candidate(source, p, [...new Set(p.discovered_artists.map(a => a.key).filter(Boolean))],
    ['KOPIS 발견 후보: 대상 장르·출연진·공식 발표 검수 필요', '일반 예매 시각은 주최사·예매처 공식 공지로 보완'])
}
const shift = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
export function kopisWindows(start, end) {
  start = day(start); end = day(end)
  if (end < start || Date.parse(end) - Date.parse(start) > 365 * 86400000) throw new Error('Invalid KOPIS discovery range (maximum 366 days)')
  const windows = []
  for (let from = start; from <= end; from = shift(from, 31)) windows.push({ start: from, end: shift(from, 30) < end ? shift(from, 30) : end })
  return windows
}
export async function collectKopis({ serviceKey = process.env.KOPIS_SERVICE_KEY, fetcher = fetch, sleep = pause,
  today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }), end = shift(today, 179),
  slot = Math.floor(Date.now() / 3600000), maxDetails = 100, maxListRequests = 30 } = {}) {
  if (!serviceKey?.trim()) throw new Error('KOPIS_SERVICE_KEY missing')
  if (!Number.isInteger(maxDetails) || maxDetails < 1 || maxDetails > 100 || !Number.isInteger(slot) || slot < 0) throw new Error('Invalid KOPIS collection budget')
  const candidates = [], failures = [], excluded = [], warnings = [], ids = new Set()
  let requests = 0
  const get = async (id, params = {}) => {
    const url = new URL(id ? `${api}/${id}` : api)
    url.search = new URLSearchParams({ service: serviceKey, ...params }).toString()
    await sleep(1000)
    // Sanitize provider/network errors: URLs contain the secret key.
    try { return await getText(url.href, (u, options) => fetcher(u, { ...options, signal: AbortSignal.timeout(10000) })) }
    catch { throw new Error('KOPIS request failed (network/HTTP/response limit)') }
  }
  for (const window of kopisWindows(today, end)) {
    for (let page = 1; ; page++) {
      if (++requests > maxListRequests) throw new Error('KOPIS listing budget exceeded: narrow the date range')
      const rows = records(await get(null, { stdate: window.start.replaceAll('-', ''), eddate: window.end.replaceAll('-', ''), cpage: String(page), rows: '100', shcate: 'CCCD' }))
      if (rows.length > 100) throw new Error('KOPIS listing page too large')
      for (const e of rows) { const id = field(e, 'mt20id'); kopisSource(id); ids.add(id) }
      if (rows.length < 100) break
    }
  }
  // Bounded batches fit the ingestion RPC. Rotate across all discovered IDs rather than starving later pages.
  const all = [...ids].sort(), batches = Math.max(1, Math.ceil(all.length / maxDetails)), offset = (slot % batches) * maxDetails
  const selected = all.slice(offset, offset + maxDetails)
  if (batches > 1) warnings.push(`상세 조회 ${offset + 1}–${offset + selected.length}/${all.length}; ${batches}개 실행 슬롯 순환. 전체 상세 갱신은 최소 ${batches}회 실행 필요`)
  let consecutiveFailures = 0, attemptedDetails = 0
  for (const id of selected) {
    attemptedDetails++
    try {
      candidates.push(parseKopis(await get(id), id)); consecutiveFailures = 0
    } catch (error) {
      failures.push({ source_url: kopisSource(id), error: error.message })
      if (++consecutiveFailures === 3) {
        failures.push({ source_url: 'https://www.kopis.or.kr', error: 'KOPIS repeated detail failures: remaining requests stopped' })
        break
      }
    }
  }
  return { candidates, failures, excluded, warnings, discovery_count: all.length, detail_count: attemptedDetails, date_range: { start: today, end } }
}
