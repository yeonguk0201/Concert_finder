import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { leaseRemaining, watchReviewLease } from '../scripts/lib/review-lease.mjs'
import { runReviewCommand } from '../scripts/artist-review-runner.mjs'
import { prepareHostCandidates } from '../scripts/prepare-review-hosts.mjs'

test('watchdog closes at minute 39 using server budget and monotonic time despite wall clock jumps', async () => {
  const start = Date.parse('2026-10-16T00:00:00Z'), runId = randomUUID()
  const state = { runId, receivedAt: start + 10 * 3600000, response: { serverNow: new Date(start).toISOString(), leaseUntil: new Date(start + 45 * 60000).toISOString() } }
  assert.equal(leaseRemaining(state, state.receivedAt), 45 * 60000)
  let mono = 0, closedAt, marker, wall = state.receivedAt, jumps = 0
  await watchReviewLease({ runId, readState: async () => state,
    wallNow: () => wall, monotonic: () => mono, wait: async ms => { mono += ms; wall += ++jumps % 2 ? 86400000 : -172800000 },
    close: async id => { assert.equal(id, runId); closedAt = mono; return { state: 'finished' } },
    writeMarker: async m => { marker = m },
  })
  assert.equal(closedAt, 39 * 60000); assert.equal(marker.stop, true)
})

test('watchdog stops when a run finishes and retries bounded close failures', async () => {
  const runId = randomUUID(), start = Date.now()
  const state = { runId, receivedAt: start, response: { serverNow: new Date(start).toISOString(), leaseUntil: new Date(start + 7 * 60000).toISOString() } }
  let mono = 0, attempts = 0, marker
  await watchReviewLease({ runId, readState: async () => state, wallNow: () => start, monotonic: () => mono,
    wait: async ms => { mono += ms }, close: async () => { if (++attempts < 3) throw new Error('transient'); return { state: 'finished' } },
    writeMarker: async m => { marker = m },
  })
  assert.equal(attempts, 3); assert.equal(marker.result.state, 'finished')
  state.finished = true
  await watchReviewLease({ runId, readState: async () => state, close: () => { throw new Error('must not close twice') } })
})

test('near-deadline CLI preserves the draft and closes instead of attempting another checkpoint', async () => {
  await mkdir('.local/artist-review', { recursive: true })
  const dir = await mkdtemp('.local/artist-review/deadline-'), runId = randomUUID(), start = Date.now()
  try {
    const statePath = `${dir}/state.json`, draft = `${dir}/draft.json`
    await writeFile(draft, '{"unfinished":"research kept locally"}', 'utf8')
    await writeFile(statePath, JSON.stringify({ runId, receivedAt: start, response: {
      serverNow: new Date(start).toISOString(), leaseUntil: new Date(start + 5 * 60000).toISOString(),
    } }), 'utf8')
    const output = []
    const closed = await runReviewCommand(['checkpoint', `--state=${statePath}`, `--input=${draft}`], {
      env: { ARTIST_REVIEW_ENDPOINT: 'https://czjrzylvnewfjnfwjhwf.supabase.co/functions/v1/artist-review-runner', ARTIST_REVIEW_RUNNER_SECRET: 'test-secret' },
      output: x => output.push(JSON.parse(x)), fetcher: async (_url, options) => {
        assert.deepEqual(JSON.parse(options.body), { action: 'close', runId }); return Response.json({ state: 'finished', notify: false })
      },
    })
    assert.equal(closed.stop, true)
    assert.equal(output[0].stop, true)
    assert.equal(await readFile(draft, 'utf8'), '{"unfinished":"research kept locally"}')
    assert.equal(JSON.parse(await readFile(statePath, 'utf8')).finished, true)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('500 existing artists: sequential gated discovery, per-artist checkpoints and resumable candidates, never auto-allow hosts', async () => {
  const rows = Array.from({ length: 500 }, (_, n) => ({ id: randomUUID(), musicbrainz_id: randomUUID(), name: `Artist ${n}` }))
  let calls = 0, waits = 0, checkpoints = 0
  const prepared = await prepareHostCandidates(rows, { fetchMusicBrainz: true,
    wait: async ms => { assert.equal(ms, 1100); waits++ }, onCheckpoint: async () => { checkpoints++ },
    fetcher: async url => { calls++; return Response.json({ id: /artist\/([^?]+)/.exec(url)[1], name: 'Artist',
      relations: [{ type: 'official homepage', url: { resource: 'https://official.example.com/artist' } },
        { type: 'youtube', url: { resource: 'https://www.youtube.com/channel/candidate' } }] }) },
  })
  assert.equal(calls, 500); assert.equal(waits, 499); assert.equal(checkpoints, 500)
  assert.equal(prepared.artists.length, 500)
  assert.ok(prepared.artists.every(r => r.status === 'needs_host_review' && r.candidates.every(h => h.verified === false)))
  const resumed = await prepareHostCandidates(rows, { previous: prepared, fetchMusicBrainz: true,
    fetcher: () => { throw new Error('cached discovery must not refetch') } })
  assert.equal(resumed.apiCalls, 0)
})

test('host discovery failure cooldown and unsafe hosts do not become allowlist entries', async () => {
  const row = { id: randomUUID(), musicbrainz_id: randomUUID() }, now = Date.now()
  const failed = await prepareHostCandidates([row], { now, fetchMusicBrainz: true, fetcher: async () => { throw new Error('provider failure') } })
  const resumed = await prepareHostCandidates([row], { now: now + 1000, previous: failed, fetchMusicBrainz: true })
  assert.equal(resumed.apiCalls, 0); assert.equal(resumed.artists[0].status, 'failed')
  const unsafe = await prepareHostCandidates([{ ...row, official_urls: ['https://127.0.0.1/', 'https://metadata.internal/', 'https://user:pass@example.com/'] }])
  assert.deepEqual(unsafe.artists[0].candidates, [])
  const canonical = await prepareHostCandidates([{ ...row, official_urls: ['https://official.example.com/artist?api_key=do-not-persist#fragment'] }])
  assert.equal(canonical.artists[0].candidates[0].sourceUrl, 'https://official.example.com/artist')
  assert.ok(!JSON.stringify(canonical).includes('do-not-persist'))
  const many = Array.from({ length: 501 }, () => ({ id: randomUUID(), musicbrainz_id: randomUUID() }))
  let calls = 0
  const stopped = await prepareHostCandidates(many, { fetchMusicBrainz: true, wait: async () => {}, fetcher: async () => {
    calls++; return new Response('provider unavailable', { status: 503 })
  } })
  assert.equal(calls, 3); assert.equal(stopped.skippedOverLimit, 1)
  assert.equal(stopped.artists.filter(r => r.status === 'deferred').length, 497)
})
