import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { collectionDecision, publicationCollectionCompatible, runScheduledCollection } from '../scripts/collect-concerts-scheduled.mjs'

test('ON preflight rejects missing pins and server drift before spawning or changing a checkpoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'collection-contract-'))
  const directory = join(root, '.local/concert-collection')
  const checkpoint = '{"nextAttemptAt":null,"http400Streak":2,"preserve":"original"}\n'
  try {
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'latest.json'), checkpoint, 'utf8')
    for (const pinned of [undefined, 'a'.repeat(32)]) {
      const requests = []
      const fetcher = async (url, options) => {
        const path = new URL(url).pathname
        requests.push({ path, method: options.method ?? 'GET' })
        const data = path.endsWith('/collection_policies') ? [{ source: 'kopis', collection_enabled: true,
          publication_enabled: true, live_after: null }]
          : path.endsWith('/collection_runs') ? [] : { contract: 'publication-facts-v3', executor_md5: 'b'.repeat(32) }
        return new Response(JSON.stringify(data))
      }
      await assert.rejects(runScheduledCollection({ root, fetcher, env: {
        SUPABASE_URL: 'https://czjrzylvnewfjnfwjhwf.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture',
        KOPIS_SERVICE_KEY: 'fixture', KOPIS_PUBLICATION_EXECUTOR_MD5: pinned,
      } }), pinned ? /CONTRACT_UNCONFIRMED/ : /POLICY_CHANGED/)
      assert.deepEqual(requests.map(r => r.method), pinned ? ['GET', 'GET', 'POST'] : ['GET', 'GET'])
      assert.equal(await readFile(join(directory, 'latest.json'), 'utf8'), checkpoint)
      assert.deepEqual(await readdir(directory), ['latest.json'])
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('publication collection requires an explicitly pinned deployed executor and silent policy', () => {
  const digest = 'a'.repeat(32)
  const policy = { source: 'kopis', collection_enabled: true, publication_enabled: true, live_after: null }
  const capabilities = { contract: 'publication-facts-v3', reviewed_release: true, executor_md5: digest }
  assert.equal(publicationCollectionCompatible(policy, capabilities, digest), true)
  for (const expected of [undefined, '', 'x'.repeat(32), 'b'.repeat(32)]) {
    assert.equal(publicationCollectionCompatible(policy, capabilities, expected), false)
  }
  for (const changed of [{ source: 'ualive' }, { collection_enabled: false }, { publication_enabled: false },
    { live_after: undefined }, { live_after: '2026-10-31T00:00:00Z' }]) {
    assert.equal(publicationCollectionCompatible({ ...policy, ...changed }, capabilities, digest), false)
  }
  assert.equal(publicationCollectionCompatible(policy, null, digest), false)
  assert.equal(publicationCollectionCompatible(policy, { ...capabilities, reviewed_release: false }, digest), false)
  assert.equal(publicationCollectionCompatible(policy, { ...capabilities, contract: 'legacy' }, digest), false)
})

test('an approved silent scheduled run selects the reviewed publisher instead of raw recollection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reviewed-scheduled-'))
  try {
    await mkdir(join(root, 'scripts'), { recursive: true })
    await writeFile(join(root, 'scripts/publish-reviewed-candidate.mjs'), `
      import {writeFile} from 'node:fs/promises';
      const output=process.argv.find(a=>a.startsWith('--output=')).slice(9);
      await writeFile(output,JSON.stringify({complete:true,results:[{source:'kopis',candidates:[],failures:[],uploaded:false}]}));
    `, 'utf8')
    const digest = 'a'.repeat(32)
    const status = await runScheduledCollection({ root, env: {
      SUPABASE_URL: 'https://czjrzylvnewfjnfwjhwf.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fictional', KOPIS_SERVICE_KEY: 'fictional',
      KOPIS_PUBLICATION_EXECUTOR_MD5: digest, KOPIS_REVIEWED_CANDIDATE: '00000000-0000-4000-8000-000000000001:1',
      KOPIS_REVIEWED_GUIDANCE: '가상 검증 회차 19:00',
    }, fetcher: async url => {
      const path = new URL(url).pathname
      return new Response(JSON.stringify(path.endsWith('/collection_policies') ? [{ source: 'kopis', collection_enabled: true,
        publication_enabled: true, live_after: null }] : path.endsWith('/collection_runs') ? []
        : { contract: 'publication-facts-v3', reviewed_release: true, executor_md5: digest }))
    } })
    assert.equal(status.failed, false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('collection fallback respects source policy, recent server attempts, cooldown and clock uncertainty', () => {
  const now = Date.parse('2026-10-22T12:00:00Z'), policy = { collection_enabled: true }
  assert.equal(collectionDecision({ policy, now }), 'collect')
  assert.equal(collectionDecision({ policy: { collection_enabled: false }, now }), 'policy_off')
  assert.equal(collectionDecision({ policy, now, latest: { started_at: '2026-10-22T11:01:00Z' } }), 'recent_attempt')
  assert.equal(collectionDecision({ policy, now, latest: { started_at: '2026-10-22T11:00:00Z' } }), 'collect')
  assert.equal(collectionDecision({ policy, now, latest: { started_at: '2026-10-22T12:01:00Z' } }), 'clock_or_state_unconfirmed')
  assert.equal(collectionDecision({ policy, now, latest: { started_at: 'invalid' } }), 'clock_or_state_unconfirmed')
  assert.equal(collectionDecision({ policy, now, nextAttemptAt: '2026-10-23T12:00:00Z' }), 'cooldown')
})

test('continuous mode keeps discovery running when the reviewed batch is empty', async () => {
  const root = await mkdtemp(join(tmpdir(), 'continuous-scheduled-'))
  try {
    await mkdir(join(root, 'scripts'), { recursive: true })
    await writeFile(join(root, 'scripts/collect-catalog.mjs'), `
      import {writeFile} from 'node:fs/promises';
      const output=process.argv.find(a=>a.startsWith('--output=')).slice(9);
      await writeFile(output,JSON.stringify({complete:true,results:[{source:'kopis',candidates:[],failures:[],uploaded:false}]}));
    `, 'utf8')
    const digest = 'a'.repeat(32)
    const env = { SUPABASE_URL: 'https://czjrzylvnewfjnfwjhwf.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture',
      KOPIS_SERVICE_KEY: 'fixture', KOPIS_PUBLICATION_EXECUTOR_MD5: digest, KOPIS_AUTOMATIC_PUBLICATION: '1', KOPIS_AUTOMATIC_REVIEW_FILE: '/fictional/empty-plan.json' }
    const fetcher = async url => new Response(JSON.stringify(new URL(url).pathname.endsWith('/collection_policies')
      ? [{ source: 'kopis', collection_enabled: true, publication_enabled: true, live_after: null }]
      : new URL(url).pathname.endsWith('/collection_runs') ? []
      : { contract: 'publication-facts-v3', reviewed_release: true, continuous_review: true, executor_md5: digest }))
    assert.equal((await runScheduledCollection({ root, env, fetcher })).failed, false)
  } finally { await rm(root, { recursive: true, force: true }) }
})
