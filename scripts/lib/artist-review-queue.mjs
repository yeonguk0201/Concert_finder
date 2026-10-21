import { createHash, randomUUID } from 'node:crypto'

export const PROJECT = 'czjrzylvnewfjnfwjhwf'
export const MAX_ARTISTS = 40
export const POLICY = 'jpop-or-rock-v1+official-channels-v1+integrated-queue-v1'
const DAY = 86400000
const STAGES = ['research', 'approval', 'channels']
const ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const fail = code => { throw new Error(code) }
export const snapshotKey = band => createHash('sha256').update(JSON.stringify([
  band.id, band.name, band.aliases, band.country_code, band.musicbrainz_id,
  band.category, band.curation_status, band.updated_at,
])).digest('hex')
const stamp = (value, code = 'INVALID_TIMESTAMP') => Number.isFinite(Date.parse(value)) ? Date.parse(value) : fail(code)
const iso = now => new Date(now).toISOString()
const owner = value => ['local', 'cloud'].includes(value) ? value : fail('OWNER_REQUIRED')

export function newQueue(lane, now = Date.now()) {
  return { version: 1, project: PROJECT, policy: POLICY, queueId: randomUUID(), revision: 0,
    owner: owner(lane), createdAt: iso(now), lastStartedAt: null, entries: {}, active: null, history: [], transfer: null }
}

export function validateQueue(queue) {
  if (queue?.version !== 1 || queue.project !== PROJECT || queue.policy !== POLICY || !ID.test(queue.queueId)
    || !Number.isInteger(queue.revision) || queue.revision < 0 || !queue.entries || Array.isArray(queue.entries)
    || !Array.isArray(queue.history)) fail('QUEUE_INVALID')
  owner(queue.owner)
  for (const [id, entry] of Object.entries(queue.entries)) {
    if (!ID.test(id) || entry.band?.id !== id || typeof entry.key !== 'string' || !entry.stages
      || STAGES.some(stage => !entry.stages[stage])) fail('QUEUE_INVALID')
    stamp(entry.waitingSince)
  }
  if (queue.active) validateSelection(queue.active)
  return queue
}

export function validateSelection(batch) {
  if (!ID.test(batch?.runId) || batch.project !== PROJECT || !Array.isArray(batch.artists)
    || batch.artists.length > MAX_ARTISTS || new Set(batch.artists.map(row => row.bandId)).size !== batch.artists.length
    || batch.artists.some(row => !ID.test(row.bandId) || typeof row.identityVersion !== 'string' || !row.key)) fail('SELECTION_INVALID')
  return batch
}

function freshStage(now) { return { status: 'pending', waitingSince: iso(now), checkedAt: null, nextAttemptAt: null } }
function checkOwner(queue, lane) {
  validateQueue(queue)
  if (queue.owner !== owner(lane) || queue.transfer) fail('HANDOFF_REQUIRED')
}

// A whole-catalog snapshot is required; no name cursor or fixed historic catalog count.
export function reconcile(queue, bands, now = Date.now()) {
  const seen = new Set()
  for (const band of bands) {
    if (!ID.test(band.id) || seen.has(band.id) || typeof band.name !== 'string' || !Array.isArray(band.aliases)
      || !['approved', 'unreviewed', 'held', 'excluded'].includes(band.curation_status)) fail('CATALOG_INVALID')
    stamp(band.updated_at); seen.add(band.id)
    const key = snapshotKey(band), old = queue.entries[band.id]
    if (!old || old.key !== key) {
      // Preserve the old proof for review, but never silently reuse it after a version/identity change.
      queue.entries[band.id] = { band, key, waitingSince: old?.waitingSince ?? iso(now), missing: false,
        stages: Object.fromEntries(STAGES.map(stage => [stage, freshStage(now)])), previous: old ? { key: old.key, stages: old.stages } : null }
    } else { old.band = band; old.missing = false }
  }
  for (const [id, entry] of Object.entries(queue.entries)) entry.missing = !seen.has(id)
}

function needed(stage, now) {
  if (stage.status === 'exception') return false
  if (stage.status === 'authority_wait') return false
  if (stage.status === 'complete') return stamp(stage.validUntil) <= now
  if (stage.status === 'deferred') return stamp(stage.nextAttemptAt) <= now
  return true
}

function tasksFor(entry, now, authorityKey) {
  const { band, stages } = entry
  if (entry.missing || ['held', 'excluded'].includes(band.curation_status)) return []
  // Existing approvals are protected; only their channel/photo refresh can be selected.
  if (band.curation_status === 'approved') return needed(stages.channels, now) ? ['channels'] : []
  const researchDue = needed(stages.research, now)
  const proofValid = stages.research.status === 'complete' && stamp(stages.research.validUntil) > now
  const approvalDue = stages.approval.status === 'authority_wait'
    ? Boolean(authorityKey && authorityKey !== stages.approval.authorityKey) : needed(stages.approval, now)
  return [...(researchDue ? ['research'] : []), ...((researchDue || proofValid && approvalDue) ? ['approval'] : []),
    ...(needed(stages.channels, now) ? ['channels'] : [])]
}

export function beginBatch(queue, { lane, bands, now = Date.now(), authorityKey = null, direction = 'forward' }) {
  checkOwner(queue, lane)
  if (queue.active) return { ...queue.active, resumed: true }
  if (!['forward', 'reverse'].includes(direction)) fail('DIRECTION_INVALID')
  // The scheduler owns cadence; ownership, frozen batches and provider retry times remain enforced.
  reconcile(queue, bands, now)
  const candidates = Object.values(queue.entries).map(entry => {
    const tasks = tasksFor(entry, now, authorityKey)
    const priority = tasks.includes('research') ? 1 : tasks.includes('approval') ? 2 : 3
    const since = Math.min(...tasks.map(stage => stamp(entry.stages[stage].waitingSince)))
    return { entry, tasks, priority, since }
  }).filter(row => row.tasks.length)
  candidates.sort((a, b) => a.priority - b.priority || a.since - b.since
    || (direction === 'reverse' ? -1 : 1) * (a.entry.band.name.localeCompare(b.entry.band.name, 'en') || a.entry.band.id.localeCompare(b.entry.band.id)))
  if (!candidates.length) return { state: 'idle', reason: 'no_work' }
  const batch = { state: 'running', project: PROJECT, runId: randomUUID(), owner: lane, startedAt: iso(now),
    authorityKey, apiCalls: 0, artists: candidates.slice(0, MAX_ARTISTS).map(({ entry, tasks, priority }) => ({
      bandId: entry.band.id, name: entry.band.name, identityVersion: entry.band.updated_at, key: entry.key,
      priority, tasks, stages: structuredClone(entry.stages), recorded: {}, receipts: {},
    })) }
  queue.active = batch; queue.lastStartedAt = iso(now); queue.revision++
  return batch
}

export function safeProof(proof, now) {
  if (!proof || !['keep', 'exclude', 'hold', 'verified', 'no_official_channel'].includes(proof.decision)
    || typeof proof.summary !== 'string' || !proof.summary.trim() || proof.summary.length > 2000
    || !Array.isArray(proof.sources) || !proof.sources.length || proof.sources.length > 10) fail('PROOF_REQUIRED')
  return { decision: proof.decision, summary: proof.summary, sources: proof.sources.map(source => {
    let u
    try { u = new URL(source.url) } catch { fail('SOURCE_INVALID') }
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) fail('SOURCE_INVALID')
    const checked = stamp(source.checkedAt)
    const field = source.excerpt === undefined ? 'summary' : 'excerpt'
    const evidence = source[field]
    if (checked > now || now - checked >= 90 * DAY || typeof evidence !== 'string'
      || !evidence.trim() || evidence.length > 1000) fail('SOURCE_INVALID')
    return { url: u.href, checkedAt: source.checkedAt, [field]: evidence }
  }) }
}

export function recordStage(queue, { lane, runId, bandId, stage, status, reason, proof, applied = false,
  verification = null, proposal = null, apiCalls = 0, now = Date.now() }) {
  checkOwner(queue, lane)
  const batch = queue.active, row = batch?.artists.find(row => row.bandId === bandId)
  if (!row || batch.runId !== runId || !STAGES.includes(stage)) fail('TARGET_NOT_SELECTED')
  if (!row.tasks.includes(stage)) fail('TASK_NOT_SELECTED')
  const receipt = createHash('sha256').update(JSON.stringify([status, reason, proof, applied, verification, proposal, apiCalls])).digest('hex')
  if (row.receipts[stage]) {
    if (row.receipts[stage] !== receipt) fail('CHECKPOINT_CONFLICT')
    return row.recorded[stage]
  }
  if (!['complete', 'deferred', 'exception', 'authority_wait'].includes(status)
    || !Number.isInteger(apiCalls) || apiCalls < 0 || apiCalls > 100 || typeof reason !== 'string' || reason.length > 2000) fail('CHECKPOINT_INVALID')
  if (status === 'authority_wait' && stage !== 'approval') fail('CHECKPOINT_INVALID')
  if (applied && (typeof verification?.version !== 'string' || verification?.readBack !== true)) fail('READBACK_REQUIRED')
  const entry = queue.entries[bandId]
  const value = { status, reason, checkedAt: iso(now), waitingSince: iso(now), applied,
    lastSuccessfulAt: status === 'complete' ? iso(now) : entry.stages[stage].lastSuccessfulAt ?? null,
    nextAttemptAt: status === 'deferred' ? iso(now + DAY) : null,
    validUntil: status === 'complete' ? iso(now + (stage === 'channels' ? 7 : 90) * DAY) : null }
  if ((stage === 'research' || stage === 'channels') && status === 'complete') {
    value.proof = safeProof(proof, now)
    if (stage === 'research' && !['keep', 'exclude', 'hold'].includes(value.proof.decision)) fail('PROOF_REQUIRED')
    if (stage === 'channels' && !['verified', 'no_official_channel'].includes(value.proof.decision)) fail('PROOF_REQUIRED')
    if (stage === 'channels' && value.proof.decision === 'verified' && !applied) fail('READBACK_REQUIRED')
    const actualCheck = stage === 'research' || value.proof.decision === 'no_official_channel'
      ? Math.min(...value.proof.sources.map(source => stamp(source.checkedAt))) : stamp(verification?.checkedAt, 'READBACK_REQUIRED')
    if (actualCheck > now) fail('READBACK_REQUIRED')
    value.validUntil = iso(actualCheck + (stage === 'channels' ? 7 : 90) * DAY)
    value.lastSuccessfulAt = iso(actualCheck)
  }
  if (stage === 'approval' && ['complete', 'authority_wait'].includes(status)) {
    if (entry.stages.research.status !== 'complete' || stamp(entry.stages.research.validUntil) <= now) fail('RESEARCH_REQUIRED')
    if (status === 'complete' && !applied) fail('READBACK_REQUIRED')
    // Proposal is exact existing RPC input, never executable SQL or a token.
    if (proposal) {
      const b = entry.band
      if (proposal.target_band_id !== bandId || proposal.expected_updated_at !== b.updated_at
        || proposal.artist_name !== b.name || proposal.country !== b.country_code
        || JSON.stringify(proposal.artist_aliases) !== JSON.stringify(b.aliases)
        || !['approved', 'excluded', 'held', 'unreviewed'].includes(proposal.review_status)
        || !['unclassified', 'domestic_rock', 'overseas_rock', 'jpop'].includes(proposal.artist_category)) fail('PROPOSAL_INVALID')
      const keys = ['target_band_id', 'expected_updated_at', 'artist_name', 'country', 'artist_category',
        'artist_aliases', 'review_status', 'reason', 'evidence_url']
      if (Object.keys(proposal).some(key => !keys.includes(key)) || typeof proposal.reason !== 'string'
        || proposal.reason.length > 2000 || !proposal.reason.trim()) fail('PROPOSAL_INVALID')
      if (proposal.evidence_url !== null) {
        let url
        try { url = new URL(proposal.evidence_url) } catch { fail('PROPOSAL_INVALID') }
        if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password) fail('PROPOSAL_INVALID')
      }
      if (proposal.review_status === 'approved' && (proposal.artist_category === 'unclassified' || !proposal.evidence_url)) fail('PROPOSAL_INVALID')
      value.proposal = structuredClone(proposal)
    }
    if (status === 'authority_wait' && !proposal) fail('PROPOSAL_REQUIRED')
    value.authorityKey = batch.authorityKey
  }
  if (verification) value.verification = { readBack: verification.readBack === true, version: verification.version,
    ...(verification.checkedAt ? { checkedAt: verification.checkedAt } : {}) }
  entry.stages[stage] = value; row.recorded[stage] = value; row.receipts[stage] = receipt
  batch.apiCalls += apiCalls; queue.revision++
  return value
}

export function finishBatch(queue, { lane, runId, deferPending = false, now = Date.now() }) {
  checkOwner(queue, lane)
  const batch = queue.active
  if (!batch || batch.runId !== runId) fail('RUN_NOT_FOUND')
  for (const row of batch.artists) for (const stage of row.tasks) if (!row.recorded[stage]) {
    if (!deferPending) fail('BATCH_INCOMPLETE')
    recordStage(queue, { lane, runId, bandId: row.bandId, stage, status: 'deferred', reason: 'INTERRUPTED', now })
  }
  const report = { ...batch, state: 'finished', finishedAt: iso(now), selected: batch.artists.length,
    remaining: Object.values(queue.entries).filter(e => tasksFor(e, now, null).length).length,
    authorityWaiting: Object.values(queue.entries).filter(e => e.stages.approval.status === 'authority_wait').length }
  queue.history.push({ runId, startedAt: batch.startedAt, finishedAt: report.finishedAt,
    bandIds: batch.artists.map(row => row.bandId), apiCalls: batch.apiCalls })
  queue.active = null; queue.revision++
  return report
}

// Explicit single-owner transfer. A copied old state is NOT a distributed lock.
export function offerHandoff(queue, { lane, to, now = Date.now() }) {
  checkOwner(queue, lane); owner(to)
  if (lane === to) fail('OWNER_UNCHANGED')
  if (queue.active) fail('BATCH_INCOMPLETE')
  queue.transfer = { id: randomUUID(), from: lane, to, offeredAt: iso(now) }; queue.revision++
  return structuredClone(queue)
}
export function acceptHandoff(packet, { lane, previous = null }) {
  validateQueue(packet)
  if (!packet.transfer || packet.transfer.to !== owner(lane) || packet.active) fail('HANDOFF_INVALID')
  const sameOffer = previous?.revision === packet.revision && previous?.transfer?.id === packet.transfer.id
    && previous?.owner === packet.transfer.from
  if (previous && (previous.queueId !== packet.queueId || previous.revision > packet.revision
    || previous.revision === packet.revision && !sameOffer)) fail('HANDOFF_STALE')
  const next = structuredClone(packet)
  next.owner = lane; next.transfer = null; next.revision++
  return next
}
