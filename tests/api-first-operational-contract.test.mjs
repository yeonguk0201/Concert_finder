import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { parseKopisApiFacts } from '../scripts/kopis-api-facts.mjs'

test('release pins reproduce the observed canonical KOPIS ingestion baseline without changing operational functions', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`)
    // Production's observed admin_ingest_catalog matches the canonical KOPIS
    // migration, not the optional Reissue wrapper used by the broader fixture.
    // Do not reapply or remove any operational migration to force a digest.
    for (const name of ['202610060001_initial', '202610070001_admin_review', '202610080001_ingestion',
      '202610090001_notifications', '202610110001_catalog_expansion', '20261011150237_discovered_artist_catalog',
      '20261012134538_automated_catalog', '20261012135134_artist_management', '20261013070742_artist_curation',
      '20261014125200_kopis_discovery', '20261031132828_harden_publication_executor',
      '20261106095303_allow_date_only_silent_publication', '20261106101911_reviewed_candidate_release',
      '20261106172058_continuous_reviewed_publication']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'))
    }
    const digest = (await db.query("select md5(pg_get_functiondef('public.admin_ingest_catalog(text,jsonb,jsonb)'::regprocedure)) d")).rows[0].d
    assert.equal(digest, '7eb3bb5ec9c207e2ca97a26795f31500')
    await db.exec(await readFile(new URL('../supabase/migrations/20261109084718_api_first_silent_publication.sql', import.meta.url), 'utf8'))
    await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`)
    const config = JSON.parse(await readFile(new URL('../docs/release/kopis-api-runtime.json', import.meta.url), 'utf8'))
    const cap = (await db.query('select public.service_publication_capabilities() c')).rows[0].c
    assert.equal(cap.executor_md5, config.executor_md5); assert.equal(cap.api_facts_md5, config.api_facts_md5)
    const user = '00000000-0000-4000-8000-000000000099', key = 'mb:00000000-0000-4000-8000-000000000001'
    await db.query('insert into auth.users values ($1)', [user])
    const band = (await db.query('select public.service_import_artist($1) id', [{ key, name: 'Fictional release band',
      country: 'KR', aliases: [], genre: 'rock', evidence: 'https://musicbrainz.org/artist/' + key.slice(3) }])).rows[0].id
    await db.query("update public.bands set curation_status='approved' where id=$1", [band])
    await db.query("insert into private.artist_publication_approvals(identity_key,evidence_url,approved_by) values ($1,'https://official.example/bio',$2)", [key, user])
    const checked = new Date().toISOString(), day = new Date(Date.now() + 100 * 86400000).toISOString().slice(0, 10)
    const sourceUse = { source: 'kopis', facts_only: true, basis_url: 'https://www.kopis.or.kr/fictional-terms', verified_at: checked }
    await db.query("update public.collection_policies set publication_enabled=true,api_facts_source_use=$1 where source='kopis'", [sourceUse])
    const context = (await db.query('select public.service_kopis_api_context() c')).rows[0].c
    const xml = `<dbs><db><mt20id>PF123456</mt20id><prfnm>Fictional release concert</prfnm><prfpdfrom>${day}</prfpdfrom><prfpdto>${day}</prfpdto><genrenm>대중음악</genrenm><area>서울</area><fcltynm>가상 공연장</fcltynm><prfcast>Fictional release band</prfcast><prfstate>공연예정</prfstate><dtguidance>${day}(19:00)</dtguidance></db></dbs>`
    const row = parseKopisApiFacts(xml, 'PF123456', { ...context, sourceUse, observedAt: checked })
    assert.equal(row.proposed_contract_ready, true)
    const token = (await db.query("select public.service_begin_collection('kopis',clock_timestamp()) id")).rows[0].id
    const result = (await db.query("select public.service_complete_collection($1,$2,'[]',1,'catalog-v1') r", [token,
      { candidates: [row], failures: [], excluded: [], publication_contract: 'kopis-api-facts-v1',
        expected_executor_md5: config.executor_md5, expected_api_facts_md5: config.api_facts_md5 }])).rows[0].r
    assert.deepEqual(result, { published: 1, review: 0 })
    const facts = (await db.query('select announced_on,announced_at,announcement_verified,publication_basis from public.concerts')).rows[0]
    assert.deepEqual(facts, { announced_on: null, announced_at: null, announcement_verified: false, publication_basis: 'kopis-api-v1' })
    assert.equal((await db.query('select initial_import from private.publication_changes')).rows[0].initial_import, true)
    for (const table of ['notification_deliveries', 'notification_attempts']) {
      assert.equal((await db.query(`select count(*)::int n from private.${table}`)).rows[0].n, 0)
    }
  } finally { await db.close() }
})
