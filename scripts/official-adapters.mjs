import { JSDOM } from 'jsdom'
import { createHash } from 'node:crypto'
import { artwork, matchProfile } from './catalog-policy.mjs'
import { getText, checkRobots, pause } from './collection-http.mjs'

export function candidate(source, payload, artistKeys = [], reasons = []) {
  return { source_url: source, payload: { ...payload, artist_keys: artistKeys, review_reasons: reasons }, content_hash: createHash('sha256').update(JSON.stringify({ ...payload, artist_keys: artistKeys, review_reasons: reasons })).digest('hex') }
}
export function basePayload(title, source, label) {
  return { title, format: 'solo', city: null, venue: null, starts_on: null, ends_on: null, announced_on: null, announced_at: null,
    announcement_verified: false, cancelled: false, status: 'review', sources: [{ url: source, label, verified_at: null }], band_ids: [], sessions: [],
    ticket: { opens_at: null, booking_url: null, price_description: null } }
}
function nextData(document) {
  return JSON.parse(document.querySelector('#__NEXT_DATA__')?.textContent ?? '{}')?.props?.apolloState?.data
}
function sourceUrl(url, origin, path) {
  const source = new URL(url)
  if (source.origin !== origin || !path.test(source.pathname) || source.search || source.hash) throw new Error('Unsupported source URL')
  return source
}
function day(value) {
  if (!Number.isFinite(Date.parse(value))) throw new Error('Invalid performance date')
  return new Date(value).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}
export function parseMintpaper(html, url) {
  const source = sourceUrl(url, 'https://www.mintpaper.co.kr', /^\/festivals\/\d+$/)
  const document = new JSDOM(html).window.document, data = nextData(document)
  const festival = data?.[`Festival:${source.pathname.split('/').at(-1)}`]
  if (!festival?.title || !festival.place || !Array.isArray(festival.lineup)) throw new Error('Festival layout changed')
  const payload = basePayload(festival.title, source.href, 'Mint Paper 주최사')
  payload.format = 'festival'; payload.venue = festival.place
  payload.starts_on = day(festival.startDate); payload.ends_on = day(festival.endDate)
  if (payload.ends_on < payload.starts_on) throw new Error('Invalid date range')
  const keys = [...new Set(festival.lineup.flatMap(group => (group.banners ?? []).map(b => matchProfile(b.link)?.key).filter(Boolean)))]
  payload.artwork = artwork(data[festival.coverImage?.__ref]?.url, source.href, 'Festival.coverImage: 공연 ID에 연결된 커버')
  return candidate(source.href, payload, keys, ['혼합 페스티벌: 확인된 대상 밴드만 연결; 개별 출연일은 검수', ...(!keys.length ? ['대상 아티스트 미확정'] : [])])
}
export function parseRadwimps(html, url) {
  const source = sourceUrl(url, 'https://radwimps.jp', /^\/live\/\d+\/$/)
  const document = new JSDOM(html).window.document
  const title = document.querySelector('.p-article__head .title')?.textContent.trim()
  const body = document.querySelector('.p-article__body')
  if (!title || !body) throw new Error('Artist live layout changed')
  if (!/RADWIMPS/i.test(`${title} ${body.textContent}`)) return null // solo member activity is not a band appearance
  // Do not associate Japanese/global tour dates with a Korean city by proximity.
  const korea = /(?:Korea|Seoul|韓国|ソウル|Nanji Hangang Park)/i.test(body.textContent)
  if (!korea) return null
  const payload = basePayload(title, source.href, 'RADWIMPS 공식 LIVE')
  const announcement = document.querySelector('.p-article__head time')?.getAttribute('datetime')
  if (/^\d{4}-\d{2}-\d{2}$/.test(announcement ?? '')) payload.announced_on = announcement
  return candidate(source.href, payload, ['radwimps'], ['한국 언급 확인; 회차·공연일·장소·출연일 원문 검수 필요'])
}
export async function collectAdapter(name, fetcher = fetch, sleep = pause) {
  const mint = name === 'mintpaper'
  if (!mint && name !== 'radwimps') throw new Error('Unknown adapter')
  const origin = mint ? 'https://www.mintpaper.co.kr' : 'https://radwimps.jp'
  const path = mint ? '/festivals' : '/live/'
  checkRobots(await getText(`${origin}/robots.txt`, fetcher, true), [path, mint ? '/festivals/172' : '/live/15735/'])
  const document = new JSDOM(await getText(origin + path, fetcher)).window.document
  const pattern = mint ? /^\/festivals\/\d+$/ : /^\/live\/\d+\/$/
  const links = [...new Set([...document.querySelectorAll('a[href]')].map(a => new URL(a.getAttribute('href'), origin)).filter(u => u.origin === origin && pattern.test(u.pathname) && !u.search && !u.hash).map(u => u.href))]
  if (!links.length || links.length > 50) throw new Error('Unexpected listing size')
  const candidates = [], failures = [], excluded = []
  for (const url of links) {
    await sleep(1000)
    try {
      const row = (mint ? parseMintpaper : parseRadwimps)(await getText(url, fetcher), url)
      if (row) candidates.push(row); else excluded.push({ source_url: url, reason: '한국 공연 근거 없음 / 투어 전용 페이지 미지원' })
    } catch (error) { failures.push({ source_url: url, error: error.message }) }
  }
  return { candidates, failures, excluded }
}
