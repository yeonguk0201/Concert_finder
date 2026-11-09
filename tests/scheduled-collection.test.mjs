import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectionDecision, runScheduledCollection, collectionCooldown, migrateHttp400Cooldown } from '../scripts/collect-concerts-scheduled.mjs'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

test('lost or incomplete checkpoint cannot silently clear collection cooldown', async () => {
  const root = await mkdtemp(join(tmpdir(), 'collection-checkpoint-'))
  let requests = 0
  const options = { root, env: { SUPABASE_URL: 'https://czjrzylvnewfjnfwjhwf.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture', KOPIS_SERVICE_KEY: 'fixture' },
    fetcher: async () => { requests++; throw new Error('Unexpected network request') } }
  try {
    await assert.rejects(runScheduledCollection(options), /COLLECTION_CHECKPOINT_REQUIRED/)
    await mkdir(join(root, '.local/concert-collection'), { recursive: true })
    await writeFile(join(root, '.local/concert-collection/latest.json'), '{}', 'utf8')
    await assert.rejects(runScheduledCollection(options), /COLLECTION_CHECKPOINT_UNREADABLE/)
    assert.equal(requests, 0)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('failed collector UUID reads back the same failed DB run with a first-400 1h cooldown', async () => {
  const root = await mkdtemp(join(tmpdir(), 'collection-failed-readback-'))
  const runId = '00000000-0000-4000-8000-000000000099'
  const run = { id: runId, state: 'failed', finished_at: '2026-10-29T00:45:16Z', candidate_count: 0 }
  const directory = join(root, '.local/concert-collection')
  const paths = []
  try {
    await mkdir(directory, { recursive: true })
    await mkdir(join(root, 'scripts'))
    await writeFile(join(directory, 'latest.json'), JSON.stringify({ source: 'kopis', nextAttemptAt: '2000-01-01T00:00:00Z' }), 'utf8')
    // A fixture child writes the CLI contract; all DB reads below are mocked.
    await writeFile(join(root, 'scripts/collect-catalog.mjs'), `
      import {writeFile} from 'node:fs/promises';
      const output=process.argv.find(s=>s.startsWith('--output=')).slice(9);
      await writeFile(output,JSON.stringify({complete:true,results:[{source:'kopis',
        run_id:'${runId}',uploaded:false,error:'KOPIS HTTP 400 [list 20261029-20261128 page=1]'}]}),'utf8');
      process.exitCode=1;
    `, 'utf8')
    const before = Date.now()
    const status = await runScheduledCollection({ root,
      env: { SUPABASE_URL: 'https://czjrzylvnewfjnfwjhwf.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture', KOPIS_SERVICE_KEY: 'fixture' },
      fetcher: async url => {
        const u = new URL(url); paths.push(u)
        return Response.json(u.pathname.endsWith('/collection_policies')
          ? [{ source: 'kopis', collection_enabled: true, publication_enabled: false, live_after: null }]
          : u.searchParams.get('id') === `eq.${runId}` ? [run] : [])
      },
    })
    assert.equal(status.failed, true)
    assert.equal(status.uploaded, false)
    assert.equal(status.candidates, 0)
    assert.deepEqual(status.latestRun, run)
    assert.equal(status.error, 'KOPIS HTTP 400 [list 20261029-20261128 page=1]')
    assert.ok(Date.parse(status.nextAttemptAt) >= before + 3600000)
    assert.ok(Date.parse(status.nextAttemptAt) < before + 2 * 3600000)
    assert.equal(status.http400Streak, 1)
    assert.equal(paths.length, 3)
    assert.equal(paths[2].searchParams.get('id'), `eq.${runId}`)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('same HTTP400 gets one retry after 1h, then 6h and 24h waits; success resets it', () => {
  const now = Date.parse('2026-10-29T00:00:00Z')
  const error = 'KOPIS HTTP 400 [list 20261029-20261128 page=1]'
  let previous = {}
  for (const hours of [1, 6, 24, 24]) {
    const result = collectionCooldown({ previous, error, now })
    assert.equal(Date.parse(result.nextAttemptAt) - now, hours * 3600000)
    assert.equal(collectionDecision({ policy: { collection_enabled: true }, now: now + hours * 3600000 - 1,
      nextAttemptAt: result.nextAttemptAt }), 'cooldown')
    previous = result
  }
  assert.equal(collectionCooldown({ previous, error: error.replace('20261029-20261128', '20261030-20261129'), now }).http400Streak, 3)
  assert.equal(collectionCooldown({ previous, error: error.replace('page=1', 'page=2'), now }).http400Streak, 1)
  const skipped = collectionCooldown({ previous, skipped: true, now })
  assert.equal(skipped.http400Streak, previous.http400Streak)
  assert.equal(skipped.http400Fingerprint, previous.http400Fingerprint)
  previous = collectionCooldown({ previous, now })
  assert.equal(previous.http400Streak, 0)
  assert.equal(previous.http400Fingerprint, null)
  assert.equal(collectionCooldown({ previous, error, now }).http400Streak, 1)
  for (const [code, hours] of [[401, 24], [403, 24], [429, 1], [500, 1]]) {
    const result = collectionCooldown({ error: error.replace('400', String(code)), now })
    assert.equal(Date.parse(result.nextAttemptAt) - now, hours * 3600000)
  }
})

test('legacy known HTTP400 migrates once, preserving history; unknown recovery stays conservative', () => {
  const previous = { source: 'kopis', failed: true, checkedAt: '2026-10-29T00:45:16Z',
    error: 'KOPIS HTTP 400 [list 20261029-20261128 page=1]', nextAttemptAt: '2026-10-30T00:45:16Z',
    latestRun: null, marker: 'retained' }
  const next = migrateHttp400Cooldown(previous)
  assert.equal(next.nextAttemptAt, '2026-10-29T01:45:16.000Z')
  assert.equal(next.http400Streak, 1)
  assert.equal(next.marker, 'retained')
  assert.equal(next.cooldownMigration.previousNextAttemptAt, previous.nextAttemptAt)
  assert.equal(previous.nextAttemptAt, '2026-10-30T00:45:16Z')
  assert.equal(migrateHttp400Cooldown(next), next)
  const unknown = { ...previous, error: 'RECOVERED_FAILED_RUN_REASON_UNCONFIRMED' }
  assert.equal(migrateHttp400Cooldown(unknown), unknown)
  assert.throws(() => migrateHttp400Cooldown({ ...previous, checkedAt: 'invalid' }), /CHECKPOINT_UNREADABLE/)
})

test('partial detail HTTP400 contexts escalate once per attempt and preserve overlapping failures', () => {
  const now = Date.parse('2026-10-30T01:00:00Z')
  const a = 'KOPIS HTTP 400 [detail PF303356]', b = 'KOPIS HTTP 400 [detail PF303398]'
  let previous = collectionCooldown({ errors: [a, a, b], now })
  assert.equal(previous.http400Streak, 1)
  assert.deepEqual(previous.http400Contexts, { 'HTTP400:detail PF303356': 1, 'HTTP400:detail PF303398': 1 })
  assert.equal(Date.parse(previous.nextAttemptAt) - now, 3600000)
  previous = collectionCooldown({ previous, errors: [b, 'KOPIS event fields missing'], now })
  assert.equal(previous.http400Streak, 2)
  assert.equal(previous.http400Fingerprint, 'HTTP400:detail PF303398')
  assert.equal(Date.parse(previous.nextAttemptAt) - now, 6 * 3600000)
  const skipped = collectionCooldown({ previous, skipped: true, now })
  assert.deepEqual(skipped.http400Contexts, previous.http400Contexts)
  assert.equal(skipped.nextAttemptAt, previous.nextAttemptAt)
  previous = collectionCooldown({ previous: skipped, errors: [b], now })
  assert.equal(Date.parse(previous.nextAttemptAt) - now, 24 * 3600000)
  assert.equal(collectionCooldown({ previous, errors: ['KOPIS event fields missing'], now }).http400Streak, 0)
  assert.equal(collectionCooldown({ errors: [a, 'KOPIS HTTP 403 [detail PF303399]'], now }).nextAttemptAt,
    new Date(now + 24 * 3600000).toISOString())
  assert.throws(() => collectionCooldown({ previous: { http400Contexts: { 'HTTP400:detail PF303398': -1 } } }), /CHECKPOINT_UNREADABLE/)
  assert.throws(() => collectionCooldown({ previous: { http400Fingerprint: 'private-url', http400Streak: 1 } }), /CHECKPOINT_UNREADABLE/)
})

test('partial upload readback counts safe detail failures without converting them to a terminal error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'collection-partial-readback-'))
  const runId = '00000000-0000-4000-8000-000000000098'
  const run = { id: runId, state: 'partial', finished_at: '2026-10-30T01:00:00Z', candidate_count: 1 }
  const directory = join(root, '.local/concert-collection')
  try {
    await mkdir(directory, { recursive: true }); await mkdir(join(root, 'scripts'))
    await writeFile(join(directory, 'latest.json'), JSON.stringify({ source: 'kopis', nextAttemptAt: '2000-01-01T00:00:00Z' }), 'utf8')
    await writeFile(join(root, 'scripts/collect-catalog.mjs'), `
      import {writeFile} from 'node:fs/promises';
      const output=process.argv.find(s=>s.startsWith('--output=')).slice(9);
      await writeFile(output,JSON.stringify({complete:false,results:[{source:'kopis',run_id:'${runId}',
        uploaded:true,candidates:[{}],failures:[{error:'KOPIS HTTP 400 [detail PF303356]',body:'private-body'},
          {error:'provider https://example.test/?key=private-secret'}]}]}),'utf8');
    `, 'utf8')
    const before = Date.now()
    const status = await runScheduledCollection({ root,
      env: { SUPABASE_URL: 'https://czjrzylvnewfjnfwjhwf.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture', KOPIS_SERVICE_KEY: 'fixture' },
      fetcher: async url => {
        const u = new URL(url)
        return Response.json(u.pathname.endsWith('/collection_policies')
          ? [{ source: 'kopis', collection_enabled: true, publication_enabled: false, live_after: null }]
          : u.searchParams.get('id') === `eq.${runId}` ? [run] : [])
      } })
    assert.equal(status.uploaded, true)
    assert.equal(status.failed, true)
    assert.equal(status.error, null)
    assert.equal(status.latestRun.id, runId)
    assert.equal(status.http400Streak, 1)
    assert.deepEqual(status.http400Errors, ['KOPIS HTTP 400 [detail PF303356]'])
    assert.ok(Date.parse(status.nextAttemptAt) >= before + 3600000)
    assert.doesNotMatch(JSON.stringify(status), /private-body|private-secret/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('publication opt-in requires pin and matching capability, preserving checkpoint on rejection', async () => {
  const { publicationCollectionCompatible } = await import('../scripts/collect-concerts-scheduled.mjs')
  const digest = 'a'.repeat(32), policy = { source: 'kopis', collection_enabled: true, publication_enabled: true, live_after: null }
  const capability = { contract: 'publication-facts-v3', reviewed_release: true, executor_md5: digest }
  assert.equal(publicationCollectionCompatible(policy, capability, digest), true)
  for (const reviewed_release of [undefined, false]) assert.equal(publicationCollectionCompatible(policy, { ...capability, reviewed_release }, digest), false)
  for (const pin of [undefined, '', 'x'.repeat(32), 'b'.repeat(32)]) assert.equal(publicationCollectionCompatible(policy, capability, pin), false)
  for (const change of [{ source: 'ualive' }, { live_after: '2026-10-31T00:00:00Z' }, { publication_enabled: false }, { collection_enabled: false }]) assert.equal(publicationCollectionCompatible({ ...policy, ...change }, capability, digest), false)
  const root = await mkdtemp(join(tmpdir(), 'collection-contract-')), directory = join(root, '.local/concert-collection')
  const checkpoint = JSON.stringify({ source: 'kopis', nextAttemptAt: '2020-01-01T00:00:00Z', cooldownVersion: 2, http400Streak: 2, preserve: 'original' })
  const { readFile, readdir } = await import('node:fs/promises')
  try {
    await mkdir(directory, { recursive: true }); await writeFile(join(directory, 'latest.json'), checkpoint, 'utf8')
    for (const pin of [undefined, digest]) {
      const methods = [], fetcher = async (url, options) => {
        methods.push(options.method ?? 'GET'); const path = new URL(url).pathname
        return new Response(JSON.stringify(path.endsWith('/collection_policies') ? [policy] : path.endsWith('/collection_runs') ? [] : { ...capability, executor_md5: 'b'.repeat(32) }))
      }
      await assert.rejects(runScheduledCollection({ root, fetcher, env: { SUPABASE_URL: 'https://czjrzylvnewfjnfwjhwf.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture', KOPIS_SERVICE_KEY: 'fixture', KOPIS_PUBLICATION_EXECUTOR_MD5: pin } }), pin ? /CONTRACT_UNCONFIRMED/ : /POLICY_CHANGED/)
      assert.deepEqual(methods, pin ? ['GET', 'GET', 'POST'] : ['GET', 'GET'])
      assert.equal(await readFile(join(directory, 'latest.json'), 'utf8'), checkpoint)
      assert.deepEqual(await readdir(directory), ['latest.json'])
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('v2 deployment cannot satisfy the date-precision v3 executor contract with the same digest', async () => {
  const { publicationCollectionCompatible } = await import('../scripts/collect-concerts-scheduled.mjs')
  const pin = 'a'.repeat(32), p = { source: 'kopis', collection_enabled: true, publication_enabled: true, live_after: null }
  assert.equal(publicationCollectionCompatible(p, { contract: 'publication-facts-v2', executor_md5: pin }, pin), false)
  assert.equal(publicationCollectionCompatible(p, { contract: 'publication-facts-v3', reviewed_release: true, executor_md5: pin }, pin), true)
})

test('reviewed ON scheduling rejects missing target or guidance without changing checkpoints', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reviewed-target-')), directory = join(root, '.local/concert-collection')
  const { readFile, readdir } = await import('node:fs/promises')
  const checkpoint = JSON.stringify({ source: 'kopis', nextAttemptAt: '2000-01-01T00:00:00Z', cooldownVersion: 2 })
  const env = { SUPABASE_URL: 'https://czjrzylvnewfjnfwjhwf.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture',
    KOPIS_SERVICE_KEY: 'fixture', KOPIS_PUBLICATION_EXECUTOR_MD5: 'a'.repeat(32) }
  const fetcher = async url => Response.json(new URL(url).pathname.endsWith('/collection_policies')
    ? [{ source: 'kopis', collection_enabled: true, publication_enabled: true, live_after: null }]
    : new URL(url).pathname.endsWith('/collection_runs') ? []
      : { contract: 'publication-facts-v3', reviewed_release: true, executor_md5: env.KOPIS_PUBLICATION_EXECUTOR_MD5 })
  try {
    await mkdir(directory, { recursive: true }); await writeFile(join(directory, 'latest.json'), checkpoint, 'utf8')
    for (const target of [{}, { KOPIS_REVIEWED_CANDIDATE: '00000000-0000-4000-8000-000000000001:3' },
      { KOPIS_REVIEWED_CANDIDATE: 'invalid', KOPIS_REVIEWED_GUIDANCE: 'fictional' }]) {
      await assert.rejects(runScheduledCollection({ root, env: { ...env, ...target }, fetcher }), /REVIEWED_TARGET_REQUIRED/)
      assert.equal(await readFile(join(directory, 'latest.json'), 'utf8'), checkpoint)
      assert.deepEqual(await readdir(directory), ['latest.json'])
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('scheduled OFF collects raw while reviewed ON selects only the reviewed helper', async () => {
  const { readFile } = await import('node:fs/promises')
  for (const mode of ['off', 'single', 'automatic']) {
    const publication_enabled = mode !== 'off', automatic = mode === 'automatic'
    const root = await mkdtemp(join(tmpdir(), 'reviewed-route-')), directory = join(root, '.local/concert-collection')
    const runId = '00000000-0000-4000-8000-000000000099'
    const run = { id: runId, state: 'success', candidate_count: 0, finished_at: new Date().toISOString() }
    const expected = publication_enabled && !automatic ? 'publish-reviewed-candidate.mjs' : 'collect-catalog.mjs'
    const env = { SUPABASE_URL: 'https://czjrzylvnewfjnfwjhwf.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture',
      KOPIS_SERVICE_KEY: 'fixture', KOPIS_PUBLICATION_EXECUTOR_MD5: 'a'.repeat(32),
      KOPIS_REVIEWED_CANDIDATE: '00000000-0000-4000-8000-000000000001:3', KOPIS_REVIEWED_GUIDANCE: 'fictional guidance' }
    if (automatic) {
      env.KOPIS_AUTOMATIC_PUBLICATION = '1'; env.KOPIS_AUTOMATIC_REVIEW_FILE = join(directory, 'fictional-plan.json')
      delete env.KOPIS_REVIEWED_CANDIDATE; delete env.KOPIS_REVIEWED_GUIDANCE
    }
    try {
      await mkdir(directory, { recursive: true }); await mkdir(join(root, 'scripts'))
      await writeFile(join(directory, 'latest.json'), JSON.stringify({ source: 'kopis', nextAttemptAt: '2000-01-01T00:00:00Z' }), 'utf8')
      // Only the expected entry exists; selecting the other route fails the run.
      await writeFile(join(root, 'scripts', expected), `
        import {readFile,writeFile} from 'node:fs/promises';
        const arg = prefix => process.argv.find(s => s.startsWith(prefix)).slice(prefix.length);
        if (await readFile(arg('--notice-file='),'utf8') !== '[]\\n') throw Error('NOT_SILENT');
        await writeFile(arg('--output='),JSON.stringify({complete:true,results:[{source:'kopis',run_id:'${runId}',uploaded:true,candidates:[],failures:[]}]}),'utf8');
      `, 'utf8')
      const fetcher = async url => {
        const u = new URL(url)
        return Response.json(u.pathname.endsWith('/collection_policies')
          ? [{ source: 'kopis', collection_enabled: true, publication_enabled, live_after: null }]
          : u.pathname.endsWith('/collection_runs') ? u.searchParams.has('id') ? [run] : []
            : { contract: 'publication-facts-v3', reviewed_release: true, continuous_review: true, executor_md5: env.KOPIS_PUBLICATION_EXECUTOR_MD5 })
      }
      const result = await runScheduledCollection({ root, env, fetcher })
      assert.equal(result.failed, false); assert.equal(result.uploaded, true); assert.equal(result.latestRun.id, runId)
      assert.equal(await readFile(join(directory, 'no-notices.json'), 'utf8'), '[]\n')
    } finally { await rm(root, { recursive: true, force: true }) }
  }
})
