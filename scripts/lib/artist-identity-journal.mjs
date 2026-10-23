import { createHash, randomUUID } from 'node:crypto'
import { open, link, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { constants } from 'node:fs'
import { prepareIdentityTargets, validateIdentityMutation } from './artist-identity-contract.mjs'

const ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const fingerprint = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')

// Preparation only: this journal has no execution/completion flags, credentials,
// RPC client, queue writer or generated artist IDs. It cannot authorize a write.
export function prepareIdentityJournal({ runId, targets, work, catalog, now = Date.now() }) {
  if (!ID.test(runId ?? '') || !Array.isArray(catalog) || !Array.isArray(work) || !work.length) {
    throw Error('IDENTITY_JOURNAL_INVALID')
  }
  if (!Array.isArray(targets) || targets.some(target => target.mutation && !work.some(item => item.bandId === target.bandId))) {
    throw Error('IDENTITY_JOURNAL_INVALID')
  }
  const prepared = prepareIdentityTargets(targets, work, catalog, now)
  if (prepared.some(target => Object.keys(target).some(key => !['bandId', 'expectedUpdatedAt', 'mutation'].includes(key))
    || (target.expectedUpdatedAt !== null && !Number.isFinite(Date.parse(target.expectedUpdatedAt))))) {
    throw Error('IDENTITY_JOURNAL_INVALID')
  }
  const payload = { version: 1, contract: '20261022121342', runId, targets: prepared }
  return validateIdentityJournal({ ...payload, fingerprint: fingerprint(payload) }, now)
}

export function validateIdentityJournal(journal, now = Date.now()) {
  if (!journal || Object.keys(journal).some(key => !['version', 'contract', 'runId', 'targets', 'fingerprint'].includes(key))
    || journal.version !== 1 || journal.contract !== '20261022121342' || !ID.test(journal.runId ?? '')
    || !Array.isArray(journal.targets) || journal.targets.length < 1 || journal.targets.length > 40
    || new Set(journal.targets.map(target => target.bandId)).size !== journal.targets.length
    || !journal.targets.some(target => target.mutation)) throw Error('IDENTITY_JOURNAL_INVALID')
  for (const target of journal.targets) {
    if (!ID.test(target.bandId ?? '') || Object.keys(target).some(key => !['bandId', 'expectedUpdatedAt', 'mutation'].includes(key))
      || (target.expectedUpdatedAt !== null && !Number.isFinite(Date.parse(target.expectedUpdatedAt)))) {
      throw Error('IDENTITY_JOURNAL_INVALID')
    }
    if (target.mutation) validateIdentityMutation(target.mutation, now)
    if (target.expectedUpdatedAt === null && target.mutation?.operation !== 'register'
      || target.mutation?.operation === 'register' && target.expectedUpdatedAt !== null) throw Error('IDENTITY_JOURNAL_INVALID')
  }
  const { fingerprint: digest, ...payload } = journal
  if (digest !== fingerprint(payload)) throw Error('IDENTITY_JOURNAL_CONFLICT')
  return structuredClone(journal)
}

export async function loadIdentityJournal(path, now = Date.now()) {
  let handle
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > 2_000_000) throw Error('invalid')
    return validateIdentityJournal(JSON.parse(await handle.readFile('utf8')), now)
  } catch (error) {
    if (error.code === 'ENOENT') throw Error('IDENTITY_JOURNAL_MISSING')
    throw Error('IDENTITY_JOURNAL_UNREADABLE')
  } finally { await handle?.close() }
}

// Publish a flushed UTF-8 file with an atomic, no-replace hard link. Interrupted
// or competing attempts can only reuse the identical frozen request. Never
// replace a damaged/conflicting journal with a fresh one to permit resubmission.
export async function saveIdentityJournal(path, journal, now = Date.now()) {
  const validated = validateIdentityJournal(journal, now)
  const temporary = `${path}.${randomUUID()}.tmp`
  let handle
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(JSON.stringify(validated, null, 2) + '\n', 'utf8')
    await handle.sync()
    await handle.close(); handle = null
    try { await link(temporary, path) }
    catch (error) { if (error.code !== 'EEXIST') throw error }
    const directory = await open(dirname(path), 'r')
    try { await directory.sync() } finally { await directory.close() }
    const stored = await loadIdentityJournal(path, now)
    if (stored.fingerprint !== validated.fingerprint) throw Error('IDENTITY_JOURNAL_CONFLICT')
    return stored
  } finally {
    await handle?.close()
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
}
