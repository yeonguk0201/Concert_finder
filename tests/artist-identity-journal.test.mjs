import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, symlink, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareIdentityJournal, validateIdentityJournal, saveIdentityJournal, loadIdentityJournal } from '../scripts/lib/artist-identity-journal.mjs'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const now = Date.parse('2026-10-24T00:00:00Z')
function fixture() {
  const band = { id: id(1), name: 'Fictional Artist', aliases: ['Original'], country_code: 'JP',
    musicbrainz_id: id(2), updated_at: '2026-10-23T00:00:00Z', curation_status: 'unreviewed' }
  const mutation = { operation: 'aliases', musicBrainzId: id(2), name: band.name, country: 'JP', aliases: ['仮の名前'],
    requirements: { identityMatched: true, countryMatched: true, sameIdentityAliases: true },
    proof: { decision: 'keep', summary: 'Fictional fixture only', sources: [
      { url: 'https://fixture.example/artist', checkedAt: '2026-10-23T23:00:00Z', summary: 'Fictional identity proof' }] } }
  return { runId: id(9), targets: [{ bandId: band.id, expectedUpdatedAt: band.updated_at }],
    work: [{ bandId: band.id, mutation }], catalog: [band], now }
}
async function directory(t) {
  const root = await mkdtemp(join(tmpdir(), 'identity-journal-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
test('preparation freezes the entire selection and never modifies source objects', () => {
  const f = fixture(); f.targets.push({ bandId: id(3), expectedUpdatedAt: f.catalog[0].updated_at })
  f.catalog.push({ ...f.catalog[0], id: id(3), name: 'Other Fixture', aliases: [], musicbrainz_id: id(4) })
  const before = structuredClone(f), journal = prepareIdentityJournal(f)
  assert.deepEqual(f, before); assert.equal(journal.targets.length, 2)
  f.work[0].mutation.aliases.push('changed')
  assert.deepEqual(journal.targets[0].mutation.aliases, ['仮の名前'])
  assert.equal(journal.targets[1].mutation, undefined)
})
test('wrong original versions, proof, target and more than 40 IDs fail before persistence', () => {
  for (const change of [f => { f.targets[0].expectedUpdatedAt = '2026-10-22T00:00:00Z' },
    f => { f.work[0].mutation.requirements.identityMatched = false },
    f => { f.work[0].bandId = id(3) },
    f => { f.targets = Array.from({ length: 41 }, (_, n) => ({ bandId: id(n + 1), expectedUpdatedAt: null })) }]) {
    const f = fixture(); change(f); assert.throws(() => prepareIdentityJournal(f))
  }
})
test('registration requires a supplied fixed ID and absence in the complete catalog', () => {
  const f = fixture(); f.work[0].mutation.operation = 'register'; f.targets[0].expectedUpdatedAt = null
  assert.throws(() => prepareIdentityJournal(f), /IDENTITY_CONFLICT/)
  f.catalog = []
  const journal = prepareIdentityJournal(f)
  assert.equal(journal.targets[0].bandId, id(1)); assert.equal(journal.targets[0].expectedUpdatedAt, null)
})
test('UTF-8 journal survives restart and concurrent identical publication without replacement', async t => {
  const root = await directory(t), path = join(root, 'journal.json'), journal = prepareIdentityJournal(fixture())
  await Promise.all([saveIdentityJournal(path, journal, now), saveIdentityJournal(path, journal, now)])
  assert.deepEqual(await loadIdentityJournal(path, now), journal)
  assert.match(await readFile(path, 'utf8'), /仮の名前/)
  assert.deepEqual(await readdir(root), ['journal.json'])
})
test('a changed alias/request or damaged journal cannot replace the original', async t => {
  const root = await directory(t), path = join(root, 'journal.json'), f = fixture()
  await saveIdentityJournal(path, prepareIdentityJournal(f), now)
  const original = await readFile(path, 'utf8'); f.work[0].mutation.aliases.push('another alias')
  await assert.rejects(saveIdentityJournal(path, prepareIdentityJournal(f), now), /JOURNAL_CONFLICT/)
  assert.equal(await readFile(path, 'utf8'), original)
  await writeFile(path, '{damaged', 'utf8')
  await assert.rejects(saveIdentityJournal(path, prepareIdentityJournal(f), now), /JOURNAL_UNREADABLE/)
  assert.equal(await readFile(path, 'utf8'), '{damaged')
})
test('tampering, stale evidence and symlinks stop recovery without writing their targets', async t => {
  const journal = prepareIdentityJournal(fixture()); journal.targets[0].mutation.aliases.push('tamper')
  assert.throws(() => validateIdentityJournal(journal, now), /JOURNAL_CONFLICT/)
  assert.throws(() => validateIdentityJournal(prepareIdentityJournal(fixture()), now + 91 * 86400000), /PROOF_REQUIRED/)
  const root = await directory(t), path = join(root, 'journal.json'), target = join(root, 'other.json')
  await writeFile(target, '{}', 'utf8'); await symlink(target, path)
  await assert.rejects(saveIdentityJournal(path, prepareIdentityJournal(fixture()), now), /JOURNAL_UNREADABLE/)
  assert.equal(await readFile(target, 'utf8'), '{}')
})
