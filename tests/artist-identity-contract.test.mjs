import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateIdentityMutation, prepareIdentityTargets, verifyIdentityReceipt } from '../scripts/lib/artist-identity-contract.mjs'

const now = Date.parse('2026-10-22T12:00:00Z')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const mutation = () => ({ operation: 'aliases', musicBrainzId: id(2), name: 'Existing Artist', country: 'JP', aliases: ['同一アーティスト'],
  requirements: { identityMatched: true, countryMatched: true, sameIdentityAliases: true },
  proof: { decision: 'keep', summary: 'Fixture only: official same identity and alias evidence', sources: [{ url: 'https://official.example/artist', checkedAt: new Date(now - 1000).toISOString(), summary: 'Fixture source' }] } })
const band = () => ({ id: id(1), name: 'Existing Artist', aliases: ['Existing alias'], country_code: 'JP', musicbrainz_id: id(2),
  category: 'jpop', curation_status: 'approved', updated_at: '2026-10-21T12:00:00Z', photo_mode: 'auto' })

test('identity proof never gains requirements from credentials or source presence', () => {
  assert.equal(validateIdentityMutation(mutation(), now).operation, 'aliases')
  for (const key of ['identityMatched', 'countryMatched', 'sameIdentityAliases']) {
    const m = mutation(); m.requirements[key] = false
    assert.throws(() => validateIdentityMutation(m, now), /IDENTITY_PROOF_REQUIRED/)
  }
  for (const stamp of [now + 1, now - 90 * 86400000]) {
    const m = mutation(); m.proof.sources[0].checkedAt = new Date(stamp).toISOString()
    assert.throws(() => validateIdentityMutation(m, now), /IDENTITY_PROOF_REQUIRED/)
  }
  const m = mutation(); m.proof.sources[0].url += '?api_key=fixture'
  assert.throws(() => validateIdentityMutation(m, now), /IDENTITY_PROOF_REQUIRED/)
})

test('fixed targets preserve versions, 40-team limit, identity and manual decisions', () => {
  const b = band(), target = { bandId: b.id, expectedUpdatedAt: b.updated_at }, work = [{ bandId: b.id, mutation: mutation() }]
  const input = JSON.stringify([target, work, b])
  assert.equal(prepareIdentityTargets([target], work, [b], now)[0].mutation.operation, 'aliases')
  assert.equal(JSON.stringify([target, work, b]), input)
  assert.throws(() => prepareIdentityTargets([target], [{ ...work[0], bandId: id(3) }], [b], now), /TARGET_NOT_SELECTED/)
  assert.throws(() => prepareIdentityTargets(Array.from({ length: 41 }, (_, n) => ({ bandId: id(n + 100) })), [], [], now), /SELECTION_INVALID/)
  assert.throws(() => prepareIdentityTargets([target], work, [{ ...b, updated_at: 'newer' }], now), /EDIT_CONFLICT/)
  assert.throws(() => prepareIdentityTargets([target], work, [{ ...b, curation_status: 'held' }], now), /MANUAL_DECISION/)
  assert.throws(() => prepareIdentityTargets([target], work, [b, { ...b, id: id(4), aliases: ['同一アーティスト'] }], now), /ALIAS_CONFLICT/)
})

test('new registration cannot duplicate an external ID or reuse an existing version', () => {
  const b = band(), m = { ...mutation(), operation: 'register' }, t = { bandId: id(3), expectedUpdatedAt: null }
  assert.equal(prepareIdentityTargets([t], [{ bandId: t.bandId, mutation: m }], [], now)[0].mutation.operation, 'register')
  assert.throws(() => prepareIdentityTargets([t], [{ bandId: t.bandId, mutation: m }], [b], now), /IDENTITY_CONFLICT/)
  assert.throws(() => prepareIdentityTargets([{ ...t, expectedUpdatedAt: b.updated_at }], [{ bandId: t.bandId, mutation: m }], [], now), /IDENTITY_CONFLICT/)
})

test('all 40 original versions are checked even when only the first target mutates', () => {
  const b = band(), catalog = [b, ...Array.from({ length: 39 }, (_, n) => ({ ...b,
    id: id(n + 100), name: `Other Fixture ${n}`, aliases: [], musicbrainz_id: id(n + 200) }))]
  const targets = catalog.map(row => ({ bandId: row.id, expectedUpdatedAt: row.updated_at }))
  const work = [{ bandId: b.id, mutation: mutation() }]
  const before = JSON.stringify([targets, work, catalog])
  assert.equal(prepareIdentityTargets(targets, work, catalog, now).length, 40)
  assert.equal(JSON.stringify([targets, work, catalog]), before)
  for (const current of [catalog.slice(0, -1), catalog.map((row, i) => i === 39
    ? { ...row, updated_at: '2026-10-22T11:00:00Z' } : row)]) {
    assert.throws(() => prepareIdentityTargets(targets, work, current, now), /EDIT_CONFLICT/)
  }
  const missingVersion = structuredClone(targets); missingVersion[39].expectedUpdatedAt = null
  assert.throws(() => prepareIdentityTargets(missingVersion, work, catalog, now), /EDIT_CONFLICT/)
  assert.equal(JSON.stringify([targets, work, catalog]), before)
})

test('receipt requires current readback and preserved aliases, status, category and relations', () => {
  const b = band(), m = mutation(), after = { ...b, aliases: [...b.aliases, ...m.aliases], updated_at: '2026-10-22T12:00:00Z' }
  const target = { bandId: b.id, expectedUpdatedAt: b.updated_at, mutation: m }
  const args = { runId: id(9), target, receipt: { runId: id(9), mutation: m, before: b, after, relations: [3, 4] }, currentBand: after, currentRelations: [3, 4] }
  assert.equal(verifyIdentityReceipt(args).verified, true)
  assert.throws(() => verifyIdentityReceipt({ ...args, currentRelations: [2, 4] }), /READBACK_FAILED/)
  assert.throws(() => verifyIdentityReceipt({ ...args, currentBand: { ...after, updated_at: 'newer' } }), /READBACK_FAILED/)
  const missingAlias = { ...after, aliases: m.aliases }
  assert.throws(() => verifyIdentityReceipt({ ...args, receipt: { ...args.receipt, after: missingAlias }, currentBand: missingAlias }), /READBACK_FAILED/)
})
