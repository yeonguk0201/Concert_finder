import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { database, musicbrainz, validateManifest } from './import-artists.mjs'

const WEEK = 7 * 86400000
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const jpop = row => row.source_tags.some(t => ['j-pop', 'jpop', 'j pop'].includes(t))
const count = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null
const recent = time => Number.isFinite(Date.parse(time)) && Date.now() - Date.parse(time) >= 0 && Date.now() - Date.parse(time) < WEEK

export function popularity(row, data, now = new Date().toISOString()) {
  // Same names are not enough: Last.fm must return the requested MBID.
  if (!data?.artist || data.artist.mbid?.toLowerCase() !== row.id) return { status: 'identity_unresolved', checked_at: now }
  const listeners = count(data.artist.stats?.listeners)
  if (listeners === null) return { status: 'metric_missing', checked_at: now }
  return { status: 'ranked', source: 'lastfm', metric: 'listeners', listeners, mbid: row.id, checked_at: now }
}

export function selectRanked(rows, limit, jpopShare = 0.5) {
  const ordered = rows.filter(row => row.popularity?.status === 'ranked' && row.popularity.mbid === row.id
    && Number.isSafeInteger(row.popularity.listeners) && row.popularity.listeners >= 0)
    .sort((a, b) => b.popularity.listeners - a.popularity.listeners || a.id.localeCompare(b.id))
  const japanese = ordered.filter(jpop), rock = ordered.filter(row => !jpop(row))
  const jpopTarget = Math.round(limit * jpopShare)
  const chosen = [...japanese.slice(0, jpopTarget), ...rock.slice(0, limit - jpopTarget)]
  const ids = new Set(chosen.map(row => row.id))
  for (const row of ordered) {
    if (chosen.length >= limit) break
    if (!ids.has(row.id)) { chosen.push(row); ids.add(row.id) }
  }
  return chosen.sort((a, b) => b.popularity.listeners - a.popularity.listeners || a.id.localeCompare(b.id))
}

export function profileLinks(row, data, now = new Date().toISOString()) {
  if (data?.id !== row.id || !Array.isArray(data.relations)) throw new Error('PROFILE_IDENTITY_INVALID')
  const links = new Map()
  for (const relation of data.relations) {
    if (relation.ended === true || relation['target-type'] !== 'url') continue
    let url
    try { url = new URL(relation.url?.resource) } catch { continue }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)
      || /\.(local|internal|localhost|test)$/i.test(url.hostname)) continue
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    let platform
    if (host === 'open.spotify.com' && /^\/artist\/[a-zA-Z0-9]{22}\/?$/.test(url.pathname)) platform = 'spotify'
    else if (host === 'youtube.com' && /^\/(channel\/UC[a-zA-Z0-9_-]{22}|@[a-zA-Z0-9._%-]+|c\/[a-zA-Z0-9._%-]+|user\/[a-zA-Z0-9._%-]+)\/?$/.test(url.pathname)) platform = 'youtube'
    else if (host === 'instagram.com' && /^\/[a-zA-Z0-9._]+\/?$/.test(url.pathname) && !/^\/(p|reel|reels|accounts|explore|stories)\/?$/.test(url.pathname)) platform = 'instagram'
    else if (['x.com', 'twitter.com'].includes(host) && /^\/[a-zA-Z0-9_]{1,15}\/?$/.test(url.pathname) && !/^\/(home|search|explore|intent|i)\/?$/.test(url.pathname)) platform = 'x'
    else if (relation.type === 'official homepage' && !['open.spotify.com', 'youtube.com', 'instagram.com', 'x.com', 'twitter.com'].includes(host)) platform = 'website'
    if (!platform) continue
    url.search = ''; url.hash = ''
    const key = `${platform}:${url.href}`
    links.set(key, { platform, url: url.href, source_url: `https://musicbrainz.org/artist/${row.id}`,
      verification: 'identity_linked_unverified', checked_at: now })
  }
  return [...links.values()]
}

export async function lastfm(row, key, { fetcher = fetch, pause = wait } = {}) {
  if (!key) throw new Error('LASTFM_API_KEY_REQUIRED')
  const url = new URL('https://ws.audioscrobbler.com/2.0/')
  url.search = new URLSearchParams({ method: 'artist.getInfo', mbid: row.id, api_key: key, format: 'json', autocorrect: '0' }).toString()
  for (let attempt = 0; attempt < 3; attempt++) {
    await pause(1100)
    let response
    try { response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(15000) }) }
    catch { if (attempt === 2) throw new Error('LASTFM_NETWORK_FAILED'); await pause(2000 * (attempt + 1)); continue }
    if (response.status === 429) throw new Error('LASTFM_RATE_LIMITED')
    if (!response.ok) {
      if (response.status >= 500 && attempt < 2) { await pause(2000 * (attempt + 1)); continue }
      throw new Error(`LASTFM_HTTP_${response.status}`)
    }
    const data = await response.json().catch(() => { throw new Error('LASTFM_INVALID_RESPONSE') })
    if ([10, 26].includes(Number(data.error))) throw new Error('LASTFM_KEY_REJECTED')
    if (Number(data.error) === 29) throw new Error('LASTFM_RATE_LIMITED')
    if ([6, 7].includes(Number(data.error))) return { status: 'not_found', checked_at: new Date().toISOString() }
    if (data.error) throw new Error('LASTFM_PROVIDER_FAILED')
    return popularity(row, data)
  }
}

async function save(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(`${path}.tmp`, path)
}

async function read(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw new Error('PREPARATION_FILE_INVALID') }
}

export async function prepare(args = process.argv.slice(2), env = process.env) {
  if (args.some(a => !/^--(input|output|limit|jpop-share)=/.test(a))) throw new Error('PREPARATION_ARGUMENT_INVALID')
  const option = (name, fallback) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
  const input = resolve(option('input', '.local/artist-import/candidate-pool.json'))
  const output = resolve(option('output', '.local/artist-import/prepared.json'))
  if (input === output) throw new Error('PREPARATION_OUTPUT_MUST_DIFFER')
  const limit = Number(option('limit', 500)), share = Number(option('jpop-share', 0.5))
  if (!Number.isInteger(limit) || limit < 1 || limit > 50000 || !Number.isFinite(share) || share < 0 || share > 1) throw new Error('PREPARATION_LIMIT_INVALID')
  if (!env.LASTFM_API_KEY) throw new Error('LASTFM_API_KEY_REQUIRED')
  const manifest = validateManifest(await read(input))
  const cachePath = `${input}.enrichment.json`
  const cache = await read(cachePath, { version: 1, artists: {} })
  if (cache.version !== 1 || !cache.artists || typeof cache.artists !== 'object' || Array.isArray(cache.artists)) throw new Error('PREPARATION_CACHE_INVALID')
  const db = database(env)
  const existing = new Set()
  if (db) {
    for (let offset = 0; ; offset += 500) {
      const page = await db(`bands?select=musicbrainz_id&order=id&limit=500&offset=${offset}`)
      if (!Array.isArray(page)) throw new Error('PREPARATION_DB_INVALID')
      for (const band of page) if (band.musicbrainz_id) existing.add(band.musicbrainz_id)
      if (page.length < 500) break
    }
  }
  const pool = manifest.candidates.filter(row => !existing.has(row.id))
  let consecutiveFailures = 0
  for (const row of pool) {
    const entry = cache.artists[row.id] ??= {}
    if (!recent(entry.popularity?.checked_at) || entry.popularity?.status === 'failed') {
      try { entry.popularity = await lastfm(row, env.LASTFM_API_KEY); consecutiveFailures = 0 }
      catch (error) {
        consecutiveFailures++
        entry.popularity = { status: 'failed', checked_at: new Date().toISOString() }
        await save(cachePath, cache)
        if (['LASTFM_KEY_REJECTED', 'LASTFM_RATE_LIMITED'].includes(error.message)) throw error
        if (consecutiveFailures >= 3) throw new Error('LASTFM_CONSECUTIVE_FAILURES')
      }
      await save(cachePath, cache)
    }
    row.popularity = entry.popularity
  }
  const selected = selectRanked(pool, limit, share)
  let profileFailures = 0
  for (const row of selected) {
    const entry = cache.artists[row.id]
    if (profileFailures >= 3 && !recent(entry.profiles_checked_at)) {
      row.profile_links = []; row.profile_status = 'deferred'; continue
    }
    if (!recent(entry.profiles_checked_at)) {
      try {
        const data = await musicbrainz(new URL(`https://musicbrainz.org/ws/2/artist/${row.id}?inc=url-rels&fmt=json`), { db })
        entry.profile_links = profileLinks(row, data)
        entry.profiles_checked_at = new Date().toISOString()
        profileFailures = 0
        delete entry.profile_error
      } catch { entry.profile_error = 'PROFILE_FETCH_FAILED'; profileFailures++ }
      await save(cachePath, cache)
    }
    row.profile_links = entry.profile_links ?? []
    row.profile_status = entry.profile_error ? 'failed' : row.profile_links.length ? 'needs_verification' : 'not_found'
    // Biographies and images need separate evidence/usage review; do not copy them.
  }
  const rankedAt = new Date().toISOString()
  const preparation = { method: 'lastfm-listeners-v1', status: selected.length ? 'ready' : 'empty', ranked_at: rankedAt,
    requested_limit: limit, jpop_share: share, collected_count: manifest.candidates.length, existing_filtered: Boolean(db),
    existing_skipped: manifest.candidates.length - pool.length, ranked_count: pool.filter(row => row.popularity?.status === 'ranked').length,
    unranked_count: pool.filter(row => row.popularity?.status !== 'ranked').length,
    popularity_failures: pool.filter(row => row.popularity?.status === 'failed').length,
    selected_jpop: selected.filter(jpop).length, selected_rock: selected.filter(row => !jpop(row)).length }
  await save(output, { ...manifest, candidates: selected, preparation, updated_at: rankedAt })
  console.log(JSON.stringify({ ...preparation, selected: selected.length, profile_failures: selected.filter(row => row.profile_status === 'failed').length,
    profile_deferred: selected.filter(row => row.profile_status === 'deferred').length, output }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  prepare().catch(error => { console.error(JSON.stringify({ error: /^(PREPARATION_|LASTFM_|TARGET_|DB_)/.test(error.message) ? error.message : 'PREPARATION_FAILED' })); process.exitCode = 1 })
}
