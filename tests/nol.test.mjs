import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bookingWindows, parseNolProduct, collectNolProducts } from '../scripts/nol.mjs'
const url = 'https://nol.yanolja.com/ticket/products/26015024'
test('explicit general sale is separate from presale and a performance range never creates daily sessions', () => {
  const row = parseNolProduct('<h1>요네즈 켄시 내한공연</h1><div>2027.01.14 ~ 2027.01.17</div><p>일반 예매: 2026년 10월 22일 (목) 오후 12시 ~</p><p>선예매: 2026년 10월 20일 (화) 오후 12시</p>', url)
  assert.equal(row.payload.ticket.opens_at, '2026-10-22T12:00:00+09:00')
  assert.deepEqual(row.payload.booking_windows.map(w => w.kind), ['general', 'presale'])
  assert.deepEqual(row.payload.sessions, []); assert.deepEqual(row.payload.artist_keys, [])
  assert.equal(row.payload.announcement_verified, false); assert.equal(row.payload.city, null)
  assert.equal(row.payload.sources[0].verified_at, null)
})
test('relative today, presale-only and conflicting general dates cannot produce a general ticket time', () => {
  const base = '<h1>Concert</h1><div>2027.01.14 ~ 2027.01.17</div>'
  assert.equal(parseNolProduct(base + '<p>일반 예매: 오늘 12:00</p>', url).payload.ticket.opens_at, null)
  assert.equal(parseNolProduct(base + '<p>선예매: 2026년 10월 20일 12시</p>', url).payload.ticket.opens_at, null)
  const r = bookingWindows(['일반 예매: 2026년 10월 20일 12시', '일반 예매: 2026년 10월 22일 12시'], url)
  assert.equal(r.conflict, true)
  assert.throws(() => parseNolProduct(base.replace('01.14', '02.30'), url), /DATE_INVALID/)
})
test('unapproved URL, robots denial and hidden script data fail closed without writes', async () => {
  assert.throws(() => parseNolProduct('<h1>x</h1>', url + '?token=hidden'), /URL_INVALID/)
  await assert.rejects(collectNolProducts([url], { sleep: async () => {}, fetcher: async () => new Response('User-agent: *\nDisallow: /ticket') }), /disallowed/)
  assert.throws(() => parseNolProduct('<h1>x</h1><script>2027.01.14 ~ 2027.01.17</script>', url), /RANGE_AMBIGUOUS/)
})
