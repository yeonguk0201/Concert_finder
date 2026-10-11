import { createClient } from '@supabase/supabase-js'
import { collect } from './ualive.mjs'
import { collectAdapter } from './official-adapters.mjs'
import { artists, validateArtwork } from './catalog-policy.mjs'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

const upload = process.argv.includes('--upload')
const output = process.argv.find(a => a.startsWith('--output='))?.slice(9)
const selected = process.argv.find(a => a.startsWith('--source='))?.slice(9) ?? 'all'
try {
  if (!['all', 'ualive', 'mintpaper', 'radwimps'].includes(selected)) throw new Error('Unknown source')
  if (upload && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error('Server upload environment missing')
  const client = upload ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null
  const results = []
  for (const source of selected === 'all' ? ['ualive', 'mintpaper', 'radwimps'] : [selected]) {
    try {
      const result = source === 'ualive' ? await collect() : await collectAdapter(source)
      result.excluded ??= []
      if (source === 'ualive') {
        result.excluded.push(...result.candidates.filter(c => !c.payload.artist_keys.length).map(c => ({ source_url: c.source_url, reason: '대상 아티스트 미확정: 수집 검수에서 제외, 지원 목록 보완 필요' })))
        result.candidates = result.candidates.filter(c => c.payload.artist_keys.length)
      }
      for (const row of result.candidates) {
        if (!row.payload.artwork) continue
        const discovered = row.payload.artwork
        row.payload.artwork = await validateArtwork(row.payload.artwork)
        row.payload.artwork_probe = { ...discovered, checked_at: new Date().toISOString(), status: row.payload.artwork ? 'validated' : 'rejected' }
        const stable = structuredClone(row.payload)
        if (stable.artwork) delete stable.artwork.checked_at
        delete stable.artwork_probe.checked_at
        row.content_hash = createHash('sha256').update(JSON.stringify(stable)).digest('hex')
      }
      if (client) {
        const { error } = await client.rpc('admin_ingest_catalog', { source, batch: result, identities: artists })
        if (error) throw new Error(`Upload failed: ${error.code ?? 'RPC'}`)
      }
      results.push({ source, ...result, uploaded: upload })
      if (result.failures.length) process.exitCode = 1
    } catch (error) { results.push({ source, error: error.message, uploaded: false }); process.exitCode = 1 }
  }
  const report = JSON.stringify({ checked_at: new Date().toISOString(), results }, null, 2)
  if (output) await writeFile(output, report + '\n', 'utf8')
  console.log(report)
} catch (error) { console.error(error.message); process.exitCode = 1 }
