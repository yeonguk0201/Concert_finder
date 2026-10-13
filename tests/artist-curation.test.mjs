import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('curation preserves relationships, fences old edits and blocks public imports, approval bypasses and recollection', async () => {
  const db = new PGlite()
  try {
    const admin = '00000000-0000-4000-8000-000000000099'
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;`)
    for (const name of ['202610060001_initial','202610070001_admin_review','202610080001_ingestion','202610090001_notifications','202610110001_catalog_expansion','20261011150237_discovered_artist_catalog','20261012134538_automated_catalog','20261012135134_artist_management','20261013070742_artist_curation']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url),'utf8'))
    }
    await db.query('insert into auth.users values ($1)',[admin])
    await db.query('insert into private.admins values ($1)',[admin])
    await db.query("select set_config('test.uid',$1,false)",[admin])
    await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`)
    const identity = {key:'mb:00000000-0000-4000-8000-000000000001',name:'Verified Band',country:'JP',aliases:['검증 밴드'],genre:'장르 미검수',evidence:'https://musicbrainz.org/artist/00000000-0000-4000-8000-000000000001'}
    const bandId = (await db.query('select public.service_import_artist($1) as id',[identity])).rows[0].id
    await db.query('insert into public.band_follows(user_id,band_id) values ($1,$2)',[admin,bandId])
    const current = async () => (await db.query('select * from public.bands where id=$1',[bandId])).rows[0]
    const curate = async (status, options = {}) => {
      const band = await current()
      return db.query('select public.admin_curate_artist($1,$2,$3,$4,$5,$6,$7,$8,$9)',[
        bandId, options.version ?? band.updated_at, options.name ?? band.name, options.country ?? band.country_code,
        options.category ?? 'jpop', options.aliases ?? ['검증 밴드','Verified Alias'],status,
        options.reason ?? 'Official target verification', options.evidence ?? 'https://official.example/biography',
      ])
    }
    const original = await current()
    await assert.rejects(curate('approved',{category:'unclassified'}),/APPROVAL_EVIDENCE_REQUIRED/)
    await assert.rejects(curate('approved',{evidence:''}),/APPROVAL_EVIDENCE_REQUIRED/)
    await assert.rejects(curate('held',{reason:''}),/INVALID_ARTIST/)
    await assert.rejects(curate('held',{country:'Japan'}),/INVALID_ARTIST/)
    await assert.rejects(curate('held',{evidence:'javascript:alert(1)'}),/INVALID_EVIDENCE/)
    await assert.rejects(curate('unknown'),/INVALID_ARTIST/)
    await curate('approved',{name:'Verified Band Renamed',country:'GB',category:'overseas_rock'})
    await assert.rejects(curate('excluded',{version:original.updated_at}),/EDIT_CONFLICT/)
    assert.equal((await current()).country_code,'GB')
    assert.equal((await db.query('select count(*)::int as n from private.artist_publication_approvals')).rows[0].n,1)
    await db.query("select public.admin_collection_policy('yes24',true,true,false)")
    const today = (await db.query("select (now() at time zone 'Asia/Seoul')::date::text as day")).rows[0].day
    const row = {source_url:'https://ticket.yes24.com/Perf/123',content_hash:'a'.repeat(64),payload:{title:'Verified Seoul',format:'solo',country_code:'KR',starts_on:'2028-12-01',ends_on:'2028-12-01',announced_on:today,announcement_verified:true,artist_keys:[identity.key],review_reasons:[],sources:[{url:'https://ticket.yes24.com/Perf/123',verified_at:new Date().toISOString()}],sessions:[],ticket:{}}}
    const collect = async item => {
      const token = (await db.query("select public.service_begin_collection('yes24',now()) as id")).rows[0].id
      return (await db.query("select public.service_complete_collection($1,$2,$3,1,'catalog-v1') as result",[token,{candidates:[item],failures:[],excluded:[]},[identity]])).rows[0].result
    }
    assert.equal((await collect(row)).published,1)
    const relation = (await db.query('select * from public.concert_bands')).rows
    await curate('held')
    assert.equal((await db.query('select count(*)::int as n from private.artist_publication_approvals')).rows[0].n,0)
    await assert.rejects(db.query('select public.admin_approve_band($1,$2)',[bandId,'https://official.example/bio']),/ARTIST_NOT_AVAILABLE/)
    await assert.rejects(db.query('select public.admin_approve_artist($1,$2)',[identity.key,'https://official.example/bio']),/ARTIST_NOT_AVAILABLE/)
    await assert.rejects(db.query('select public.service_import_artist($1)',[identity]),/ARTIST_NOT_AVAILABLE/)
    await curate('excluded')
    const fresh = structuredClone(row)
    fresh.payload.starts_on='2029-12-01'; fresh.payload.ends_on='2029-12-01'
    fresh.source_url='https://ticket.yes24.com/Perf/456'; fresh.payload.title='Another Seoul'; fresh.payload.sources=[{url:fresh.source_url,verified_at:new Date().toISOString()}]
    assert.equal((await collect(fresh)).published,0)
    assert.equal((await db.query('select reason from public.collection_decisions order by decided_at desc limit 1')).rows[0].reason,'ARTIST_CURATION_BLOCKED')
    assert.equal((await current()).curation_status,'excluded')
    assert.equal((await db.query('select count(*)::int as n from public.bands')).rows[0].n,1)
    assert.deepEqual((await db.query('select * from public.concert_bands')).rows,relation)
    assert.equal((await db.query('select count(*)::int as n from public.band_follows')).rows[0].n,1)
    // RLS and grants are checked with actual roles, not only privileged test queries.
    await db.exec("select set_config('test.uid','',false); set role anon")
    assert.equal((await db.query('select * from public.bands')).rows.length,0)
    await assert.rejects(db.query("select public.admin_curate_artist($1,now(),'X','JP','jpop','{}','approved','bypass','https://official.example')",[bandId]),/permission denied|ADMIN_REQUIRED/)
    await db.exec('reset role; set role authenticated')
    assert.equal((await db.query('select * from public.bands')).rows.length,0)
    await assert.rejects(db.query("update public.bands set curation_status='approved' where id=$1",[bandId]),/permission denied/)
    await assert.rejects(db.query("select public.admin_curate_artist($1,now(),'X','JP','jpop','{}','approved','bypass','https://official.example')",[bandId]),/ADMIN_REQUIRED/)
    await assert.rejects(db.query('select public.admin_artist_history($1)',[bandId]),/ADMIN_REQUIRED/)
    await db.exec('reset role')
    await db.query("select set_config('test.uid',$1,false)",[admin])
    await curate('unreviewed')
    assert.equal((await db.query('select count(*)::int as n from private.artist_publication_approvals')).rows[0].n,0)
    assert.equal((await collect(fresh)).published,0)
    await curate('approved')
    assert.equal((await collect(fresh)).published,1)
    assert.equal((await db.query('select public.service_import_artist($1) as id',[identity])).rows[0].id,bandId)
    const history = (await db.query('select public.admin_artist_history($1) as rows',[bandId])).rows[0].rows
    assert.equal(history.filter(h=>h.after_record.curation_status==='excluded').length,1)
    assert.ok(history.some(h=>h.before_record.curation_status==='excluded' && h.after_record.curation_status==='unreviewed'))
    assert.ok(history.every(h=>h.actor_id===admin))
    assert.equal(history.filter(h=>h.after_record.name==='Verified Band Renamed' && h.before_record.name==='Verified Band').length,1)
    assert.equal((await db.query('select count(*)::int as n from private.publication_changes')).rows[0].n,2)
  } finally { await db.close() }
})
