import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { backend, configurationError } from './backend'
import { authCallback } from './authErrors'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(backend))
  // Read before effects clean the URL; StrictMode replays setup and cleanup.
  const [error, setError] = useState(() => configurationError || authCallback(new URL(window.location.href)).error)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!backend) return
    let active = true
    let eventSeen = false
    const handleCallback = () => {
      const callback = authCallback(new URL(window.location.href))
      if (callback.error) { setError(callback.error); history.replaceState(null, '', callback.cleanUrl) }
    }
    const initial = authCallback(new URL(window.location.href))
    if (initial.error) history.replaceState(null, '', initial.cleanUrl)
    window.addEventListener('hashchange', handleCallback)
    window.addEventListener('popstate', handleCallback)
    const { data: { subscription } } = backend.auth.onAuthStateChange((_event, next) => {
      eventSeen = true
      if (active) { setSession(next); setLoading(false) }
    })
    void backend.auth.getSession().then(({ data, error: failure }) => {
      if (!active || eventSeen) return
      setSession(data.session); setLoading(false)
      if (failure) setError('세션을 복구하지 못했습니다. 새 로그인 링크를 요청해 주세요.')
    }).catch(() => { if (active) { setLoading(false); setError('세션 확인에 실패했습니다. 연결을 확인하고 다시 시도해 주세요.') } })
    return () => { active = false; subscription.unsubscribe(); window.removeEventListener('hashchange', handleCallback); window.removeEventListener('popstate', handleCallback) }
  }, [])

  const requestLink = async (email: string) => {
    if (!backend || busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      // Query keeps the current page/detail available in a newly opened browser.
      const redirect = new URL(window.location.href)
      redirect.hash = ''
      const { error: failure } = await backend.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect.href } })
      if (failure) setError('로그인 링크 요청에 실패했습니다. 이메일과 연결을 확인한 뒤 잠시 후 다시 시도해 주세요.')
      else setMessage('이메일에서 로그인 링크를 열어 주세요. 링크를 연 브라우저에 로그인됩니다.')
    } catch { setError('로그인 서버에 연결하지 못했습니다. 다시 시도해 주세요.') }
    finally { setBusy(false) }
  }
  const signOut = async () => {
    if (!backend || busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      const { error: failure } = await backend.auth.signOut({ scope: 'local' })
      if (failure) setError('로그아웃하지 못했습니다. 다시 시도해 주세요.')
      else setSession(null)
    } catch { setError('로그아웃하지 못했습니다. 연결을 확인해 주세요.') }
    finally { setBusy(false) }
  }
  return { session, loading, error, busy, message, requestLink, signOut }
}
