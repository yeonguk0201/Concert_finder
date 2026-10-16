import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

test('admin review status and resumption preserve auth, exact versions and a durable audit boundary', async () => {
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
    for (const name of ['20261015122525_artist_official_channels', '202610160001_artist_review_runner', '20261016151915_admin_artist_review_status']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'))
    }
    const admin = randomUUID(), band = randomUUID()
    await db.query('insert into auth.users values($1)', [admin])
    await db.query('insert into private.admins(user_id) values($1)', [admin])
    await db.query("insert into public.bands(id,name,country_code) values($1,'Artist','JP')", [band])
    const status = async (id = band) => (await db.query('select public.admin_artist_review_status($1) as value', [id])).rows[0].value
    for (const role of ['anon', 'service_role']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(status(), /permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role authenticated')
    await assert.rejects(status(), /ADMIN_REQUIRED/)
    await db.exec('reset role')
    await db.query("select set_config('test.uid',$1,false)", [admin])
    await db.exec('set role authenticated')
    let row = await status()
    assert.equal(row.state, null)
    assert.equal(row.target_enabled, false)
    assert.equal(row.can_resume, false)
    await assert.rejects(status(randomUUID()), /ARTIST_NOT_FOUND/)
    await db.exec('reset role')
    await db.query("insert into private.artist_review_targets values($1,true,array['official.example.com'])", [band])
    await db.query(`insert into private.artist_review_state(band_id,policy,snapshot,result,outcome,valid_until,next_attempt_at)
      values($1,'test','{}','{"error":"YOUTUBE_ACTION_REQUIRED"}','action_required',now(),now())`, [band])
    await db.exec('set role authenticated')
    row = await status()
    assert.equal(row.can_resume, true)
    assert.equal(row.state.error, 'YOUTUBE_ACTION_REQUIRED')
    const resume = (version = row.band_version, checked = row.state.checked_at) => db.query(
      'select public.admin_resume_artist_review($1,$2,$3,$4)', [band, version, checked, 'Server key configured; review explicitly resumed'])
    await assert.rejects(resume('2000-01-01T00:00:00Z'), /EDIT_CONFLICT/)
    await assert.rejects(resume(row.band_version, '2000-01-01T00:00:00Z'), /EDIT_CONFLICT/)
    await db.exec('reset role')
    await db.query('update private.artist_review_targets set enabled=false where band_id=$1', [band])
    await db.exec('set role authenticated')
    assert.equal((await status()).can_resume, false)
    await assert.rejects(resume(), /TARGET_DISABLED/)
    await db.exec('reset role')
    await db.query('update private.artist_review_targets set enabled=true where band_id=$1', [band])
    await db.query("update public.bands set curation_status='held' where id=$1", [band])
    await db.exec('set role authenticated')
    assert.equal((await status()).can_resume, false)
    await db.exec('reset role')
    await db.query("update public.bands set curation_status='unreviewed' where id=$1", [band])
    await db.exec('set role authenticated')
    row = await status()
    const version = row.band_version
    await resume()
    const after = await status()
    assert.equal(after.band_version, version)
    assert.equal(after.curation_status, 'unreviewed')
    assert.equal(after.state.outcome, 'failed')
    assert.equal(after.can_resume, false)
    await assert.rejects(resume(), /REVIEW_NOT_PAUSED/)
    await db.exec('reset role')
    const audit = (await db.query('select actor_id,band_version,previous_state from private.artist_review_resumptions')).rows
    assert.equal(audit.length, 1)
    assert.equal(audit[0].actor_id, admin)
    assert.equal(audit[0].previous_state.outcome, 'action_required')
    assert.equal((await db.query('select count(*)::int n from private.artist_channels')).rows[0].n, 0)
  } finally { await db.close() }
})
