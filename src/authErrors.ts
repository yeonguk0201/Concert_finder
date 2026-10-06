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
