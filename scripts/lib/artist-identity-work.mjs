import { validateIdentityMutation, verifyIdentityReceipt } from './artist-identity-contract.mjs'
import { validateIdentityJournal } from './artist-identity-journal.mjs'

// Read-only recovery of a previously frozen journal. Validate ALL selected IDs
// and original versions before the first RPC reader, including ordinary review
// targets that have no identity mutation. A receipt never authorizes a new write.
export async function recoverIdentityJournal({ journal, queue, lane, now = Date.now(), ...readers }) {
  const frozen = validateIdentityJournal(journal, now)
  const active = queue?.active
  if (!['cloud', 'local'].includes(lane) || queue?.owner !== lane || queue.transfer
    || !active || active.runId !== frozen.runId || !Array.isArray(active.artists)
    || active.artists.length !== frozen.targets.length
    || new Set(active.artists.map(a => a.bandId)).size !== active.artists.length) {
    throw Error('IDENTITY_SELECTION_INVALID')
  }
  const selected = new Map(active.artists.map(a => [a.bandId, a]))
  for (const target of frozen.targets) {
    const row = selected.get(target.bandId)
    if (!row || (Object.hasOwn(row, 'originalIdentityVersion') ? row.originalIdentityVersion : row.identityVersion ?? null) !== target.expectedUpdatedAt) {
      throw Error('IDENTITY_SELECTION_INVALID')
    }
  }
  const results = []
  for (const target of frozen.targets.filter(t => t.mutation)) {
    // Reader errors and per-target identity/search conflicts already have fixed,
    // redacted codes in recoverIdentityWork. Keep a failure local to that target.
    try {
      results.push(await recoverIdentityWork({ ...readers, queue, lane, runId: frozen.runId, target, now }))
    } catch (error) {
      const code = /^IDENTITY_(?:RECEIPT_UNAVAILABLE|READBACK_UNAVAILABLE|READBACK_FAILED|LINK_UNCONFIRMED|SEARCH_UNAVAILABLE|READERS_REQUIRED)$/.test(error.message)
        ? error.message : 'IDENTITY_RECOVERY_FAILED'
      results.push({ bandId: target.bandId, state: 'recovery_failed', verified: false, code })
    }
  }
  return { runId: frozen.runId, fingerprint: frozen.fingerprint,
    selected: frozen.targets.length, complete: results.every(r => r.verified === true), results }
}

// Receipt recovery only. This module never registers a run, mutates an artist,
// approves publication, changes a queue, or reads credentials. The journal
// recovery above remains independent of the mutation CLI/queue integration.
export async function recoverIdentityWork({ queue, lane, runId, target,
  receiptReader, bandReader, relationReader, identityReader, searchReader, now = Date.now() }) {
  const active = queue?.active
  if (!['cloud', 'local'].includes(lane) || queue?.owner !== lane || queue.transfer
    || !active || active.runId !== runId || !Array.isArray(active.artists)
    || active.artists.length < 1 || active.artists.length > 40
    || new Set(active.artists.map(a => a.bandId)).size !== active.artists.length) throw Error('IDENTITY_SELECTION_INVALID')
  const selected = active.artists.find(a => a.bandId === target?.bandId)
  if (!selected || (Object.hasOwn(selected, 'originalIdentityVersion') ? selected.originalIdentityVersion : selected.identityVersion ?? null) !== target.expectedUpdatedAt) throw Error('IDENTITY_SELECTION_INVALID')
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
