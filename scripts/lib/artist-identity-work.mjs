import { validateIdentityMutation, verifyIdentityReceipt } from './artist-identity-contract.mjs'

// Receipt recovery only. This module never registers a run, mutates an artist,
// approves publication, changes a queue, or reads credentials. CLI/journal
// integration must be completed before scheduling identity writes.
export async function recoverIdentityWork({ queue, lane, runId, target,
  receiptReader, bandReader, relationReader, identityReader, searchReader, now = Date.now() }) {
  const active = queue?.active
  if (!['cloud', 'local'].includes(lane) || queue?.owner !== lane || queue.transfer
    || !active || active.runId !== runId || !Array.isArray(active.artists)
    || active.artists.length < 1 || active.artists.length > 40
    || new Set(active.artists.map(a => a.bandId)).size !== active.artists.length) throw Error('IDENTITY_SELECTION_INVALID')
  const selected = active.artists.find(a => a.bandId === target?.bandId)
  if (!selected || (selected.originalIdentityVersion ?? selected.identityVersion ?? null) !== target.expectedUpdatedAt) throw Error('IDENTITY_SELECTION_INVALID')
  validateIdentityMutation(target.mutation, now)
  if ([receiptReader, bandReader, relationReader, identityReader, searchReader].some(r => typeof r !== 'function')) throw Error('IDENTITY_READERS_REQUIRED')
  // The reader must use the installed service_integrated_identity_receipt RPC.
  // Absence is not permission to issue a mutation through a different writer.
  let receipt
  try { receipt = await receiptReader(runId, target.bandId) }
  catch { throw Error('IDENTITY_RECEIPT_UNAVAILABLE') }
  if (!receipt) return { state: 'not_applied', verified: false, bandId: target.bandId }
  let currentBand, currentRelations, identities
  try {
    [currentBand, currentRelations, identities] = await Promise.all([
      bandReader(target.bandId), relationReader(target.bandId), identityReader(target.bandId),
    ])
  } catch { throw Error('IDENTITY_READBACK_UNAVAILABLE') }
  const verified = verifyIdentityReceipt({ runId, target, receipt, currentBand, currentRelations })
  if (!Array.isArray(identities) || !identities.some(i => i.key === `mb:${target.mutation.musicBrainzId}`)) throw Error('IDENTITY_LINK_UNCONFIRMED')
  // Public discovery is checked independently of receipt/DB success. No aliases
  // are inferred from translations, popularity, or a successful service login.
  const missingNames = []
  // The verified current record includes retained aliases as well as the newly
  // requested ones. A successful mutation must not hide an old public-search
  // collision just because that alias was omitted from the additive request.
  for (const name of new Set([currentBand.name, ...currentBand.aliases])) {
    let ids
    try { ids = await searchReader(name) }
    catch { throw Error('IDENTITY_SEARCH_UNAVAILABLE') }
    if (!Array.isArray(ids) || ids.length !== 1 || ids[0] !== target.bandId) missingNames.push(name)
  }
  return missingNames.length
    ? { state: 'search_pending', verified: false, receiptVerified: true, bandId: target.bandId, missingNames }
    : { state: 'verified', ...verified, publicSearchVerified: true }
}
