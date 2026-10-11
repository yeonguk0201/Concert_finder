import { createClient } from '@supabase/supabase-js'
import { collect } from './ualive.mjs'
import { collectAdapter } from './official-adapters.mjs'
import { artists, validateArtwork } from './catalog-policy.mjs'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { collectYes24 } from './yes24.mjs'
import { createArtistResolver, enrichArtists } from './artist-discovery.mjs'
import { filterPastCandidates } from './candidate-policy.mjs'

const upload = process.argv.includes('--upload')
const output = process.argv.find(a => a.startsWith('--output='))?.slice(9)
const selected = process.argv.find(a => a.startsWith('--source='))?.slice(9) ?? 'all'
const includePast = process.argv.includes('--include-past')
const skipArtistLookup = process.argv.includes('--skip-artist-lookup')
const cachePath = '.artist-cache.local'
try {
  if (!['all', 'ualive', 'mintpaper', 'radwimps', 'yes24'].includes(selected)) throw new Error('Unknown source')
  if (upload && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error('Server upload environment missing')
  const client = upload ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null
  const results = []
  let cache = {}
  try { cache = JSON.parse(await readFile(cachePath, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const resolveArtist = createArtistResolver({ cache, onCacheChanged: () => writeFile(cachePath, JSON.stringify(cache, null, 2) + '\n', 'utf8') })
  const writeReport = () => output ? writeFile(output, JSON.stringify({ checked_at: new Date().toISOString(), complete: false, results }, null, 2) + '\n', 'utf8') : Promise.resolve()
  for (const source of selected === 'all' ? ['ualive', 'mintpaper', 'radwimps', 'yes24'] : [selected]) {
    console.error(`[${source}] 공개 공연 목록 수집 시작`)
    try {
      const result = source === 'ualive' ? await collect() : source === 'yes24' ? await collectYes24() : await collectAdapter(source)
      result.excluded ??= []
      filterPastCandidates(result, { includePast })
      console.error(`[${source}] 후보 ${result.candidates.length}개 · 제외 ${result.excluded.length}개 · 실패 ${result.failures.length}개; 아티스트 보완 중`)
      const discoveredIdentities = skipArtistLookup ? [] : await enrichArtists(result, resolveArtist)
      for (const row of result.candidates) {
        if (row.payload.artwork) {
          const discovered = row.payload.artwork
          row.payload.artwork = await validateArtwork(row.payload.artwork)
          row.payload.artwork_probe = { ...discovered, checked_at: new Date().toISOString(), status: row.payload.artwork ? 'validated' : 'rejected' }
        }
        const stable = structuredClone(row.payload)
        if (stable.artwork) delete stable.artwork.checked_at
        if (stable.artwork_probe) delete stable.artwork_probe.checked_at
        row.content_hash = createHash('sha256').update(JSON.stringify(stable)).digest('hex')
      }
      if (client) {
        const { error } = await client.rpc('admin_ingest_catalog', { source, batch: result, identities: [...artists, ...discoveredIdentities] })
        if (error) throw new Error(`Upload failed: ${error.code ?? 'RPC'}`)
      }
      results.push({ source, ...result, artist_identity_count: discoveredIdentities.length, uploaded: upload })
      console.error(`[${source}] 완료 · 새 식별 정보 ${discoveredIdentities.length}개 · 업로드 ${upload}`)
      if (result.failures.length) process.exitCode = 1
    } catch (error) { results.push({ source, error: error.message, uploaded: false }); console.error(`[${source}] 실패: ${error.message}`); process.exitCode = 1 }
    await writeReport()
  }
  await writeFile(cachePath, JSON.stringify(cache, null, 2) + '\n', 'utf8')
  const report = JSON.stringify({ checked_at: new Date().toISOString(), complete: true, results }, null, 2)
  if (output) await writeFile(output, report + '\n', 'utf8')
  console.log(report)
} catch (error) { console.error(error.message); process.exitCode = 1 }
