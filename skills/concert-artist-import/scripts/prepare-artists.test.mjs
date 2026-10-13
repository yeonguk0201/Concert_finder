import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, unlinkSync, rmdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { lastfm, popularity, prepare, profileLinks, selectRanked } from './prepare-artists.mjs'
import { requirePrepared, queries } from './import-artists.mjs'

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const row = (n, listeners = 10, tags = ['rock']) => ({ id: id(n), name: `Artist ${n}`, type: 'Group', country: 'JP', source_tags: tags,
  popularity: { status: 'ranked', source: 'lastfm', metric: 'listeners', listeners, mbid: id(n), checked_at: new Date().toISOString() } })

test('popularity requires exact external identity and numeric listeners; missing is not zero', () => {
  assert.equal(popularity(row(1), { artist: { mbid: id(2), stats: { listeners: '99999' } } }).status, 'identity_unresolved')
  assert.equal(popularity(row(1), { artist: { mbid: '', stats: { listeners: '99999' } } }).status, 'identity_unresolved')
  assert.equal(popularity(row(1), { artist: { mbid: id(1), stats: {} } }).status, 'metric_missing')
  assert.equal(popularity(row(1), { artist: { mbid: id(1), stats: { listeners: 'NaN' } } }).status, 'metric_missing')
  assert.equal(popularity(row(1), { artist: { mbid: id(1), stats: { listeners: '0' } } }).listeners, 0)
})

test('selection preserves category share, ranks within categories and handles overlapping tags once', () => {
  const selected = selectRanked([row(1, 1000, ['j-pop', 'rock']), row(2, 900, ['j-pop']), row(3, 800, ['j-pop']), row(4, 100), row(5, 50)], 4)
  assert.deepEqual(selected.map(r => r.id), [id(1), id(2), id(4), id(5)])
  assert.equal(new Set(selected.map(r => r.id)).size, 4)
})

test('short category fills from other ranked candidates, unranked candidates never fill quota', () => {
  const unresolved = { ...row(4, 99999), popularity: { status: 'identity_unresolved' } }
  assert.deepEqual(selectRanked([row(1, 100, ['j-pop']), row(2, 90), row(3, 80), unresolved], 4).map(r => r.id), [id(1), id(2), id(3)])
  assert.deepEqual(selectRanked([row(2), row(1)], 2).map(r => r.id), [id(1), id(2)])
})

test('raw, stale, mismatched or missing metrics are blocked before default import', () => {
  assert.throws(() => requirePrepared({ candidates: [row(1)] }), /PREPARATION_REQUIRED/)
  const manifest = { preparation: { method: 'lastfm-listeners-v1', status: 'ready', ranked_at: new Date().toISOString() }, candidates: [row(1)] }
  assert.doesNotThrow(() => requirePrepared(manifest))
  manifest.candidates[0].popularity.checked_at = '2000-01-01T00:00:00Z'
  assert.throws(() => requirePrepared(manifest), /PREPARATION_REQUIRED/)
  manifest.candidates = [row(1)]
  manifest.candidates[0].popularity.mbid = id(2)
  assert.throws(() => requirePrepared(manifest), /PREPARATION_REQUIRED/)
  manifest.candidates = [row(1)]
  manifest.preparation.ranked_at = '2999-01-01T00:00:00Z'
  assert.throws(() => requirePrepared(manifest), /PREPARATION_REQUIRED/)
})

test('profile harvesting retains provenance without claiming official verification', () => {
  const urls = ['https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb', 'https://www.youtube.com/channel/UCq19-LqvG35A-30oyAiPiqA', 'https://www.instagram.com/example/?utm_source=x', 'https://x.com/example', 'https://example.com/']
  const relations = urls.map(url => ({ 'target-type': 'url', type: url === 'https://example.com/' ? 'official homepage' : 'social network', url: { resource: url } }))
  const result = profileLinks(row(1), { id: id(1), relations })
  assert.deepEqual(result.map(r => r.platform), ['spotify', 'youtube', 'instagram', 'x', 'website'])
  assert.ok(result.every(r => r.verification === 'identity_linked_unverified' && r.source_url.endsWith(id(1))))
  assert.ok(!result[2].url.includes('?'))
})

test('profile harvesting rejects wrong identity, video/post URLs, private hosts and credentials', () => {
  assert.throws(() => profileLinks(row(1), { id: id(2), relations: [] }), /PROFILE_IDENTITY_INVALID/)
  const urls = ['https://youtube.com/watch?v=123', 'https://instagram.com/p/123', 'https://youtube.com.evil.test/@example', 'https://localhost/', 'https://127.0.0.1/', 'https://user:pass@example.com/', 'http://example.com/']
  const relations = urls.map(url => ({ 'target-type': 'url', type: 'social network', url: { resource: url } }))
  assert.deepEqual(profileLinks(row(1), { id: id(1), relations }), [])
})

test('Last.fm calls use MBID and distinguish unavailable metrics, credentials and rate limits', async () => {
  await assert.rejects(lastfm(row(1), ''), /LASTFM_API_KEY_REQUIRED/)
  const options = { pause: async () => {}, fetcher: async url => {
    assert.equal(url.searchParams.get('mbid'), id(1))
    assert.equal(url.searchParams.has('artist'), false)
    return Response.json({ artist: { mbid: id(1), stats: { listeners: '123' } } })
  } }
  assert.equal((await lastfm(row(1), 'test-key', options)).listeners, 123)
  for (const [error, expected] of [[10, 'LASTFM_KEY_REJECTED'], [26, 'LASTFM_KEY_REJECTED'], [29, 'LASTFM_RATE_LIMITED']]) {
    await assert.rejects(lastfm(row(1), 'test-key', { pause: async () => {}, fetcher: async () => Response.json({ error, message: 'secret-like provider text' }) }), new RegExp(expected))
  }
  assert.equal((await lastfm(row(1), 'test-key', { pause: async () => {}, fetcher: async () => Response.json({ error: 6 }) })).status, 'not_found')
})

test('Last.fm transient failures retry finitely and do not expose upstream text', async () => {
  let calls = 0
  await assert.rejects(lastfm(row(1), 'test-key', { pause: async () => {}, fetcher: async () => { calls++; return new Response('secret-like provider text', { status: 503 }) } }), /LASTFM_HTTP_503/)
  assert.equal(calls, 3)
  calls = 0
  await assert.rejects(lastfm(row(1), 'test-key', { pause: async () => {}, fetcher: async () => { calls++; return new Response('', { status: 429 }) } }), /LASTFM_RATE_LIMITED/)
  assert.equal(calls, 1)
})

test('cached pipeline preserves original pool, selects ranked rows, and default import blocks raw input', async t => {
  const base = resolve('.local/artist-import-tests')
  mkdirSync(base, { recursive: true })
  const directory = mkdtempSync(join(base, 'run-'))
  const input = join(directory, 'pool.json'), output = join(directory, 'prepared.json'), cachePath = `${input}.enrichment.json`
  t.after(() => { for (const path of [input, output, `${output}.tmp`, cachePath]) if (existsSync(path)) unlinkSync(path); rmdirSync(directory) })
  const candidates = [row(1, 100, ['j-pop']), row(2, 80), row(3, 60)].map(r => ({ ...r, aliases: [] }))
  const manifest = { version: 1, queries, cursors: queries.map(() => ({ offset: 0, done: true })), candidates }
  const cache = { version: 1, artists: Object.fromEntries(candidates.map(r => [r.id, { popularity: r.popularity, profiles_checked_at: new Date().toISOString(), profile_links: [] }])) }
  const original = JSON.stringify(manifest)
  writeFileSync(input, original, 'utf8')
  writeFileSync(cachePath, JSON.stringify(cache), 'utf8')
  const env = { ...process.env, LASTFM_API_KEY: 'offline-fixture-key', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' }
  await prepare([`--input=${input}`, `--output=${output}`, '--limit=2'], env)
  assert.equal(readFileSync(input, 'utf8'), original)
  const result = JSON.parse(readFileSync(output, 'utf8'))
  assert.deepEqual(result.candidates.map(r => r.id), [id(1), id(2)])
  assert.equal(result.preparation.existing_filtered, false)
  assert.equal(result.preparation.selected_jpop, 1)
  assert.doesNotThrow(() => requirePrepared(result))
  const blocked = spawnSync(process.execPath, [fileURLToPath(new URL('./import-artists.mjs', import.meta.url)), 'import', `--file=${input}`, '--apply'], { encoding: 'utf8', env })
  assert.equal(blocked.status, 1)
  assert.match(blocked.stderr, /PREPARATION_REQUIRED_OR_STALE/)
})
