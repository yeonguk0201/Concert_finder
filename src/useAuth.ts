import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { backend, configurationError } from './backend'
import { authCallback, loginRequestError } from './authErrors'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const currentUser = useRef<string | null>(null)
  useLayoutEffect(() => { currentUser.current = session?.user.id ?? null }, [session])
  const [loading, setLoading] = useState(Boolean(backend))
  // Read before effects clean the URL; StrictMode replays setup and cleanup.
  const [error, setError] = useState(() => configurationError || authCallback(new URL(window.location.href)).error)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
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
      if (active) { setSession(next); setLoading(false); if (next) { setPendingEmail(''); setMessage('') } }
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
      if (failure) setError(loginRequestError(failure))
      else {
        setPendingEmail(email.trim())
        setMessage('이메일의 인증번호를 이 화면에 입력하거나 로그인 링크를 열어 주세요. 링크는 열린 브라우저에 로그인됩니다.')
      }
    } catch (failure) { setError(loginRequestError(failure)) }
    finally { setBusy(false) }
  }
  const verifyCode = async (code: string) => {
    if (!backend || busy || !pendingEmail) return
    setError(''); setMessage('')
    const token = code.trim()
    if (!/^\d{6,10}$/.test(token)) { setError('이메일에 표시된 숫자 인증번호를 입력해 주세요.'); return }
    setBusy(true)
    try {
      const { data, error: failure } = await backend.auth.verifyOtp({ email: pendingEmail, token, type: 'email' })
      if (failure) {
        setError(failure.code === 'otp_expired' || failure.code === 'access_denied'
          ? '인증번호가 만료되었거나 올바르지 않습니다. 최신 메일의 번호를 확인하거나 새로 요청해 주세요.'
          : '인증번호를 확인하지 못했습니다. 연결과 번호를 확인하고 다시 시도해 주세요.')
      } else if (data.session) { setSession(data.session); setPendingEmail('') }
      else setError('로그인을 완료하지 못했습니다. 새 인증번호를 요청해 주세요.')
    } catch { setError('로그인 서버에 연결하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.') }
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
  const deleteAccount = async (expectedUserId: string) => {
    if (!backend || busy || !session || session.user.id !== expectedUserId) return false
    setBusy(true); setError(''); setMessage('')
    try {
      const { data, error: failure } = await backend.functions.invoke('delete-account', {
        body: { expectedUserId, confirmation: '계정 삭제' },
      })
      if (failure || data?.deleted !== true) throw new Error('DELETE_FAILED')
      if (currentUser.current !== expectedUserId) return true
      // Clear the current browser's persisted auth tokens even after Auth deletion.
      await backend.auth.signOut({ scope: 'local' }).catch(() => ({ error: null }))
      setSession(null); setPendingEmail('')
      setMessage('계정과 계정에 저장된 데이터를 삭제했습니다. 이미 전달된 알림과 내려받은 캘린더는 기기에서 직접 삭제해 주세요.')
      return true
    } catch {
      setError('계정 삭제를 확인하지 못했습니다. 연결을 확인해 주세요. 로그인 상태를 다시 확인한 뒤 재시도할 수 있습니다.')
      return false
    } finally { setBusy(false) }
  }
  return { session, loading, error, busy, message, pendingEmail, requestLink, verifyCode, signOut, deleteAccount }
}
