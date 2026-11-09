import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { parseKopisApiFacts, normalizeKopisSessions } from '../scripts/kopis-api-facts.mjs'

// Fictional performances, approvals and subscribers in an isolated Postgres.
// Never connects to the operational project or runs a notification worker.
test('API-first server contract publishes unknown optional times with existing guards', async t => {
  const db = new PGlite()
  const sql = await readFile(new URL('../supabase/manual/api-first-publication.sql', import.meta.url), 'utf8')
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`)
    for (const name of ['202610060001_initial', '202610070001_admin_review', '202610080001_ingestion',
      '202610090001_notifications', '202610110001_catalog_expansion', '20261011150237_discovered_artist_catalog',
      '20261012134538_automated_catalog', '20261012135134_artist_management', '20261013070742_artist_curation',
      '20261014125200_kopis_discovery', '20261022101423_reissue_nol_collection',
      '20261031132828_harden_publication_executor', '20261106095303_allow_date_only_silent_publication',
      '20261106101911_reviewed_candidate_release']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'))
    }
    await db.exec(await readFile(new URL('../supabase/manual/continuous-reviewed-publication.sql', import.meta.url), 'utf8'))
    const before = (await db.query('select * from public.collection_policies order by source')).rows
    await db.exec("update public.collection_policies set publication_enabled=true where source='kopis'")
    await assert.rejects(db.exec(sql), /PUBLICATION_OFF_REQUIRED/)
    await db.exec('rollback')
    assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='concerts' and column_name='publication_basis'")).rows[0].n, 0)
    await db.exec("update public.collection_policies set publication_enabled=false where source='kopis'")
    await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`)
    const preflightRun = (await db.query("select public.service_begin_collection('kopis',clock_timestamp()) id")).rows[0].id
    await assert.rejects(db.exec(sql), /COLLECTION_LEASE_ACTIVE/)
    await db.exec('rollback')
    await db.query("select public.service_fail_collection($1,1,'fixture installation preflight')", [preflightRun])
    await db.exec(sql)
    assert.deepEqual((await db.query('select * from public.collection_policies order by source')).rows
      .map(({ api_facts_source_use, ...p }) => { assert.equal(api_facts_source_use, null); return p }), before)
    await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`)
    const capability = (await db.query('select public.service_publication_capabilities() c')).rows[0].c
    assert.equal(capability.contract, 'publication-facts-v4')
    assert.equal(capability.api_facts_contract, 'kopis-api-facts-v1')
    assert.match(capability.executor_md5, /^[a-f0-9]{32}$/); assert.match(capability.api_facts_md5, /^[a-f0-9]{32}$/)
    const user = '00000000-0000-4000-8000-000000000099'
    await db.query('insert into auth.users values ($1)', [user])
    const key = 'mb:00000000-0000-4000-8000-000000000001'
    const band = (await db.query('select public.service_import_artist($1) id', [{ key, name: 'Fictional API band',
      country: 'KR', aliases: ['가상 밴드'], genre: 'rock', evidence: 'https://musicbrainz.org/artist/' + key.slice(3) }])).rows[0].id
    await db.query("update public.bands set curation_status='approved' where id=$1", [band])
    await db.query("insert into private.artist_publication_approvals(identity_key,evidence_url,approved_by) values ($1,'https://official.example/bio',$2)", [key, user])
    await db.query('insert into public.band_follows(user_id,band_id) values ($1,$2)', [user, band])
    await db.query('insert into public.notification_preferences(user_id,announcements) values ($1,true)', [user])
    await db.query('insert into private.push_devices(user_id,endpoint,p256dh,auth_key,label) values ($1,$2,$3,$4,$5)',
      [user, 'https://fcm.googleapis.com/fcm/send/fictional-api', 'A'.repeat(87), 'B'.repeat(22), 'fictional'])
    const clock = (await db.query(`select clock_timestamp()::text as checked,
      ((clock_timestamp() at time zone 'Asia/Seoul')::date+100)::text as day`)).rows[0]
    const checked = new Date(clock.checked).toISOString()
    const config = { source: 'kopis', facts_only: true, basis_url: 'https://www.kopis.or.kr/fictional-terms', verified_at: checked }
    // Fictional terms only. Production configuration is never created here.
    await db.query("update public.collection_policies set api_facts_source_use=$1 where source='kopis'", [config])
    const context = (await db.query('select public.service_kopis_api_context() c')).rows[0].c
    assert.ok(context.catalog.some(b => b.id === band)); assert.deepEqual(context.approvals, [{ identity_key: key, band_id: band }])
    const makeRow = (index = 0) => {
      const day = new Date(Date.parse(clock.day) + index * 86400000).toISOString().slice(0, 10)
      const id = `PF${String(123456 + index)}`
      const xml = `<dbs><db><mt20id>${id}</mt20id><prfnm>Fictional API concert ${index}</prfnm>
        <prfpdfrom>${day}</prfpdfrom><prfpdto>${day}</prfpdto><genrenm>대중음악</genrenm><area>서울</area>
        <fcltynm>가상 공연장</fcltynm><prfcast>Fictional API band</prfcast><prfstate>공연예정</prfstate>
        <dtguidance>${day}(19:00)</dtguidance></db></dbs>`
      const row = parseKopisApiFacts(xml, id, { observedAt: checked, now: Date.parse(checked), ...context, sourceUse: context.source_use })
      assert.equal(row.proposed_contract_ready, true)
      return row
    }
    const scalar = async query => (await db.query(query)).rows[0]
    const count = async table => (await scalar(`select count(*)::int n from ${table}`)).n
    const caps = async () => (await scalar('select public.service_publication_capabilities() c')).c
    const stored = async row => (await db.query('select * from public.collection_candidates where source_url=$1', [row.source_url])).rows[0]
    const begin = async () => (await scalar("select public.service_begin_collection('kopis',clock_timestamp()) id")).id
    const finish = async (token, rows, extra = {}) => (await db.query(
      "select public.service_complete_collection($1,$2,'[]',1,'catalog-v1') r", [token, { candidates: rows, failures: [], excluded: [],
        publication_contract: 'kopis-api-facts-v1', expected_executor_md5: capability.executor_md5,
        expected_api_facts_md5: capability.api_facts_md5, ...extra }])).rows[0].r
    const complete = async (rows, extra) => finish(await begin(), rows, extra)
    const isolate = async (name, fn) => t.test(name, async () => {
      await db.exec('begin'); try { await fn(makeRow()) } finally { await db.exec('rollback') }
    })

    await isolate('policy OFF stores a valid candidate but never publishes it', async row => {
      assert.deepEqual(await complete([row]), { published: 0, review: 1 })
      assert.equal((await stored(row)).payload.announcement_verified, false)
      assert.equal(await count('public.concerts'), 0)
    })
    await db.exec("update public.collection_policies set publication_enabled=true where source='kopis'")
    await isolate('null announcement/sale publishes, is readable anonymously, and creates no deliveries or attempts', async row => {
      const token = await begin()
      assert.deepEqual(await finish(token, [row]), { published: 1, review: 0 })
      assert.deepEqual(await finish(token, [row]), { published: 1, review: 0 })
      const concert = await scalar('select announced_on,announced_at,announcement_verified,publication_basis from public.concerts')
      assert.deepEqual(concert, { announced_on: null, announced_at: null, announcement_verified: false, publication_basis: 'kopis-api-v1' })
      assert.equal((await scalar('select opens_at from public.ticket_schedules')).opens_at, null)
      assert.equal((await scalar('select initial_import from private.publication_changes')).initial_import, true)
      assert.equal(await count('private.notification_deliveries'), 0); assert.equal(await count('private.notification_attempts'), 0)
      assert.equal(await count('private.collection_leases'), 0)
      await db.exec("set local role anon; select set_config('request.jwt.claims','{}',true)")
      assert.equal(await count('public.concerts'), 1)
      assert.equal(await count('public.concert_sources'), 1)
      assert.equal(await count('public.concert_sessions'), 1)
      await db.exec('reset role')
    })
    await isolate('same candidate rereads require CAS and never create duplicate concerts', async row => {
      await complete([row])
      const previous = await stored(row)
      row.api_expected_revision = previous.revision; row.api_expected_hash = previous.content_hash
      assert.deepEqual(await complete([row]), { published: 0, review: 0 })
      assert.equal(await count('public.concerts'), 1)
      assert.equal((await stored(row)).revision, previous.revision)
    })
    await isolate('API provenance survives normal edits but cannot replace reviewed legacy provenance', async row => {
      await complete([row])
      const id = (await scalar('select id from public.concerts')).id
      // Existing manual cancellation remains supported; recollection cannot do it.
      await db.query('update public.concerts set cancelled=true where id=$1', [id])
      await db.exec('savepoint provenance')
      await assert.rejects(db.query("update public.concerts set publication_basis='reviewed' where id=$1", [id]), /PUBLISHED_PROVENANCE_IMMUTABLE/)
      await db.exec('rollback to savepoint provenance')
      await db.exec('savepoint sessions')
      await db.query('delete from public.concert_sessions where concert_id=$1', [id])
      await assert.rejects(db.exec('set constraints all immediate'), /API_PUBLICATION_FACTS_REQUIRED/)
      await db.exec('rollback to savepoint sessions')
      const reviewed = (await db.query("insert into public.concerts(title,format) values ('Fictional reviewed legacy','solo') returning id")).rows[0].id
      await db.query("insert into public.concert_sources(concert_id,url,label,verified_at) values ($1,$2,'Fictional official source',clock_timestamp())", [reviewed, row.source_url + '&legacy=1'])
      await db.query('insert into public.concert_bands(concert_id,band_id) values ($1,$2)', [reviewed, band])
      await assert.rejects(db.query("update public.concerts set status='published',starts_on=$1 where id=$2", [clock.day, reviewed]), /verified announcement/)
    })
    await isolate('manual and stale candidates are held while another valid performance publishes', async row => {
      await db.exec("update public.collection_policies set publication_enabled=false where source='kopis'")
      await complete([row]); const previous = await stored(row)
      await db.exec("update public.collection_policies set publication_enabled=true where source='kopis'")
      row.api_expected_revision = previous.revision + 1; row.api_expected_hash = previous.content_hash
      assert.deepEqual(await complete([row, makeRow(1)]), { published: 1, review: 1 })
      assert.equal((await stored(row)).revision, previous.revision)
      assert.equal((await scalar("select reason from public.collection_decisions where reason='API_CANDIDATE_CHANGED' limit 1")).reason, 'API_CANDIDATE_CHANGED')
    })
    await isolate('manual dismissal and existing verified optional evidence cannot be overwritten', async row => {
      await db.exec("update public.collection_policies set publication_enabled=false where source='kopis'")
      await complete([row]); let previous = await stored(row)
      const payload = structuredClone(previous.payload)
      Object.assign(payload, { announced_on: checked.slice(0, 10), announcement_verified: true, announcement_precision: 'day' })
      await db.query('update public.collection_candidates set payload=$1 where id=$2', [payload, previous.id])
      previous = await stored(row)
      row.api_expected_revision = previous.revision; row.api_expected_hash = previous.content_hash
      assert.deepEqual(await complete([row]), { published: 0, review: 1 })
      assert.deepEqual((await stored(row)).payload, payload)
      await db.query("update public.collection_candidates set status='dismissed' where id=$1", [previous.id])
      assert.deepEqual(await complete([row]), { published: 0, review: 1 })
      assert.equal((await stored(row)).status, 'dismissed')
    })
    await isolate('invalid CAS metadata holds only its own candidate', async row => {
      await db.exec("update public.collection_policies set publication_enabled=false where source='kopis'")
      await complete([row]); const previous = await stored(row)
      await db.exec("update public.collection_policies set publication_enabled=true where source='kopis'")
      row.api_expected_revision = 'invalid'; row.api_expected_hash = previous.content_hash
      assert.deepEqual(await complete([row, makeRow(1)]), { published: 1, review: 1 })
      assert.equal((await stored(row)).revision, previous.revision)
    })
    for (const [name, mutate] of [
      ['unknown cast', p => { p.api_observation.cast += ', Unknown guest' }],
      ['wrong cast identity', p => { p.discovered_artists[0].key = 'unapproved' }],
      ['ambiguous guidance', p => { p.api_observation.guidance = '추후 공지' }],
      ['invented session', p => { p.sessions[0].starts_at = `${p.starts_on}T20:00:00+09:00` }],
      ['unknown state', p => { p.api_observation.state = '공연완료' }],
      ['unpermitted product link', p => { p.ticket.booking_url = 'https://nol.yanolja.com/ticket/products/123' }],
      ['fake announcement verification', p => { p.announcement_verified = true }],
      ['sale without evidence', p => { p.ticket.opens_at = checked }],
      ['wrong terms configuration', p => { p.source_use.basis_url += '-different' }],
      ['future observation', p => { p.api_observation.observed_at = '2999-01-01T00:00:00Z' }],
      ['missing import flag', p => { delete p.initial_import }],
    ]) await isolate(`${name} is held independently`, async row => {
      mutate(row.payload)
      assert.deepEqual(await complete([row, makeRow(2)]), { published: 1, review: 1 })
      assert.equal(await count('public.concerts'), 1)
    })
    await isolate('revoked approval and catalog collisions are checked again on the server', async row => {
      await db.query('delete from private.artist_publication_approvals where identity_key=$1', [key])
      assert.deepEqual(await complete([row]), { published: 0, review: 1 })
      await db.query("insert into private.artist_publication_approvals(identity_key,evidence_url,approved_by) values ($1,'https://official.example/bio',$2)", [key, user])
      await db.query("insert into public.bands(name,country_code,curation_status) values ('Fictional API band','KR','excluded')")
      assert.deepEqual(await complete([row]), { published: 0, review: 1 })
    })
    await isolate('cross-source duplicates stay separate and are held rather than merged', async row => {
      await complete([row])
      const duplicate = makeRow(3)
      duplicate.payload.title = row.payload.title
      assert.deepEqual(await complete([duplicate]), { published: 0, review: 1 })
      assert.equal(await count('public.concerts'), 1)
    })
    await isolate('executor and dependency digests are both required', async row => {
      for (const change of [{ expected_executor_md5: '0'.repeat(32) }, { expected_api_facts_md5: '0'.repeat(32) }]) {
        await db.exec('savepoint mismatch')
        await assert.rejects(complete([row], change), /API_PUBLICATION_CONTRACT_CHANGED/)
        await db.exec('rollback to savepoint mismatch')
      }
      const old = await caps()
      await db.exec(`create or replace function private.kopis_api_regression(previous jsonb,incoming jsonb) returns boolean language sql stable set search_path='' as $$select true$$`)
      assert.notEqual((await caps()).api_facts_md5, old.api_facts_md5)
      await assert.rejects(complete([row]), /API_PUBLICATION_CONTRACT_CHANGED/)
    })
    await isolate('live notification policy cannot use the API-first batch contract', async row => {
      await db.exec("update public.collection_policies set live_after=clock_timestamp() where source='kopis'")
      await assert.rejects(complete([row]), /API_COLLECTION_SCOPE_REQUIRED/)
    })
    await isolate('legacy unreviewed candidates still require the old reviewed target', async row => {
      assert.deepEqual(await complete([row], { publication_contract: undefined }), { published: 0, review: 1 })
      assert.equal((await scalar('select reason from public.collection_decisions order by decided_at desc limit 1')).reason, 'REVIEWED_RELEASE_TARGET_REQUIRED')
    })
    await isolate('sessions normalize identically in JavaScript and Postgres', async () => {
      for (const guidance of ['목요일(19:30), 토요일 ~ 일요일(19:00)', '2027.01.14(14:00, 19:30)',
        '토요일~일요일(18:00)', '목요일(19:00),', '목요일(24:00)', '목요일(19:00) 공휴일 제외',
        '목요일(19:00), 2027.01.14(19:00)', '2027.02.30(19:00)', '일요일~토요일(19:00)', '매일 19:00']) {
        let expected = null
        try { expected = normalizeKopisSessions(guidance, '2027-01-14', '2027-01-17') } catch { /* deliberate holds */ }
        const actual = (await db.query("select private.kopis_api_sessions($1,'2027-01-14','2027-01-17') s", [guidance])).rows[0].s
        const key = s => [s.starts_on, new Date(s.starts_at).toISOString()]
        assert.deepEqual(actual?.map(key).sort() ?? null, expected?.map(key).sort() ?? null, guidance)
      }
    })
    await isolate('service RPCs reject ordinary roles and private validators are not executable', async () => {
      for (const role of ['anon', 'authenticated']) {
        for (const fn of ['public.service_kopis_api_context()', 'public.service_publication_capabilities()',
          'public.service_complete_collection(uuid,jsonb,jsonb,integer,text)', 'private.kopis_api_facts_reason(jsonb,text,timestamptz)',
          'private.kopis_api_sessions(text,date,date)', 'private.check_api_publication_children()']) {
          assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') allowed', [role, fn])).rows[0].allowed, false)
        }
      }
      await db.exec('set local role service_role')
      assert.equal((await caps()).contract, 'publication-facts-v4')
      assert.equal((await scalar('select public.service_kopis_api_context() c')).c.approvals.length, 1)
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claims','{}',false)")
      await assert.rejects(db.query('select public.service_kopis_api_context()'), /SERVICE_REQUIRED/)
    })
  } finally { await db.close() }
})
