import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

// Evidence journal only. No catalog, review, channel or scheduler writer.
export const profileBucket = 'concert-scheduler-state'
const prefix = 'artist-profile-preparation/v1'
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = code => { throw Error(code) }
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
const https = value => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.hash }
  catch { return false }
}

export function validateProfileEvent(event) {
  if (event?.schemaVersion !== 1 || !uuid.test(event.runId) || !uuid.test(event.bandId)
    || !uuid.test(event.musicBrainzId) || !stamp(event.sourceVersion) || !stamp(event.checkedAt)
    || !Number.isSafeInteger(event.attempt) || event.attempt < 1
    || !['candidate', 'approved', 'held', 'failed'].includes(event.status)
    || !Array.isArray(event.sources) || !event.sources.length
    || !event.sources.every(s => https(s.url) && stamp(s.checkedAt) && typeof s.useBasis === 'string' && s.useBasis.length > 5)
    || !event.retry || !Number.isSafeInteger(event.retry.count) || event.retry.count < 0
    || !(event.retry.nextAt === null || stamp(event.retry.nextAt))
    || event.application?.status !== 'not_attempted' || !event.candidate
    || (event.status === 'approved' && (!event.approval?.actor || !stamp(event.approval?.at)))) fail('PROFILE_EVENT_INVALID')
  const text = JSON.stringify(event)
  if (Buffer.byteLength(text) > 256 * 1024 || /SUPABASE_SERVICE_ROLE_KEY|RUNNER_SECRET|YOUTUBE_API_KEY|Bearer |sb_secret_|eyJ[A-Za-z0-9_-]{20}/.test(text)) fail('PROFILE_EVENT_INVALID')
  return event
}

export function profileAttemptKey(locator) {
  if (!uuid.test(locator?.runId) || !uuid.test(locator?.bandId)
    || !Number.isSafeInteger(locator?.attempt) || locator.attempt < 1) fail('PROFILE_LOCATOR_INVALID')
  return `${prefix}/runs/${locator.runId}/bands/${locator.bandId}/attempts/${locator.attempt}.json.gz`
}

export function profileEventKey(event) {
  validateProfileEvent(event)
  return profileAttemptKey(event)
}

export function profileStateStore(client) {
  const storage = client.storage.from(profileBucket)
  const privateBucket = async () => {
    const { data, error } = await client.storage.getBucket(profileBucket)
    if (error || data?.id !== profileBucket || data.public !== false) fail('PROFILE_PRIVATE_BUCKET_REQUIRED')
  }
  const read = async key => {
    const { data, error } = await storage.download(key)
    if (error || !data) fail('PROFILE_READBACK_FAILED')
    return Buffer.from(await data.arrayBuffer())
  }
  const readAttempt = async locator => {
    const key = profileAttemptKey(locator)
    await privateBucket()
    const bytes = await read(key)
    const actual = validateProfileEvent(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(gunzipSync(bytes, { maxOutputLength: 256 * 1024 }))))
    if (profileEventKey(actual) !== key) fail('PROFILE_ATTEMPT_CONFLICT')
    return actual
  }
  return {
    async persist(event) {
      const key = profileEventKey(event)
      const bytes = gzipSync(Buffer.from(JSON.stringify(event) + '\n', 'utf8'))
      await privateBucket()
      // Storage's atomic create is the concurrency fence; no list/read-then-upsert.
      const { error } = await storage.upload(key, bytes, { upsert: false, contentType: 'application/gzip', cacheControl: '0' })
      // Also read after an uncertain response. Only exact bytes establish success.
      let actual
      try { actual = await read(key) } catch { fail(error ? 'PROFILE_WRITE_UNCONFIRMED' : 'PROFILE_READBACK_FAILED') }
      if (sha(actual) !== sha(bytes)) fail('PROFILE_ATTEMPT_CONFLICT')
      return { key, sha256: sha(bytes), readbackVerified: true }
    },
    readAttempt,
    async read(event) {
      validateProfileEvent(event)
      const actual = await readAttempt(event)
      if (actual.musicBrainzId !== event.musicBrainzId || actual.sourceVersion !== event.sourceVersion) fail('PROFILE_ATTEMPT_CONFLICT')
      return actual
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const reading = process.argv[2] === '--read-attempt'
    if (process.argv.length !== 4 || (!reading && process.argv[2] !== '--persist-candidate')) fail('PROFILE_CANDIDATE_ARGUMENT_REQUIRED')
    const input = JSON.parse(await readFile(process.argv[3], 'utf8'))
    if (reading) profileAttemptKey(input)
    else {
      validateProfileEvent(input)
      if (!['candidate', 'held', 'failed'].includes(input.status)) fail('PROFILE_APPROVAL_NOT_SUPPORTED_BY_CLI')
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) fail('PROFILE_SERVER_ENV_REQUIRED')
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    console.log(JSON.stringify(await profileStateStore(client)[reading ? 'readAttempt' : 'persist'](input)))
  } catch (error) {
    console.error(/^PROFILE_[A-Z_]+$/.test(error.message) ? error.message : 'PROFILE_STATE_FAILED')
    process.exitCode = 1
  }
}
