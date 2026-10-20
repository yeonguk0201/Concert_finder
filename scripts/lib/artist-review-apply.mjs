import { recordStage, snapshotKey, safeProof } from './artist-review-queue.mjs'

// Human administration and scheduled service application use separate audited RPCs.
export async function applyQueuedCuration(queue, { lane, runId, bandId, proposal, requirements = {},
  approvalEvidence = {}, approvalProof = null, serviceClient = null, adminClient = null, relationReader = null, accessToken = null, now = Date.now() }) {
  const row = queue.active?.artists.find(row => row.bandId === bandId)
  if (!row || queue.active.runId !== runId || !row.tasks.includes('approval') || queue.owner !== lane || queue.transfer) throw new Error('TARGET_NOT_SELECTED')
  const entry = queue.entries[bandId]
  if (row.recorded?.approval?.applied) {
    if (JSON.stringify(row.recorded.approval.proposal) !== JSON.stringify(proposal)) throw new Error('CHECKPOINT_CONFLICT')
    return row.recorded.approval
  }
  // Validate the entire proposal and fresh research before touching an authenticated client.
  const draft = structuredClone(queue)
  recordStage(draft, { lane, runId, bandId, stage: 'approval', status: 'authority_wait',
    reason: 'ADMIN_AUTHENTICATION_REQUIRED', proposal, now })
  if (serviceClient) return applyService(queue, { lane, runId, bandId, proposal, requirements, approvalEvidence, approvalProof, serviceClient, now })
  const wait = reason => recordStage(queue, { lane, runId, bandId, stage: 'approval', status: 'authority_wait', reason, proposal, now })
  if (!adminClient || !accessToken) return wait('ADMIN_AUTHENTICATION_REQUIRED')
  const { data: identity, error: userError } = await adminClient.auth.getUser(accessToken)
  if (userError || !identity?.user?.id) return wait('ADMIN_AUTHENTICATION_REQUIRED')
  const { data: catalog, error: catalogError } = await adminClient.rpc('admin_catalog')
  if (catalogError || !Array.isArray(catalog?.bands)) return wait('ADMIN_AUTHENTICATION_REQUIRED')
  const current = catalog.bands.find(band => band.id === bandId)
  if (!current || snapshotKey(current) !== entry.key || current.curation_status !== 'unreviewed') throw new Error('EDIT_CONFLICT')
  if (proposal.review_status === 'approved' && !['identityMatched', 'countryMatched', 'genreMatched',
    'classificationMatched', 'externalIdentityLinked', 'publicationEffectUnderstood'].every(key => requirements[key] === true)) throw new Error('APPROVAL_REQUIREMENTS_REQUIRED')
  const decision = entry.stages.research.proof?.decision
  if ((proposal.review_status === 'approved' && decision !== 'keep')
    || (proposal.review_status === 'excluded' && decision !== 'exclude')
    || (proposal.review_status === 'held' && decision !== 'hold')) throw new Error('DECISION_CONFLICT')
  if (!relationReader) throw new Error('RELATIONSHIP_VERIFICATION_REQUIRED')
  const relationCounts = async () => {
    const counts = await Promise.all(['concert_bands', 'band_follows'].map(async table => {
      const { count, error } = await relationReader.from(table).select('band_id', { head: true, count: 'exact' }).eq('band_id', bandId)
      if (error || !Number.isInteger(count)) throw new Error('RELATIONSHIP_VERIFICATION_REQUIRED')
      return count
    }))
    return JSON.stringify(counts)
  }
  const beforeRelations = await relationCounts()
  const { error } = await adminClient.rpc('admin_curate_artist', proposal)
  if (error) {
    if (String(error.message).includes('ADMIN_REQUIRED')) return wait('ADMIN_AUTHENTICATION_REQUIRED')
    throw new Error(String(error.message).includes('EDIT_CONFLICT') ? 'EDIT_CONFLICT' : 'CURATION_WRITE_UNCONFIRMED')
  }
  const [{ data: afterCatalog, error: readError }, { data: history, error: historyError }] = await Promise.all([
    adminClient.rpc('admin_catalog'), adminClient.rpc('admin_artist_history', { target_band_id: bandId }),
  ])
  const after = afterCatalog?.bands?.find(band => band.id === bandId)
  const sameAliases = values => JSON.stringify([...values].sort())
  if (readError || historyError || !after || !Array.isArray(history)
    || after.name !== current.name || after.country_code !== current.country_code || after.musicbrainz_id !== current.musicbrainz_id
    || sameAliases(after.aliases) !== sameAliases(current.aliases) || after.curation_status !== proposal.review_status
    || after.category !== proposal.artist_category || after.curation_reason !== proposal.reason
    || after.curation_evidence_url !== proposal.evidence_url
    || !history.some(item => item.actor_id === identity.user.id && item.after_record?.updated_at === after.updated_at
      && item.after_record?.curation_status === proposal.review_status)) throw new Error('CURATION_WRITE_UNCONFIRMED')
  if (beforeRelations !== await relationCounts()) throw new Error('CURATION_WRITE_UNCONFIRMED')
  const outcome = recordStage(queue, { lane, runId, bandId, stage: 'approval', status: 'complete', reason: 'RPC_AND_HISTORY_VERIFIED',
    applied: true, proposal, verification: { readBack: true, version: after.updated_at }, now })
  // This known, verified write must not invalidate its own research on the next snapshot.
  entry.band = { ...entry.band, category: after.category, curation_status: after.curation_status, updated_at: after.updated_at }
  entry.key = snapshotKey(entry.band)
  row.identityVersion = after.updated_at
  row.key = entry.key
  return outcome
}

export const SERVICE_AUTHORITY = 'integrated-service-approval-v1'
const approvalKeys = ['identityMatched', 'countryMatched', 'genreMatched', 'classificationMatched',
  'externalIdentityLinked', 'publicationEffectUnderstood']

export async function registerServiceBatch(client, queue) {
  if (!queue.active) return
  const { error } = await client.rpc('service_begin_integrated_review', { run_id: queue.active.runId, batch_started_at: queue.active.startedAt,
    targets: queue.active.artists.map(row => ({ bandId: row.bandId,
      // A verified apply changes the local version, but registration remains immutable.
      expectedUpdatedAt: row.originalIdentityVersion ?? row.identityVersion })) })
  if (error) throw new Error(/SCHEDULE_WINDOW|EDIT_CONFLICT|SELECTION_CONFLICT|LEGACY_REVIEW_NOT_FINISHED|LEASE_LOST/.exec(error.message)?.[0] ?? 'SERVICE_REGISTRATION_FAILED')
}

async function applyService(queue, { lane, runId, bandId, proposal, requirements, approvalEvidence, approvalProof, serviceClient, now }) {
  const entry = queue.entries[bandId], row = queue.active.artists.find(row => row.bandId === bandId)
  // Approval-only batches may need new sources beyond the reusable genre investigation.
  // Preserve that investigation and submit separately validated supplemental research.
  const proof = approvalProof ? safeProof(approvalProof, now) : entry.stages.research.proof
  if (proof.decision !== entry.stages.research.proof.decision) throw new Error('DECISION_CONFLICT')
  if (proposal.review_status === 'approved' && !approvalKeys.every(key => requirements[key] === true
    && typeof approvalEvidence[key]?.summary === 'string' && approvalEvidence[key].summary.trim()
    && Array.isArray(approvalEvidence[key].sourceUrls) && approvalEvidence[key].sourceUrls.length
    && approvalEvidence[key].sourceUrls.every(url => proof.sources.some(source => source.url === url)))) {
    throw new Error('APPROVAL_REQUIREMENTS_REQUIRED')
  }
  const { data, error } = await serviceClient.rpc('service_apply_integrated_review', { run_id: runId,
    proposal, proof, requirements, approval_evidence: approvalEvidence })
  if (error) throw new Error(/EDIT_CONFLICT|MANUAL_DECISION|LEASE_LOST|IDENTITY_REQUIRED|APPROVAL_REQUIREMENTS_REQUIRED|CLASSIFICATION_CONFLICT|LEGACY_REVIEW_NOT_FINISHED/.exec(error.message)?.[0] ?? 'CURATION_WRITE_UNCONFIRMED')
  const [{ data: receipt, error: receiptError }, { data: after, error: readError }] = await Promise.all([
    serviceClient.rpc('service_integrated_review_receipt', { run_id: runId, band_id: bandId }),
    serviceClient.from('bands').select('*').eq('id', bandId).single(),
  ])
  const relations = await Promise.all(['concert_bands', 'band_follows'].map(async table => {
    const { count, error } = await serviceClient.from(table).select('band_id', { head: true, count: 'exact' }).eq('band_id', bandId)
    if (error || !Number.isInteger(count)) throw new Error('CURATION_WRITE_UNCONFIRMED')
    return count
  }))
  if (receiptError || readError || !after || receipt?.runId !== runId || data?.runId !== runId
    || receipt.after?.updated_at !== after.updated_at || data.after?.updated_at !== after.updated_at
    || receipt.before?.updated_at !== proposal.expected_updated_at
    || after.id !== bandId || after.name !== entry.band.name || after.country_code !== entry.band.country_code
    || after.musicbrainz_id !== entry.band.musicbrainz_id || JSON.stringify(after.aliases) !== JSON.stringify(entry.band.aliases)
    || after.category !== proposal.artist_category || after.curation_status !== proposal.review_status
    || after.curation_reason !== proposal.reason || after.curation_evidence_url !== proposal.evidence_url
    || proposal.review_status === 'approved' && receipt.publicationApproved !== true
    || JSON.stringify(relations) !== JSON.stringify(receipt.relations)) throw new Error('CURATION_WRITE_UNCONFIRMED')
  const outcome = recordStage(queue, { lane, runId, bandId, stage: 'approval', status: 'complete', reason: 'SERVICE_RPC_AND_RECEIPT_VERIFIED',
    applied: true, proposal, verification: { readBack: true, version: after.updated_at }, now })
  row.originalIdentityVersion ??= row.identityVersion
  entry.band = { ...entry.band, category: after.category, curation_status: after.curation_status, updated_at: after.updated_at }
  entry.key = snapshotKey(entry.band); row.identityVersion = after.updated_at; row.key = entry.key
  return outcome
}
