import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createArtistSearchHandler } from '../supabase/functions/_shared/artist-search.mjs'
const id = '00000000-0000-4000-8000-000000000001'
const artist = { id, name: 'New Band', country: 'JP', aliases: [{ name: '새 밴드' }] }
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
