import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runQueueCommand } from '../scripts/artist-review-queue.mjs'
import { newQueue } from '../scripts/lib/artist-review-queue.mjs'

const writes = ['init', 'begin', 'identity', 'context', 'checkpoint', 'apply', 'finish', 'handoff', 'accept', 'snapshot']

test('monitor and omitted roles reject artist operations before filesystem, environment or network work', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'artist-role-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  let calls = 0
  const env = { get SUPABASE_URL() { calls++; throw Error('ENV_TOUCHED') } }
  const options = { cwd, env, fetcher: () => { calls++; throw Error('NETWORK_TOUCHED') },
    serverGuard: () => { calls++; throw Error('GUARD_TOUCHED') }, output: () => {} }
  for (const command of writes) for (const role of [[], ['--role=monitor']]) {
    await assert.rejects(runQueueCommand([command, '--owner=cloud', ...role], options), /ARTIST_ROLE_REQUIRED/)
  }
  assert.equal(calls, 0)
  assert.deepEqual(await readdir(cwd), [])
  await assert.rejects(runQueueCommand(['begin', '--owner=cloud', '--role=admin'], options), /EXECUTION_ROLE_INVALID/)
  await assert.rejects(runQueueCommand(['begin', '--owner=cloud', '--role=artist', '--role=monitor'], options), /ARGUMENT_INVALID/)
})

test('monitor status preserves queue bytes and an existing writer lock without env loading or RPCs', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'monitor-status-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  const root = join(cwd, '.local/artist-review-queue')
  await mkdir(root, { recursive: true })
  const raw = JSON.stringify(newQueue('cloud')) + '\n'
  await writeFile(join(root, 'state.json'), raw, 'utf8')
  await writeFile(join(root, 'state.json.lock'), 'existing artist lock', 'utf8')
  // A read-only status must not consume the env fallback at all.
  await writeFile(join(cwd, '.env.push.local'), 'SUPABASE_URL=https://wrong.example\n', 'utf8')
  const env = {}
  const options = { cwd, env, fetcher: () => { throw Error('NETWORK_TOUCHED') }, output: () => {} }
  const status = await runQueueCommand(['status', '--owner=cloud', '--role=monitor'], options)
  assert.equal(status.owner, 'cloud')
  assert.equal(status.activeRun, null)
  assert.equal(await readFile(join(root, 'state.json'), 'utf8'), raw)
  assert.equal(await readFile(join(root, 'state.json.lock'), 'utf8'), 'existing artist lock')
  assert.deepEqual(await readdir(root), ['state.json', 'state.json.lock'])
  assert.deepEqual(env, {})
  assert.deepEqual(await runQueueCommand(['status', '--owner=cloud'], options), status)
  await assert.rejects(runQueueCommand(['status', '--owner=cloud', '--state=../outside.json'], options), /IGNORED_PATH_REQUIRED/)
  await symlink(join(root, 'state.json'), join(root, 'link.json'))
  await assert.rejects(runQueueCommand(['status', '--owner=cloud', '--state=.local/artist-review-queue/link.json'], options), /SYMLINK_PATH_REJECTED/)
})

test('artist role is explicit execution intent; existing ownership checks remain authoritative', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'artist-intent-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  const options = { cwd, env: {}, output: () => {} }
  await runQueueCommand(['init', '--owner=local', '--role=artist'], options)
  const q = JSON.parse(await readFile(join(cwd, '.local/artist-review-queue/state.json'), 'utf8'))
  assert.equal(q.owner, 'local')
  await assert.rejects(runQueueCommand(['handoff', '--owner=cloud', '--role=artist', '--to=local'], options), /HANDOFF_REQUIRED/)
  assert.equal(JSON.parse(await readFile(join(cwd, '.local/artist-review-queue/state.json'), 'utf8')).owner, 'local')
})
