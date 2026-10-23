// Fixed codes only: error messages can contain credential-bearing provider URLs.
function collectionFailure(error, phase) {
  const message = error?.message ?? ''
  const status = /^(?:KOPIS )?HTTP ([45]\d{2})$/.exec(message)?.[1]
  if (phase === 'upload') return { code: 'COLLECTION_UPLOAD_FAILED', retryable: false }
  if (status) return { code: `COLLECTION_HTTP_${status}`, retryable: status === '429' || Number(status) >= 500 }
  if (message === 'KOPIS_SERVICE_KEY missing') return { code: 'COLLECTION_CONFIGURATION_MISSING', retryable: false }
  if (message === 'Collection disallowed by robots.txt') return { code: 'COLLECTION_ROBOTS_DISALLOWED', retryable: false }
  if (message === 'KOPIS listing budget exceeded: narrow the date range') return { code: 'COLLECTION_LISTING_BUDGET_EXCEEDED', retryable: false }
  if (message === 'Response too large' || message === 'KOPIS response too large') return { code: 'COLLECTION_RESPONSE_TOO_LARGE', retryable: false }
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError' || message === 'KOPIS request timeout') return { code: 'COLLECTION_TIMEOUT', retryable: true }
  return { code: 'COLLECTION_OR_UPLOAD_FAILED', retryable: true }
}

// A lease covers a complete source attempt, including bounded collection retries.
export async function runSource({ client, source, collect, upload, sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => new Date().toISOString() }) {
  const scheduledAt = process.env.CATALOG_SCHEDULED_AT || now()
  let token = null
  if (client) {
    const started = await client.rpc('service_begin_collection', { source_name: source, scheduled_at: scheduledAt })
    if (started.error) throw new Error(`Start failed: ${started.error.code ?? 'RPC'}`)
    token = started.data
    if (!token) return { source, skipped: 'locked_or_disabled' }
  }
  let attempts = 0, phase = 'collect'
  try {
    let result
    for (attempts = 1; attempts <= 3; attempts++) {
      try { result = await collect(); break } catch (error) {
        if (attempts === 3 || !collectionFailure(error, phase).retryable) throw error
        await sleep(attempts * 5000)
      }
    }
    // Upload retries use the same run token, so a lost response cannot republish.
    phase = 'upload'
    const publication = client ? await upload(result, token, attempts) : null
    return { ...result, attempts, run_id: token, publication }
  } catch (error) {
    const failure = collectionFailure(error, phase)
    if (client) {
      const finished = await client.rpc('service_fail_collection', { run_token: token, attempt_count: attempts, failure_code: failure.code })
      if (finished.error) throw new Error(`Failure recording failed: ${finished.error.code ?? 'RPC'}`)
    }
    throw new Error(failure.code)
  }
}
