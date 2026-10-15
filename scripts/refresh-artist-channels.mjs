import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { refreshManifest } from './youtube-channels.mjs'

const safeError = error => /^(EDIT_CONFLICT|CHANNEL_LOCKED|IDENTITY_REQUIRED|ARTIST_NOT_AVAILABLE|OFFICIAL_EVIDENCE_REQUIRED)$/.test(error?.message ?? '') ? error.message : 'CHANNEL_DB_FAILED'

export async function runRefresh(client, { key = '', manifest = null, fetcher = fetch, pause, now = Date.now() } = {}) {
  const summary = { imported: 0, importFailures: 0, artists: 0, applied: 0, writeFailures: 0, apiCalls: 0, counts: {}, errors: {}, ok: false }
  const failed = code => { summary.errors[code] = (summary.errors[code] ?? 0) + 1 }
  if (manifest) {
    // Validate the entire input before the first mutation. Official evidence must
    // be collected by the skill/operator, never inferred from an API response.
    await refreshManifest(manifest, { key: '', now })
    for (const row of manifest.artists) {
      const { error } = await client.rpc('service_save_artist_channel', {
        target_band_id: row.bandId, expected_band_updated_at: row.identityVersion,
        expected_updated_at: row.profileVersion ?? null,
        profile: { musicBrainzId: row.musicBrainzId, websiteUrl: row.websiteUrl ?? null,
          channelUrl: row.channelUrl, verification: row.verification, evidence: row.evidence,
          previousChannelId: row.previousChannelId ?? null, locked: row.locked === true },
      })
      if (error) { summary.importFailures++; failed(safeError(error)) } else summary.imported++
    }
  }
  const { data, error } = await client.rpc('service_artist_channel_manifest')
  if (error) throw new Error('CHANNEL_DB_READ_FAILED')
  if (!data || data.version !== 1 || !Array.isArray(data.artists)) throw new Error('CHANNEL_DB_READ_FAILED')
  summary.artists = data.artists.length
  const versions = new Map(data.artists.map(row => [row.bandId, row.profileVersion]))
  const applied = new Map(), written = new Set()
  const report = await refreshManifest(data, { previous: data, key, fetcher, ...(pause ? { pause } : {}), now,
    onCheckpoint: async output => {
      for (const row of output.artists) {
        if (row.status === 'pending') continue
        const fingerprint = JSON.stringify([row.status, row.reason, row.cache])
        if (applied.get(row.bandId) === fingerprint) continue
        const { error } = await client.rpc('service_apply_artist_channel', {
          result: row, expected_profile_updated_at: versions.get(row.bandId),
        })
        // Don't loop on a conflicting edit or an uncertain network response.
        applied.set(row.bandId, fingerprint)
        if (error) { summary.writeFailures++; failed(safeError(error)) } else written.add(row.bandId)
      }
    },
  })
  summary.applied = written.size; summary.apiCalls = report.apiCalls; summary.counts = report.counts
  summary.ok = !summary.importFailures && !summary.writeFailures && !['failed','deferred','key_required'].some(status => report.counts[status])
  return summary
}

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.some(a => a !== '--upload' && !/^--(manifest|output)=.+/.test(a)) || !args.includes('--upload')) throw new Error('UPLOAD_ARGUMENT_REQUIRED')
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SERVER_ENVIRONMENT_REQUIRED')
  const input = args.find(a => a.startsWith('--manifest='))?.slice(11)
  const output = args.find(a => a.startsWith('--output='))?.slice(9)
  const manifest = input ? JSON.parse(await readFile(input, 'utf8')) : null
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const summary = await runRefresh(client, { key: env.YOUTUBE_API_KEY ?? '', manifest })
  // Counts and sanitized error codes only: no API titles, image URLs or secrets
  // in artifacts/logs, so retention cannot accidentally outlive the API cache.
  if (output) await writeFile(output, JSON.stringify(summary, null, 2) + '\n', 'utf8')
  console.log(JSON.stringify(summary))
  if (!summary.ok) process.exitCode = 1
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  console.error(/^[A-Z0-9_]+$/.test(error.message) ? error.message : 'CHANNEL_RUN_FAILED'); process.exitCode = 1
})
