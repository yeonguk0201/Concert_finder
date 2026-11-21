import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { gunzipSync } from 'node:zlib'
import { appendAppliedBookingReview, encodeReview } from '../scripts/reviewed-booking-link.mjs'

test('private applied records append without overwriting and retain the original review', async () => {
  const old = { schema: 1, concert_id: 'fixture', url: 'https://www.ticketlink.co.kr/product/12345',
    revision: 2, status: 'needs_review', original: { manual: 'preserved' }, uncertainties: ['Screen unverified'], evidence: [] }
  const originalBytes = encodeReview(old)
  const files = new Map()
  const storage = { upload: async (key, bytes, options) => {
    assert.equal(options.upsert, false)
    if (files.has(key)) return { error: { statusCode: 409 } }
    files.set(key, bytes); return { error: null }
  }, download: async key => ({ data: new Blob([files.get(key)]), error: null }) }
  const client = { storage: { from: name => { assert.equal(name, 'concert-scheduler-state'); return storage } } }
  const p = { concert_id: old.concert_id, url: old.url, checked_at: new Date().toISOString(), evidence: { method: 'fixture' }, confirmation_basis: 'fixture explicit confirmation' }
  const previousKey = `booking-link-reviews/v1/fixture/${'a'.repeat(64)}/00000002.json.gz`
  await assert.rejects(appendAppliedBookingReview(client, p, {}, { applied: true }, originalBytes), /REVIEW_KEY_REQUIRED/)
  const key = await appendAppliedBookingReview(client, p, {}, { applied: true, history_id: 'fixture-history' }, originalBytes, previousKey)
  assert.equal(key, previousKey.replace('00000002', '00000003'))
  assert.match(key, /\/00000003.json.gz$/)
  const saved = JSON.parse(gunzipSync(files.get(key)).toString('utf8'))
  assert.deepEqual(saved.original, old.original)
  assert.deepEqual(saved.uncertainties, old.uncertainties)
  assert.equal(saved.automatic_apply, false)
  assert.equal(saved.status, 'applied')
  await assert.rejects(appendAppliedBookingReview(client, p, {}, { applied: true }, originalBytes, previousKey), /REVIEW_NOT_SAVED:409/)
  assert.equal(files.size, 1)
})

test('reviewed booking links preserve catalog facts, manual edits and notification state', async t => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;`)
    for (const name of ['202610060001_initial','202610070001_admin_review','202610080001_ingestion',
      '202610090001_notifications','20261121131934_reviewed_booking_link']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'))
    }
    const id = (await db.query(`insert into public.concerts(title,format,city,venue,starts_on,ends_on,
      announced_on,announcement_verified) values ('Fictional booking fixture','solo','서울','가상 공연장',
      current_date+30,current_date+30,current_date,true) returning id`)).rows[0].id
    const band = (await db.query("insert into public.bands(name,country_code) values ('Fictional band','KR') returning id")).rows[0].id
    await db.query('insert into public.concert_bands(concert_id,band_id) values ($1,$2)', [id, band])
    await db.query("insert into public.concert_sources(concert_id,url,label,verified_at) values ($1,'https://official.example/show','fixture',now())", [id])
    await db.query("insert into public.concert_sessions(concert_id,label,starts_on,starts_at) values ($1,'fixture',current_date+30,now()+interval '30 days')", [id])
    await db.query("insert into public.ticket_schedules(concert_id,price_description) values ($1,'unchanged price')", [id])
    await db.exec("select set_config('encore.initial_import','true',false)")
    await db.query("update public.concerts set status='published' where id=$1", [id])
    const snapshot = async () => (await db.query('select private.catalog_snapshot($1) s', [id])).rows[0].s
    const before = await snapshot()
    const proposal = { concert_id: id, url: 'https://www.ticketlink.co.kr/product/12345',
      confirmed: true, confirmation_basis: 'Explicit user approval for this reviewed link',
      checked_at: new Date().toISOString(), evidence: { identity_matched: true,
        product_url: 'https://www.ticketlink.co.kr/product/12345', method: 'Official product facts matched against current catalog' } }
    const apply = (p = proposal, s = before) => db.query('select public.service_apply_reviewed_booking_link($1,$2) r', [p, s])
    await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`)
    const isolated = (name, fn) => t.test(name, async () => {
      await db.exec('begin'); try { await fn() } finally { await db.exec('rollback') }
    })
    await isolated('public callers cannot execute either entry point', async () => {
      for (const role of ['anon','authenticated']) {
        for (const schema of ['public','private']) {
          const fn = schema === 'public' ? 'service_apply_reviewed_booking_link' : 'apply_reviewed_booking_link'
          assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') p',
            [role, `${schema}.${fn}(jsonb,jsonb)`])).rows[0].p, false)
        }
      }
      await db.query(`select set_config('request.jwt.claims','{"role":"authenticated"}',false)`)
      await assert.rejects(apply(), /SERVICE_REQUIRED/)
    })
    await isolated('requires confirmation and current matched official product evidence', async () => {
      await assert.rejects(apply({ ...proposal, confirmed: false }), /BOOKING_CONFIRMATION_REQUIRED/)
    })
    await isolated('rejects search pages and misleading hostnames', async () => {
      await assert.rejects(apply({ ...proposal, url: 'https://www.ticketlink.co.kr.evil.example/product/12345' }), /BOOKING_PRODUCT_URL_REQUIRED/)
    })
    await isolated('rejects stale evidence', async () => {
      await assert.rejects(apply({ ...proposal, checked_at: '2020-01-01T00:00:00Z' }), /BOOKING_EVIDENCE_REQUIRED/)
    })
    await isolated('full snapshot conflicts with changes to child facts', async () => {
      await db.query("update public.ticket_schedules set price_description='manual edit' where concert_id=$1", [id])
      await assert.rejects(apply(), /EDIT_CONFLICT/)
    })
    await isolated('never replaces an existing manual link', async () => {
      await db.query("update public.ticket_schedules set booking_url='https://ticket.yes24.com/Perf/999' where concert_id=$1", [id])
      await assert.rejects(apply(proposal, await snapshot()), /BOOKING_MANUAL_VALUE_PROTECTED/)
    })
    await isolated('success changes only URL and editor version, is audited and retry is a no-op', async () => {
      const count = async table => (await db.query(`select count(*)::int n from ${table}`)).rows[0].n
      const changes = await count('private.publication_changes')
      const deliveries = await count('private.notification_deliveries')
      const r = (await apply()).rows[0].r
      assert.equal(r.applied, true)
      const after = await snapshot()
      const expected = structuredClone(before)
      expected.updated_at = after.updated_at
      expected.ticket.booking_url = proposal.url
      assert.deepEqual(after, expected)
      assert.notEqual(after.updated_at, before.updated_at)
      assert.equal(await count('private.catalog_history'), 1)
      assert.equal(await count('private.publication_changes'), changes)
      assert.equal(await count('private.notification_deliveries'), deliveries)
      assert.equal((await apply(proposal, after)).rows[0].r.unchanged, true)
      assert.equal(await count('private.catalog_history'), 1)
    })
  } finally { await db.close() }
})
