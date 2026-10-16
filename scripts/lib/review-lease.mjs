export const LEASE_RESERVE_MS = 6 * 60_000
export function leaseRemaining(state, wallNow = Date.now()) {
  const lease = Date.parse(state.response?.leaseUntil), server = Date.parse(state.response?.serverNow)
  if (!Number.isFinite(lease) || !Number.isFinite(server) || !Number.isFinite(state.receivedAt)) return 0
  return Math.max(0, Math.min(45 * 60_000, lease - server - Math.max(0, wallNow - state.receivedAt)))
}

// One-shot active-run shutdown, not a recurring/local scheduler. Monotonic after startup.
export async function watchReviewLease({ runId, readState, close, writeMarker, wallNow = Date.now,
  monotonic = () => performance.now(), wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const state = await readState()
  if (state.runId !== runId || state.finished) return
  const expires = monotonic() + leaseRemaining(state, wallNow())
  const stopAt = expires - LEASE_RESERVE_MS
  while (true) {
    const latest = await readState()
    if (latest.runId !== runId || latest.finished) return
    if (monotonic() >= stopAt) {
      let lastError
      for (let attempt = 0; attempt < 3 && monotonic() < expires - 30_000; attempt++) {
        try {
          const result = await close(runId)
          await writeMarker({ runId, stop: true, result })
          return result
        } catch { lastError = 'LEASE_CLOSE_FAILED'; await wait(1000) }
      }
      await writeMarker({ runId, stop: true, error: lastError ?? 'LEASE_LOST' })
      return
    }
    await wait(Math.min(60_000, stopAt - monotonic()))
  }
}
