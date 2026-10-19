import { recordStage, snapshotKey } from './artist-review-queue.mjs'

// Existing authenticated RPCs only. A server/service key is never an administrator actor.
export async function applyQueuedCuration(queue, { lane, runId, bandId, proposal, requirements = {},
  adminClient = null, relationReader = null, accessToken = null, now = Date.now() }) {
  const row = queue.active?.artists.find(row => row.bandId === bandId)
  if (!row || queue.active.runId !== runId || !row.tasks.includes('approval') || queue.owner !== lane || queue.transfer) throw new Error('TARGET_NOT_SELECTED')
  const entry = queue.entries[bandId]
  // Validate the entire proposal and fresh research before touching an authenticated client.
  const draft = structuredClone(queue)
  recordStage(draft, { lane, runId, bandId, stage: 'approval', status: 'authority_wait',
    reason: 'ADMIN_AUTHENTICATION_REQUIRED', proposal, now })
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
  return outcome
}
