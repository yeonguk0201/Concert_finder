import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('scheduled approval uses a service actor, checks evidence and selection, preserves relationships and is retryable', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;`)
    for (const name of ['202610060001_initial','202610070001_admin_review','202610080001_ingestion','202610090001_notifications',
      '202610110001_catalog_expansion','20261011150237_discovered_artist_catalog','20261012134538_automated_catalog',
      '20261012135134_artist_management','20261013070742_artist_curation','20261020053150_integrated_artist_approval','20261021165010_integrated_review_lifecycle']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'))
    }
    await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`)
    const mbid = '00000000-0000-4000-8000-000000000001'
    const bandId = (await db.query('select public.service_import_artist($1) as id', [{ key: `mb:${mbid}`,
      name: 'Verified Band', country: 'JP', aliases: [], genre: '장르 미검수', evidence: `https://musicbrainz.org/artist/${mbid}` }])).rows[0].id
    const current = async () => (await db.query('select * from public.bands where id=$1', [bandId])).rows[0]
    const band = await current(), runId = '00000000-0000-4000-8000-000000000002'
    const targets = [{ bandId, expectedUpdatedAt: band.updated_at }]
    const begin = (id = runId, list = targets) => db.query('select public.service_begin_integrated_review($1,$2)', [id, list])
    await db.exec('set role anon')
    await assert.rejects(begin(), /permission denied/)
    await db.exec('reset role; set role authenticated')
    await assert.rejects(begin(), /permission denied/)
    await db.exec('reset role')
    await db.exec(`select set_config('request.jwt.claims','{"role":"authenticated"}',false)`)
    await assert.rejects(begin(), /SERVICE_REQUIRED/)
    await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`)
    await assert.rejects(begin(runId, Array(41).fill(targets[0])), /SELECTION_INVALID/)
    await begin(); await begin()
    await assert.rejects(begin(runId, [{ ...targets[0], expectedUpdatedAt: '2020-01-01' }]), /SELECTION_CONFLICT/)
    await assert.rejects(begin('00000000-0000-4000-8000-000000000003'), /INTEGRATED_REVIEW_BUSY/)
    const url = 'https://official.example/biography'
    const proposal = { target_band_id: bandId, expected_updated_at: band.updated_at, artist_name: band.name,
      country: 'JP', artist_category: 'jpop', artist_aliases: [], review_status: 'approved', reason: '자동 검수 jpop-or-rock-v1: verified activity', evidence_url: url }
    const proof = { decision: 'keep', summary: 'Official artist identity and J-pop activity', sources: [{ url,
      checkedAt: new Date().toISOString(), summary: 'Official artist biography and release information.' }] }
    const keys = ['identityMatched','countryMatched','genreMatched','classificationMatched','externalIdentityLinked','publicationEffectUnderstood']
    const requirements = Object.fromEntries(keys.map(key => [key, true]))
    const evidence = Object.fromEntries(keys.map(key => [key, { summary: `Verified ${key}`, sourceUrls: [url] }]))
    const apply = (p = proposal, pr = proof, req = requirements, ev = evidence) => db.query(
      'select public.service_apply_integrated_review($1,$2,$3,$4,$5) as result', [runId, p, pr, req, ev])
    await assert.rejects(apply(proposal, proof, {}), /APPROVAL_REQUIREMENTS_REQUIRED/)
    await assert.rejects(apply(proposal, proof, requirements, {}), /APPROVAL_REQUIREMENTS_REQUIRED/)
    await assert.rejects(apply({ ...proposal, country: 'KR' }), /PROPOSAL_INVALID/)
    await assert.rejects(apply({ ...proposal, target_band_id: runId }), /TARGET_NOT_SELECTED/)
    await assert.rejects(apply(proposal, { ...proof, decision: 'exclude' }), /PROOF_REQUIRED/)
    await assert.rejects(apply(proposal, { ...proof, sources: [{ ...proof.sources[0], checkedAt: '2020-01-01' }] }), /SOURCE_INVALID/)
    await assert.rejects(apply({ ...proposal, artist_category: 'domestic_rock' }), /CLASSIFICATION_CONFLICT/)
    await db.query(`insert into auth.users values($1)`, ['00000000-0000-4000-8000-000000000098'])
    await db.query(`insert into private.artist_management_history(band_id,actor_id,before_record,after_record)
      values($1,'00000000-0000-4000-8000-000000000098','{"category":"unclassified"}','{"category":"jpop"}')`, [bandId])
    await assert.rejects(apply(), /MANUAL_DECISION/)
    await db.query(`delete from private.artist_management_history where actor_id='00000000-0000-4000-8000-000000000098'`)
    await db.query("update public.bands set curation_reason='Manual hold note' where id=$1", [bandId])
    const manual = await current()
    await assert.rejects(apply({ ...proposal, expected_updated_at: manual.updated_at }), /TARGET_NOT_SELECTED/)
    await assert.rejects(apply(), /EDIT_CONFLICT/)
    // Rewind fixture only, so the original registered snapshot can exercise the success path.
    await db.exec('alter table public.bands disable trigger artist_version')
    await db.query("update public.bands set curation_reason='',updated_at=$2 where id=$1", [bandId, band.updated_at])
    await db.exec('alter table public.bands enable trigger artist_version')
    const userId = '00000000-0000-4000-8000-000000000099'
    await db.query('insert into auth.users values ($1)', [userId])
    await db.query('insert into public.band_follows(user_id,band_id) values($1,$2)', [userId,bandId])
    const concertId = (await db.query("insert into public.concerts(title,format) values('Fixture','solo') returning id")).rows[0].id
    await db.query('insert into public.concert_bands(concert_id,band_id) values($1,$2)', [concertId,bandId])
    const result = (await apply()).rows[0].result
    assert.equal(result.after.curation_status, 'approved'); assert.equal(result.after.category, 'jpop')
    assert.deepEqual(result.relations, [1,1]); assert.equal(result.runId, runId)
    assert.deepEqual((await apply()).rows[0].result, result)
    await assert.rejects(apply({ ...proposal, reason: 'Different request' }), /CHECKPOINT_CONFLICT/)
    const receipt = (await db.query('select public.service_integrated_review_receipt($1,$2) as r', [runId,bandId])).rows[0].r
    assert.equal(receipt.before.curation_status, 'unreviewed'); assert.equal(receipt.after.id, bandId)
    const approval = (await db.query('select * from private.artist_publication_approvals')).rows[0]
    assert.equal(approval.approved_by, null); assert.equal(approval.integrated_run_id, runId)
    assert.equal((await db.query('select count(*)::int as n from private.integrated_review_receipts')).rows[0].n, 1)
    assert.equal((await db.query('select count(*)::int as n from public.band_follows')).rows[0].n, 1)
    assert.equal((await db.query('select count(*)::int as n from public.concert_bands')).rows[0].n, 1)
    await db.exec('set role service_role')
    await assert.rejects(db.query('select * from private.integrated_review_receipts'), /permission denied/)
    assert.ok((await db.query('select public.service_integrated_review_receipt($1,$2) as r', [runId,bandId])).rows[0].r)
    await db.exec('reset role')
    // Explicit human approval can replace an automated approval with its real actor.
    await db.query('insert into private.admins values($1)', [userId])
    await db.query("select set_config('test.uid',$1,false)", [userId])
    await db.query('select public.admin_approve_artist($1,$2)', [`mb:${mbid}`,url])
    const manualApproval = (await db.query('select * from private.artist_publication_approvals')).rows[0]
    assert.equal(manualApproval.approved_by,userId); assert.equal(manualApproval.integrated_run_id,null)
    await db.exec("select set_config('test.uid','',false)")
    const finish = id => db.query('select public.service_finish_integrated_review($1) as r', [id])
    const finished = (await finish(runId)).rows[0].r
    assert.deepEqual((await finish(runId)).rows[0].r, finished)
    // Existing receipts remain retrievable/idempotent after closure.
    assert.deepEqual((await apply()).rows[0].result, result)
    await assert.rejects(begin(), /RUN_FINISHED/)
    await db.exec('set role anon')
    await assert.rejects(finish(runId), /permission denied/)
    await db.exec('reset role; set role authenticated')
    await assert.rejects(finish(runId), /permission denied/)
    await db.exec('reset role')
    await assert.rejects(finish('00000000-0000-4000-8000-000000000077'), /RUN_NOT_FOUND/)

    const others = []
    for (const n of [4,5]) {
      const mid = `00000000-0000-4000-8000-00000000000${n}`
      const bid = (await db.query('select public.service_import_artist($1) as id', [{ key:`mb:${mid}`,name:`Other ${n}`,
        country:'JP',aliases:[],genre:'장르 미검수',evidence:`https://musicbrainz.org/artist/${mid}` }])).rows[0].id
      others.push((await db.query('select * from public.bands where id=$1',[bid])).rows[0])
    }
    const nextRun = '00000000-0000-4000-8000-000000000006'
    await begin(nextRun, others.map(b => ({bandId:b.id,expectedUpdatedAt:b.updated_at})))
    // Four hours is not a cadence barrier, but an unfinished lease still blocks.
    await db.exec("update private.integrated_review_runs set started_at=clock_timestamp()-interval '4 hours' where finished_at is null")
    await assert.rejects(begin('00000000-0000-4000-8000-000000000007', others.map(b => ({bandId:b.id,expectedUpdatedAt:b.updated_at}))), /INTEGRATED_REVIEW_BUSY/)
    for (const [index,b] of others.entries()) {
      const state = index ? 'excluded' : 'held', decision = index ? 'exclude' : 'hold'
      const p = { ...proposal,target_band_id:b.id,expected_updated_at:b.updated_at,artist_name:b.name,
        artist_category:b.category,review_status:state }
      const result = (await db.query('select public.service_apply_integrated_review($1,$2,$3,$4,$5) as r',
        [nextRun,p,{...proof,decision},{},{}])).rows[0].r
      assert.equal(result.after.curation_status,state); assert.equal(result.after.category,'unclassified')
    }
    await finish(nextRun)
    const currentOthers = (await db.query('select * from public.bands where id=any($1::uuid[])', [others.map(b=>b.id)])).rows
    const closedRun = '00000000-0000-4000-8000-000000000008'
    await begin(closedRun,currentOthers.map(b=>({bandId:b.id,expectedUpdatedAt:b.updated_at})))
    await finish(closedRun)
    const closedTarget = currentOthers[0]
    await assert.rejects(db.query('select public.service_apply_integrated_review($1,$2,$3,$4,$5)',
      [closedRun,{...proposal,target_band_id:closedTarget.id,expected_updated_at:closedTarget.updated_at},proof,requirements,evidence]), /RUN_FINISHED/)
    await assert.rejects(db.query('select public.service_integrated_review_context($1,$2)', [closedRun,closedTarget.id]), /TARGET_NOT_SELECTED/)
    // An abandoned lease only unblocks at the existing lease expiry, without rewriting history.
    const abandoned = '00000000-0000-4000-8000-000000000009'
    await begin(abandoned,currentOthers.map(b=>({bandId:b.id,expectedUpdatedAt:b.updated_at})))
    await db.query("update private.integrated_review_runs set started_at=clock_timestamp()-interval '6 hours' where id=$1",[abandoned])
    await begin('00000000-0000-4000-8000-000000000010',currentOthers.map(b=>({bandId:b.id,expectedUpdatedAt:b.updated_at})))
  } finally { await db.close() }
})
