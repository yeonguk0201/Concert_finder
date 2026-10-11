import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createArtistSearchHandler } from '../supabase/functions/_shared/artist-search.mjs'
import { relevantArtists, artistQuery } from '../supabase/functions/_shared/musicbrainz-data.mjs'
const id = '00000000-0000-4000-8000-000000000001'
const artist = { id, name: 'New Band', country: 'JP', type: 'Group', aliases: [{ name: '새 밴드' }] }
const request = (body, token = 'admin') => new Request('https://example.test/search', { method:'POST', headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(body) })
test('public search never registers an artist and import authorizes before any provider call', async () => {
  const calls = [], imported = []
  const handler = createArtistSearchHandler({ authenticateUser:async token=>token==='admin', cache:async action=>action==='reserve',importArtist:async a=>imported.push(a),fetcher:async url=>{calls.push(url);return new Response(JSON.stringify({artists:[artist]}))} })
  assert.equal((await handler(request({action:'import',id},'ordinary'))).status,401)
  assert.equal(calls.length,0)
  const result = await handler(new Request('https://example.test/search', {method:'POST',body:JSON.stringify({action:'search',query:'New Band'})}))
  assert.equal(result.status,200)
  assert.equal((await result.json()).artists[0].key,`mb:${id}`)
  assert.equal(imported.length,0)
  assert.equal((await handler(request({action:'import',id:'https://127.0.0.1'}))).status,400)
  assert.equal((await handler(request(null))).status,400)
})
test('import refetches identity by fixed provider ID and refuses missing country or conflicting identities', async () => {
  let provider={...artist}, imported=[]
  const handler=createArtistSearchHandler({authenticateUser:async()=>true,cache:async action=>action==='reserve',importArtist:async a=>{imported.push(a);return 'band-id'},loadBand:async id=>({id,name:'New Band',country_code:'JP',aliases:[]}),fetcher:async url=>{assert.ok(url.startsWith(`https://musicbrainz.org/ws/2/artist/${id}?`));return new Response(JSON.stringify(provider))} })
  assert.equal((await handler(request({action:'import',id}))).status,200)
  assert.equal(imported[0].evidence,`https://musicbrainz.org/artist/${id}`)
  provider={...artist,country:undefined}
  assert.equal((await handler(request({action:'import',id}))).status,422)
  assert.equal(imported.length,1)
})
test('cache hits do not call provider; rate limiting and provider failure remain explicit', async () => {
  let network=0
  const handler=createArtistSearchHandler({authenticateUser:async()=>true,cache:async()=>[],importArtist:async()=>{},fetcher:async()=>{network++;throw new Error('must not fetch')} })
  assert.equal((await handler(request({action:'search',query:'New'}))).status,200)
  assert.equal(network,0)
  const busy=createArtistSearchHandler({authenticateUser:async()=>true,cache:async()=>false,importArtist:async()=>{},fetcher:async()=>{network++} })
  assert.equal((await busy(request({action:'search',query:'New'}))).status,429)
  const failing=createArtistSearchHandler({authenticateUser:async()=>true,cache:async action=>action==='reserve',importArtist:async()=>{},fetcher:async()=>new Response('',{status:503}) })
  assert.equal((await failing(request({action:'search',query:'New'}))).status,503)
})

test('short names exclude unknown countries, nonperformer types and unrelated names while preserving namesakes', () => {
  const row = { key: `mb:${id}`, name: 'Ado', country: 'JP', type: 'Person', aliases: [], score: 100 }
  const candidates = [
    { ...row, key: 'unknown', country: null }, { ...row, key: 'ai', type: 'Other' },
    { ...row, key: 'cn', country: 'CN', score: 100 },
    { ...row, key: 'unknown-type', type: '' }, { ...row, key: 'longer', name: 'Ado Barker' },
    { ...row, key: 'prefix', name: 'Adonis' }, { ...row, key: 'namesake', country: 'GB', score: 80 },
    { ...row, key: 'alias', name: '別名', aliases: ['Ａｄｏ'], score: 99 }, row,
  ]
  assert.deepEqual(relevantArtists(candidates, 'ado').map(a => a.key), [row.key, 'namesake', 'alias'])
  assert.deepEqual(relevantArtists(candidates, '***'), [])
})

test('long queries match whole phrases and aliases, prioritize exact names and cap visible results', () => {
  const row = { name: 'GREEN APPLE', country: 'JP', type: 'Group', aliases: [], score: 50 }
  assert.deepEqual(relevantArtists([
    { ...row, key: 'phrase', name: 'Mrs. GREEN APPLE', score: 100 },
    { ...row, key: 'exact' }, { ...row, key: 'unrelated', name: 'Green Applesauce' },
    { ...row, key: 'alias', name: 'Mrs. GREEN APPLE', aliases: ['グリーンアップル'] },
  ], 'green apple').map(a => a.key), ['exact', 'phrase', 'alias'])
  assert.equal(relevantArtists(Array.from({ length: 30 }, (_, i) => ({ ...row, key: String(i) })), 'green apple').length, 10)
  const query = new URL(artistQuery('Ado')).searchParams.get('query')
  assert.ok(query.includes('artist:"Ado" OR alias:"Ado"'))
  assert.ok(query.includes('country:*'))
  assert.ok(query.includes('-country:CN'))
})

test('server cache hits also pass relevance filtering and use a new query namespace', async () => {
  const row = { key: `mb:${id}`, name: 'Ado', country: 'JP', type: 'Person', aliases: [], score: 100 }
  let fetched = false
  const handler = createArtistSearchHandler({ authenticateUser: async () => false,
    cache: async (action, term) => { assert.equal(action, 'get'); assert.equal(term, 'query:v3:ado'); return [row, { ...row, country: null }, { ...row, country: 'CN' }, { ...row, name: 'Ado Barker' }] },
    fetcher: async () => { fetched = true }, importArtist: async () => {} })
  const response = await handler(request({ action: 'search', query: 'ado' }))
  assert.deepEqual((await response.json()).artists, [row])
  assert.equal(fetched, false)
})
