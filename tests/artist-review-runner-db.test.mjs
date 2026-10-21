import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

test('review worker fences roles, targets, versions, manual decisions and leases; durable reuse/backoff/checkpoints', async t => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;`)
    for (const name of ['202610060001_initial', '202610070001_admin_review', '202610080001_ingestion',
      '202610090001_notifications', '202610110001_catalog_expansion', '20261011150237_discovered_artist_catalog',
      '20261012134538_automated_catalog', '20261012135134_artist_management', '20261013070742_artist_curation']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'))
    }
    await db.exec('create table public.catalog_signal(id int primary key,revision bigint); insert into public.catalog_signal values(1,0)')
    for (const name of ['20261015122525_artist_official_channels', '202610160001_artist_review_runner', '20261017160310_artist_review_readiness']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'))
    }
    const owner = () => db.exec('reset role')
    const service = async () => { await db.exec('set role service_role'); await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`) }
    const call = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value
    const begin = id => call('select public.service_claim_artist_review($1) as value', [id])
    const finish = id => call('select public.service_finish_artist_review($1) as value', [id])
    const checkpoint = (run, row, result, version = row.snapshot.version) => call('select public.service_checkpoint_artist_review($1,$2,$3,$4) as value', [run, row.snapshot.id, version, result])
    const defer = (run, id, reason = 'SOURCE_UNAVAILABLE') => call('select public.service_defer_artist_review($1,$2,$3) as value', [run, id, reason])
    const proof = () => [{ kind: 'official_artist_page', url: 'https://official.example.com/artist',
      identityMatched: true, checkedAt: new Date(Date.now() - 1000).toISOString(), excerpt: 'Artist performs alternative rock music' }]
    const result = (decision = 'keep', channelDecision = 'candidate') => ({ genre: { decision,
      summary: 'Official artist biography establishes the identity and genre', evidence: decision === 'failed' ? [] : proof() },
      channel: { decision: channelDecision, summary: 'Official channel investigation requires additional evidence', evidence: [] } })
    await t.test('no direct private grants or user-callable worker endpoints; empty queue does not start a run', async () => {
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`)
        await assert.rejects(begin(randomUUID()), /permission denied/)
        await assert.rejects(db.exec('select * from private.artist_review_state'), /permission denied/)
        await owner()
      }
      await service()
      await assert.rejects(db.exec('select * from private.artist_review_targets'), /permission denied/)
      await assert.rejects(db.query('select private.apply_artist_curation($1,null,null,null,null,null,null,null,null)', [randomUUID()]), /permission denied/)
      await db.query(`select set_config('request.jwt.claims','{"role":"authenticated"}',false)`)
      await assert.rejects(begin(randomUUID()), /SERVICE_REQUIRED/)
      await service()
      assert.equal((await begin(randomUUID())).state, 'idle')
      await owner()
      assert.equal((await db.query('select count(*)::int n from private.artist_review_runs')).rows[0].n, 0)
    })
    const ids = []
    for (let n = 0; n < 13; n++) {
      const id = randomUUID(); ids.push(id)
      await db.query('insert into public.bands(id,name,country_code,musicbrainz_id) values($1,$2,$3,$4)', [id, `Artist ${n}`, 'JP', randomUUID()])
      await db.query("insert into private.artist_review_targets values($1,true,array['official.example.com'])", [id])
    }
    const run = randomUUID(); let batch
    await t.test('maximum ten; duplicate begin resumes; another concurrent run gets busy', async () => {
      await service(); batch = await begin(run)
      assert.equal(batch.targets.length, 10)
      assert.equal((await begin(run)).targets.length, 10)
      assert.equal((await begin(randomUUID())).state, 'busy')
      assert.equal((await finish(run)).state, 'incomplete')
    })
    await t.test('scope, stale version, missing/forged sources, arbitrary keys and admin impersonation rejected', async () => {
      const row = batch.targets[0]
      const foreign = ids.find(id => !batch.targets.some(x => x.snapshot.id === id))
      await assert.rejects(checkpoint(run, { snapshot: { ...row.snapshot, id: foreign } }, result()), /TARGET_NOT_CLAIMED/)
      await assert.rejects(checkpoint(run, row, result(), '2000-01-01'), /EDIT_CONFLICT/)
      const bad = result(); bad.genre.evidence = []
      await assert.rejects(checkpoint(run, row, bad), /OFFICIAL_EVIDENCE_REQUIRED/)
      bad.genre.evidence = proof(); bad.genre.evidence[0].url = 'https://unapproved.example.com/artist'
      await assert.rejects(checkpoint(run, row, bad), /OFFICIAL_EVIDENCE_REQUIRED/)
      bad.genre.evidence = proof(); bad.genre.evidence[0].checkedAt = '2000-01-01T00:00:00Z'
      await assert.rejects(checkpoint(run, row, bad), /OFFICIAL_EVIDENCE_REQUIRED/)
      await assert.rejects(checkpoint(run, row, { ...result(), cache: { title: 'do not store API metadata' } }), /INVALID_RESULT/)
      await assert.rejects(db.query('select public.admin_catalog()'), /ADMIN_REQUIRED|permission denied/)
      await assert.rejects(db.query('select public.admin_curate_artist($1,null,null,null,null,null,null,null,null)', [row.snapshot.id]), /ADMIN_REQUIRED|permission denied/)
    })
    await t.test('reversible exclusion uses shared core, preserves identity and links, records server provenance', async () => {
      const row = batch.targets[0]
      await owner(); const user = randomUUID()
      await db.query('insert into auth.users values($1)', [user])
      await db.query('insert into public.band_follows values($1,$2,now())', [user, row.snapshot.id])
      await service()
      const payload = result('exclude', 'skipped')
      assert.equal((await checkpoint(run, row, payload)).outcome, 'complete')
      assert.deepEqual(await checkpoint(run, row, payload), { outcome: 'complete', failures: 0, notify: true })
      await assert.rejects(checkpoint(run, row, result()), /CHECKPOINT_CONFLICT/)
      await owner()
      const b = (await db.query('select * from public.bands where id=$1', [row.snapshot.id])).rows[0]
      assert.equal(b.curation_status, 'excluded'); assert.equal(b.name, row.snapshot.name)
      assert.equal(b.musicbrainz_id, row.snapshot.mbid); assert.equal(b.category, row.snapshot.category)
      assert.equal((await db.query('select count(*)::int n from public.band_follows where band_id=$1', [b.id])).rows[0].n, 1)
      const h = (await db.query('select * from private.artist_management_history where review_run_id=$1', [run])).rows
      assert.equal(h.length, 1); assert.equal(h[0].actor_id, null); assert.equal(h[0].after_record.curation_status, 'excluded')
      assert.equal((await db.query('select count(*)::int n from private.admins')).rows[0].n, 0)
      await service()
    })
    await t.test('channel evidence/version/lock fences, only approved direct ID can be saved', async () => {
      const row = batch.targets[1], cid = 'UC' + 'a'.repeat(22), payload = result('keep', 'verified')
      payload.channel.url = `https://www.youtube.com/channel/${cid}`
      payload.channel.evidence = proof(); payload.channel.evidence[0].linkedChannelUrl = payload.channel.url
      assert.equal((await checkpoint(run, row, payload)).outcome, 'complete')
      await owner()
      const profile = (await db.query('select * from private.artist_channels where band_id=$1', [row.snapshot.id])).rows[0]
      assert.equal(profile.verification, 'verified')
      assert.equal((await db.query('select count(*)::int n from private.artist_channel_cache')).rows[0].n, 0)
      assert.equal((await db.query('select count(*)::int n from private.artist_channel_history where band_id=$1 and review_run_id=$2 and not manual_decision', [row.snapshot.id,run])).rows[0].n, 1)
      await service()
    })
    await t.test('manual edits during research stay intact and can be checkpointed as action required', async () => {
      const row = batch.targets[2]
      await owner(); await db.query("update public.bands set curation_status='approved',curation_reason='Manual approval' where id=$1", [row.snapshot.id])
      await service()
      await assert.rejects(checkpoint(run, row, result()), /EDIT_CONFLICT/)
      assert.equal((await defer(run, row.snapshot.id, 'EDIT_CONFLICT')).outcome, 'action_required')
    })
    await t.test('failed investigations get backoff; successful checkpoints resume without being repeated', async () => {
      const row = batch.targets[3]
      assert.deepEqual(await defer(run, row.snapshot.id), { outcome: 'failed', failures: 1, notify: false })
      assert.equal((await begin(run)).targets.length, 6)
      await owner()
      const s = (await db.query('select * from private.artist_review_state where band_id=$1', [row.snapshot.id])).rows[0]
      assert.ok(new Date(s.next_attempt_at) - new Date(s.checked_at) >= 5 * 3600000 - 100)
      await service()
      for (const other of batch.targets.slice(4)) await checkpoint(run, other, result())
      const summary = await finish(run)
      assert.equal(summary.complete, 2); assert.equal(summary.failed, 1); assert.equal(summary.actionRequired, 7)
      assert.equal(summary.notify, true); assert.equal((await finish(run)).notify, false)
      assert.equal((await begin(randomUUID())).state, 'idle') // Delayed duplicate cannot start another batch.
      await owner(); await db.exec("update private.artist_review_lock set anchor_at=anchor_at-interval '6 hours'"); await service()
      const next = await begin(randomUUID())
      assert.equal(next.targets.length, 3) // Cached keep and pending failures were not researched again.
      await owner(); await db.exec("update private.artist_review_runs set lease_until=now()-interval '1 minute' where finished_at is null; update private.artist_review_lock set anchor_at=anchor_at-interval '6 hours'")
      await service()
      await assert.rejects(checkpoint(next.runId, next.targets[0], result()), /LEASE_LOST/)
      assert.equal((await begin(randomUUID())).state, 'idle') // Crash recovery delays unfinished work.
      await owner()
      const stale = (await db.query("select count(*)::int n from private.artist_review_state where result->>'error'='LEASE_EXPIRED'")).rows[0].n
      assert.equal(stale, 3)
    })
    await t.test('same-version completion reused, expiry rescheduled; channel manual decisions and original admin route preserved', async () => {
      const row = batch.targets[1], admin = randomUUID()
      await db.exec('update private.artist_review_targets set enabled=false')
      await db.query('update private.artist_review_targets set enabled=true where band_id=$1', [row.snapshot.id])
      await service(); assert.equal((await begin(randomUUID())).state, 'idle')
      await owner()
      await db.query("update private.artist_review_state set valid_until=now()-interval '1 minute' where band_id=$1", [row.snapshot.id])
      await db.query('insert into auth.users values($1)', [admin]); await db.query('insert into private.admins values($1)', [admin])
      await db.query("select set_config('test.uid',$1,false)", [admin])
      const other = (await db.query('select * from public.bands where id=$1', [ids.find(x => !batch.targets.some(b => b.snapshot.id === x))])).rows[0]
      await db.exec('set role authenticated')
      await db.query('select public.admin_curate_artist($1,$2,$3,$4,$5,$6,$7,$8,$9)', [other.id, other.updated_at, other.name,
        other.country_code, other.category, other.aliases, 'held', 'Existing administrator manual decision', 'https://official.example.com/artist'])
      await owner()
      assert.equal((await db.query('select curation_status from public.bands where id=$1', [other.id])).rows[0].curation_status, 'held')
      await db.query('insert into private.artist_channel_history(band_id,actor_id,before_record,after_record) values($1,$2,$3,$3)', [row.snapshot.id, admin, { verification: 'verified' }])
      await db.query('update private.artist_channel_history set actor_id=null where band_id=$1', [row.snapshot.id]) // Deleted actor must not erase manual provenance.
      await db.query("select set_config('test.uid','',false)")
      await db.exec("update private.artist_review_lock set anchor_at=anchor_at-interval '6 hours'")
      await service()
      const again = await begin(randomUUID())
      assert.equal(again.targets.length, 1)
      const payload = result('keep', 'verified'); payload.channel.url = 'https://www.youtube.com/channel/UC' + 'a'.repeat(22)
      payload.channel.evidence = proof(); payload.channel.evidence[0].linkedChannelUrl = payload.channel.url
      await assert.rejects(checkpoint(again.runId, again.targets[0], payload), /CHANNEL_LOCKED/)
      await defer(again.runId, row.snapshot.id, 'CHANNEL_LOCKED'); await finish(again.runId)
      const notices = await call('select public.service_artist_review_notices() as value')
      assert.ok(notices.some(x => x.band_id === row.snapshot.id && x.kind === 'action_required'))
      assert.deepEqual(await call('select public.service_artist_review_notices($1) as value', [notices.map(x => x.id)]), [])
      await owner()
    })
    await t.test('failure backoff doubles and emits a durable notice only at the third failure', async () => {
      const id = batch.targets[3].snapshot.id
      await db.exec('update private.artist_review_targets set enabled=false')
      await db.query('update private.artist_review_targets set enabled=true where band_id=$1', [id])
      for (const count of [2, 3]) {
        await db.exec("update private.artist_review_lock set anchor_at=anchor_at-interval '6 hours'")
        await db.query("update private.artist_review_state set next_attempt_at=now()-interval '1 minute' where band_id=$1", [id])
        await service(); const next = await begin(randomUUID())
        assert.equal(next.targets.length, 1)
        const failed = await defer(next.runId, id)
        assert.equal(failed.failures, count); assert.equal(failed.notify, count === 3)
        assert.deepEqual(await defer(next.runId, id), failed)
        await finish(next.runId)
        await owner()
        const state = (await db.query('select * from private.artist_review_state where band_id=$1', [id])).rows[0]
        assert.ok(new Date(state.next_attempt_at) - new Date(state.checked_at) >= 5 * 2 ** (count - 1) * 3600000 - 100)
      }
      await service()
      const notices = await call('select public.service_artist_review_notices() as value')
      assert.equal(notices.filter(x => x.kind === 'repeated_failure').length, 1)
      assert.equal((await begin(randomUUID())).state, 'idle')
    })
    await t.test('read-only readiness matches claim scope and preserves leases, slots, cache/backoff and notices', async () => {
      await owner()
      await db.exec("select set_config('test.uid','',false); update private.artist_review_targets set enabled=false; update private.artist_review_lock set run_id=null,anchor_at=null,last_slot=-1")
      const ready = () => call('select public.service_artist_review_readiness() as value')
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`)
        await assert.rejects(ready(), /permission denied/)
        await owner()
      }
      await service()
      await db.query(`select set_config('request.jwt.claims','{"role":"authenticated"}',false)`)
      await assert.rejects(ready(), /SERVICE_REQUIRED/)
      await service()
      const empty = await ready()
      assert.equal(empty.state, 'idle'); assert.equal(empty.eligible, 0)
      assert.ok(empty.notices > 0) // Listing must not consume existing notices.
      assert.deepEqual(await ready(), empty)
      await owner()
      const fresh = []
      for (let n = 0; n < 11; n++) {
        const id = randomUUID(); fresh.push(id)
        await db.query("insert into public.bands(id,name,country_code,musicbrainz_id) values($1,'New Artist','JP',$2)", [id, randomUUID()])
        await db.query("insert into private.artist_review_targets values($1,true,array['official.example.com'])", [id])
      }
      const snapshot = async () => (await db.query(`select jsonb_build_object(
        'gate',(select to_jsonb(l) from private.artist_review_lock l),
        'runs',(select count(*) from private.artist_review_runs),
        'items',(select count(*) from private.artist_review_items),
        'states',(select count(*) from private.artist_review_state),
        'notices',(select jsonb_agg(to_jsonb(n) order by n.id) from private.artist_review_notices n)) as value`)).rows[0].value
      const before = await snapshot()
      await service()
      const due = await ready()
      assert.equal(due.state, 'ready'); assert.equal(due.eligible, 10)
      assert.deepEqual(await ready(), due)
      await owner(); assert.deepEqual(await snapshot(), before)
      await service()
      const claimed = await begin(randomUUID())
      assert.equal(claimed.targets.length, due.eligible)
      assert.equal((await ready()).state, 'busy')
      await owner()
      await db.query("update private.artist_review_runs set lease_until=clock_timestamp()-interval '1 second' where id=$1", [claimed.runId])
      await db.exec("update private.artist_review_lock set anchor_at=anchor_at-interval '5 hours'")
      const expiredBefore = await snapshot()
      await service()
      assert.equal((await ready()).reason, 'lease_recovery')
      await owner(); assert.deepEqual(await snapshot(), expiredBefore)
      await service()
      // Claim performs recovery; the read-only poll did not defer or reserve any work.
      const remaining = await begin(randomUUID())
      assert.equal(remaining.targets.length, 1)
      await call('select public.service_close_artist_review($1) as value', [remaining.runId])
      await owner()
      await db.exec('update private.artist_review_lock set run_id=null,anchor_at=null,last_slot=-1')
      await service()
      assert.equal((await ready()).reason, 'no_work') // All eleven failures are still in backoff.
      assert.equal((await begin(randomUUID())).state, 'idle')
      await owner()
      const id = fresh[0]
      await db.query("update private.artist_review_state set outcome='complete',snapshot=private.review_snapshot(b),valid_until=clock_timestamp()+interval '90 days' from public.bands b where artist_review_state.band_id=b.id and b.id=$1", [id])
      await service(); assert.equal((await ready()).eligible, 0)
      await owner()
      await db.query("update private.artist_review_state set valid_until=clock_timestamp()-interval '1 second' where band_id=$1", [id])
      await service(); assert.equal((await ready()).eligible, 1)
      await owner()
      await db.query("update private.artist_review_state set outcome='action_required' where band_id=$1", [id])
      await service(); assert.equal((await ready()).eligible, 0)
      await owner()
      await db.exec('update private.artist_review_lock set anchor_at=clock_timestamp(),last_slot=0')
      await service(); assert.equal((await ready()).reason, 'schedule_window')
      await owner()
      const finalBefore = await snapshot()
      const poll = () => call('select private.poll_artist_review_readiness() as value')
      assert.equal((await poll()).checked, true)
      const stored = (await db.query('select to_jsonb(c) as value from private.artist_review_readiness_check c')).rows[0].value
      assert.deepEqual(await poll(), { checked: false })
      assert.deepEqual((await db.query('select to_jsonb(c) as value from private.artist_review_readiness_check c')).rows[0].value, stored)
      assert.deepEqual(await snapshot(), finalBefore) // Poll status is separate from leases, items and notices.
      await db.exec('update private.artist_review_readiness_check set slot=slot-1')
      assert.equal((await poll()).checked, true)
      for (const role of ['anon', 'authenticated', 'service_role']) {
        await db.exec(`set role ${role}`)
        await assert.rejects(poll(), /permission denied/)
        await assert.rejects(db.exec('select * from private.artist_review_readiness_check'), /permission denied/)
        if (role !== 'authenticated') {
          await assert.rejects(call('select public.admin_artist_review_readiness() as value'), /permission denied/)
        } else {
          await assert.rejects(call('select public.admin_artist_review_readiness() as value'), /ADMIN_REQUIRED/)
        }
        await owner()
      }
      const admin = randomUUID()
      await db.query('insert into auth.users values($1)', [admin])
      await db.query('insert into private.admins values($1)', [admin])
      await db.query("select set_config('test.uid',$1,false)", [admin])
      await db.exec('set role authenticated')
      const adminStatus = await call('select public.admin_artist_review_readiness() as value')
      assert.equal(adminStatus.current.reason, 'schedule_window')
      assert.ok(adminStatus.lastCheckedAt)
      await owner()
    })
  } finally { await db.close() }
})
