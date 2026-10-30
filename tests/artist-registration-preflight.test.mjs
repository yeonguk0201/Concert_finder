import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessArtistRegistration, runRegistrationPreflight } from '../scripts/artist-registration-preflight.mjs'

const now = Date.parse('2026-10-30T00:00:00Z')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const input = () => ({ version: 1, observedAt: new Date(now).toISOString(),
  targets: [{ bandId: id(1), expectedUpdatedAt: null }], catalog: [],
  work: [{ bandId: id(1), mutation: { operation: 'register', musicBrainzId: id(2), name: 'Fictional artist', country: 'JP', aliases: [],
    requirements: { identityMatched: true, countryMatched: true, sameIdentityAliases: true },
    proof: { decision: 'keep', summary: 'Fictional fixture', sources: [{ url: 'https://official.example/artist', checkedAt: new Date(now).toISOString(), summary: 'Fixture identity' }] } } }] })

test('offline preparation accepts an existing internal ID without granting execution approval or changing pending input', () => {
  const pending = input(), before = structuredClone(pending)
  const result = assessArtistRegistration(pending, { role: 'artist', now })
  assert.equal(result.registrations, 1)
  assert.equal(result.approvalGranted, false)
  assert.equal(result.writesPerformed, false)
  assert.deepEqual(pending, before)
})

test('monitor and unspecified roles cannot read preflight files', async () => {
  for (const args of [[], ['--role=monitor', 'pending.json'], ['pending.json']]) {
    await assert.rejects(runRegistrationPreflight(args, { reader: () => assert.fail('must not read') }), /ARTIST_ROLE_REQUIRED/)
  }
})

test('stale catalog, duplicate identity and missing proof remain registration blockers', () => {
  const stale = input(); stale.observedAt = new Date(now - 3600001).toISOString()
  assert.throws(() => assessArtistRegistration(stale, { role: 'artist', now }), /CATALOG_SNAPSHOT_INVALID/)
  const duplicate = input(); duplicate.catalog.push({ id: id(3), musicbrainz_id: id(2) })
  assert.throws(() => assessArtistRegistration(duplicate, { role: 'artist', now }), /IDENTITY_CONFLICT/)
  const unverified = input(); unverified.work[0].mutation.requirements.identityMatched = false
  assert.throws(() => assessArtistRegistration(unverified, { role: 'artist', now }), /IDENTITY_PROOF_REQUIRED/)
})
