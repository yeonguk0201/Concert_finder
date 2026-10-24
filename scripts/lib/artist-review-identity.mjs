import { recordStage, snapshotKey } from './artist-review-queue.mjs'
import { recoverIdentityWork } from './artist-identity-work.mjs'
import { isDeepStrictEqual } from 'node:util'
import { validateIdentityJournal } from './artist-identity-journal.mjs'

// Registration always retains the first version, including explicit null for a
// new artist. Never let a verified mutation rewrite the frozen server request.
export const identityRegistrationTargets = batch => batch.artists.map(row => ({
  bandId: row.bandId,
  expectedUpdatedAt: Object.hasOwn(row, 'originalIdentityVersion') ? row.originalIdentityVersion : row.identityVersion,
  ...(row.identityMutation ? { mutation: structuredClone(row.identityMutation) } : {}),
}))

export function checkIdentitySelection(queue, lane, journal, now = Date.now()) {
  const frozen = validateIdentityJournal(journal, now)
  if (queue.owner !== lane || queue.transfer || queue.active?.runId !== frozen.runId
    || !isDeepStrictEqual(identityRegistrationTargets(queue.active), frozen.targets)) {
    throw Error('IDENTITY_SELECTION_INVALID')
  }
  return frozen
}

// One installed mutation endpoint; an uncertain write is never retried here.
// A later invocation reads its receipt first, then verifies DB and public search.
export async function applyQueuedIdentity(queue, { lane, journal, bandId, client, searchReader, now = Date.now() }) {
  const frozen = checkIdentitySelection(queue, lane, journal, now)
  const target = frozen.targets.find(t => t.bandId === bandId && t.mutation)
  const row = queue.active.artists.find(a => a.bandId === bandId)
  if (!target || !row.tasks.includes('identity')) throw Error('TARGET_NOT_SELECTED')
  if (row.recorded.identity) return row.recorded.identity
  let receipt, band
  const rpc = async name => {
    let result
    try { result = await client.rpc(name, { run_id: frozen.runId, band_id: bandId }) }
    catch { throw Error('IDENTITY_WRITE_UNCONFIRMED') }
    if (result.error) {
      const code = /\b(EDIT_CONFLICT|MANUAL_DECISION|LEASE_LOST|RUN_FINISHED|IDENTITY_CONFLICT|ALIAS_CONFLICT|LEGACY_REVIEW_NOT_FINISHED)\b/.exec(result.error.message)?.[1]
      throw Error(code ?? 'IDENTITY_WRITE_UNCONFIRMED')
    }
    return result.data
  }
  const readers = {
    receiptReader: async () => { receipt = await rpc('service_integrated_identity_receipt'); return receipt },
    bandReader: async () => {
      const r = await client.from('bands').select('id,name,aliases,country_code,musicbrainz_id,category,curation_status,updated_at').eq('id', bandId).single()
      if (r.error) throw Error('READ_FAILED'); band = r.data; return band
    },
    relationReader: async () => Promise.all(['concert_bands', 'band_follows'].map(async table => {
      const r = await client.from(table).select('band_id', { head: true, count: 'exact' }).eq('band_id', bandId)
      if (r.error || !Number.isInteger(r.count)) throw Error('READ_FAILED'); return r.count
    })),
    identityReader: async () => {
      const r = await client.rpc('service_integrated_review_context', { run_id: frozen.runId, band_id: bandId })
      if (r.error) throw Error('READ_FAILED'); return r.data?.identities
    }, searchReader,
  }
  const recover = () => recoverIdentityWork({ queue, lane, runId: frozen.runId, target, ...readers, now })
  let result = await recover()
  if (result.state === 'not_applied') { await rpc('service_mutate_integrated_artist'); result = await recover() }
  // Keep active and original versions on any uncertainty. No completion mark,
  // alternate writer, or renewed research validity on a missing/search conflict.
  if (!result.verified) throw Error(result.state === 'search_pending' ? 'IDENTITY_PUBLIC_SEARCH_PENDING' : 'IDENTITY_WRITE_UNCONFIRMED')
  const entry = queue.entries[bandId]
  const outcome = recordStage(queue, { lane, runId: frozen.runId, bandId, stage: 'identity', status: 'complete',
    reason: 'IDENTITY_RECEIPT_DB_AND_PUBLIC_SEARCH_VERIFIED', applied: true,
    verification: { readBack: true, publicSearchVerified: true, version: band.updated_at }, now })
  row.originalIdentityVersion = target.expectedUpdatedAt
  // The installed approval RPC only accepts the immutable original target
  // version. Identity mutation advances that version; approval must wait for
  // the next regular batch, never a second begin or rewritten registration.
  if (band.curation_status === 'unreviewed' && !row.recorded.approval) recordStage(queue, {
    lane, runId: frozen.runId, bandId, stage: 'approval', status: 'deferred',
    reason: 'IDENTITY_APPROVAL_NEXT_BATCH', now,
  })
  entry.band = band; entry.key = snapshotKey(band); entry.missing = false
  row.identityVersion = band.updated_at; row.key = entry.key
  return outcome
}
