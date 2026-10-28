import { JSDOM } from 'jsdom'
import { candidate } from './official-adapters.mjs'
import { bookingWindows, nolProduct, nolWorldProduct, parseNolProduct } from './nol.mjs'
import { getText, checkRobots, pause } from './collection-http.mjs'

export function reissueNotice(value) {
  try {
    const u = new URL(value)
    return u.origin === 'https://reissuerecords.net' && !u.username && !u.password && !u.search && !u.hash
      && /^\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9-]+\/$/.test(u.pathname) ? u.href : null
  } catch { return null }
}
const norm = s => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
function visible(html) {
  const d = new JSDOM(html).window.document
  for (const n of d.querySelectorAll('script,style,nav,footer,[hidden],[aria-hidden="true"]')) n.remove()
  for (const n of d.querySelectorAll('br')) n.replaceWith('\n')
  for (const n of d.querySelectorAll('p,li,div,section,tr,h1,h2,h3,h4,blockquote')) n.append('\n')
  return d
}
function sessions(element) {
  // Only explicit labelled performance datetimes in a Korea section are sessions.
  const result = []
  for (const line of element.textContent.split('\n')) {
    if (!/공연|회차|공연일|일시|show|performance|公演/i.test(line) || /예매|sale/i.test(line)) continue
    for (const m of line.matchAll(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})\s+(\d{1,2}):(\d{2})/g)) {
      const day = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
      if (!Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day || +m[4] > 23 || +m[5] > 59) throw Error('REISSUE_SESSION_INVALID')
      result.push({ starts_on: day, starts_at: `${day}T${m[4].padStart(2, '0')}:${m[5]}:00+09:00`, label: '공식 회차' })
    }
  }
  return [...new Map(result.map(s => [s.starts_at, s])).values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}

function tourDays(element, entry) {
  let year = null
  const days = []
  for (const raw of element.textContent.split('\n')) {
    const line = raw.trim(), header = line.match(/^(\d{4})\s*\|?$/)
    if (header) { year = header[1]; continue }
    const row = line.match(/^(\d{2})\/(\d{2})\([^)]*\)\s+(.+)$/)
    if (!row || !entry.tourCity || !norm(row[3]).includes(norm(entry.tourCity))) continue
    if (!year || !(entry.venueNames ?? [entry.venue]).some(v => norm(row[3]).includes(norm(v)))) throw Error('REISSUE_TOUR_ROW_UNCONFIRMED')
    const day = `${year}-${row[1]}-${row[2]}`
    if (!Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) throw Error('REISSUE_SESSION_INVALID')
    days.push(day)
  }
  return [...new Set(days)].sort()
}

// Entries are reviewed source links, not arbitrary HTML selectors or write commands.
export function validateReissueLinks(entries) {
  if (!Array.isArray(entries) || entries.length > 40 || new Set(entries.map(e => e.announcementUrl)).size !== entries.length
    || entries.some(e => reissueNotice(e.announcementUrl) !== e.announcementUrl || nolProduct(e.productUrl) !== e.productUrl
      || !/^mb:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(e.artistKey ?? '')
      || !Array.isArray(e.artistNames) || !e.artistNames.length || e.artistNames.some(n => typeof n !== 'string' || n.trim().length < 2)
      || typeof e.city !== 'string' || !e.city.trim() || typeof e.venue !== 'string' || !e.venue.trim()
      || e.tourCity !== undefined && (typeof e.tourCity !== 'string' || !e.tourCity.trim())
      || e.venueNames !== undefined && (!Array.isArray(e.venueNames) || !e.venueNames.length || e.venueNames.some(n => typeof n !== 'string' || !n.trim()))
      || e.timezone !== 'Asia/Seoul')) throw Error('REISSUE_LINKS_INVALID')
  return entries
}

export function linkReissueNol(announcementHtml, productHtml, entry, { checkedAt = new Date().toISOString(), liveVerified = false } = {}) {
  validateReissueLinks([entry])
  const d = visible(announcementHtml), productDocument = visible(productHtml)
  const article = d.querySelector('article,main') ?? d.body
  // The live WordPress detail puts its title in a sibling header. Scope the
  // fallback to that same detail, so a site logo or unrelated heading cannot win.
  const detail = article.closest('.single.single_news.single_detail')
  const headings = [...article.querySelectorAll('h1')].filter(h => h.textContent.trim())
  const siblingHeadings = detail ? [...detail.querySelectorAll(':scope > header .single_header h1')].filter(h => h.textContent.trim()) : []
  const heading = headings.length === 1 ? headings[0] : headings.length === 0 && siblingHeadings.length === 1 ? siblingHeadings[0] : null
  if (!heading) throw Error('REISSUE_LAYOUT_CHANGED')
  const product = parseNolProduct(productHtml, entry.productUrl)
  const reasons = [], normalizedNames = entry.artistNames.map(norm)
  if (![heading.textContent + article.textContent, productDocument.querySelector('h1')?.textContent ?? ''].every(text => normalizedNames.some(n => norm(text).includes(n)))) reasons.push('ARTIST_IDENTITY_UNCONFIRMED')
  const internationalLinks = [...productDocument.querySelectorAll('a[href]')].map(a => {
    try { return nolWorldProduct(new URL(a.getAttribute('href'), entry.productUrl).href) } catch { return null }
  }).filter(u => u && u.split('/').at(-1) === entry.productUrl.split('/').at(-1))
  if (![...article.querySelectorAll('a[href]')].some(a => {
    try {
      const url = new URL(a.getAttribute('href'), entry.announcementUrl).href
      return url === entry.productUrl || internationalLinks.includes(nolWorldProduct(url))
    } catch { return false }
  })) reasons.push('OFFICIAL_PRODUCT_LINK_MISSING')
  // The smallest explicitly labelled Korea block must independently contain city,
  // venue and all sessions. Global-tour dates outside it cannot leak into Korea.
  const sections = [...article.querySelectorAll('section')].filter(s => /Korea|韓国|한국/i.test(s.querySelector('h2,h3,h4')?.textContent ?? ''))
  const section = sections.length === 1 ? sections[0] : null
  const venueMatches = t => (entry.venueNames ?? [entry.venue]).some(v => norm(t).includes(norm(v)))
  const days = tourDays(article, entry)
  const venueConfirmed = (section ? venueMatches(section.textContent) : days.length > 0)
    && venueMatches(productDocument.body.textContent) && norm(productDocument.body.textContent).includes(norm(entry.city))
  if (!venueConfirmed) reasons.push('KOREA_VENUE_UNCONFIRMED')
  // A Korean booking host or a global tour's Seoul label does not establish the
  // venue's country. Use the actual, labelled venue block and its postal region.
  const venueBlocks = [...productDocument.querySelectorAll('section#venue')]
  const location = venueBlocks.length === 1 ? venueBlocks[0] : null
  const venueHeading = location?.querySelector('h3')?.textContent.trim()
  const regions = location ? [...location.querySelectorAll('span')].flatMap(n => {
    const region = n.textContent.trim().match(/^(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|충청북도|충청남도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)\s+/)?.[1]
    return region ? [region] : []
  }) : []
  const countryConfirmed = venueConfirmed && location?.querySelector('h2')?.textContent.trim() === '장소'
    && venueHeading && (entry.venueNames ?? [entry.venue]).some(v => norm(v) === norm(venueHeading))
    && regions.length === 1 && (norm(regions[0]) === norm(entry.city)
      || norm(regions[0].replace(/특별자치시$|특별자치도$|특별시$|광역시$|도$/, '')) === norm(entry.city))
  if (!countryConfirmed) reasons.push('KOREA_COUNTRY_UNCONFIRMED')
  const noticeShows = section ? sessions(section) : [], ticketShows = product.payload.sessions.length ? product.payload.sessions : sessions(productDocument.body)
  const daysMatch = days.length > 0 && JSON.stringify(days) === JSON.stringify([...new Set(ticketShows.map(s => s.starts_on))].sort())
  if (!ticketShows.length || !(noticeShows.length > 0 && JSON.stringify(noticeShows.map(s => s.starts_at)) === JSON.stringify(ticketShows.map(s => s.starts_at)) || daysMatch)) reasons.push('PERFORMANCE_SESSIONS_UNCONFIRMED')
  const shows = ticketShows
  if (shows.some(s => s.starts_on < product.payload.starts_on || s.starts_on > product.payload.ends_on)
    || shows[0]?.starts_on !== product.payload.starts_on || shows.at(-1)?.starts_on !== product.payload.ends_on) reasons.push('PERFORMANCE_RANGE_CONFLICT')
  const sale = section ? bookingWindows(section.textContent.split('\n').map(s => s.trim()).filter(Boolean), entry.announcementUrl) : { windows: [], conflict: false, problems: [] }
  const windows = [...sale.windows, ...product.payload.booking_windows]
  const general = [...new Set(windows.filter(w => w.kind === 'general').map(w => w.opens_at))]
  if (sale.conflict || product.payload.review_reasons.some(r => /충돌|혼합/.test(r)) || general.length !== 1) reasons.push('BOOKING_TIME_UNCONFIRMED')
  // An update timestamp is not the initial announcement. Ambiguous timestamps
  // also stay unverified, even if they happen to contain the same calendar day.
  const publicationTimes = [...article.querySelectorAll('time[datetime]')].filter(t =>
    !t.matches('[itemprop~="dateModified"],.updated,.modified')
    && !t.closest('[itemprop~="dateModified"],.updated,.modified'))
  const published = publicationTimes.length === 1 ? publicationTimes[0].getAttribute('datetime') : null
  const validPublication = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(published ?? '')
    && Number.isFinite(Date.parse(published)) && Date.parse(published) <= Date.parse(checkedAt)
  if (!validPublication) reasons.push('ANNOUNCEMENT_TIME_UNCONFIRMED')
  const text = article.textContent + productDocument.body.textContent
  const cancellation = /공연\s*취소|공연\s*연기|公演中止|公演延期|show\s*(?:cancelled|canceled|postponed)/i.test(text)
  if (cancellation) reasons.push('CANCELLATION_OR_POSTPONEMENT_REVIEW')
  // Production certification requires actual page + terms validation. Synthetic
  // fixtures and a successful network fetch cannot certify a production adapter.
  if (!liveVerified) reasons.push('LIVE_LAYOUT_AND_TERMS_UNVERIFIED')
  const payload = { ...product.payload, title: heading.textContent.trim(), artist_keys: [entry.artistKey],
    country_code: countryConfirmed ? 'KR' : null,
    city: venueConfirmed ? entry.city : null, venue: venueConfirmed ? entry.venue : null, sessions: shows,
    announced_at: validPublication ? published : null,
    announced_on: validPublication ? new Date(published).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) : null,
    announcement_verified: Boolean(validPublication && !reasons.length), cancelled: cancellation,
    booking_windows: windows, review_reasons: [...new Set(reasons)],
    sources: [{ url: entry.announcementUrl, label: 'Reissue 공식 공지', verified_at: reasons.length ? null : checkedAt },
      { url: entry.productUrl, label: 'NOL 공식 예매', verified_at: reasons.length ? null : checkedAt }],
    ticket: { ...product.payload.ticket, opens_at: general.length === 1 ? general[0] : null },
  }
  return candidate(entry.announcementUrl, payload, payload.artist_keys, payload.review_reasons)
}

export async function collectReissueNol(entries, { fetcher = fetch, sleep = pause } = {}) {
  validateReissueLinks(entries)
  const result = { candidates: [], failures: [], excluded: [] }
  if (!entries.length) return result
  // Fail closed on missing/HTML robots; no redirect, TLS bypass, browser scraping
  // or network retry using a different identity.
  for (const origin of ['https://reissuerecords.net', 'https://nol.yanolja.com']) {
    const robots = await getText(`${origin}/robots.txt`, fetcher)
    if (/<html/i.test(robots)) throw Error('REISSUE_NOL_ROBOTS_INVALID')
    checkRobots(robots, entries.map(e => new URL(origin.includes('reissue') ? e.announcementUrl : e.productUrl).pathname))
  }
  for (const entry of entries) {
    try {
      await sleep(1100); const announcement = await getText(entry.announcementUrl, fetcher)
      await sleep(1100); const product = await getText(entry.productUrl, fetcher)
      result.candidates.push(linkReissueNol(announcement, product, entry))
    } catch (error) { result.failures.push({ source_url: entry.announcementUrl, error: /^[A-Z_]+$/.test(error.message) ? error.message : 'REISSUE_NOL_FETCH_FAILED' }) }
  }
  return result
}
