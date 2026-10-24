// Pure validation for the installed 20261022121342 contract. No RPC or queue writes.
const ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const fail = code => { throw new Error(code) }
const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const searchName = s => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '')

export function validateIdentityMutation(change, now = Date.now()) {
  if (!change || !['register', 'aliases'].includes(change.operation) || !ID.test(change.musicBrainzId ?? '')
    || !text(change.name, 200) || !/^[A-Z]{2}$/.test(change.country ?? '')
    || !Array.isArray(change.aliases) || change.aliases.length > 100 || change.aliases.some(a => !text(a, 200))) fail('IDENTITY_INVALID')
  if (['identityMatched', 'countryMatched', 'sameIdentityAliases'].some(k => change.requirements?.[k] !== true)
    || change.proof?.decision !== 'keep' || !text(change.proof.summary, 2000)
    || !Array.isArray(change.proof.sources) || change.proof.sources.length < 1 || change.proof.sources.length > 10) fail('IDENTITY_PROOF_REQUIRED')
  for (const source of change.proof.sources) {
    let url
    try { url = new URL(source.url) } catch { fail('IDENTITY_PROOF_REQUIRED') }
    const date = Date.parse(source.checkedAt)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || !text(source.excerpt ?? source.summary, 1000) || !Number.isFinite(date)
      || date > now || date <= now - 90 * 86400000) fail('IDENTITY_PROOF_REQUIRED')
  }
  if (Buffer.byteLength(JSON.stringify(change), 'utf8') > 40000) fail('IDENTITY_INVALID')
  return change
}

// Validate work against an already fixed selection; never append/refill targets or mutate input.
// Queue registration/identity CLI integration is deliberately not implemented here.
export function prepareIdentityTargets(targets, work, catalog, now = Date.now()) {
  if (!Array.isArray(targets) || targets.length < 1 || targets.length > 40
    || targets.some(t => !ID.test(t.bandId ?? '')) || new Set(targets.map(t => t.bandId)).size !== targets.length
    || !Array.isArray(work) || new Set(work.map(w => w.bandId)).size !== work.length
    || !Array.isArray(catalog)) fail('SELECTION_INVALID')
  const selected = new Map(targets.map(t => [t.bandId, t]))
  const assigned = new Map()
  for (const item of work) {
    const target = selected.get(item.bandId)
    if (!target) fail('TARGET_NOT_SELECTED')
    const change = validateIdentityMutation(item.mutation, now)
    const band = catalog.find(b => b.id === item.bandId)
    if (change.operation === 'register') {
      if (band || target.expectedUpdatedAt != null || catalog.some(b => b.musicbrainz_id === change.musicBrainzId)) fail('IDENTITY_CONFLICT')
    } else {
      if (!band || band.updated_at !== target.expectedUpdatedAt) fail('EDIT_CONFLICT')
      if (band.musicbrainz_id !== change.musicBrainzId || band.name !== change.name || band.country_code !== change.country) fail('IDENTITY_CONFLICT')
      if (['held', 'excluded'].includes(band.curation_status) || ['manual', 'hidden'].includes(band.photo_mode)) fail('MANUAL_DECISION')
      if (band.aliases.length + change.aliases.length > 100) fail('IDENTITY_INVALID')
    }
    const names = [change.name, ...change.aliases, ...(band?.aliases ?? [])].map(searchName)
    if (catalog.some(b => b.id !== item.bandId && [b.name, ...b.aliases].some(n => names.includes(searchName(n))))) fail('ALIAS_CONFLICT')
    if ([...assigned.values()].some(other => other.musicBrainzId === change.musicBrainzId
      || [other.name, ...other.aliases].some(n => names.includes(searchName(n))))) fail('IDENTITY_CONFLICT')
    if (target.mutation && !same(target.mutation, change)) fail('SELECTION_CONFLICT')
    assigned.set(item.bandId, structuredClone(change))
  }
  // The installed begin RPC checks ordinary reviews as well as mutations.
  // Reject incomplete/stale snapshots before publishing an immutable journal.
  for (const target of targets.filter(t => !assigned.has(t.bandId))) {
    const band = catalog.find(b => b.id === target.bandId)
    if (!band || !Number.isFinite(Date.parse(target.expectedUpdatedAt))
      || band.updated_at !== target.expectedUpdatedAt) fail('EDIT_CONFLICT')
  }
  return targets.map(t => ({ ...structuredClone(t), ...(assigned.has(t.bandId) ? { mutation: assigned.get(t.bandId) } : {}) }))
}

export function verifyIdentityReceipt({ runId, target, receipt, currentBand, currentRelations }) {
  const change = target.mutation, before = receipt?.before, after = receipt?.after
  if (!change || receipt?.runId !== runId || !same(receipt.mutation, change) || !after || !currentBand
    || after.id !== target.bandId || currentBand.id !== target.bandId) fail('IDENTITY_READBACK_FAILED')
  for (const key of ['id', 'name', 'aliases', 'country_code', 'musicbrainz_id', 'category', 'curation_status', 'updated_at']) {
    if (!same(after[key], currentBand[key])) fail('IDENTITY_READBACK_FAILED')
  }
  if (after.name !== change.name || after.country_code !== change.country || after.musicbrainz_id !== change.musicBrainzId
    || change.aliases.some(a => !after.aliases.includes(a)) || !same(receipt.relations, currentRelations)) fail('IDENTITY_READBACK_FAILED')
  if (change.operation === 'aliases') {
    if (!before || before.id !== target.bandId || before.updated_at !== target.expectedUpdatedAt
      || ['name', 'country_code', 'musicbrainz_id', 'category', 'curation_status'].some(k => !same(before[k], after[k]))
      || before.aliases.some(a => !after.aliases.includes(a))) fail('IDENTITY_READBACK_FAILED')
  } else if (before !== null || after.curation_status !== 'unreviewed' || after.category !== 'unclassified') fail('IDENTITY_READBACK_FAILED')
  return { verified: true, bandId: after.id, updatedAt: after.updated_at }
}
