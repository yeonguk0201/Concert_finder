import { useState } from 'react'
import type { useAuth } from './useAuth'
import { accountMode, backend } from './backend'

export function AccountPanel({ auth, initiallyExpanded = false }: { auth: ReturnType<typeof useAuth>; initiallyExpanded?: boolean }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const [deleting, setDeleting] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  return <section className="account-panel" aria-label="계정">
    <div className="account-heading"><strong>{auth.loading ? '로그인 확인 중…' : auth.session ? '계정으로 로그인됨' : accountMode ? '계정 로그인' : '로컬 프리뷰'}</strong>
      {backend && !auth.session && <button className="outline" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '접기' : '이메일 로그인'}</button>}
      {auth.session && <button className="outline" disabled={auth.busy} onClick={() => void auth.signOut()}>로그아웃</button>}
    </div>
    {auth.session && <p className="account-email">{auth.session.user.email}</p>}
    {auth.session && <div className="account-deletion">
      <button className="outline" disabled={auth.busy} aria-expanded={deleting} onClick={() => { setDeleting(!deleting); setConfirmation('') }}>계정 삭제 안내</button>
      {deleting && <form onSubmit={e => { e.preventDefault(); if (confirmation === '계정 삭제') void auth.deleteAccount(auth.session!.user.id) }}>
        <p id="deletion-warning">이 계정의 로그인 정보, 밴드 찜, 저장 일정, 알림 동의·기기·발송 기록을 삭제하며 복구할 수 없습니다. 이후 알림 발송 대상에서 제외됩니다. 이미 발송 중이거나 전달된 알림과 내려받은 캘린더는 회수되지 않습니다.</p>
        <label htmlFor="delete-confirmation">확인을 위해 ‘계정 삭제’ 입력</label>
        <input id="delete-confirmation" autoComplete="off" value={confirmation} aria-describedby="deletion-warning" onChange={e => setConfirmation(e.target.value)} disabled={auth.busy} />
        <button className="outline danger" disabled={auth.busy || confirmation !== '계정 삭제'}>{auth.busy ? '처리 중…' : '계정 영구 삭제'}</button>
        <button type="button" className="outline" disabled={auth.busy} onClick={() => { setDeleting(false); setConfirmation('') }}>취소</button>
      </form>}
    </div>}
    {!accountMode && <p>로그인 없이 가상 공연을 체험합니다. 저장은 이 브라우저에서만 유지됩니다.</p>}
    {expanded && !auth.session && <form onSubmit={e => { e.preventDefault(); void auth.requestLink(email) }}>
      <label htmlFor="login-email">이메일</label><input id="login-email" type="email" autoComplete="email" autoFocus={initiallyExpanded} required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
      <button className="primary" disabled={auth.busy || auth.loading}>{auth.busy ? '요청 중…' : '로그인 메일 받기'}</button>
      <p>비밀번호 없이 로그인합니다. 로그인 이메일과 공연 알림 수신 동의는 별개입니다.</p>
    </form>}
    {expanded && !auth.session && auth.pendingEmail && <form onSubmit={e => { e.preventDefault(); void auth.verifyCode(code).then(() => setCode('')) }}>
      <p className="account-email">{auth.pendingEmail}로 받은 인증번호를 입력하세요. 아이폰은 홈 화면 앱의 이 화면에서 입력하면 됩니다.</p>
      <label htmlFor="login-code">이메일 인증번호</label><input id="login-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required value={code} onChange={e => setCode(e.target.value)} />
      <button className="primary" disabled={auth.busy || auth.loading}>{auth.busy ? '확인 중…' : '인증번호로 로그인'}</button>
      <p>인증번호와 로그인 링크는 한 번만 사용할 수 있습니다. 번호로 로그인할 때는 메일 링크를 먼저 열지 마세요.</p>
    </form>}
    {auth.error && <p role="alert" className="account-error">{auth.error}</p>}
    {auth.message && <p role="status">{auth.message}</p>}
  </section>
}
