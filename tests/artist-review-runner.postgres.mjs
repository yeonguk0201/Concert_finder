// Explicit real-PostgreSQL suite, never accepts a DSN or an operational project URL.
// CONCERT_TEST_PG_CONTAINER=concert-review-pg-check node --test tests/artist-review-runner.postgres.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const container = process.env.CONCERT_TEST_PG_CONTAINER
if (!/^concert-review-pg-[a-z0-9-]+$/.test(container ?? '')) throw new Error('Explicit isolated test container required')
const literal = value => `'${String(typeof value === 'object' ? JSON.stringify(value) : value).replaceAll("'", "''")}'`
function psql(database, sql, { role = null, app = 'review-test' } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database])
    let stdout = '', stderr = ''
    child.stdout.on('data', b => { stdout += b }); child.stderr.on('data', b => { stderr += b })
    child.on('error', reject); child.on('close', code => code ? reject(new Error(stderr)) : resolve(stdout.trim()))
    child.stdin.end(`set application_name=${literal(app)};set statement_timeout='15s';${role ? `set role ${role};set request.jwt.claims='{"role":"${role}"}';` : ''}\n${sql}`)
  })
}
const migrationNames = ['202610060001_initial', '202610070001_admin_review', '202610080001_ingestion',
  '202610090001_notifications', '202610110001_catalog_expansion', '20261011150237_discovered_artist_catalog',
  '20261012134538_automated_catalog', '20261012135134_artist_management', '20261013070742_artist_curation']
async function fixture() {
  const name = 'concert_review_' + randomUUID().replaceAll('-', '')
  await psql('postgres', `create database ${name}`)
  let sql = `create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;`
  for (const n of migrationNames) sql += '\n' + await readFile(new URL(`../supabase/migrations/${n}.sql`, import.meta.url), 'utf8')
  sql += ';create table public.catalog_signal(id int primary key,revision bigint);insert into public.catalog_signal values(1,0);'
  for (const n of ['20261015122525_artist_official_channels', '202610160001_artist_review_runner']) sql += '\n' + await readFile(new URL(`../supabase/migrations/${n}.sql`, import.meta.url), 'utf8')
  sql += `insert into public.bands(name,country_code,musicbrainz_id) select 'Test Artist '||n,'JP',gen_random_uuid() from generate_series(1,80) n;
    insert into private.artist_review_targets select id,true,array['official.example.com'] from public.bands;`
  await psql(name, sql)
  return {
    name,
    owner: (sql, opts = {}) => psql(name, sql, opts),
    service: (sql, opts = {}) => psql(name, sql, { ...opts, role: 'service_role' }),
    claim: async id => JSON.parse(await psql(name, `select public.service_claim_artist_review(${literal(id)}::uuid)`, { role: 'service_role' })),
    cleanup: () => psql('postgres', `drop database ${name} with(force)`),
  }
}
async function waitUntilSleeping(db, app) {
  for (let n = 0; n < 60; n++) {
    if (await db.owner(`select exists(select 1 from pg_stat_activity where application_name=${literal(app)} and wait_event='PgSleep')`) === 't') return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('Transaction barrier not reached')
}
const submission = () => ({ genre: { decision: 'keep', summary: 'Official biography confirms Artist alternative rock identity',
  evidence: [{ kind: 'official_artist_page', identityMatched: true, url: 'https://official.example.com/artist',
    checkedAt: new Date(Date.now() - 1000).toISOString(), excerpt: 'Test Artist plays alternative rock music' }] },
channel: { decision: 'candidate', summary: 'Official channel still requires additional verification', evidence: [] } })
function checkpointSql(runId, row, result) {
  return `select public.service_checkpoint_artist_review(${literal(runId)}::uuid,${literal(row.snapshot.id)}::uuid,${literal(row.snapshot.version)}::timestamptz,${literal(result)}::jsonb)`
}

test('real PostgreSQL independent connections: timing, race, conflict, graceful close and lease recovery', async t => {
  await psql('postgres', `do $$begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end$$;`)
  await t.test('rolling five-hour gate reproduces repeated skips; anchored SQL admits all jittered slots', async () => {
    const offsets = [15, 0, 20, 0, 15, 0] // Minutes late relative to a 5h repeating schedule.
    let last = -Infinity, rollingAccepted = 0
    for (let n = 0; n < offsets.length; n++) {
      const actual = n * 300 + offsets[n]
      if (actual - last >= 300) { rollingAccepted++; last = actual }
    }
    assert.equal(rollingAccepted, 3)
    const db = await fixture()
    try {
      await db.owner("update private.artist_review_lock set anchor_at=clock_timestamp()+interval '1 hour'")
      assert.equal((await db.claim(randomUUID())).reason, 'schedule_window')
      await db.owner("update private.artist_review_lock set anchor_at=clock_timestamp()-interval '15 minutes'")
      const first = await db.claim(randomUUID()); assert.equal(first.targets.length, 10)
      await db.service(`select public.service_close_artist_review(${literal(first.runId)}::uuid)`)
      for (let n = 1; n < offsets.length; n++) {
        await db.owner(`update private.artist_review_lock set anchor_at=clock_timestamp()-interval '${n * 300 + offsets[n]} minutes'`)
        const run = await db.claim(randomUUID())
        assert.equal(run.state, 'running', `slot ${n}`); assert.equal(run.targets.length, 10)
        await db.service(`select public.service_close_artist_review(${literal(run.runId)}::uuid)`)
        assert.equal((await db.claim(randomUUID())).reason, 'schedule_window')
      }
      assert.equal(await db.owner('select count(*) from private.artist_review_runs'), '6')
    } finally { await db.cleanup() }
  })
  await t.test('overlapping transactions allocate one batch; checkpoint writers serialize and reject divergent replay', async () => {
    const db = await fixture(), first = randomUUID(), second = randomUUID()
    try {
      const holder = db.service(`begin;select public.service_claim_artist_review(${literal(first)}::uuid);select pg_sleep(1);commit`, { app: 'review-claim-holder' })
      await waitUntilSleeping(db, 'review-claim-holder')
      const competitor = db.claim(second)
      const [held, other] = await Promise.all([holder, competitor])
      const batch = JSON.parse(held.split('\n')[0])
      assert.equal(batch.targets.length, 10); assert.equal(other.state, 'busy')
      assert.equal(await db.owner('select count(*) from private.artist_review_runs'), '1')
      const row = batch.targets[0], original = submission()
      const writing = db.service(`begin;${checkpointSql(first, row, original)};select pg_sleep(1);commit`, { app: 'review-checkpoint-holder' })
      await waitUntilSleeping(db, 'review-checkpoint-holder')
      const changed = submission(); changed.genre.summary = 'Different evidence outcome from a concurrent writer'
      const conflicted = assert.rejects(db.service(checkpointSql(first, row, changed)), /CHECKPOINT_CONFLICT/)
      await Promise.all([writing, conflicted])
      assert.equal(await db.owner(`select count(*) from private.artist_review_items where checkpoint is not null`), '1')
      assert.equal(await db.owner(`select count(*) from private.artist_review_notices`), '1')
      await db.service(`select public.service_close_artist_review(${literal(first)}::uuid)`)
      await db.owner("update private.artist_review_lock set anchor_at=clock_timestamp()-interval '6 hours'")
      const crashedId = randomUUID()
      const crashing = db.service(`begin;select public.service_claim_artist_review(${literal(crashedId)}::uuid);select pg_sleep(10);commit`, { app: 'review-crash-holder' })
      const disconnected = assert.rejects(crashing, /terminating connection|server closed the connection/)
      await waitUntilSleeping(db, 'review-crash-holder')
      await db.owner("select pg_terminate_backend(pid) from pg_stat_activity where application_name='review-crash-holder'")
      await disconnected
      assert.equal(await db.owner(`select count(*) from private.artist_review_runs where id=${literal(crashedId)}::uuid`), '0')
      assert.equal((await db.claim(randomUUID())).state, 'running')
    } finally { await db.cleanup() }
  })
  await t.test('manual transaction wins a stale research conflict; old leases cannot write; recovery retains completed checkpoints', async () => {
    const db = await fixture()
    try {
      const run = await db.claim(randomUUID()), done = run.targets[0], changed = run.targets[1]
      await db.service(checkpointSql(run.runId, done, submission()))
      const before = await db.owner(`select checkpoint::text from private.artist_review_items where band_id=${literal(done.snapshot.id)}::uuid`)
      const manual = db.owner(`begin;update public.bands set curation_status='approved',curation_reason='Manual decision' where id=${literal(changed.snapshot.id)}::uuid;select pg_sleep(1);commit`, { app: 'review-manual-holder' })
      await waitUntilSleeping(db, 'review-manual-holder')
      await Promise.all([manual, assert.rejects(db.service(checkpointSql(run.runId, changed, submission())), /EDIT_CONFLICT/)])
      assert.equal(await db.owner(`select curation_status from public.bands where id=${literal(changed.snapshot.id)}::uuid`), 'approved')
      await db.owner(`update private.artist_review_runs set lease_until=now()-interval '1 second';update private.artist_review_lock set anchor_at=now()-interval '6 hours'`)
      await assert.rejects(db.service(checkpointSql(run.runId, run.targets[2], submission())), /LEASE_LOST/)
      const next = await db.claim(randomUUID()); assert.equal(next.state, 'running')
      assert.equal(await db.owner(`select checkpoint::text from private.artist_review_items where run_id=${literal(run.runId)}::uuid and band_id=${literal(done.snapshot.id)}::uuid`), before)
      assert.equal(await db.owner(`select count(*) from private.artist_review_state where result->>'error'='LEASE_EXPIRED'`), '9')
    } finally { await db.cleanup() }
  })
  await t.test('graceful close preserves completed work and prevents late checkpoint; action queue needs explicit existing admin resumption', async () => {
    const db = await fixture()
    try {
      const run = await db.claim(randomUUID()), row = run.targets[0]
      await db.service(checkpointSql(run.runId, row, submission()))
      await db.owner("update private.artist_review_runs set started_at=clock_timestamp()-interval '39 minutes',lease_until=clock_timestamp()+interval '6 minutes'")
      const close = JSON.parse(await db.service(`select public.service_close_artist_review(${literal(run.runId)}::uuid)`))
      assert.equal(close.state, 'finished'); assert.equal(close.actionRequired, 1); assert.equal(close.failed, 9)
      assert.equal(await db.owner('select finished_at<lease_until from private.artist_review_runs'), 't')
      await assert.rejects(db.service(checkpointSql(run.runId, run.targets[1], submission())), /LEASE_LOST/)
      const queue = JSON.parse(await db.service('select public.service_artist_review_queue()'))
      assert.equal(queue.length, 1); assert.equal(queue[0].band_id, row.snapshot.id)
      const q = queue[0], admin = randomUUID()
      const resume = `select public.admin_resume_artist_review(${literal(q.band_id)}::uuid,${literal(q.updated_at)}::timestamptz,${literal(q.checked_at)}::timestamptz,'Official evidence reviewed; explicitly resume')`
      await assert.rejects(db.service(resume), /permission denied/)
      await assert.rejects(psql(db.name, resume, { role: 'authenticated' }), /ADMIN_REQUIRED/)
      await db.owner(`insert into auth.users values(${literal(admin)}::uuid);insert into private.admins values(${literal(admin)}::uuid)`)
      await psql(db.name, `set test.uid=${literal(admin)};${resume}`, { role: 'authenticated' })
      assert.equal(await db.owner('select count(*) from private.artist_review_resumptions'), '1')
      assert.equal(JSON.parse(await db.service('select public.service_artist_review_queue()')).length, 0)
      assert.equal(await db.owner(`select curation_status from public.bands where id=${literal(q.band_id)}::uuid`), 'unreviewed')
      // A held artist must first be explicitly restored by the existing admin RPC.
      const heldId = run.targets[1].snapshot.id
      await db.owner(`update private.artist_review_state set outcome='action_required' where band_id=${literal(heldId)}::uuid`)
      const curate = (status, reason) => `set test.uid=${literal(admin)};select public.admin_curate_artist(b.id,b.updated_at,b.name,b.country_code,b.category,b.aliases,${literal(status)},${literal(reason)},'https://official.example.com/artist') from public.bands b where b.id=${literal(heldId)}::uuid`
      await psql(db.name, curate('held', 'Administrator holds identity pending evidence'), { role: 'authenticated' })
      const checked = await db.owner(`select checked_at::text from private.artist_review_state where band_id=${literal(heldId)}::uuid`)
      const resumeHeld = `set test.uid=${literal(admin)};select public.admin_resume_artist_review(b.id,b.updated_at,${literal(checked)}::timestamptz,'New official evidence checked; resume review') from public.bands b where b.id=${literal(heldId)}::uuid`
      await assert.rejects(psql(db.name, resumeHeld, { role: 'authenticated' }), /RESTORE_ARTIST_FIRST/)
      await psql(db.name, curate('unreviewed', 'Explicit manual restoration for another review'), { role: 'authenticated' })
      await psql(db.name, resumeHeld, { role: 'authenticated' })
      assert.equal(await db.owner(`select private.review_manual(b) from public.bands b where id=${literal(heldId)}::uuid`), 'f')
      assert.equal(await db.owner(`select curation_reason from public.bands where id=${literal(heldId)}::uuid`), 'Explicit manual restoration for another review')
      await psql(db.name, curate('unreviewed', 'A later manual decision must be preserved'), { role: 'authenticated' })
      assert.equal(await db.owner(`select private.review_manual(b) from public.bands b where id=${literal(heldId)}::uuid`), 't')
    } finally { await db.cleanup() }
  })
})
