import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PROJECT = 'https://czjrzylvnewfjnfwjhwf.supabase.co'
const UA = 'EncoreArtistImport/1.0 (https://github.com/yeonguk0201/concert-finder)'
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const JPOP = ['j-pop', 'jpop', 'j pop']
const ROCK = ['rock', 'alternative rock', 'indie rock', 'punk rock', 'hard rock', 'progressive rock', 'post-rock', 'pop rock', 'metal', 'heavy metal']
export const queries = [
  ...JPOP.map(tag => `tag:"${tag}" AND (type:person OR type:group)`),
  ...ROCK.map(tag => `tag:"${tag}" AND type:group`),
]
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export function candidate(artist) {
  if (!artist || !UUID.test(artist.id ?? '') || typeof artist.name !== 'string' || !artist.name.trim() || artist.name.length > 200
    || !/^[A-Z]{2}$/.test(artist.country ?? '') || !['Person', 'Group'].includes(artist.type)) return null
  const tags = [...new Set((artist.tags ?? []).map(t => t.name).filter(t => typeof t === 'string').map(t => t.toLowerCase().trim()))]
  if (!tags.some(t => JPOP.includes(t)) && !(artist.type === 'Group' && tags.some(t => ROCK.includes(t)))) return null
  return { id: artist.id, name: artist.name, country: artist.country, type: artist.type,
    aliases: [...new Set((artist.aliases ?? []).map(a => a.name).filter(n => typeof n === 'string' && n.trim() && n.length <= 200 && n !== artist.name))].slice(0, 50), source_tags: tags.slice(0, 100) }
}

export function validateManifest(manifest) {
  if (manifest?.version !== 1 || JSON.stringify(manifest.queries) !== JSON.stringify(queries) || !Array.isArray(manifest.candidates)
    || !Array.isArray(manifest.cursors) || manifest.cursors.length !== queries.length
    || manifest.cursors.some(c => !Number.isInteger(c.offset) || c.offset < 0 || typeof c.done !== 'boolean')) throw new Error('INVALID_MANIFEST')
  const ids = new Set()
  for (const row of manifest.candidates) {
    if (!candidate({ ...row, tags: row.source_tags?.map(name => ({ name })), aliases: row.aliases?.map(name => ({ name })) }) || ids.has(row.id)) throw new Error('INVALID_CANDIDATE')
    ids.add(row.id)
  }
  return manifest
}

async function save(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(`${path}.tmp`, path)
}

export function database(env = process.env, fetcher = fetch) {
  if (!env.SUPABASE_URL && !env.SUPABASE_SERVICE_ROLE_KEY) return null
  if (env.SUPABASE_URL?.replace(/\/$/, '') !== PROJECT || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('TARGET_OR_CREDENTIALS_INVALID')
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  return async (path, body) => {
    const response = await fetcher(`${PROJECT}/rest/v1/${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { apikey: key, ...(!key.startsWith('sb_secret_') ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      // Never log arbitrary provider responses or credentials.
      throw new Error(error.message === 'ARTIST_NOT_AVAILABLE' ? 'ARTIST_NOT_AVAILABLE' : `DB_HTTP_${response.status}`)
    }
    return response.json()
  }
}

export async function musicbrainz(url, { db = null, fetcher = fetch, wait = sleep } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    // Space local requests before taking the shared gate, then send immediately.
    await wait(1200)
    if (db) {
      let granted = false
      for (let i = 0; i < 25; i++) {
        if (await db('rpc/service_artist_search_cache', { action: 'reserve', term: 'artist-import:v1' })) { granted = true; break }
        await wait(1200)
      }
      if (!granted) throw new Error('SHARED_GATE_BUSY')
    }
    let response
    try { response = await fetcher(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000) }) }
    catch { if (attempt === 2) throw new Error('PROVIDER_NETWORK_FAILED'); await wait(2000 * (attempt + 1)); continue }
    if (response.ok) return response.json()
    if (response.status !== 429 && response.status < 500) throw new Error(`PROVIDER_HTTP_${response.status}`)
    if (attempt === 2) throw new Error(`PROVIDER_HTTP_${response.status}`)
    const retrySeconds = Number(response.headers.get('retry-after'))
    if (Number.isFinite(retrySeconds) && retrySeconds > 30) throw new Error('PROVIDER_RETRY_LATER')
    await wait(Math.max(2000 * (attempt + 1), (retrySeconds || 0) * 1000))
  }
}

export async function collect(manifest, limit, getPage, checkpoint) {
  const known = new Map(manifest.candidates.map(c => [c.id, c]))
  while (known.size < limit && manifest.cursors.some(c => !c.done)) {
    for (let index = 0; index < queries.length && known.size < limit; index++) {
      const cursor = manifest.cursors[index]
      if (cursor.done) continue
      const url = new URL('https://musicbrainz.org/ws/2/artist/')
      url.search = new URLSearchParams({ query: queries[index], fmt: 'json', limit: '100', offset: String(cursor.offset) }).toString()
      const data = await getPage(url)
      if (!Array.isArray(data.artists) || !Number.isInteger(data.count) || data.count < 0) throw new Error('INVALID_PROVIDER_PAGE')
      let consumed = 0
      for (const artist of data.artists) {
        const row = candidate(artist)
        if (row) {
          const previous = known.get(row.id)
          known.set(row.id, { ...(previous ?? row), matched_queries: [...new Set([...(previous?.matched_queries ?? []), index])] })
        }
        consumed++
        if (known.size >= limit) break
      }
      cursor.offset += consumed
      cursor.done = data.artists.length === 0 || cursor.offset >= data.count
      manifest.candidates = [...known.values()]
      manifest.updated_at = new Date().toISOString()
      await checkpoint(manifest)
    }
  }
  return { candidates: known.size, complete: manifest.cursors.every(c => c.done) }
}

export async function importCandidates(rows, db, checkpoint) {
  const snapshot = new Map()
  for (let offset = 0; ; offset += 500) {
    const page = await db(`bands?select=id,musicbrainz_id,curation_status,category&order=id&limit=500&offset=${offset}`)
    if (!Array.isArray(page)) throw new Error('INVALID_DB_SNAPSHOT')
    for (const row of page) if (row.musicbrainz_id) snapshot.set(row.musicbrainz_id, row)
    if (page.length < 500) break
  }
  const report = { version: 1, started_at: new Date().toISOString(), results: [], stopped: false }
  await checkpoint(report)
  for (const row of rows) {
    const existing = snapshot.get(row.id)
    let result = { id: row.id, name: row.name }
    if (existing) result = { ...result, status: ['held', 'excluded'].includes(existing.curation_status) ? 'blocked' : 'existing', band_id: existing.id }
    else {
      let bandId
      try {
        bandId = await db('rpc/service_import_artist', { identity: { key: `mb:${row.id}`, name: row.name, country: row.country,
          aliases: row.aliases, genre: '장르 미검수', evidence: `https://musicbrainz.org/artist/${row.id}` } })
        if (bandId === null) result.status = 'identity_conflict'
        else {
          if (!UUID.test(bandId ?? '')) throw new Error('INVALID_RPC_RESULT')
          const bands = await db(`bands?select=id,musicbrainz_id,curation_status,category&id=eq.${bandId}`)
          if (bands.length !== 1 || bands[0].musicbrainz_id !== row.id || !['unreviewed', 'approved'].includes(bands[0].curation_status)) throw new Error('READBACK_FAILED')
          result = { ...result, status: 'registered_or_reused', band_id: bandId, curation_status: bands[0].curation_status }
          snapshot.set(row.id, bands[0])
        }
      } catch (error) {
        if (error.message === 'ARTIST_NOT_AVAILABLE') result.status = 'blocked'
        else { result = { ...result, status: 'failed', error: /^DB_HTTP_\d+$|^READBACK_FAILED$|^INVALID_RPC_RESULT$/.test(error.message) ? error.message : 'DB_REQUEST_FAILED', write_may_have_committed: true }; report.stopped = true }
      }
    }
    report.results.push(result)
    await checkpoint(report)
    if (report.stopped) break
  }
  return report
}

async function main() {
  const [mode, ...args] = process.argv.slice(2)
  if (!['collect', 'import'].includes(mode) || args.some(a => a !== '--apply' && !a.startsWith('--file=') && !a.startsWith('--limit='))) throw new Error('Use collect|import --file=path [--limit=500] [--apply]')
  if (mode === 'collect' && args.includes('--apply')) throw new Error('COLLECT_IS_READ_ONLY')
  const file = resolve(args.find(a => a.startsWith('--file='))?.slice(7) ?? '.local/artist-import/candidates.json')
  const limit = Number(args.find(a => a.startsWith('--limit='))?.slice(8) ?? 500)
  if (!Number.isInteger(limit) || limit < 1 || limit > 50000) throw new Error('LIMIT_MUST_BE_1_TO_50000')
  let manifest
  try { manifest = JSON.parse(await readFile(file, 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT' || mode !== 'collect') throw new Error('MANIFEST_READ_FAILED') }
  if (manifest) validateManifest(manifest)
  if (mode === 'collect') {
    manifest ??= { version: 1, queries, cursors: queries.map(() => ({ offset: 0, done: false })), candidates: [] }
    const db = database()
    text(await collect(manifest, limit, url => musicbrainz(url, { db }), value => save(file, value)))
  } else if (!args.includes('--apply')) text({ candidates: manifest.candidates.length, apply: false })
  else {
    const db = database()
    if (!db) throw new Error('SERVER_CREDENTIALS_REQUIRED')
    const reportFile = `${file}.import-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    const report = await importCandidates(manifest.candidates, db, value => save(reportFile, value))
    const counts = {}
    for (const row of report.results) counts[row.status] = (counts[row.status] ?? 0) + 1
    text({ counts, stopped: report.stopped, report: reportFile })
    if (report.stopped) process.exitCode = 1
  }
}
function text(value) { console.log(JSON.stringify(value)) }
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(JSON.stringify({ error: /^(INVALID_|MANIFEST_|TARGET_|SERVER_|LIMIT_|COLLECT_|SHARED_|PROVIDER_|DB_)/.test(error.message) ? error.message : 'IMPORT_FAILED' })); process.exitCode = 1 })
}
