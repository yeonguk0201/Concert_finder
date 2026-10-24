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
import { runSource } from './collection-runner.mjs'
import { collectKopis } from './kopis.mjs'
import { collectTicketlinkEvidence, supplementBooking, ticketlinkProduct } from './booking-evidence.mjs'
import { readCollectionArtists, createCatalogArtistResolver, assertCollectionLinksPreserved } from './collection-artist-links.mjs'

const upload = process.argv.includes('--upload')
const output = process.argv.find(a => a.startsWith('--output='))?.slice(9)
const selected = process.argv.find(a => a.startsWith('--source='))?.slice(9) ?? 'all'
const includePast = process.argv.includes('--include-past')
const skipArtistLookup = process.argv.includes('--skip-artist-lookup')
const cachePath = '.artist-cache.local'
try {
  if (!['all', 'ualive', 'mintpaper', 'radwimps', 'yes24', 'kopis'].includes(selected)) throw new Error('Unknown source')
  if (selected === 'kopis' && !process.env.KOPIS_SERVICE_KEY) throw new Error('KOPIS_SERVICE_KEY missing')
  if (upload && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error('Server upload environment missing')
  const client = upload ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null
  const results = []
  const noticeFile = process.argv.find(a => a.startsWith('--notice-file='))?.slice(14)
  const noticeUrls = JSON.parse(await readFile(noticeFile ?? new URL('./ticketlink-notices.json', import.meta.url), 'utf8'))
  if (!Array.isArray(noticeUrls)) throw new Error('Notice allowlist must be an array')
  const noticeCache = new Map(), noticeFailures = new Map()
  const supplement = async result => {
    const hasProducts = result.candidates.some(row => [row.payload.ticket.booking_url, ...(row.payload.booking_links ?? []).map(l => l.url)].some(ticketlinkProduct))
    const urls = [...new Set([...(hasProducts ? noticeUrls : []), ...result.candidates.flatMap(row => row.payload.booking_notice_urls ?? [])])]
    const pending = urls.filter(url => !noticeCache.has(url) && !noticeFailures.has(url))
    if (pending.length) {
      try {
        const batch = await collectTicketlinkEvidence(pending)
        for (const row of batch.evidence) noticeCache.set(row.source_url, row)
        for (const failure of batch.failures) noticeFailures.set(failure.source_url, failure)
      } catch (error) { for (const url of pending) noticeFailures.set(url, { source_url: url, error: error.message }) }
    }
    result.failures.push(...urls.flatMap(url => noticeFailures.has(url) ? [noticeFailures.get(url)] : []))
    const official = results.flatMap(result => (result.candidates ?? []).flatMap(row =>
      (row.payload.ticket_evidence ?? []).filter(e => e.source_url === row.source_url && e.opens_at).map(e => ({
        source_url: e.source_url, ...row.payload.ticket, opens_at: e.opens_at,
        starts_on: row.payload.starts_on, ends_on: row.payload.ends_on, venue: row.payload.venue, line: e.line,
      }))))
    for (const row of result.candidates) supplementBooking(row, [...noticeCache.values(), ...official])
  }
  let cache = {}
  try { cache = JSON.parse(await readFile(cachePath, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const lookupArtist = skipArtistLookup ? null : createArtistResolver({ cache, onCacheChanged: () => writeFile(cachePath, JSON.stringify(cache, null, 2) + '\n', 'utf8') })
  const writeReport = () => output ? writeFile(output, JSON.stringify({ checked_at: new Date().toISOString(), complete: false, results }, null, 2) + '\n', 'utf8') : Promise.resolve()
  for (const source of selected === 'all' ? ['ualive', 'mintpaper', 'radwimps', 'kopis'] : [selected]) {
    if (source === 'kopis' && !process.env.KOPIS_SERVICE_KEY) {
      results.push({ source, skipped: 'configuration_missing', warning: 'KOPIS_SERVICE_KEY 미등록: 공연 발견 경로 비활성', uploaded: false })
      console.error('::warning::KOPIS_SERVICE_KEY 미등록: KOPIS 수집을 건너뜁니다. 기존 주최사 수집만 실행합니다.')
      await writeReport(); continue
    }
    console.error(`[${source}] 공개 공연 목록 수집 시작`)
    let pendingResult = null
    try {
      let discoveredIdentities = []
      const result = await runSource({ client, source, collect: async () => {
      const slotOption = process.argv.find(a => a.startsWith('--kopis-slot='))?.slice(13)
      const kopisOptions = slotOption === undefined ? {} : { slot: Number(slotOption) }
      const result = source === 'kopis' ? await collectKopis(kopisOptions) : source === 'ualive' ? await collect() : source === 'yes24' ? await collectYes24() : await collectAdapter(source)
      result.excluded ??= []
      filterPastCandidates(result, { includePast })
      await supplement(result)
      console.error(`[${source}] 후보 ${result.candidates.length}개 · 제외 ${result.excluded.length}개 · 실패 ${result.failures.length}개; 아티스트 보완 중`)
      const bands = client ? await readCollectionArtists(client) : []
      discoveredIdentities = await enrichArtists(result, createCatalogArtistResolver(bands, lookupArtist))
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
      pendingResult = result
      return result
      }, upload: async (batch, runToken, attempts) => {
        let lastError
        for (let attempt = 1; attempt <= 3; attempt++) {
          try { await assertCollectionLinksPreserved(client, batch) }
          catch (error) {
            if (error.message === 'COLLECTION_IDENTITY_REGRESSION') batch.identity_link_review = error.review
            throw error
          }
          const { data, error } = await client.rpc('service_complete_collection', { run_token: runToken, batch, identities: [...artists, ...discoveredIdentities], attempt_count: attempts, adapter_version: 'catalog-v1' })
          if (!error) return data
          lastError = error
          if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 5000))
        }
        throw new Error(`Upload failed: ${lastError.code ?? 'RPC'}`)
      } })
      if (result.skipped) { results.push({ source, ...result }); await writeReport(); continue }
      results.push({ source, ...result, artist_identity_count: discoveredIdentities.length, uploaded: upload })
      console.error(`[${source}] 완료 · 새 식별 정보 ${discoveredIdentities.length}개 · 업로드 ${upload}`)
      if (result.failures.length) process.exitCode = 1
    } catch (error) { results.push({ source, ...(pendingResult ?? {}), error: error.message, uploaded: false }); console.error(`[${source}] 실패: ${error.message}`); process.exitCode = 1 }
    await writeReport()
  }
  await writeFile(cachePath, JSON.stringify(cache, null, 2) + '\n', 'utf8')
  const report = JSON.stringify({ checked_at: new Date().toISOString(), complete: true, results }, null, 2)
  if (output) await writeFile(output, report + '\n', 'utf8')
  console.log(report)
} catch (error) { console.error(error.message); process.exitCode = 1 }
