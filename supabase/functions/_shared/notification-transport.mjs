// Use native fetch rather than Node's HTTP implementation on the Edge runtime.
export function createPushSender(webpush, fetchRequest = fetch) {
  return async (subscription, payload, options) => {
    const details = webpush.generateRequestDetails(subscription, payload, options)
    const response = await fetchRequest(details.endpoint, {
      method: details.method,
      headers: details.headers,
      body: details.body,
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    })
    try { await response.body?.cancel() } catch { /* Only the provider status is needed. */ }
    if (!response.ok) throw { statusCode: response.status }
  }
}
