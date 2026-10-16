import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from 'node:fs/promises'
import { createArtistReviewHandler, verifyReviewSources } from '../supabase/functions/_shared/artist-review-runner.mjs'
import { runReviewCommand } from '../scripts/artist-review-runner.mjs'

const secret = 'test-only-scoped-secret-'.repeat(3)
const runId = randomUUID(), bandId = randomUUID(), version = new Date().toISOString()
const channel = 'https://www.youtube.com/channel/UC' + 'a'.repeat(22)
const proof = () => [{ kind: 'official_artist_page', identityMatched: true, checkedAt: version,
  url: 'https://official.example.com/artist', excerpt: 'Artist performs alternative rock music', linkedChannelUrl: channel }]
const result = () => ({ genre: { decision: 'keep', summary: 'Official profile establishes artist identity and rock genre', evidence: proof() },
  channel: { decision: 'verified', summary: 'Official profile links directly to the artist channel', evidence: proof(), url: channel } })
const context = { snapshot: { id: bandId, name: 'Artist', aliases: [], version }, sourceHosts: ['official.example.com'] }
const request = (body, token = secret) => new Request('https://edge.example.test', {
  method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
})

test('scoped auth gates every operation; idle performs no investigation; arbitrary RPCs cannot be selected', async () => {
  let calls = 0
  const handler = createArtistReviewHandler({ secret, rpc: async (name) => {
    calls++; assert.equal(name, 'service_claim_artist_review'); return { data: { state: 'idle', targets: [], notify: false } }
  }, fetcher: () => { throw new Error('no provider calls allowed') } })
  assert.equal((await handler(request({ action: 'begin', runId }, 'wrong'))).status, 401)
  assert.equal(calls, 0)
  assert.deepEqual(await (await handler(request({ action: 'begin', runId }))).json(), { state: 'idle', targets: [], notify: false })
  assert.equal(calls, 1)
  assert.equal((await handler(request({ action: 'admin_curate_artist', runId }))).status, 400)
  assert.equal(calls, 1)
})

test('checkpoint verifies actual page content/direct link and a minimal fixed-host API request before committing', async () => {
  const calls = [], fetches = []
  const handler = createArtistReviewHandler({ secret, youtubeKey: 'test-provider-key', rpc: async (name) => {
    calls.push(name); return { data: name.endsWith('_context') ? context : { outcome: 'complete', notify: true } }
  }, fetcher: async (url, options) => {
    fetches.push(url); assert.equal(options.redirect, 'error')
    if (url.startsWith('https://official.')) return new Response(`<h1>Artist</h1><p>Artist performs alternative rock music</p><a href="${channel}">YouTube</a>`, { headers: { 'Content-Type': 'text/html' } })
    assert.equal(new URL(url).host, 'www.googleapis.com'); assert.equal(new URL(url).searchParams.get('part'), 'id')
    assert.ok(!url.includes('test-provider-key')); assert.equal(options.headers['X-Goog-Api-Key'], 'test-provider-key')
    return Response.json({ items: [{ id: channel.split('/').at(-1) }] })
  } })
  const response = await handler(request({ action: 'checkpoint', runId, bandId, expectedVersion: version, result: result() }))
  assert.equal(response.status, 200)
  assert.deepEqual(calls, ['service_artist_review_context', 'service_checkpoint_artist_review'])
  assert.equal(fetches.length, 2) // Shared source fetched once, plus one API ID check; no images.
})

test('HTTP 200 alone, fake excerpts, arbitrary hosts, missing API key and provider errors never commit', async () => {
  for (const failure of ['empty', 'bad-excerpt', 'host', 'missing-key', 'provider', 'rate-limit']) {
    const submitted = result(); let commits = 0
    if (failure === 'host') submitted.genre.evidence[0].url = 'https://169.254.169.254/'
    if (failure === 'bad-excerpt') submitted.genre.evidence[0].excerpt = 'Fiction invented by a research model'
    const handler = createArtistReviewHandler({ secret, youtubeKey: failure === 'missing-key' ? '' : 'test-key',
      rpc: async name => {
        if (name.endsWith('_context')) return { data: context }
        commits++; return { data: {} }
      }, fetcher: async url => {
        if (url.startsWith('https://official.')) return new Response(failure === 'empty' ? '<p>200 OK</p>'
          : `<h1>Artist</h1><p>Artist performs alternative rock music</p><a href="${channel}">link</a>`, { headers: { 'Content-Type': 'text/html' } })
        return new Response('do not expose provider text or key', { status: failure === 'rate-limit' ? 429 : 403 })
      } })
    const response = await handler(request({ action: 'checkpoint', runId, bandId, expectedVersion: version, result: submitted }))
    assert.equal(response.status, 409, failure); assert.equal(commits, 0, failure)
    const body = await response.text()
    assert.ok(!body.includes('test-key'))
    if (failure === 'rate-limit') assert.match(body, /SOURCE_UNAVAILABLE/)
  }
})

test('source redirects, oversized streams and script-injected links fail closed', async () => {
  await assert.rejects(verifyReviewSources(result(), context, async (_url, options) => {
    assert.equal(options.redirect, 'error'); throw new TypeError('redirect refused')
  }), /redirect refused/)
  await assert.rejects(verifyReviewSources(result(), context, async () => new Response('a'.repeat(800001), {
    headers: { 'Content-Type': 'text/html' },
  })), /BODY_TOO_LARGE/)
  await assert.rejects(verifyReviewSources(result(), context, async () => new Response(
    `<h1>Artist</h1><p>Artist performs alternative rock music</p><script>var x='<a href="${channel}">fake</a>'</script>`,
    { headers: { 'Content-Type': 'text/html' } },
  )), /CHANNEL_EVIDENCE_REQUIRED/)
})

test('unknown lease fails before network; defer records bounded codes without catalog writes', async () => {
  let providers = 0
  const handler = createArtistReviewHandler({ secret,
    rpc: async name => name.endsWith('_context') ? { error: { message: 'LEASE_LOST' } } : { data: {} },
    fetcher: async () => { providers++; throw new Error('unexpected') },
  })
  assert.equal((await handler(request({ action: 'checkpoint', runId, bandId, expectedVersion: version, result: result() }))).status, 409)
  assert.equal(providers, 0)
  const deferrer = createArtistReviewHandler({ secret, rpc: async (name, args) => {
    assert.equal(name, 'service_defer_artist_review'); assert.equal(args.reason, 'SOURCE_UNAVAILABLE')
    return { data: { outcome: 'failed', notify: false } }
  } })
  assert.equal((await deferrer(request({ action: 'defer', runId, bandId, reason: 'SOURCE_UNAVAILABLE' }))).status, 200)
})

test('ambiguous checkpoint response can be replayed without repeating research or API requests', async () => {
  const handler = createArtistReviewHandler({ secret, rpc: async name => ({ data: name.endsWith('_context')
    ? { ...context, checkpoint: { submitted: result() } } : { outcome: 'complete' } }),
  fetcher: () => { throw new Error('must not refetch committed evidence') } })
  assert.equal((await handler(request({ action: 'checkpoint', runId, bandId, expectedVersion: version, result: result() }))).status, 200)
})

test('CLI persists idempotency before network, resumes, restricts outputs to ignored paths and serializes local writers', async () => {
  await mkdir('.local/artist-review', { recursive: true })
  const dir = await mkdtemp('.local/artist-review/test-'), statePath = `${dir}/state.json`
  const env = { ARTIST_REVIEW_ENDPOINT: 'https://czjrzylvnewfjnfwjhwf.supabase.co/functions/v1/artist-review-runner', ARTIST_REVIEW_RUNNER_SECRET: secret }
  try {
    const requestIds = []
    const options = { env, output: () => {}, fetcher: async (_url, options) => {
      const body = JSON.parse(options.body); requestIds.push(body.runId)
      const persisted = JSON.parse(await readFile(statePath, 'utf8'))
      assert.equal(persisted.runId, body.runId)
      assert.ok(!JSON.stringify(persisted).includes(secret))
      return Response.json({ state: 'running', targets: [] })
    } }
    await runReviewCommand(['begin', `--state=${statePath}`], options)
    await runReviewCommand(['begin', `--state=${statePath}`], options)
    assert.equal(requestIds[0], requestIds[1])
    await symlink('state.json', `${dir}/alias.json`)
    await assert.rejects(runReviewCommand(['begin', `--state=${dir}/alias.json`], options), /SYMLINK_PATH_REJECTED/)
    await writeFile(`${dir}/injected.json`, JSON.stringify({ bandId, expectedVersion: version,
      result: { genre: { summary: secret } } }), 'utf8')
    await assert.rejects(runReviewCommand(['checkpoint', `--state=${statePath}`, `--input=${dir}/injected.json`], options), /SECRET_IN_PAYLOAD/)
    await writeFile(`${statePath}.lock`, 'test lock', 'utf8')
    await assert.rejects(runReviewCommand(['begin', `--state=${statePath}`], options), /EEXIST/)
    await assert.rejects(runReviewCommand(['begin', '--state=docs/curation-runs/leak.json'], options), /IGNORED_PATH_REQUIRED/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
