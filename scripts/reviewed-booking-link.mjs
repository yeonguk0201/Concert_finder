import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const bucket = 'concert-scheduler-state'
const sha = value => createHash('sha256').update(value).digest('hex')
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])]))
  return value
}
export const encodeReview = record => Buffer.from(JSON.stringify(sorted(record)), 'utf8')

export async function readBookingSnapshot(client, concertId) {
  const { data, error } = await client.from('concerts').select('*,concert_sources(*),concert_sessions(*),concert_bands(*),ticket_schedules(*)').eq('id', concertId).single()
  if (error) throw new Error(`BOOKING_SNAPSHOT_FAILED:${error.code ?? 'UNKNOWN'}`)
  const { concert_sources, concert_sessions, concert_bands, ticket_schedules, ...concert } = data
  return { ...concert, sources: concert_sources.sort((a, b) => a.url.localeCompare(b.url)),
    sessions: concert_sessions.sort((a, b) => a.id.localeCompare(b.id)),
    band_ids: concert_bands.map(b => b.band_id).sort(), ticket: ticket_schedules }
}

export async function appendAppliedBookingReview(client, proposal, original, receipt, previousBytes = null, previousKey = null) {
  const previous = previousBytes ? JSON.parse(previousBytes.toString('utf8')) : null
  if (previous && (previous.concert_id !== proposal.concert_id || previous.url !== proposal.url || !Number.isInteger(previous.revision))) {
    throw new Error('BOOKING_REVIEW_IDENTITY_CONFLICT')
  }
  const revision = (previous?.revision ?? 0) + 1
  const root = `booking-link-reviews/v1/${proposal.concert_id}/`
  if (previous && (!previousKey?.startsWith(root)
    || !new RegExp(`^[a-f0-9]{64}/${String(previous.revision).padStart(8, '0')}\\.json\\.gz$`).test(previousKey.slice(root.length)))) {
    throw new Error('BOOKING_REVIEW_KEY_REQUIRED')
  }
  const record = { ...(previous ?? { schema: 1, original, original_hash: sha(encodeReview(original)) }),
    concert_id: proposal.concert_id, url: proposal.url, revision,
    previous_hash: previousBytes ? sha(previousBytes) : null,
    status: 'applied', applied: true, automatic_apply: proposal.confirmation_mode === 'standing_policy', checked_at: proposal.checked_at,
    evidence: [...(previous?.evidence ?? []), proposal.evidence],
    application: { ...receipt, confirmation_basis: proposal.confirmation_basis,
      confirmation_mode: proposal.confirmation_mode ?? 'per_link' }, retry_after: null }
  // Existing candidate identifiers were not necessarily hashes of the raw URL.
  // Keep their directory; deriving a new one would duplicate the same candidate.
  const prefix = previous ? previousKey.slice(0, previousKey.lastIndexOf('/')) : `${root}${sha(proposal.url)}`
  const key = `${prefix}/${String(revision).padStart(8, '0')}.json.gz`
  const bytes = encodeReview(record)
  const store = client.storage.from(bucket)
  const { error } = await store.upload(key, gzipSync(bytes), { upsert: false, contentType: 'application/gzip', cacheControl: '0' })
  if (error) throw new Error(`BOOKING_APPLIED_REVIEW_NOT_SAVED:${error.statusCode ?? 'UNKNOWN'}`)
  const result = await store.download(key)
  if (result.error || !gunzipSync(Buffer.from(await result.data.arrayBuffer())).equals(bytes)) throw new Error('BOOKING_REVIEW_READBACK_FAILED')
  return key
}

// No retries on mutation errors or uncertain responses. Re-read the catalog and
// audit receipt before deciding whether another explicit apply is appropriate.
export async function applyReviewedBookingLink(client, input) {
  const { proposal, expected_snapshot: before } = input
  const { data, error } = await client.rpc('service_apply_reviewed_booking_link', { proposal, expected_snapshot: before })
  if (error) throw new Error(`BOOKING_APPLY_FAILED:${error.code ?? 'UNKNOWN'}:${error.message}`)
  const after = await readBookingSnapshot(client, proposal.concert_id)
  const expected = structuredClone(before)
  expected.updated_at = after.updated_at
  expected.ticket.booking_url = proposal.url
  if (!encodeReview(after).equals(encodeReview(expected))) throw new Error('BOOKING_APPLY_READBACK_UNCERTAIN')
  return data
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 4 || process.argv[2] !== '--confirmed-input') throw new Error('CONFIRMED_INPUT_REQUIRED')
  const input = JSON.parse(await readFile(process.argv[3], 'utf8'))
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SERVER_BINDINGS_REQUIRED')
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const receipt = await applyReviewedBookingLink(client, input)
  console.log(JSON.stringify(receipt))
}
