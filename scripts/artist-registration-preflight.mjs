import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { prepareIdentityTargets } from './lib/artist-identity-contract.mjs'

// An offline review of existing pending IDs, never a registration or approval.
// No environment loading, ID allocation, queue lock, journal or network writes.
export function assessArtistRegistration(input, { role, now = Date.now() } = {}) {
  if (role !== 'artist') throw Error('ARTIST_ROLE_REQUIRED')
  if (input?.version !== 1 || !Number.isFinite(Date.parse(input.observedAt))
    || Date.parse(input.observedAt) > now || now - Date.parse(input.observedAt) > 3600000) throw Error('CATALOG_SNAPSHOT_INVALID')
  const targets = prepareIdentityTargets(input.targets, input.work, input.catalog, now)
  return { version: 1, status: 'CONTRACT_VALID_REQUIRES_EXECUTION_REVIEW',
    selected: targets.length, registrations: targets.filter(t => t.mutation?.operation === 'register').length,
    writesPerformed: false, approvalGranted: false,
    remaining: ['FRESH_SERVER_LEASE_AND_VERSION_CHECK', 'EXECUTION_APPROVAL_REVIEW', 'RPC_RECEIPT_AND_PUBLIC_SEARCH_READBACK'] }
}

export async function runRegistrationPreflight(args, { reader = path => readFile(path, 'utf8'), now = Date.now() } = {}) {
  // Reject a wrong/missing role before reading even the input file.
  if (args[0] !== '--role=artist') throw Error('ARTIST_ROLE_REQUIRED')
  if (args.length !== 2 || !args[1]) throw Error('PREFLIGHT_INPUT_REQUIRED')
  return assessArtistRegistration(JSON.parse(await reader(resolve(args[1]))), { role: 'artist', now })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await runRegistrationPreflight(process.argv.slice(2)))) }
  catch (error) {
    const safeCodes = ['ARTIST_ROLE_REQUIRED', 'PREFLIGHT_INPUT_REQUIRED', 'CATALOG_SNAPSHOT_INVALID',
      'SELECTION_INVALID', 'TARGET_NOT_SELECTED', 'IDENTITY_INVALID', 'IDENTITY_PROOF_REQUIRED',
      'IDENTITY_CONFLICT', 'EDIT_CONFLICT', 'MANUAL_DECISION', 'ALIAS_CONFLICT', 'SELECTION_CONFLICT']
    console.error(safeCodes.includes(error.message) ? error.message : 'ARTIST_REGISTRATION_PREFLIGHT_FAILED')
    process.exitCode = 1
  }
}
