import { readFile, mkdir, writeFile, rename, realpath } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
function candidates(urls) {
  const result = new Map()
  for (const raw of urls) {
    try {
      const u = new URL(raw)
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port || isIP(u.hostname)
        || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname) || /\.(local|internal)$/i.test(u.hostname)) continue
      u.search = ''; u.hash = '';
      result.set(u.hostname, { host: u.hostname, sourceUrl: u.href, verified: false })
    } catch { /* Discovery input is untrusted. */ }
  }
  return [...result.values()]
}

export async function prepareHostCandidates(records, { previous = null, fetchMusicBrainz = false, fetcher = fetch,
  wait = delay, now = Date.now(), onCheckpoint = async () => {} } = {}) {
  if (!Array.isArray(records) || records.some(r => !UUID.test(r.id ?? '') || !UUID.test(r.musicbrainz_id ?? ''))
    || new Set(records.map(r => r.id)).size !== records.length) throw new Error('INVALID_EXISTING_ARTISTS')
  const output = { version: 1, totalInput: records.length, limit: 500, skippedOverLimit: Math.max(0, records.length - 500),
    apiCalls: 0, artists: [] }
  const prior = new Map((previous?.artists ?? []).map(r => [r.bandId, r]))
  let queried = false, consecutiveFailures = 0, stopped = false
  for (const record of records.slice(0, 500)) {
    const old = prior.get(record.id)
    if (old?.musicBrainzId === record.musicbrainz_id && JSON.stringify(old.inputUrls ?? []) === JSON.stringify(candidates(record.official_urls ?? []).map(c => c.sourceUrl))
      && Date.parse(old.retryAfter ?? old.expiresAt) > now) {
      output.artists.push(old); await onCheckpoint(output); continue
    }
    const row = { bandId: record.id, musicBrainzId: record.musicbrainz_id, name: record.name ?? '',
      status: 'discovery_required', checkedAt: new Date(now).toISOString(), inputUrls: [], candidates: [] }
    let urls = Array.isArray(record.official_urls) ? record.official_urls : []
    row.inputUrls = candidates(urls).map(c => c.sourceUrl)
    if (!urls.length && fetchMusicBrainz && stopped) {
      row.status = 'deferred'; row.retryAfter = new Date(now + 5 * 3600000).toISOString()
    } else if (!urls.length && fetchMusicBrainz) {
      if (queried) await wait(1100)
      queried = true; output.apiCalls++
      try {
        const response = await fetcher(`https://musicbrainz.org/ws/2/artist/${record.musicbrainz_id}?fmt=json&inc=url-rels`, {
          headers: { 'User-Agent': 'ConcertFinderHostPreparation/1.0 (https://github.com/yeonguk0201/Concert_finder)' },
          redirect: 'error', signal: AbortSignal.timeout(20000),
        })
        if (!response.ok) throw new Error('PROVIDER_FAILED')
        const reader = response.body.getReader(); const chunks = []; let size = 0
        try {
          while (true) {
            const { value, done } = await reader.read(); if (done) break
            size += value.length; if (size > 600000) throw new Error('PROVIDER_TOO_LARGE')
            chunks.push(value)
          }
        } finally { await reader.cancel() }
        const bytes = new Uint8Array(size); let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
        const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
        if (data.id !== record.musicbrainz_id || typeof data.name !== 'string') throw new Error('IDENTITY_MISMATCH')
        urls = (data.relations ?? []).filter(r => r.type === 'official homepage').map(r => r.url?.resource)
        consecutiveFailures = 0
      } catch {
        row.status = 'failed'; row.retryAfter = new Date(now + 5 * 3600000).toISOString()
        if (++consecutiveFailures >= 3) stopped = true
      }
    }
    row.candidates = candidates(urls)
    if (!['failed', 'deferred'].includes(row.status)) {
      row.status = row.candidates.length ? 'needs_host_review' : 'discovery_required'
      row.expiresAt = new Date(now + 7 * 86400000).toISOString()
    }
    output.artists.push(row); await onCheckpoint(output)
  }
  if (!records.length) await onCheckpoint(output)
  return output
}

async function main(args) {
  if (args.some(x => x !== '--fetch-musicbrainz' && !/^--(input|output|previous)=.+/.test(x))) throw new Error('ARGUMENT_INVALID')
  const option = name => args.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3)
  const input = resolve(option('input') ?? '.local/artist-review/existing-artists.json')
  const output = resolve(option('output') ?? '.local/artist-review/host-candidates.json')
  const root = resolve('.local/artist-review')
  if (input === output || ![input, output].every(p => p.startsWith(root + '/'))) throw new Error('IGNORED_PATH_REQUIRED')
  await mkdir(dirname(output), { recursive: true })
  if (await realpath(dirname(output)) !== dirname(output) || await realpath(input) !== input) throw new Error('SYMLINK_PATH_REJECTED')
  const previousPath = option('previous') && resolve(option('previous'))
  if (previousPath && (!previousPath.startsWith(root + '/') || await realpath(previousPath) !== previousPath)) throw new Error('IGNORED_PATH_REQUIRED')
  const previous = previousPath ? JSON.parse(await readFile(previousPath, 'utf8')) : null
  const result = await prepareHostCandidates(JSON.parse(await readFile(input, 'utf8')), {
    previous, fetchMusicBrainz: args.includes('--fetch-musicbrainz'),
    onCheckpoint: async data => {
      const temporary = `${output}.${randomUUID()}.tmp`
      await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' })
      await rename(temporary, output)
    },
  })
  console.log(JSON.stringify({ artists: result.artists.length, apiCalls: result.apiCalls,
    candidateHosts: new Set(result.artists.flatMap(r => r.candidates.map(c => c.host))).size }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(() => {
  console.error('HOST_PREPARATION_FAILED'); process.exitCode = 1
})
