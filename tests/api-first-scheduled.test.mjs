import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apiFirstCollectionCompatible } from '../scripts/api-first-publication.mjs'
import { apiCollectionCheckpoint, assertApiCheckpoint } from '../scripts/collection-cooldown.mjs'
import { runScheduledCollection } from '../scripts/collect-concerts-scheduled.mjs'

const now = Date.parse('2026-11-09T00:00:00Z'), hour = 3600000
const checkpoint = { cooldownVersion: 2, nextAttemptAt: new Date(now - hour).toISOString(),
  preserve: 'original checkpoint', reviewBatch: ['fixed'], notificationFingerprint: 'keep' }
const env = { SUPABASE_URL: 'https://czjrzylvnewfjnfwjhwf.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fictional',
  KOPIS_SERVICE_KEY: 'fictional', KOPIS_API_FIRST_PUBLICATION: '1', KOPIS_PUBLICATION_EXECUTOR_MD5: 'a'.repeat(32), KOPIS_API_FACTS_MD5: 'b'.repeat(32) }
const policy = { source: 'kopis', collection_enabled: true, publication_enabled: true, live_after: null, adapter_version: 'catalog-v1' }
const capabilities = { contract: 'publication-facts-v4', api_facts_contract: 'kopis-api-facts-v1', executor_md5: env.KOPIS_PUBLICATION_EXECUTOR_MD5, api_facts_md5: env.KOPIS_API_FACTS_MD5 }

test('API-first preflight requires both pinned digests and silent policy', () => {
  assert.equal(apiFirstCollectionCompatible(policy, capabilities, env.KOPIS_PUBLICATION_EXECUTOR_MD5, env.KOPIS_API_FACTS_MD5), true)
  for (const change of [{ contract: 'publication-facts-v3' }, { api_facts_md5: '0'.repeat(32) }, { executor_md5: '0'.repeat(32) }]) {
    assert.equal(apiFirstCollectionCompatible(policy, { ...capabilities, ...change }, env.KOPIS_PUBLICATION_EXECUTOR_MD5, env.KOPIS_API_FACTS_MD5), false)
  }
  assert.equal(apiFirstCollectionCompatible({ ...policy, live_after: '2026-11-01T00:00:00Z' }, capabilities, env.KOPIS_PUBLICATION_EXECUTOR_MD5, env.KOPIS_API_FACTS_MD5), false)
})

test('HTTP 400 cooldown advances 1h → 6h → 24h and preserves original checkpoint fields', () => {
  const failure = { error: 'KOPIS HTTP 400 [list 20261109-20261209 page=1]' }
  let previous = checkpoint
  for (const [index, hours] of [1, 6, 24, 24].entries()) {
    const result = apiCollectionCheckpoint(previous, failure, { now })
    assert.equal(Date.parse(result.nextAttemptAt) - now, hours * hour)
    assert.equal(result.http400Streak, Math.min(3, index + 1))
    assert.equal(result.preserve, checkpoint.preserve); assert.deepEqual(result.reviewBatch, checkpoint.reviewBatch)
    assert.equal(result.notificationFingerprint, checkpoint.notificationFingerprint)
    previous = result
  }
  const detail = apiCollectionCheckpoint(checkpoint, { failures: [{ error: failure.error }] }, { now, confirmed: true })
  assert.equal(Date.parse(detail.nextAttemptAt) - now, hour)
  assert.equal(detail.failed, true)
  const unconfirmed = apiCollectionCheckpoint(checkpoint, {}, { now })
  assert.equal(Date.parse(unconfirmed.nextAttemptAt) - now, 24 * hour)
  assert.equal(unconfirmed.uploaded, false)
  const historic = apiCollectionCheckpoint({ ...checkpoint, http400Streak: 2 }, failure, { now })
  assert.equal(Date.parse(historic.nextAttemptAt) - now, 24 * hour)
  const uncertain400 = apiCollectionCheckpoint(checkpoint, failure, { now, receiptUnconfirmed: true })
  assert.equal(Date.parse(uncertain400.nextAttemptAt) - now, 24 * hour)
  const temporary = apiCollectionCheckpoint(checkpoint, { error: 'KOPIS HTTP 503 [list 20261109-20261209 page=1]' }, { now })
  assert.equal(Date.parse(temporary.nextAttemptAt) - now, hour)
  assert.throws(() => assertApiCheckpoint({ ...checkpoint, nextAttemptAt: 'invalid' }), /CHECKPOINT_UNCONFIRMED/)
})

test('missing original checkpoint never creates a directory or issues any API request', async () => {
  const root = await mkdtemp(join(tmpdir(), 'api-first-missing-'))
  try {
    await assert.rejects(runScheduledCollection({ root, env, fetcher: () => assert.fail('no requests') }), /CHECKPOINT_UNREADABLE/)
    assert.deepEqual(await readdir(root), [])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('cooldown, recent runs and contract mismatch preserve the original checkpoint byte for byte', async () => {
  const root = await mkdtemp(join(tmpdir(), 'api-first-preflight-'))
  const directory = join(root, '.local/concert-collection')
  try {
    await mkdir(directory, { recursive: true })
    for (const scenario of ['cooldown', 'recent', 'contract']) {
      const saved = JSON.stringify({ ...checkpoint, nextAttemptAt: new Date(scenario === 'cooldown' ? now + hour : now - hour).toISOString() })
      await writeFile(join(directory, 'latest.json'), saved, 'utf8')
      let calls = 0
      const fetcher = async url => {
        calls++
        const path = new URL(url).pathname
        return new Response(JSON.stringify(path.endsWith('/collection_policies') ? [policy]
          : path.endsWith('/collection_runs') ? scenario === 'recent' ? [{ started_at: new Date(now).toISOString() }] : []
          : { ...capabilities, api_facts_md5: '0'.repeat(32) }))
      }
      if (scenario === 'contract') await assert.rejects(runScheduledCollection({ root, env, now, fetcher }), /API_PUBLICATION_CONTRACT_CHANGED/)
      else assert.equal((await runScheduledCollection({ root, env, now, fetcher })).skipped, scenario === 'cooldown' ? 'cooldown' : 'recent_attempt')
      assert.equal(calls, scenario === 'contract' ? 3 : 2)
      assert.equal(await readFile(join(directory, 'latest.json'), 'utf8'), saved)
      assert.deepEqual(await readdir(directory), ['latest.json'])
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('scheduled API execution confirms the persisted run and protects uncertain receipts for 24h', async () => {
  const root = await mkdtemp(join(tmpdir(), 'api-first-receipt-'))
  const directory = join(root, '.local/concert-collection')
  const run = { id: '00000000-0000-4000-8000-000000000001', state: 'success', finished_at: new Date().toISOString(),
    candidate_count: 1, published_count: 1, review_count: 0 }
  try {
    await mkdir(directory, { recursive: true })
    for (const scenario of ['confirmed', 'mismatch', 'unavailable', 'locked', 'changed']) {
      const saved = JSON.stringify(checkpoint)
      await writeFile(join(directory, 'latest.json'), saved, 'utf8')
      let executed = false
      const fetcher = async url => {
        const u = new URL(url), path = u.pathname
        if (path.endsWith('/collection_policies')) return new Response(JSON.stringify([policy]))
        if (path.endsWith('/collection_runs')) {
          if (!u.searchParams.has('id')) return new Response('[]')
          if (scenario === 'unavailable') return new Response('unavailable', { status: 503 })
          return new Response(JSON.stringify([{ ...run, published_count: scenario === 'mismatch' ? 0 : 1 }]))
        }
        return new Response(JSON.stringify(capabilities))
      }
      const apiExecutor = async () => {
        executed = true
        if (scenario === 'locked') return { skipped: 'locked_or_disabled' }
        if (scenario === 'changed') await writeFile(join(directory, 'latest.json'), 'concurrent update', 'utf8')
        return { run_id: run.id, candidates: [{}], failures: [], holds: [{ source_url: 'fixture', reasons: ['ARTIST_OR_GENRE_UNVERIFIED'] }],
          publication: { published: 1, review: 0 } }
      }
      if (scenario === 'changed') {
        await assert.rejects(runScheduledCollection({ root, env, now, fetcher, apiExecutor }), /CHECKPOINT_CHANGED/)
        assert.equal(await readFile(join(directory, 'latest.json'), 'utf8'), 'concurrent update')
      } else {
        const status = await runScheduledCollection({ root, env, now, fetcher, apiExecutor })
        if (scenario === 'locked') assert.equal(await readFile(join(directory, 'latest.json'), 'utf8'), saved)
        else {
          assert.equal(status.uploaded, scenario === 'confirmed')
          assert.equal(status.published, scenario === 'confirmed' ? 1 : 0)
          assert.equal(status.held, 1); assert.equal(status.preserve, checkpoint.preserve)
          const remaining = Date.parse(status.nextAttemptAt) - Date.parse(status.checkedAt)
          assert.equal(remaining, (scenario === 'confirmed' ? 1 : 24) * hour)
        }
      }
      assert.equal(executed, true)
      assert.deepEqual(await readdir(directory), ['latest.json'])
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})
