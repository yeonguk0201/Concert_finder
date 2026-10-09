// Dependencies are injected so authorization can be tested without a live account.
export function createAccountDeletionHandler({ authenticate, deleteUser }) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  }
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers })
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' })
    const authorization = request.headers.get('authorization') ?? ''
    if (!/^Bearer \S+$/i.test(authorization)) return reply(401, { error: 'LOGIN_REQUIRED' })
    let body
    try { body = await request.json() } catch { return reply(400, { error: 'INVALID_REQUEST' }) }
    if (body?.confirmation !== '계정 삭제' || typeof body?.expectedUserId !== 'string') return reply(400, { error: 'CONFIRMATION_REQUIRED' })
    try {
      // A server lookup rejects deleted users and revoked/invalid sessions.
      const user = await authenticate(authorization.replace(/^Bearer /i, ''))
      if (!user) return reply(401, { error: 'LOGIN_REQUIRED' })
      if (user.id !== body.expectedUserId) return reply(409, { error: 'ACCOUNT_CHANGED' })
      // Never accept a target ID from the caller as the deletion authority.
      await deleteUser(user.id)
      return reply(200, { deleted: true })
    } catch { return reply(503, { error: 'DELETE_FAILED' }) }
  }
}
