import { useEffect, useRef, useState } from 'react'
import type { useAuth } from './useAuth'
import { Icon } from './UiIcon'

export function LoginDialog({ auth, open, onClose }: { auth: ReturnType<typeof useAuth>; open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [emailStep, setEmailStep] = useState(false)
  const verifying = Boolean(auth.pendingEmail) && !emailStep
  useEffect(() => {
    if (open && !auth.session) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open, auth.session])
  return <dialog ref={dialog} className="flow-login" aria-labelledby="login-title" onClose={onClose} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}>
    <button className="close" aria-label="로그인 닫기" onClick={() => dialog.current?.close()}>×</button>
    <span className="brand">encore.</span><div className="login-illustration"><Icon name={verifying ? 'user' : 'heart'} /></div>
    <h2 id="login-title">{verifying ? <>메일함을 확인해 주세요.</> : <>좋아하는 음악이<br />다음 만남이 되도록.</>}</h2>
    <p>{verifying ? `${auth.pendingEmail}로 보낸 인증번호를 입력해 주세요.` : <>이메일로 간편하게 시작하고,<br />찜한 아티스트와 예매 일정을 모아보세요.</>}</p>
    {verifying ? <form onSubmit={event => { event.preventDefault(); void auth.verifyCode(code).then(() => setCode('')) }}><label htmlFor="login-code">이메일 인증번호</label><input id="login-code" className="code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required value={code} onChange={event => setCode(event.target.value)} /><button className="primary" disabled={auth.busy || auth.loading}>인증번호로 로그인 <Icon name="arrow" /></button><button type="button" className="login-retry" onClick={() => setEmailStep(true)}>다른 이메일로 다시 받기</button></form> : <form onSubmit={event => { event.preventDefault(); setEmailStep(false); void auth.requestLink(email) }}><label htmlFor="login-email">이메일</label><input id="login-email" type="email" placeholder="you@example.com" autoComplete="email" autoFocus required value={email} onChange={event => setEmail(event.target.value)} /><button className="primary" disabled={auth.busy || auth.loading}>{auth.busy ? '요청 중…' : '이메일로 계속하기'} <Icon name="arrow" /></button></form>}
    {auth.error && <p className="account-error" role="alert">{auth.error}</p>}{auth.message && <p role="status">{auth.message}</p>}
    <div className="login-benefits"><span><Icon name="heart" />나의 아티스트</span><span><Icon name="calendar" />나의 예매 일정</span></div>
  </dialog>
}
