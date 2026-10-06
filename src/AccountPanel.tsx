import { useState } from 'react'
import type { useAuth } from './useAuth'
import { accountMode, backend } from './backend'

export function AccountPanel({ auth, initiallyExpanded = false }: { auth: ReturnType<typeof useAuth>; initiallyExpanded?: boolean }) {
  const [email, setEmail] = useState('')
  const [expanded, setExpanded] = useState(initiallyExpanded)
  return <section className="account-panel" aria-label="계정">
    <div className="account-heading"><strong>{auth.loading ? '로그인 확인 중…' : auth.session ? '계정으로 로그인됨' : accountMode ? '계정 로그인' : '로컬 프리뷰'}</strong>
      {backend && !auth.session && <button className="outline" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '접기' : '이메일 로그인'}</button>}
      {auth.session && <button className="outline" disabled={auth.busy} onClick={() => void auth.signOut()}>로그아웃</button>}
    </div>
    {auth.session && <p className="account-email">{auth.session.user.email}</p>}
    {!accountMode && <p>로그인 없이 가상 공연을 체험합니다. 저장은 이 브라우저에서만 유지됩니다.</p>}
    {expanded && !auth.session && <form onSubmit={e => { e.preventDefault(); void auth.requestLink(email) }}>
      <label htmlFor="login-email">이메일</label><input id="login-email" type="email" autoComplete="email" autoFocus={initiallyExpanded} required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
      <button className="primary" disabled={auth.busy || auth.loading}>{auth.busy ? '요청 중…' : '로그인 링크 받기'}</button>
      <p>비밀번호 없이 로그인합니다. 로그인 이메일과 공연 알림 수신 동의는 별개입니다.</p>
    </form>}
    {auth.error && <p role="alert" className="account-error">{auth.error}</p>}
    {auth.message && <p role="status">{auth.message}</p>}
  </section>
}
