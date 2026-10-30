import { readFile, writeFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { assessPublicationReadiness } from './concert-publication-readiness.mjs'
import { preparePressSaleEvidence } from './press-sale-evidence.mjs'

const actions = {
  ARTIST_IDENTITY_OR_APPROVAL_UNVERIFIED: ['artist', 'Verify canonical identity, register/approve/search within the existing fixed40 integrated lease; collector then verifies candidate links.'],
  SOURCE_USE_UNVERIFIED: ['collector', 'Check the exact API/license/use scope or an independent allowed source; require operator action only for a concrete unresolved external grant.'],
  RUNNER_NOT_PUBLICATION_COMPATIBLE: ['collector', 'Prepare and isolate-test publication compatibility; preserve existing ON guard until separately approved release.'],
  ADAPTER_UNVERIFIED: ['collector', 'Verify actual source layout and permitted use; synthetic tests do not certify the adapter.'],
  GENERAL_SALE_UNVERIFIED: ['collector', 'Match original general-sale evidence and contextual date interpretation to this event; never rewrite the source line.'],
  SESSIONS_UNVERIFIED: ['collector', 'Verify exact individual performance starts; never expand a date range into daily sessions.'],
  ANNOUNCEMENT_UNVERIFIED: ['collector', 'Verify original announcement timestamp separately from updates.'],
  OPTIONAL_NOL_DEPENDENCY: ['collector', 'Find independent allowed evidence/booking path; preserve NOL exclusion.'],
}

// Preparation checkpoint only. Its results never modify/certify the DB snapshot.
export function planPublicationPilot(input, { previous, now = Date.now() } = {}) {
  if (input?.version !== 1 || typeof input.candidateId !== 'string' || !input.candidateId
    || !previous || previous.candidateId !== input.candidateId) throw Error('PILOT_CHECKPOINT_REQUIRED')
  const assessment = assessPublicationReadiness(input.snapshot, { now })
  const matches = input.snapshot.sources.flatMap(source => source.candidates?.filter(row => row.id === input.candidateId).map(row => ({ source, row })) ?? [])
  if (matches.length !== 1) throw Error('PILOT_TARGET_UNCONFIRMED')
  const { source, row } = matches[0]
  if (!Number.isInteger(row.revision) || row.revision < 1 || previous.revision > row.revision) throw Error('PILOT_REVISION_STALE')
  const result = assessment.sources.find(s => s.source === source.source)
  const candidate = result?.candidates?.find(c => c.id === row.id)
  if (!candidate) throw Error('PILOT_TARGET_UNCONFIRMED')
  // Facts from a separate press source remain advisory and do not clear DB blockers.
  let press = null
  if (input.pressEvidence) {
    const checked = Date.parse(input.pressEvidence.checkedAt)
    if (!Number.isFinite(checked) || checked > now || now - checked > 90 * 86400000) throw Error('PILOT_PRESS_EVIDENCE_STALE')
    press = preparePressSaleEvidence(input.pressEvidence)
  }
  const blockers = [...new Set([...result.blockers.filter(b => b !== 'NO_VERIFIED_CANDIDATES'), ...candidate.reasons])].sort()
  const tasks = blockers.map(code => {
    const [owner, action] = actions[code] ?? ['collector', 'Verify this specific blocker with official evidence and current candidate revision.']
    return { code, owner, action, status: 'pending' }
  })
  const ready = candidate.eligible && result.status === 'READY_FOR_ACTIVATION'
  const status = ready ? 'READY_FOR_PUBLICATION_APPROVAL' : result.status === 'ACTIVE_VERIFIED' && candidate.eligible ? 'ACTIVE_VERIFIED_ADVISORY' : 'BLOCKED_NOT_READY'
  const facts = { candidateId: row.id, revision: row.revision, status, tasks,
    notificationMode: candidate.notificationMode, press }
  const fingerprint = createHash('sha256').update(JSON.stringify(facts)).digest('hex')
  const changed = previous.preparationFingerprint !== fingerprint
  return { version: 1, ...facts, observedAt: input.snapshot.observedAt,
    preparationFingerprint: fingerprint, changed, notify: changed,
    lastNotified: previous.lastNotified ?? null, // Writing a checkpoint is not notification delivery.
    operationallyApplied: false, assessment, nextAction: tasks[0] ?? null }
}

export async function runPilotPreparation(inputPath, previousPath, outputPath) {
  const root = resolve('.local/concert-operations')
  const checked = path => {
    const absolute = resolve(path ?? '')
    if (!absolute.startsWith(root + '/')) throw Error('PILOT_LOCAL_PATH_REQUIRED')
    return absolute
  }
  const source = checked(inputPath), previous = checked(previousPath), target = checked(outputPath)
  if (source === target || previous === target) throw Error('PILOT_INPUT_OVERWRITE_FORBIDDEN')
  const result = planPublicationPilot(JSON.parse(await readFile(source, 'utf8')), { previous: JSON.parse(await readFile(previous, 'utf8')) })
  const temp = target + '.tmp'
  await writeFile(temp, JSON.stringify(result, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  await rename(temp, target)
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runPilotPreparation(...process.argv.slice(2)).then(r => console.log(JSON.stringify({ status: r.status, pending: r.tasks.length, changed: r.changed })))
    .catch(() => { console.error('PILOT_PREPARATION_FAILED'); process.exitCode = 1 })
}
