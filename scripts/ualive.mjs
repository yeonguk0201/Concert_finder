import { JSDOM } from 'jsdom'
import { createHash } from 'node:crypto'

export const origin = 'https://ualive.com'
export function concertLinks(html) {
  const document = new JSDOM(html).window.document
  return [...new Set([...document.querySelectorAll('a[href]')].map(a => new URL(a.getAttribute('href'), origin)).filter(u => u.origin === origin && /^\/concerts\/\d+$/.test(u.pathname)).map(u => u.href))]
}
export function parseConcert(html, url) {
  const source = new URL(url)
  if (source.origin !== origin || !/^\/concerts\/\d+$/.test(source.pathname)) throw new Error('Unsupported source URL')
  const document = new JSDOM(html).window.document
  const title = document.querySelector('h1')?.textContent.trim()
  const section = [...document.querySelectorAll('h2')].find(h => h.textContent.trim() === '공연 시간')?.closest('section')
  const dates = [...(section?.textContent ?? '').matchAll(/(\d{4})\.\s*(\d{2})\.\s*(\d{2})\.\([^)]*\)\s*(\d{2}:\d{2})/g)]
  if (!title || !dates.length) throw new Error('Source layout changed or session time missing')
  const sessions = dates.map(d => ({ label: `${d[1]}-${d[2]}-${d[3]} ${d[4]}`, starts_on: `${d[1]}-${d[2]}-${d[3]}`, starts_at: `${d[1]}-${d[2]}-${d[3]}T${d[4]}:00+09:00` }))
  if (sessions.some(s => !Number.isFinite(Date.parse(s.starts_at)) || new Date(s.starts_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) !== s.starts_on)) throw new Error('Invalid session date')
  sessions.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const venue = [...document.querySelectorAll('a[href]')].find(a => a.href.startsWith('https://naver.me/'))?.textContent.replace(/↗/g, '').trim() ?? null
  const booking = [...document.querySelectorAll('a[href]')].find(a => /^https:\/\/(?:m\.)?ticketlink\.co\.kr\/product\/\d+$/.test(a.href))?.href ?? null
  const payload = { title, format: 'solo', city: null, venue, starts_on: sessions[0].starts_on, ends_on: sessions.at(-1).starts_on,
    announced_on: null, announced_at: null, announcement_verified: false, cancelled: false, status: 'review',
    sources: [{ url: source.href, label: 'ualive 주최사', verified_at: null }], band_ids: [], sessions,
    ticket: { opens_at: null, booking_url: booking, price_description: null } }
  return { source_url: source.href, payload, content_hash: createHash('sha256').update(JSON.stringify(payload)).digest('hex') }
}
export async function collect(fetcher = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const get = async url => {
    const response = await fetcher(url, { signal: AbortSignal.timeout(20000), redirect: 'error', headers: { 'User-Agent': 'EncoreCatalog/0.1 (official concert metadata review)' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const html = await response.text()
    if (html.length > 2000000) throw new Error('Response too large')
    return html
  }
  // Fail closed if robots changes; no internal APIs or login endpoints are used.
  const robots = await get(`${origin}/robots.txt`)
  if (/Disallow:\s*\/(?:concerts[^\s]*|\s*$)/mi.test(robots)) throw new Error('Concert collection disallowed by robots.txt')
  const links = concertLinks(await get(`${origin}/concerts`))
  if (!links.length || links.length > 50) throw new Error('Unexpected listing size')
  const candidates = [], failures = []
  for (const url of links) {
    await pause(1000)
    try { candidates.push(parseConcert(await get(url), url)) }
    catch (error) { failures.push({ source_url: url, error: error.message }) }
  }
  return { candidates, failures }
}
