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
  let attempts = 0
  try {
    let result
    for (attempts = 1; attempts <= 3; attempts++) {
      try { result = await collect(); break } catch (error) {
        if (attempts === 3) throw error
        await sleep(attempts * 5000)
      }
    }
    // Upload retries use the same run token, so a lost response cannot republish.
    const publication = client ? await upload(result, token, attempts) : null
    return { ...result, attempts, run_id: token, publication }
  } catch (error) {
    if (client) {
      const finished = await client.rpc('service_fail_collection', { run_token: token, attempt_count: attempts, failure_code: 'COLLECTION_OR_UPLOAD_FAILED' })
      if (finished.error) throw new Error(`Failure recording failed: ${finished.error.code ?? 'RPC'}`)
    }
    throw error
  }
}
