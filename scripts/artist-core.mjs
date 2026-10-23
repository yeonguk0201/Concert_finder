import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { selectRanked, lastfm } from '../skills/concert-artist-import/scripts/prepare-artists.mjs'

export const COMPOSITION = { japanese_solo_unit: 80, japanese_rock_band: 60, overseas_rock_band: 60 }
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const WEEK = 7 * 86400000
const normalize = value => value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
const fresh = (value, now) => Number.isFinite(Date.parse(value)) && now >= Date.parse(value) && now - Date.parse(value) < WEEK
const safeSource = value => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash } catch { return false }
}

// Chart position discovers candidates. Only artist.getInfo listeners ranks a verified identity.
export function chartCandidates(data, { method, country = null, sourceUrl, checkedAt }) {
  if (!['chart.getTopArtists', 'geo.getTopArtists'].includes(method) || !safeSource(sourceUrl)
    || !Number.isFinite(Date.parse(checkedAt)) || (method === 'geo.getTopArtists' && !country)) throw Error('CHART_SOURCE_INVALID')
  const rows = (method === 'chart.getTopArtists' ? data.artists : data.topartists)?.artist
  if (!Array.isArray(rows)) throw Error('CHART_RESPONSE_INVALID')
  return rows.filter(row => typeof row.name === 'string' && row.name.trim()).map(row => ({
    name: row.name, id: UUID.test(row.mbid ?? '') ? row.mbid.toLowerCase() : null,
    discovery: { method, listeningRegion: country, sourceUrl, checkedAt },
    identityVerified: false, popularity: { status: 'not_checked' },
  }))
}

export async function discoverCharts(key, { fetcher = fetch, pause = ms => new Promise(r => setTimeout(r, ms)), pages = 2 } = {}) {
  if (!key) throw Error('LASTFM_API_KEY_REQUIRED')
  if (!Number.isInteger(pages) || pages < 1 || pages > 10) throw Error('CHART_BUDGET_INVALID')
  const rows = []
  for (const country of [null, 'Japan', 'South Korea']) for (let page = 1; page <= pages; page++) {
    const method = country ? 'geo.getTopArtists' : 'chart.getTopArtists'
    const url = new URL('https://ws.audioscrobbler.com/2.0/')
    // Last.fm rejects "South Korea"; its geo API uses the ISO country name.
    // Keep the listening-region label independent from the provider parameter.
    const providerCountry = country === 'South Korea' ? 'Korea, Republic of' : country
    url.search = new URLSearchParams({ method, api_key: key, format: 'json', limit: '100', page: String(page), ...(country ? { country: providerCountry } : {}) }).toString()
    await pause(1100)
    let response
    try { response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(15000) }) } catch { throw Error('LASTFM_NETWORK_FAILED') }
    if (!response.ok) throw Error(`LASTFM_HTTP_${response.status}`)
    const data = await response.json()
    if (data.error) throw Error([10, 26].includes(Number(data.error)) ? 'LASTFM_KEY_REJECTED' : 'LASTFM_PROVIDER_FAILED')
    rows.push(...chartCandidates(data, { method, country, sourceUrl: `https://www.last.fm/api/show/${method}`, checkedAt: new Date().toISOString() }))
  }
  return rows // No biography, image, or key-bearing URL is returned or persisted.
}

export async function enrichCoreMetrics(rows, key, { now = Date.now(), lookup = lastfm } = {}) {
  const result = []
  for (const row of rows) {
    if (!UUID.test(row.id ?? '')) { result.push({ ...row, popularity: { status: 'identity_unresolved' } }); continue }
    if (row.popularity?.status === 'ranked' && row.popularity.source === 'lastfm' && row.popularity.metric === 'listeners'
      && Number.isSafeInteger(row.popularity.listeners) && row.popularity.listeners >= 0
      && row.popularity.mbid === row.id && fresh(row.popularity.checked_at, now)) { result.push(row); continue }
    if (!key) { result.push({ ...row, popularity: { status: 'key_required' } }); continue }
    // Existing lookup validates the response MBID and sanitizes metrics; fatal failures stop the batch.
    result.push({ ...row, popularity: await lookup(row, key) })
  }
  return result
}

function verified(row) {
  const v = row.validation
  return UUID.test(row.id ?? '') && v && ['identityMatched', 'countryMatched', 'genreMatched', 'scopeMatched'].every(k => v[k] === true)
    && Array.isArray(v.sources) && v.sources.length > 0 && v.sources.every(s => safeSource(s.url) && s.summary?.trim())
    && Object.hasOwn(COMPOSITION, row.bucket)
    && (row.bucket === 'overseas_rock_band' ? row.country !== 'JP' && row.country !== 'KR' && row.type === 'Group'
      : row.country === 'JP' && (row.bucket !== 'japanese_rock_band' || row.type === 'Group'))
}

export function planCore(rows, nominations, catalog, now = Date.now()) {
  const seen = new Set()
  for (const row of rows) if (row.id) { if (seen.has(row.id)) throw Error('DUPLICATE_CORE_ID'); seen.add(row.id) }
  const mandatory = nominations.map(n => {
    const band = n.musicBrainzId ? catalog.find(b => b.musicbrainz_id === n.musicBrainzId) : null
    const row = n.musicBrainzId ? rows.find(r => r.id === n.musicBrainzId) : null
    return { ...n, bandId: band?.id ?? null, registered: Boolean(band), approved: band?.curation_status === 'approved',
      protected: ['held', 'excluded'].includes(band?.curation_status), identityVerified: Boolean(row && verified(row)),
      metricStatus: row?.popularity?.status ?? 'not_checked', selectionBasis: 'user_nominated',
      // Names are hints, never authority to merge or register an external identity.
      nameCandidates: band ? [] : catalog.filter(b => [b.name, ...b.aliases].some(a => [n.name, ...n.expectedAliases].some(x => normalize(a) === normalize(x)))).map(b => b.id),
      missingSearchNames: band ? n.expectedAliases.filter(a => ![band.name, ...band.aliases].some(x => normalize(a) === normalize(x))) : n.expectedAliases }
  })
  const nominatedIds = new Set(mandatory.map(n => n.musicBrainzId).filter(Boolean))
  const eligible = rows.filter(row => verified(row) && !catalog.some(b => b.musicbrainz_id === row.id && ['held', 'excluded'].includes(b.curation_status)))
  const ranked = selectRanked(eligible.filter(row => row.popularity?.source === 'lastfm' && row.popularity?.metric === 'listeners'
    && fresh(row.popularity?.checked_at, now)), eligible.length)
  const selected = []
  for (const [bucket, quota] of Object.entries(COMPOSITION)) {
    const named = mandatory.filter(n => n.bucket === bucket)
    if (named.length > quota) throw Error('MANDATORY_QUOTA_EXCEEDED')
    // Reserve the named slots even while ID/metrics are unresolved; never drop the four.
    selected.push(...named.map(n => ({ ...n, popularityRanked: false })))
    selected.push(...ranked.filter(row => row.bucket === bucket && !nominatedIds.has(row.id)).slice(0, quota - named.length)
      .map(row => ({ ...row, musicBrainzId: row.id, selectionBasis: 'lastfm_listeners', popularityRanked: true })))
  }
  return { version: 1, policy: 'core200-v1', checkedAt: new Date(now).toISOString(), target: 200, composition: COMPOSITION,
    selectionMeaning: '편성안 기준 후보 풀 내 Last.fm 청취자 정렬과 사용자 지명 목록. 검증된 전세계 인기 상위 200위가 아님.',
    selected, mandatory, unfilled: 200 - selected.length, complete: false,
    priorityMusicBrainzIds: [...new Set(selected.map(row => row.musicBrainzId).filter(id => UUID.test(id ?? '')))],
    limitations: ['등록·승인·공개 검색의 동일 ID 확인 전에는 완료가 아님', 'geo 차트는 청취 지역이며 아티스트 국적이 아님', '태그 수는 listeners가 아님', '사진은 완료보다 후순위'] }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = process.argv.slice(2)
  const arg = name => args.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3)
  const read = async file => JSON.parse(await readFile(file, 'utf8'))
  if (command === 'discover') {
    if (!arg('output')) throw Error('OUTPUT_REQUIRED')
    const rows = await discoverCharts(process.env.LASTFM_API_KEY, { pages: Number(arg('pages') ?? 2) })
    await mkdir(dirname(arg('output')), { recursive: true }); await writeFile(arg('output'), JSON.stringify(rows, null, 2) + '\n', 'utf8')
    console.log(JSON.stringify({ discovered: rows.length, identityVerified: 0, registered: 0 })); process.exit(0)
  }
  if (command !== 'plan' || !arg('catalog') || !arg('output')) throw Error('Usage: artist-core.mjs plan --catalog=... --output=... [--candidates=...]')
  const nominations = await read(new URL('../supabase/manual/core-artists.json', import.meta.url))
  const candidates = arg('candidates') ? await read(arg('candidates')) : []
  const result = planCore(candidates, nominations.artists, await read(arg('catalog')))
  await mkdir(dirname(arg('output')), { recursive: true }); await writeFile(arg('output'), JSON.stringify(result, null, 2) + '\n', 'utf8')
  console.log(JSON.stringify({ selected: result.selected.length, unfilled: result.unfilled, mandatory: result.mandatory.length, complete: false }))
}
