import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { factRegressionReasons, assertCollectionFactsPreserved, quarantineCollectionFactRegressions } from '../scripts/collection-fact-guards.mjs'
import { runSource } from '../scripts/collection-runner.mjs'

const url = 'https://ticket.yes24.com/Perf/1'
const payload = () => ({ title: 'Fictional reviewed show', sessions: [{ starts_on: '2027-01-14', starts_at: '2027-01-14T19:00:00+09:00' }],
  announced_at: '2026-10-15T09:00:00Z', announced_on: '2026-10-15', announcement_verified: true,
  ticket: { opens_at: '2026-10-22T12:00:00+09:00' },
  sources: [{ url, verified_at: '2026-10-31T12:00:00Z' }],
  ticket_evidence: [{ method: 'api', sale_type: 'general', event_matched: true, source_url: url,
    opens_at: '2026-10-22T12:00:00+09:00', verified_at: '2026-10-31T12:00:00Z' }] })

test('raw rediscovery cannot erase reviewed sessions, announcement, sale or source verification', () => {
  const old = payload(), raw = { title: old.title, sessions: [], ticket: {}, sources: [{ url, verified_at: null }], ticket_evidence: [] }
  assert.deepEqual(factRegressionReasons(old, raw), ['SESSIONS_REMOVED_OR_CHANGED', 'ANNOUNCEMENT_REMOVED_OR_CHANGED',
    'SALE_REMOVED_OR_CHANGED', 'SALE_EVIDENCE_REMOVED_OR_CHANGED', 'SOURCE_VERIFICATION_REMOVED'])
  assert.deepEqual(factRegressionReasons(old, structuredClone(old)), [])
  assert.deepEqual(factRegressionReasons(old, { ...old, title: 'Changed event' }), ['EVENT_CHANGED_WITH_REVIEWED_FACTS'])
  const refreshed = structuredClone(old)
  refreshed.sessions[0].starts_at = '2027-01-14T10:00:00Z'
  refreshed.ticket_evidence[0].verified_at = '2026-10-31T13:00:00Z'
  refreshed.sources[0].verified_at = '2026-10-31T13:00:00Z'
  assert.deepEqual(factRegressionReasons(old, refreshed), [])
  refreshed.sessions[0].starts_at = '2027-01-14T11:00:00Z'
  assert.deepEqual(factRegressionReasons(old, refreshed), ['SESSIONS_REMOVED_OR_CHANGED'])
  assert.throws(() => factRegressionReasons(null, raw), /CONTEXT_UNAVAILABLE/)
  assert.throws(() => factRegressionReasons({ sources: 'unknown' }, raw), /CONTEXT_UNAVAILABLE/)
  assert.throws(() => factRegressionReasons(old, { sources: [null] }), /CONTEXT_UNAVAILABLE/)
  const dayOnly = { ...old, announced_at: null, announcement_precision: 'day' }
  assert.deepEqual(factRegressionReasons(dayOnly, structuredClone(dayOnly)), [])
  assert.deepEqual(factRegressionReasons(dayOnly, { ...dayOnly, announced_on: '2026-10-16' }), ['ANNOUNCEMENT_REMOVED_OR_CHANGED'])
})

test('a fact conflict found at the upload retry boundary stops without recollection or a second lease', async () => {
  const calls = []
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: 'fixture-run', error: null } } }
  let collected = 0
  await assert.rejects(runSource({ client, source: 'kopis', collect: async () => { collected++; return { candidates: [], failures: [] } },
    upload: async () => { throw Error('COLLECTION_FACT_REGRESSION') }, sleep: async () => { throw Error('must not retry') } }), /FACT_REGRESSION/)
  assert.equal(collected, 1)
  assert.deepEqual(calls.map(c => c.name), ['service_begin_collection', 'service_fail_collection'])
  assert.equal(calls[1].args.failure_code, 'COLLECTION_FACT_REGRESSION')
})

test('mixed batches preserve actual stored facts and revision while completing unrelated ingestion', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`)
    for (const file of ['202610060001_initial', '202610070001_admin_review', '202610080001_ingestion',
      '202610110001_catalog_expansion', '20261011150237_discovered_artist_catalog']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}.sql`, import.meta.url), 'utf8'))
    }
    await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`)
    const reviewed = { source_url: url, content_hash: 'a'.repeat(64), payload: { ...payload(), artist_keys: [] } }
    await db.query("select public.admin_ingest_catalog('yes24',$1,'[]')", [{ candidates: [reviewed], failures: [] }])
    const before = (await db.query('select payload,revision from public.collection_candidates')).rows
    const client = { from: () => ({ select: () => ({ in: async (_key, urls) => ({ data: (await db.query(
      'select source_url,payload from public.collection_candidates where source_url=any($1)', [urls])).rows }) }) }) }
    const raw = { source_url: url, content_hash: 'b'.repeat(64), payload: { artist_keys: [], sessions: [], ticket_evidence: [] } }
    const other = { source_url: 'https://ticket.yes24.com/Perf/2', content_hash: 'c'.repeat(64), payload: { artist_keys: [] } }
    const batch = { candidates: [raw, other], failures: [] }
    const input = structuredClone(raw)
    await quarantineCollectionFactRegressions(client, batch)
    assert.deepEqual(raw, input) // No old facts are copied onto the new event.
    assert.deepEqual(batch.candidates, [other])
    assert.equal(batch.failures[0].error, 'COLLECTION_FACT_REGRESSION')
    await assertCollectionFactsPreserved(client, batch)
    await db.query("select public.admin_ingest_catalog('yes24',$1,'[]')", [batch])
    assert.deepEqual((await db.query('select payload,revision from public.collection_candidates where source_url=$1', [url])).rows, before)
    assert.equal((await db.query('select count(*)::int n from public.collection_candidates')).rows[0].n, 2)
    await quarantineCollectionFactRegressions(client, batch)
    assert.equal(batch.failures.length, 1)
    const failed = { from: () => ({ select: () => ({ in: async () => ({ error: {} }) }) }) }
    await assert.rejects(quarantineCollectionFactRegressions(failed, batch), /CONTEXT_UNAVAILABLE/)
  } finally { await db.close() }
})
