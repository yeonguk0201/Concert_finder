import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { createArtistPhotoHandler, commonsPhoto } from '../supabase/functions/_shared/artist-photo.mjs'
const id = '00000000-0000-4000-8000-000000000001'
const info = { mime: 'image/jpeg', thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Artist.jpg/320px-Artist.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Artist.jpg', extmetadata: { Artist: { value: '<a href="https://example.test">Photo &amp; Author</a>' }, Credit: { value: 'Own work' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' } } }
const request = body => new Request('https://example.test/photo', { method: 'POST', body: JSON.stringify(body) })
const claim = value => ({ rank: 'normal', mainsnak: { snaktype: 'value', datavalue: { value } } })
function setup({ entity, artist, commons, cached, fail = false, reserve = true } = {}) {
  const calls = [], stored = []
  const handler = createArtistPhotoHandler({ resolveBand: async () => id,
    cache: async (action, key, value) => { if (action === 'get') return cached; if (action === 'reserve') return reserve; stored.push({ key, value }) },
    fetcher: async (url, options) => {
      calls.push(url); assert.equal(options.redirect, 'error')
      if (fail) return new Response('', { status: 503 })
      const data = url.startsWith('https://musicbrainz.org/') ? artist ?? { id, relations: [{ type: 'wikidata', url: { resource: 'https://www.wikidata.org/wiki/Q123' } }] }
        : url.startsWith('https://www.wikidata.org/') ? { entities: { Q123: entity ?? { claims: { P18: [claim('Artist.jpg')], P434: [claim(id)] } } } }
          : commons ?? { query: { pages: { 1: { imageinfo: [info] } } } }
      return new Response(JSON.stringify(data))
    } })
  return { handler, calls, stored }
}

test('photo follows fixed identity links and stores complete plain-text attribution', async () => {
  const { handler, calls, stored } = setup()
  const response = await handler(request({ band_id: id }))
  assert.equal(response.status, 200)
  const { photo } = await response.json()
  assert.equal(photo.identity, `mb:${id}`); assert.equal(photo.author, 'Photo & Author')
  assert.equal(photo.licenseUrl, info.extmetadata.LicenseUrl.value)
  assert.equal(calls.length, 3); assert.equal(stored[0].value[0].url, info.thumburl)
  assert.ok(new URL(calls[2]).searchParams.get('titles') === 'File:Artist.jpg')
})

test('unknown/unsafe licenses, missing credits, arbitrary hosts and SVGs never become photos', () => {
  assert.ok(commonsPhoto({ ...info, thumburl: info.thumburl.replace('upload.', 'thumb.'), extmetadata: { ...info.extmetadata, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' } } }, id, 'Q123'))
  for (const invalid of [
    { ...info, mime: 'image/svg+xml' }, { ...info, thumburl: 'https://upload.wikimedia.org.evil.test/x' },
    { ...info, descriptionurl: 'https://evil.test/File:x' },
    { ...info, extmetadata: { ...info.extmetadata, Artist: { value: '' } } },
    { ...info, extmetadata: { ...info.extmetadata, LicenseUrl: { value: 'https://evil.test/license' } } },
    { ...info, extmetadata: { ...info.extmetadata, Restrictions: { value: 'non-free' } } },
  ]) assert.equal(commonsPhoto(invalid, id, 'Q123'), null)
})

test('missing photos are cached, conflicting Wikidata IDs do not fetch unrelated images', async () => {
  for (const options of [
    { artist: { id, relations: [{ type: 'wikidata', url: { resource: 'https://evil.test/wiki/Q123' } }] } },
    { entity: { claims: { P18: [claim('Artist.jpg')], P434: [claim('another-id')] } } },
    { entity: { claims: { P18: [{ ...claim('Artist.jpg'), rank: 'deprecated' }] } } },
  ]) {
    const { handler, calls, stored } = setup(options)
    assert.equal((await (await handler(request({ id }))).json()).photo, null)
    assert.ok(calls.length < 3); assert.deepEqual(stored[0].value, [])
  }
})

test('cache and rate gate protect provider; failures are retryable and request URLs are never trusted', async () => {
  const cached = setup({ cached: [] })
  assert.equal((await cached.handler(request({ id }))).status, 200); assert.equal(cached.calls.length, 0)
  const busy = setup({ reserve: false })
  assert.equal((await busy.handler(request({ id }))).status, 429); assert.equal(busy.calls.length, 0)
  const failed = setup({ fail: true })
  assert.equal((await failed.handler(request({ id }))).status, 503); assert.equal(failed.stored.length, 0)
  for (const body of [null, { id: 'https://127.0.0.1' }, { id: [id] }, { id, band_id: id }, {}]) assert.equal((await cached.handler(request(body))).status, 400)
})

test('photo identity RPC resolves only registered MBIDs and is inaccessible to public clients', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`)
    for (const file of ['202610060001_initial.sql', '202610070001_admin_review.sql', '202610080001_ingestion.sql', '202610110001_catalog_expansion.sql', '20261011150237_discovered_artist_catalog.sql', '20261011163010_artist_photo_identity.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    await assert.rejects(db.query('select public.service_artist_photo_identity($1)', [id]), /SERVICE_REQUIRED/)
    await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)")
    const identity = { key: `mb:${id}`, name: 'Test Artist', country: 'JP', genre: '장르 미검수', aliases: [], evidence: `https://musicbrainz.org/artist/${id}` }
    const band = (await db.query('select public.service_import_artist($1) as id', [identity])).rows[0].id
    assert.equal((await db.query('select public.service_artist_photo_identity($1) as id', [band])).rows[0].id, id)
    assert.equal((await db.query('select public.service_artist_photo_identity($1) as id', [id])).rows[0].id, null)
    const photo = commonsPhoto(info, id, 'Q123')
    await db.query("select public.service_artist_search_cache('store',$1,$2)", [`photo:v1:${id}`, [photo]])
    const stored = (await db.query("select public.service_artist_search_cache('get',$1) as result", [`photo:v1:${id}`])).rows[0].result[0]
    assert.equal(stored.author, photo.author)
    assert.equal(stored.licenseUrl, photo.licenseUrl)
    assert.equal(stored.identity, `mb:${id}`)
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(db.query('select public.service_artist_photo_identity($1)', [band]), /permission denied/)
      await db.exec('reset role')
    }
  } finally { await db.close() }
})
