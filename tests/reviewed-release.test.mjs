import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { reviewedReleaseRow, runReviewedPublication, assertCurrentKopis } from '../scripts/publish-reviewed-candidate.mjs'

// Fictional subscribers and a fictional concert in a local DB only.
test('reviewed publication uses exact stored facts while older collectors cannot erase them', async t => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;`)
    for (const name of ['202610060001_initial', '202610070001_admin_review', '202610080001_ingestion',
      '202610090001_notifications', '202610110001_catalog_expansion', '20261011150237_discovered_artist_catalog',
      '20261012134538_automated_catalog', '20261012135134_artist_management', '20261013070742_artist_curation',
      '20261014125200_kopis_discovery', '20261022101423_reissue_nol_collection',
      '20261031132828_harden_publication_executor', '20261106095303_allow_date_only_silent_publication']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'))
    }
    await db.exec(await readFile(new URL('../supabase/migrations/20261106101911_reviewed_candidate_release.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/manual/continuous-reviewed-publication.sql', import.meta.url), 'utf8'))
    await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`)
    const user = '00000000-0000-4000-8000-000000000099'
    await db.query('insert into auth.users values ($1)', [user])
    const key = 'mb:00000000-0000-4000-8000-000000000001'
    const band = (await db.query('select public.service_import_artist($1) as id', [{ key, name: 'Fictional reviewed band',
      country: 'JP', aliases: [], genre: 'rock', evidence: 'https://musicbrainz.org/artist/' + key.slice(3) }])).rows[0].id
    await db.query("update public.bands set curation_status='approved' where id=$1", [band])
    await db.query("insert into private.artist_publication_approvals(identity_key,evidence_url,approved_by) values ($1,'https://official.example/bio',$2)", [key, user])
    await db.query('insert into public.band_follows(user_id,band_id) values ($1,$2)', [user, band])
    await db.query('insert into public.notification_preferences(user_id,announcements) values ($1,true)', [user])
    await db.query('insert into private.push_devices(user_id,endpoint,p256dh,auth_key,label) values ($1,$2,$3,$4,$5)',
      [user, 'https://fcm.googleapis.com/fcm/send/fictional-reviewed', 'A'.repeat(87), 'B'.repeat(22), 'fictional'])
    const clock = (await db.query(`select (now() at time zone 'Asia/Seoul')::date::text as today,
      ((now() at time zone 'Asia/Seoul')::date+100)::text as day`)).rows[0]
    const now = new Date().toISOString(), sale = new Date(Date.now() + 86400000).toISOString()
    const url = 'https://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20Id=PF123456'
    const row = { source_url: url, content_hash: 'a'.repeat(64), payload: { title: 'Fictional reviewed concert', format: 'solo',
      country_code: 'KR', city: '서울', venue: '가상 공연장', cancelled: false, starts_on: clock.day, ends_on: clock.day,
      announced_on: clock.today, announced_at: null, announcement_precision: 'day', announcement_verified: true,
      initial_import: true, artist_keys: [key], band_ids: [band],
      discovered_artists: [{ key, band_id: band, name: 'Fictional reviewed band' }], review_reasons: [],
      sessions: [{ starts_on: clock.day, starts_at: `${clock.day}T19:00:00+09:00` }], sources: [{ url, verified_at: now }],
      ticket: { opens_at: sale, booking_url: 'https://official.example/' },
      ticket_evidence: [{ method: 'api', sale_type: 'general', event_matched: true, source_url: url, opens_at: sale, verified_at: now }] } }
    const complete = async rows => {
      const token = (await db.query("select public.service_begin_collection('kopis',now()) as id")).rows[0].id
      const result = (await db.query("select public.service_complete_collection($1,$2,'[]',1,'catalog-v1') as r", [token,
        { candidates: rows, failures: [], excluded: [] }])).rows[0].r
      return { result, token }
    }
    const stored = async () => (await db.query('select * from public.collection_candidates where source_url=$1', [url])).rows[0]
    assert.deepEqual((await complete([row])).result, { published: 0, review: 1 })
    const snapshot = await stored(), reference = `${snapshot.id}:${snapshot.revision}`
    const release = reviewedReleaseRow(snapshot, reference)
    const isolate = (name, fn) => t.test(name, async () => {
      await db.exec('begin'); try { await fn() } finally { await db.exec('rollback') }
    })
    await isolate('scheduled release calls the existing lease and completion once with no artist writes', async () => {
      await db.exec("update public.collection_policies set publication_enabled=true where source='kopis'")
      const calls = []
      const client = {
        from(table) {
          const filters = {}
          return { select() { return this }, eq(k, v) { filters[k] = v; return this }, async single() {
            const rows = table === 'collection_policies'
              ? (await db.query('select * from public.collection_policies where source=$1', [filters.source])).rows
              : (await db.query('select * from public.collection_candidates where id=$1', [filters.id])).rows
            return { data: rows[0] }
          } }
        },
        async rpc(name, args) {
          calls.push({ name, args })
          if (name === 'service_publication_capabilities') return { data: (await db.query('select public.service_publication_capabilities() c')).rows[0].c }
          if (name === 'service_begin_collection') return { data: (await db.query('select public.service_begin_collection($1,$2) t', [args.source_name, args.scheduled_at])).rows[0].t }
          if (name === 'service_complete_collection') return { data: (await db.query('select public.service_complete_collection($1,$2,$3,$4,$5) r',
            [args.run_token, args.batch, args.identities, args.attempt_count, args.adapter_version])).rows[0].r }
          throw Error('UNEXPECTED_RPC')
        },
      }
      const digest = (await db.query('select public.service_publication_capabilities() c')).rows[0].c.executor_md5
      const xml = `<dbs><db><mt20id>PF123456</mt20id><genrenm>대중음악</genrenm><prfstate>공연예정</prfstate>
        <prfnm>Fictional reviewed concert</prfnm><fcltynm>가상 공연장</fcltynm><area>서울</area>
        <prfpdfrom>${clock.day}</prfpdfrom><prfpdto>${clock.day}</prfpdto><dtguidance>가상 검증 회차 19:00</dtguidance>
        <prfcast>Fictional reviewed band</prfcast></db></dbs>`
      assertCurrentKopis(snapshot, xml, '가상 검증 회차 19:00')
      for (const changed of [xml.replace('공연예정', '공연취소'), xml.replace('가상 공연장', '다른 공연장'),
        xml.replace('Fictional reviewed band', 'Another fictional artist'), xml.replace('19:00', '20:00')]) {
        assert.throws(() => assertCurrentKopis(snapshot, changed, '가상 검증 회차 19:00'), /SOURCE_CHANGED/)
      }
      let sourceRequests = 0
      const result = await runReviewedPublication({ client, env: { KOPIS_PUBLICATION_EXECUTOR_MD5: digest,
        KOPIS_REVIEWED_CANDIDATE: reference, KOPIS_REVIEWED_GUIDANCE: '가상 검증 회차 19:00', KOPIS_SERVICE_KEY: 'fictional' },
        fetcher: async url => { sourceRequests++; assert.equal(url.hostname, 'kopis.or.kr'); return new Response(xml) } })
      assert.equal(sourceRequests, 1)
      assert.deepEqual(result.publication, { published: 1, review: 0 })
      assert.deepEqual(calls.map(c => c.name), ['service_publication_capabilities', 'service_begin_collection', 'service_complete_collection'])
      assert.deepEqual(calls[2].args.identities, [])
      assert.equal(calls[2].args.batch.candidates[0].reviewed_revision, snapshot.revision)
    })
    await isolate('unchanged stored revision publishes once without inventing a timestamp', async () => {
      await db.exec("update public.collection_policies set publication_enabled=true where source='kopis'")
      assert.deepEqual((await complete([release])).result, { published: 1, review: 0 })
      const c = (await db.query('select announced_at from public.concerts')).rows[0]
      assert.equal(c.announced_at, null)
      assert.equal((await stored()).revision, snapshot.revision)
      assert.equal((await db.query('select count(*)::int n from private.notification_deliveries')).rows[0].n, 0)
      assert.deepEqual((await db.query('select public.claim_notification_batch() b')).rows[0].b, [])
      assert.deepEqual((await complete([release])).result, { published: 0, review: 0 })
      assert.equal((await db.query('select count(*)::int n from public.concerts')).rows[0].n, 1)
    })
    for (const [name, change] of [
      ['stale revision', r => { r.reviewed_revision++ }],
      ['changed hash', r => { r.reviewed_content_hash = 'b'.repeat(64) }],
      ['changed payload', r => { r.payload.venue = '다른 가상 공연장' }],
    ]) await isolate(name, async () => {
      const changed = structuredClone(release); change(changed)
      await assert.rejects(complete([changed]), /REVIEWED_CANDIDATE_CHANGED/)
    })
    for (const [name, sql] of [
      ['manual dismissal', "update public.collection_candidates set status='dismissed'"],
      ['manual automation block', 'update public.collection_candidates set automation_blocked=true'],
    ]) await isolate(name, async () => {
      await db.exec(sql); await assert.rejects(complete([release]), /REVIEWED_CANDIDATE_CHANGED/)
    })
    await isolate('old raw collector preserves reviewed row and processes its other candidate', async () => {
      const raw = structuredClone(row); raw.content_hash = 'b'.repeat(64)
      Object.assign(raw.payload, { announced_on: null, announcement_verified: false, sessions: [], ticket_evidence: [] })
      raw.payload.ticket.opens_at = null
      const other = structuredClone(row); other.source_url = url.replace('PF123456', 'PF123457'); other.content_hash = 'c'.repeat(64)
      assert.deepEqual((await complete([raw, other])).result, { published: 0, review: 2 })
      assert.deepEqual(await stored(), snapshot)
      const last = (await db.query("select state,candidate_count,failures from public.collection_runs where state<>'legacy' order by created_at desc limit 1")).rows[0]
      assert.equal(last.state, 'partial'); assert.equal(last.candidate_count, 2)
      assert.equal(last.failures[0].error, 'REVIEWED_FACT_REGRESSION')
      assert.equal((await db.query('select count(*)::int n from public.collection_candidates')).rows[0].n, 2)
    })
    await isolate('raw complete facts do not expand the initial KOPIS release target', async () => {
      await db.exec("update public.collection_policies set publication_enabled=true where source='kopis'")
      const other = structuredClone(row); other.source_url = url.replace('PF123456', 'PF123457')
      assert.deepEqual((await complete([other])).result, { published: 0, review: 1 })
      assert.equal((await db.query('select reason from public.collection_decisions order by decided_at desc limit 1')).rows[0].reason, 'REVIEWED_RELEASE_TARGET_REQUIRED')
    })
    await isolate('continuous batches enrich two arbitrary candidates and persist all source links silently', async () => {
      const other = structuredClone(row); other.source_url = url.replace('PF123456', 'PF123458')
      other.payload.title = 'Another fictional concert'; other.payload.sources[0].url = other.source_url
      other.payload.ticket_evidence[0].source_url = other.source_url
      other.payload.starts_on = other.payload.ends_on = new Date(Date.parse(clock.day) + 86400000).toISOString().slice(0, 10)
      other.payload.sessions = [{ starts_on: other.payload.starts_on, starts_at: `${other.payload.starts_on}T19:00:00+09:00` }]
      await complete([other])
      const second = (await db.query('select * from public.collection_candidates where source_url=$1', [other.source_url])).rows[0]
      const rows = [snapshot, second].map((stored, i) => {
        const r = reviewedReleaseRow(stored, `${stored.id}:${stored.revision}`)
        r.automatic_enrichment = true; r.content_hash = String(i + 2).repeat(64)
        r.payload.sources.push({ url: `https://official.example/notice/${i}`, label: 'Fictional official notice', verified_at: now })
        return r
      })
      await db.exec("update public.collection_policies set publication_enabled=true where source='kopis'")
      assert.deepEqual((await complete(rows)).result, { published: 2, review: 0 })
      assert.equal((await db.query('select count(*)::int n from public.concert_sources')).rows[0].n, 4)
      assert.equal((await db.query('select count(*)::int n from private.notification_deliveries')).rows[0].n, 0)
      assert.equal((await db.query('select count(*)::int n from private.notification_attempts')).rows[0].n, 0)
      assert.equal((await db.query('select bool_and(initial_import) b from private.publication_changes')).rows[0].b, true)
    })
    await isolate('automatic enrichment cannot bypass manual state, stale CAS or regress event facts', async () => {
      await db.exec("update public.collection_policies set publication_enabled=true where source='kopis'")
      const r = structuredClone(release); r.automatic_enrichment = true; r.payload.venue = 'Unverified different venue'
      await assert.rejects(complete([r]), /REVIEWED_ENRICHMENT_INVALID/)
    })
    await isolate('an initially incomplete collected candidate can be enriched and published atomically', async () => {
      const raw = structuredClone(row)
      raw.source_url = url.replace('PF123456', 'PF123459'); raw.payload.sources[0].url = raw.source_url
      raw.payload.sources[0].verified_at = null; raw.payload.sessions = []
      raw.payload.announcement_verified = false; raw.payload.announced_on = null
      raw.payload.ticket.opens_at = null; raw.payload.ticket_evidence = []
      await complete([raw])
      const before = (await db.query('select * from public.collection_candidates where source_url=$1', [raw.source_url])).rows[0]
      const proposed = structuredClone(row); proposed.source_url = raw.source_url
      proposed.payload.sources[0].url = raw.source_url; proposed.payload.ticket_evidence[0].source_url = raw.source_url
      Object.assign(proposed, { automatic_enrichment: true, reviewed_revision: before.revision,
        reviewed_content_hash: before.content_hash, content_hash: 'd'.repeat(64) })
      await db.exec("update public.collection_policies set publication_enabled=true where source='kopis'")
      assert.deepEqual((await complete([proposed])).result, { published: 1, review: 0 })
      const after = (await db.query('select revision,payload from public.collection_candidates where id=$1', [before.id])).rows[0]
      assert.equal(after.revision, before.revision + 1); assert.equal(after.payload.sessions.length, 1)
    })
    for (const change of [{ revision: 999 }, { status: 'dismissed' }, { automation_blocked: true }]) {
      assert.throws(() => reviewedReleaseRow({ ...snapshot, ...change }, reference))
    }
    const stale = structuredClone(snapshot); stale.payload.sources[0].verified_at = '2000-01-01T00:00:00Z'
    assert.throws(() => reviewedReleaseRow(stale, reference), /OBSERVATION_STALE/)
  } finally { await db.close() }
})
