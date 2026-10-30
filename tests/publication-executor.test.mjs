import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Fictional API facts and subscribers in an in-memory DB. No operational RPCs.
test('proposed publication executor validates API facts and preserves publication protections', async t => {
  const db = new PGlite()
  try {
    const user = '00000000-0000-4000-8000-000000000099'
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;`)
    for (const name of ['202610060001_initial', '202610070001_admin_review', '202610080001_ingestion',
      '202610090001_notifications', '202610110001_catalog_expansion', '20261011150237_discovered_artist_catalog',
      '20261012134538_automated_catalog', '20261012135134_artist_management', '20261013070742_artist_curation',
      '20261014125200_kopis_discovery', '20261022101423_reissue_nol_collection']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'))
    }
    const policies = (await db.query('select * from public.collection_policies order by source')).rows
    await db.exec(await readFile(new URL('../supabase/manual/harden-publication-executor.sql', import.meta.url), 'utf8'))
    assert.deepEqual((await db.query('select * from public.collection_policies order by source')).rows, policies)
    await db.query('insert into auth.users values ($1)', [user])
    await db.query('insert into private.admins values ($1)', [user])
    await db.query("select set_config('test.uid',$1,false)", [user])
    await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`)
    const key = 'mb:00000000-0000-4000-8000-000000000001'
    const band = (await db.query('select public.service_import_artist($1) as id', [{ key, name: 'Fictional API band',
      country: 'JP', aliases: [], genre: 'rock', evidence: 'https://musicbrainz.org/artist/00000000-0000-4000-8000-000000000001' }])).rows[0].id
    await db.query("update public.bands set curation_status='approved' where id=$1", [band])
    await db.query('select public.admin_approve_artist($1,$2)', [key, 'https://official.example/bio'])
    await db.query('insert into public.band_follows(user_id,band_id) values ($1,$2)', [user, band])
    await db.query('insert into public.notification_preferences(user_id,announcements) values ($1,true)', [user])
    await db.query('insert into private.push_devices(user_id,endpoint,p256dh,auth_key,label) values ($1,$2,$3,$4,$5)',
      [user, 'https://fcm.googleapis.com/fcm/send/fictional', 'A'.repeat(87), 'B'.repeat(22), 'fixture'])
    const clock = (await db.query(`select clock_timestamp()::text as now,
      (clock_timestamp() at time zone 'Asia/Seoul')::date::text as today,
      ((clock_timestamp() at time zone 'Asia/Seoul')::date+100)::text as day`)).rows[0]
    const now = new Date(clock.now).toISOString(), sale = new Date(Date.parse(now) + 86400000).toISOString()
    const url = 'https://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20Id=PF123456'
    const original = { source_url: url, content_hash: 'a'.repeat(64), payload: {
      title: 'Fictional API concert', format: 'solo', country_code: 'KR', city: '서울', venue: '가상 공연장',
      cancelled: false, starts_on: clock.day, ends_on: clock.day,
      announced_at: now, announced_on: clock.today, announcement_verified: true, artist_keys: [key], review_reasons: [],
      sources: [{ url, verified_at: now }], sessions: [{ starts_on: clock.day, starts_at: `${clock.day}T19:00:00+09:00` }],
      ticket: { opens_at: sale, booking_url: 'https://nol.yanolja.com/ticket/products/123' },
      ticket_evidence: [{ method: 'api', sale_type: 'general', event_matched: true, source_url: url, opens_at: sale, verified_at: now }],
    } }
    const begin = async (source = 'kopis') => (await db.query('select public.service_begin_collection($1,now()) as id', [source])).rows[0].id
    const finish = async (token, rows, version = 'catalog-v1') => (await db.query(
      "select public.service_complete_collection($1,$2,'[]',1,$3) as result", [token, { candidates: rows, failures: [] }, version])).rows[0].result
    const complete = async (rows, source = 'kopis') => finish(await begin(source), rows)
    const reason = async () => (await db.query('select reason from public.collection_decisions order by decided_at desc limit 1')).rows[0].reason
    const count = async table => (await db.query(`select count(*)::int as n from ${table}`)).rows[0].n
    const variant = (row, index) => {
      const copy = structuredClone(row)
      copy.source_url = url.replace('PF123456', `PF${123456 + index}`)
      copy.content_hash = String(index).repeat(64)
      copy.payload.title += ` ${index}`
      const day = new Date(Date.parse(`${clock.day}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10)
      copy.payload.starts_on = copy.payload.ends_on = day
      copy.payload.sessions = [{ starts_on: day, starts_at: `${day}T19:00:00+09:00` }]
      copy.payload.sources[0].url = copy.payload.ticket_evidence[0].source_url = copy.source_url
      return copy
    }
    const isolate = async (name, fn) => t.test(name, async () => {
      await db.exec('begin')
      try { await fn(structuredClone(original)) } finally { await db.exec('rollback') }
    })
    await isolate('policy OFF is retained and no concert or announcement is created', async row => {
      assert.deepEqual(await complete([row]), { published: 0, review: 1 })
      assert.equal(await reason(), 'PUBLICATION_DISABLED')
      assert.equal(await count('public.concerts'), 0)
      assert.equal(await count('private.notification_deliveries'), 0)
    })
    // Only the isolated fixture policy is enabled. Production is never contacted.
    await db.exec("update public.collection_policies set publication_enabled=true where source='kopis'")
    await isolate('initial publication is silent with an opted-in follower and active device; replay is idempotent', async row => {
      const token = await begin()
      assert.equal(await begin(), null)
      assert.deepEqual(await finish(token, [row]), { published: 1, review: 0 })
      assert.deepEqual(await finish(token, [row]), { published: 1, review: 0 })
      assert.equal(await count('public.concerts'), 1)
      assert.equal(await count('private.publication_changes'), 1)
      assert.equal((await db.query('select initial_import from private.publication_changes')).rows[0].initial_import, true)
      assert.equal(await count('private.notification_deliveries'), 0)
      assert.deepEqual(await complete([row]), { published: 0, review: 0 })
      assert.equal(await reason(), 'SAME_REVISION')
    })
    for (const [name, change, expected] of [
      ['unknown cancellation', p => { delete p.cancelled }, 'INVALID_EVENT'],
      ['cancelled', p => { p.cancelled = true }, 'INVALID_EVENT'],
      ['missing venue', p => { p.venue = ' ' }, 'KOREA_VENUE_UNVERIFIED'],
      ['impossible date', p => { p.starts_on = '2027-02-30' }, 'DATE_UNVERIFIED_OR_PAST'],
      ['announcement without offset', p => { p.announced_at = '2026-10-30T12:00:00' }, 'ANNOUNCEMENT_UNVERIFIED'],
      ['no sessions', p => { p.sessions = [] }, 'SESSIONS_UNVERIFIED'],
      ['duplicate absolute session', p => { p.sessions.push({ ...p.sessions[0], starts_at: `${clock.day}T10:00:00Z` }) }, 'SESSIONS_UNVERIFIED'],
      ['unverified source', p => { p.sources[0].verified_at = null }, 'SOURCE_UNVERIFIED'],
      ['presale', p => { p.ticket_evidence[0].sale_type = 'presale' }, 'API_SALE_EVIDENCE_REQUIRED'],
      ['unmatched event', p => { delete p.ticket_evidence[0].event_matched }, 'API_SALE_EVIDENCE_REQUIRED'],
      ['HTML excerpt', p => { p.ticket_evidence[0].line = '일반 예매 원문' }, 'API_SALE_EVIDENCE_REQUIRED'],
      ['wrong sale time', p => { p.ticket_evidence[0].opens_at = now }, 'API_SALE_EVIDENCE_REQUIRED'],
      ['NOL evidence with another booking destination', p => { p.ticket.booking_url = 'https://other.example/123'; p.sources.push({ url: 'https://tickets.interpark.com/notice/1' }) }, 'OPTIONAL_NOL_DEPENDENCY'],
    ]) await isolate(name, async row => {
      change(row.payload)
      assert.equal((await complete([row])).published, 0)
      assert.equal(await reason(), expected)
      assert.equal(await count('public.concerts'), 0)
      assert.equal(await count('private.notification_deliveries'), 0)
    })
    await isolate('manual block survives a new revision', async row => {
      await db.query("select public.admin_ingest_catalog('kopis',$1,'[]')", [{ candidates: [row], failures: [] }])
      await db.exec('update public.collection_candidates set automation_blocked=true')
      row.content_hash = 'b'.repeat(64)
      await complete([row])
      assert.equal(await reason(), 'ADMIN_OVERRIDE')
      assert.equal((await db.query('select automation_blocked from public.collection_candidates')).rows[0].automation_blocked, true)
      assert.equal(await count('public.concerts'), 0)
    })
    await isolate('withdrawn concert is never restored by a same-revision recollection', async row => {
      await complete([row])
      await db.exec("update public.concerts set status='withdrawn'")
      await complete([row])
      assert.equal(await reason(), 'EXISTING_CONCERT_REVIEW')
      assert.equal((await db.query('select status from public.concerts')).rows[0].status, 'withdrawn')
    })
    await isolate('cancellation/important change goes to review without overwriting the published concert', async row => {
      await complete([row])
      row.payload.cancelled = true; row.content_hash = 'b'.repeat(64)
      await complete([row])
      assert.equal(await reason(), 'CANCELLED_OR_UNKNOWN')
      assert.equal((await db.query('select cancelled from public.concerts')).rows[0].cancelled, false)
      row.payload.cancelled = false; row.payload.venue = 'changed'; row.content_hash = 'c'.repeat(64)
      await complete([row])
      assert.equal(await reason(), 'EXISTING_CONCERT_REVIEW')
      assert.equal((await db.query('select venue from public.concerts')).rows[0].venue, '가상 공연장')
    })
    await isolate('cross-source duplicates stay in review', async row => {
      await complete([row])
      row.source_url = 'https://ualive.com/concerts/123'
      row.payload.sources = [{ url: row.source_url, verified_at: now }]
      row.payload.ticket_evidence[0].source_url = row.source_url
      await db.exec("update public.collection_policies set publication_enabled=true where source='ualive'")
      await complete([row], 'ualive')
      assert.equal(await reason(), 'POSSIBLE_DUPLICATE_OR_CONFLICT')
      assert.equal(await count('public.concerts'), 1)
    })
    await isolate('duplicate batch URLs fail atomically without ingestion', async row => {
      const token = await begin()
      await db.exec('savepoint duplicate_batch')
      await assert.rejects(finish(token, [row, row]), /DUPLICATE_BATCH_SOURCE/)
      await db.exec('rollback to savepoint duplicate_batch')
      for (const table of ['public.collection_candidates', 'public.collection_decisions', 'public.concerts', 'private.notification_deliveries']) {
        assert.equal(await count(table), 0)
      }
      assert.equal((await db.query('select state from public.collection_runs where id=$1', [token])).rows[0].state, 'running')
      assert.equal((await finish(token, [row])).published, 1)
    })
    for (const resolution of ['reviewed', 'dismissed']) await isolate(`${resolution} protection survives two changed revisions and preserves candidate ID`, async row => {
      await db.query("select public.admin_ingest_catalog('kopis',$1,'[]')", [{ candidates: [row], failures: [] }])
      const candidate = (await db.query('select id,revision from public.collection_candidates')).rows[0]
      await db.query('select public.admin_resolve_candidate($1,$2,$3)', [candidate.id, candidate.revision, resolution])
      for (const hash of ['b', 'c']) {
        row.content_hash = hash.repeat(64)
        row.payload.venue += ' changed'
        await complete([row])
        assert.equal(await reason(), 'ADMIN_OVERRIDE')
        const after = (await db.query('select id,revision,automation_blocked from public.collection_candidates')).rows[0]
        assert.equal(after.id, candidate.id)
        assert.equal(after.automation_blocked, true)
        assert.ok(after.revision > candidate.revision)
      }
      assert.equal(await count('public.concerts'), 0)
      assert.equal(await count('private.notification_deliveries'), 0)
    })
    await isolate('an administrator cancellation and every existing concert child remain unchanged', async row => {
      await complete([row])
      await db.exec('update public.concerts set cancelled=true')
      const tables = ['public.concerts', 'public.concert_sources', 'public.concert_bands', 'public.concert_sessions', 'public.ticket_schedules', 'private.catalog_history', 'private.concert_history']
      const snapshot = async () => Promise.all(tables.map(async table => (await db.query(`select to_jsonb(t) as row from ${table} t order by id`)).rows))
      const before = await snapshot()
      row.content_hash = 'd'.repeat(64)
      assert.deepEqual(await complete([row]), { published: 0, review: 1 })
      assert.equal(await reason(), 'EXISTING_CONCERT_REVIEW')
      assert.deepEqual(await snapshot(), before)
      assert.equal(await count('private.notification_deliveries'), 0)
    })
    for (const duplicate of ['normalized_title', 'overlapping_artist']) await isolate(`duplicate detection: ${duplicate}`, async row => {
      await complete([row])
      const other = variant(row, 1)
      if (duplicate === 'normalized_title') other.payload.title = 'Fictional-API.Concert!!'
      else {
        other.payload.starts_on = row.payload.starts_on
        other.payload.ends_on = row.payload.ends_on
        other.payload.sessions = row.payload.sessions
      }
      assert.equal((await complete([other])).published, 0)
      assert.equal(await reason(), 'POSSIBLE_DUPLICATE_OR_CONFLICT')
      assert.equal(await count('public.concerts'), 1)
      assert.equal(await count('private.publication_changes'), 1)
    })
    await isolate('initial data is publicly readable yet worker claims stay empty even after live mode begins', async row => {
      await complete([row])
      await db.exec("select set_config('test.uid','',true); set local role anon")
      assert.equal((await db.query("select id from public.concerts where status='published'")).rows.length, 1)
      assert.equal(await count('public.concert_sessions'), 1)
      assert.equal(await count('public.ticket_schedules'), 1)
      await db.exec('reset role')
      await db.query("select set_config('test.uid',$1,true)", [user])
      assert.deepEqual((await db.query('select public.claim_notification_batch() as batch')).rows[0].batch, [])
      await db.exec("update public.collection_policies set live_after=clock_timestamp()-interval '2 days' where source='kopis'")
      await complete([row])
      assert.equal(await reason(), 'SAME_REVISION')
      assert.deepEqual((await db.query('select public.claim_notification_batch() as batch')).rows[0].batch, [])
      assert.equal(await count('private.notification_deliveries'), 0)
      assert.equal(await count('private.notification_attempts'), 0)
    })
    for (const boundary of ['run_equal', 'run_before', 'announcement_equal_day']) await isolate(`silent activation boundary: ${boundary}`, async row => {
      const token = await begin()
      if (boundary === 'announcement_equal_day') {
        // Run began later, but the announcement falls on the activation KST day.
        await db.query('update public.collection_policies set live_after=$1::timestamptz where source=\'kopis\'', [now])
        await db.query('update public.collection_runs set started_at=$1::timestamptz+interval \'1 second\' where id=$2', [now, token])
      } else {
        await db.query(`update public.collection_policies set live_after=(select started_at from public.collection_runs where id=$1)
          + case when $2='run_before' then interval '1 second' else interval '0 seconds' end where source='kopis'`, [token, boundary])
      }
      assert.equal((await finish(token, [row])).published, 1)
      assert.equal((await db.query('select initial_import from private.publication_changes')).rows[0].initial_import, true)
      assert.equal(await count('private.notification_deliveries'), 0)
    })
    await isolate('silent and failed rows cannot leak notification mode into the next live row', async row => {
      await db.exec("update public.collection_policies set live_after=clock_timestamp()-interval '2 days' where source='kopis'")
      row.payload.initial_import = true
      const invalid = variant(row, 1), live = variant(row, 2)
      delete invalid.payload.initial_import
      delete live.payload.initial_import
      invalid.payload.ticket.booking_url = 'http://invalid.example/ticket'
      await db.exec("select set_config('encore.initial_import','true',true)")
      assert.deepEqual(await complete([row, invalid, live]), { published: 2, review: 1 })
      assert.equal(await count('public.concerts'), 2)
      assert.equal(await count('public.ticket_schedules'), 2)
      assert.equal(await count('private.notification_deliveries'), 1)
      assert.equal((await db.query("select current_setting('encore.initial_import') as value")).rows[0].value, 'true')
      assert.equal((await db.query("select count(*)::int as n from private.publication_changes where initial_import")).rows[0].n, 1)
      assert.equal((await db.query("select reason from public.collection_decisions where outcome='review'")).rows[0].reason, 'INVALID_PUBLICATION_FIELDS')
    })
    await isolate('unreviewed artist cannot publish using an old approval', async row => {
      await db.query("update public.bands set curation_status='unreviewed' where id=$1", [band])
      await complete([row])
      assert.equal(await reason(), 'ARTIST_OR_GENRE_UNVERIFIED')
    })
    for (const mode of ['explicit_initial', 'past_sale', 'live']) await isolate(mode, async row => {
      await db.exec("update public.collection_policies set live_after=clock_timestamp()-interval '2 days' where source='kopis'")
      if (mode === 'explicit_initial') row.payload.initial_import = true
      if (mode === 'past_sale') row.payload.ticket.opens_at = row.payload.ticket_evidence[0].opens_at = now
      assert.equal((await complete([row])).published, 1)
      assert.equal(await count('private.notification_deliveries'), mode === 'live' ? 1 : 0)
      assert.equal((await db.query('select initial_import from private.publication_changes')).rows[0].initial_import, mode !== 'live')
    })
    await isolate('expired lease cannot publish', async row => {
      const token = await begin()
      await db.exec("update private.collection_leases set expires_at=clock_timestamp()-interval '1 second'")
      const replacement = await begin()
      assert.notEqual(replacement, token)
      await assert.rejects(finish(token, [row]), /LEASE_LOST/)
    })
    await isolate('public roles have no executor or private validator access', async () => {
      for (const role of ['anon', 'authenticated']) {
        const privileges = (await db.query(`select has_function_privilege($1,
          'public.service_complete_collection(uuid,jsonb,jsonb,integer,text)','execute') as runner,
          has_function_privilege($1,'private.publication_facts_reason(jsonb,text,timestamptz)','execute') as validator`, [role])).rows[0]
        assert.deepEqual(privileges, { runner: false, validator: false })
      }
    })
  } finally { await db.close() }
})
