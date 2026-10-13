import { JSDOM } from 'jsdom'
import { candidate, basePayload } from './official-adapters.mjs'
import { discoveredArtist } from './artist-discovery.mjs'
import { getText, checkRobots, pause } from './collection-http.mjs'

const origin = 'https://ticket.yes24.com'
const listings = [
  `${origin}/New/Genre/GenreList.aspx?genretype=2&genre=15463`,
  `${origin}/New/Genre/GenreMain.aspx?genre=15456&Gcode=009_202_001`,
]
export function yes24Url(value, base = origin) {
  try {
    const u = new URL(value, base)
    if (u.origin !== origin || u.username || u.password || !/^\/(?:English\/)?Perf\/\d+\/?$/i.test(u.pathname)) return null
    return `${origin}/Perf/${u.pathname.match(/\d+/)[0]}`
  } catch { return null }
}
export function yes24Links(html, base = origin) {
  const d = new JSDOM(html).window.document
  return [...new Set([...d.querySelectorAll('a[href]')].map(a => yes24Url(a.getAttribute('href'), base)).filter(Boolean))]
}
function schemaEvents(document) {
  const visit = value => {
    if (Array.isArray(value)) return value.flatMap(visit)
    if (!value || typeof value !== 'object') return []
    if ([value['@type']].flat().some(t => ['Event', 'MusicEvent'].includes(t))) return [value]
    return visit(value['@graph'])
  }
  return [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(s => visit(JSON.parse(s.textContent)))
}
function date(value) {
  // Date-only is not midnight or the performance time.
  const day = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(value ?? '')?.[1]
  if (!day || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) throw new Error('Invalid event date')
  return day
}
export function parseYes24(html, url) {
  const canonical = yes24Url(url)
  if (canonical !== url) throw new Error('Unsupported source URL')
  const document = new JSDOM(html).window.document
  const events = schemaEvents(document)
  if (events.length !== 1 || !events[0].name || !events[0].location?.name) throw new Error('Ticket event layout changed')
  const event = events[0], address = event.location.address
  if ((typeof address?.addressCountry === 'string' ? address.addressCountry : address?.addressCountry?.name) !== 'KR') throw new Error('Korean venue not confirmed')
  const payload = basePayload(event.name.trim(), canonical, 'YES24 공식 예매처')
  payload.starts_on = date(event.startDate); payload.ends_on = date(event.endDate ?? event.startDate)
  if (payload.ends_on < payload.starts_on) throw new Error('Invalid event range')
  payload.venue = event.location.name; payload.city = address.addressRegion ?? null
  const performers = [event.performer ?? []].flat()
  payload.discovered_artists = [...new Set(performers.flatMap(p => [p.name ?? []].flat()).filter(n => typeof n === 'string'))].map(name => discoveredArtist(name, canonical)).filter(Boolean)
  const keys = [...new Set(payload.discovered_artists.map(a => a.key).filter(Boolean))]
  payload.ticket.booking_url = canonical
  // Offers.validFrom is not reliably the general sale time (may be presale).
  return candidate(canonical, payload, keys, ['대상 장르·출연진 신원·공연 형식 검수 필요', '일반 예매 시각·공식 발표일은 별도 확인'])
}
export async function collectYes24(fetcher = fetch, sleep = pause) {
  const candidates = [], failures = [], excluded = [], warnings = []
  const robots = await getText(`${origin}/robots.txt`, fetcher, true)
  if (/<html/i.test(robots)) warnings.push('YES24 robots.txt가 HTML 오류 페이지를 반환함: 공개 HTML만 읽음')
  const discovered = new Set()
  for (const listing of listings) {
    try {
      checkRobots(robots, [new URL(listing).pathname])
      await sleep(1000)
      for (const link of yes24Links(await getText(listing, fetcher))) discovered.add(link)
    } catch (error) { failures.push({ source_url: listing, error: error.message }) }
  }
  // Secondary index supplies links only. No dates, prices, biographies or images are copied.
  try {
    const jrobots = await getText('https://j-live.kr/robots.txt', fetcher, true)
    checkRobots(jrobots, ['/calendar/'])
    const links = yes24Links(await getText('https://j-live.kr/calendar/', fetcher), 'https://j-live.kr/calendar/')
    for (const link of links) discovered.add(link)
    warnings.push(`J-LIVE 발견 경로: YES24 링크 ${links.length}개; NOL 등 미지원 예매처는 수집하지 않음`)
  } catch (error) { failures.push({ source_url: 'https://j-live.kr/calendar/', error: error.message }) }
  if (!discovered.size || discovered.size > 100) throw new Error(`Unexpected ticket listing size: ${discovered.size}`)
  for (const url of discovered) {
    await sleep(1000)
    try { checkRobots(robots, [new URL(url).pathname]); candidates.push(parseYes24(await getText(url, fetcher), url)) }
    catch (error) { failures.push({ source_url: url, error: error.message }) }
  }
  return { candidates, failures, excluded, warnings, discovery_count: discovered.size }
}
