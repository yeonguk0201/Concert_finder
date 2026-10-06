const callbackKeys = ['error', 'error_code', 'error_description']

export function authCallback(url: URL) {
  const fragment = new URLSearchParams(url.hash.slice(1))
  const failed = callbackKeys.some(key => url.searchParams.has(key) || fragment.has(key))
  if (!failed) return { error: '', cleanUrl: url.href }
  const clean = new URL(url)
  for (const key of callbackKeys) { clean.searchParams.delete(key); fragment.delete(key) }
  clean.hash = fragment.toString()
  return { error: '로그인 링크가 만료되었거나 사용할 수 없습니다. 새 링크를 요청해 주세요.', cleanUrl: clean.href }
}

export function loginRequestError(failure: unknown) {
  const error = failure && typeof failure === 'object' ? failure as { code?: string; status?: number; name?: string; message?: string } : {}
  if (error.code === 'over_email_send_rate_limit') {
    // Some Auth versions use this code for the per-address cooldown too.
    const seconds = error.message?.match(/after (\d+) seconds/i)?.[1]
    return seconds
      ? `로그인 링크를 너무 빨리 다시 요청했습니다. ${seconds}초 후 다시 시도해 주세요.`
      : '로그인 이메일 발송 한도에 도달했습니다. 발송 제한이 해제된 뒤 다시 요청해 주세요.'
  }
  if (error.code === 'over_request_rate_limit' || error.status === 429) return '로그인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'
  if (error.code === 'email_address_invalid') return '이메일 주소를 확인해 주세요.'
  if (error.code === 'email_address_not_authorized') return '현재 이 주소로 로그인 이메일을 보낼 수 없습니다. 서비스 관리자에게 문의해 주세요.'
  if (error.name === 'AuthRetryableFetchError' || failure instanceof TypeError || error.status === 0) return '로그인 서버에 연결하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'
  if (error.status && error.status >= 500) return '로그인 서버에 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  return '로그인 링크 요청에 실패했습니다. 이메일과 연결을 확인한 뒤 잠시 후 다시 시도해 주세요.'
}
