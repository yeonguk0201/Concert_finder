import { createHash } from 'node:crypto'
import { getText, pause } from './collection-http.mjs'
import { matchArtist, normalizeName } from './catalog-policy.mjs'
import { musicbrainzArtist } from '../supabase/functions/_shared/musicbrainz-data.mjs'

// An event's cast is evidence of a credit, not proof of nationality or genre.
export function discoveredArtist(name, sourceUrl, profileUrl = null) {
  const clean = typeof name === 'string' ? name.normalize('NFKC').replace(/\s+/g, ' ').trim() : null
  if (!clean || clean.length > 200) return null
  const reviewed = matchArtist(clean)
  return { name: clean, source_url: sourceUrl, profile_url: profileUrl, key: reviewed?.key ?? null }
}
export function artistNames(value) {
  return [...new Set([value, ...[...value.matchAll(/\(([^)]+)\)/g)].map(m => m[1]), value.replace(/\s*\([^)]*\)/g, '').trim()].filter(Boolean))]
}
export function musicbrainzMatches(data, name) {
  const names = artistNames(name).map(normalizeName)
  return (data.artists ?? []).map(musicbrainzArtist).filter(Boolean)
    .filter(a => [a.name, ...a.aliases].some(n => names.includes(normalizeName(n))))
    .map(a => ({ ...a, aliases: [...new Set([...a.aliases, name])].filter(n => n !== a.name).slice(0, 50), truncated: (data.count ?? 0) > 25 }))
}
export function createArtistResolver({ cache = {}, fetcher = fetch, sleep = pause, maxRequests = 25, onCacheChanged = async () => {} } = {}) {
  let lastRequest = 0
  let consecutiveFailures = 0
  let requests = 0
  return async name => {
    const cacheKey = createHash('sha256').update(normalizeName(name)).digest('hex')
    if (cache[cacheKey]?.expires_at > Date.now()) return cache[cacheKey].matches
    if (requests >= maxRequests) throw new Error('ARTIST_LOOKUP_BUDGET')
    if (consecutiveFailures >= 2) throw new Error('Artist provider unavailable for this run')
    // One application request per second, including retries. Failures leave credits intact.
    await sleep(Math.max(0, 1100 - (Date.now() - lastRequest)))
    lastRequest = Date.now()
    requests++
    const escaped = artistNames(name).map(n => `artist:"${n.replace(/[\\"]/g, '\\$&')}"`).join(' OR ')
    const url = `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(escaped)}&fmt=json&limit=25`
    const identifiedFetch = (u, options) => fetcher(u, { ...options, signal: AbortSignal.timeout(5000), headers: { ...options.headers, 'User-Agent': 'EncoreCatalog/0.3 (https://github.com/yeonguk0201/concert-finder)' } })
    let matches
    try { matches = musicbrainzMatches(JSON.parse(await getText(url, identifiedFetch)), name); consecutiveFailures = 0 }
    catch (error) { consecutiveFailures++; throw error }
    cache[cacheKey] = { expires_at: Date.now() + 7 * 86400000, matches }
    await onCacheChanged()
    return matches
  }
}
export async function enrichArtists(result, resolve) {
  const identities = new Map(), lookedUp = new Map()
  for (const row of result.candidates) {
    for (const credit of row.payload.discovered_artists ?? []) {
      if (credit.key || !credit.name) continue
      const key = normalizeName(credit.name)
      if (!lookedUp.has(key)) {
        try { lookedUp.set(key, { matches: await resolve(credit.name) }) }
        catch (error) { lookedUp.set(key, { matches: [], error: error.message === 'ARTIST_LOOKUP_BUDGET' ? '이번 실행의 아티스트 조회 한도 도달: 다음 실행에서 보완' : '아티스트 검색 연결 실패' }) }
      }
      const lookup = lookedUp.get(key)
      credit.matches = lookup.matches
      if (lookup.matches.length === 1 && lookup.matches[0].country && !lookup.matches[0].truncated) {
        const identity = lookup.matches[0]
        credit.key = identity.key
        identities.set(identity.key, identity)
        row.payload.artist_keys = [...new Set([...row.payload.artist_keys, identity.key])]
      } else credit.reason = lookup.error ?? (lookup.matches.length > 1 ? '동명이인: 식별자 선택 필요' : '신원·국적 확인 필요')
    }
    if (row.payload.discovered_artists?.some(a => !a.key)) row.payload.review_reasons.push('미연결 출연진이 있습니다. 이름은 보존되며 신원 확인 후 연결하세요.')
  }
  return [...identities.values()]
}
