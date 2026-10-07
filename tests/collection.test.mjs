import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collect, concertLinks, parseConcert } from '../scripts/ualive.mjs'
const page = `<h1>Band &amp; Friends</h1><a href="https://naver.me/venue">공연장</a><section><h2>공연 시간</h2><p>2026. 11. 07.(토) 19:00 ~ 20:30</p></section><a href="https://m.ticketlink.co.kr/product/57330">예매</a>`
test('collector normalizes only known metadata, deduplicates links, and rejects layout drift', () => {
  const row = parseConcert(page, 'https://ualive.com/concerts/397')
  assert.equal(row.payload.title, 'Band & Friends')
  assert.equal(row.payload.sessions[0].starts_at, '2026-11-07T19:00:00+09:00')
  assert.equal(row.payload.announced_on, null)
  assert.equal(row.payload.sources[0].verified_at, null)
  assert.equal(row.content_hash, parseConcert(page, row.source_url).content_hash)
  assert.notEqual(row.content_hash, parseConcert(page.replace('19:00', '18:00'), row.source_url).content_hash)
  assert.deepEqual(concertLinks('<a href="/concerts/397">a</a><a href="/concerts/397">b</a><a href="https://evil.test/concerts/1">bad</a>'), [row.source_url])
  assert.throws(() => parseConcert('<h1>Changed layout</h1>', row.source_url), /layout changed/)
})
test('collection records partial failures and refuses robots exclusion', async () => {
  const fetcher = async url => new Response(url.endsWith('robots.txt') ? 'User-agent: *\nAllow: /' : url.endsWith('/concerts') ? '<a href="/concerts/397">a</a><a href="/concerts/398">b</a>' : url.endsWith('397') ? page : 'broken')
  const result = await collect(fetcher, async () => {})
  assert.equal(result.candidates.length, 1)
  assert.equal(result.failures.length, 1)
  await assert.rejects(collect(async () => new Response('User-agent: *\nDisallow: /concerts'), async () => {}), /disallowed/)
})
