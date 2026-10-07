import { useEffect, useRef, useState } from 'react'
import { loadNotificationSettings, saveNotificationPreferences, registerPushDevice, removePushDevice, requestPushTest, pushSupported, notificationError } from './notificationApi'
import type { NotificationSettings } from './notificationApi'

export function NotificationPanel({ userId }: { userId: string }) {
  const [settings, setSettings] = useState<NotificationSettings>({ preferences: { announcements: false, ticket_reminders: false }, devices: [] })
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [label, setLabel] = useState('내 휴대폰')
  const active = useRef(false)
  const working = useRef(false)
  const generation = useRef(0)
  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() ?? ''
  const supported = pushSupported()
  const refresh = async () => {
    const version = ++generation.current
    try {
      const value = await loadNotificationSettings()
      if (active.current && version === generation.current) { setSettings(value); setReady(true); setError(''); setLoading(false) }
    } catch (e) {
      if (active.current && version === generation.current) { setReady(false); setError(notificationError(e)); setLoading(false) }
    }
  }
  useEffect(() => {
    active.current = true
    queueMicrotask(() => { if (active.current) void refresh() })
    const reload = () => { if (!working.current && document.visibilityState === 'visible') void refresh() }
    const timer = window.setInterval(reload, 30000)
    window.addEventListener('focus', reload)
    const invalidate = () => { active.current = false; generation.current++ }
    return () => { invalidate(); clearInterval(timer); window.removeEventListener('focus', reload) }
  }, [])
  const run = async (action: () => Promise<unknown>, success: string) => {
    if (working.current) return
    working.current = true
    generation.current++
    setBusy(true); setError(''); setMessage('')
    try {
      await action()
      if (active.current) { setMessage(success); await refresh() }
    } catch (e) { if (active.current) setError(notificationError(e)) }
    finally { working.current = false; if (active.current) setBusy(false) }
  }
  return <section className="account-panel notification-panel" aria-label="공연 알림 설정">
    <div className="account-heading"><strong>공연 알림 · 웹 푸시 테스트</strong><button className="outline" disabled={busy} onClick={() => void refresh()}>설정 다시 확인</button></div>
    <p>찜·일정 저장과 수신 동의는 별개입니다. 동의한 계정의 등록된 모든 활성 기기로 전달합니다.</p>
    {loading ? <p role="status">알림 설정을 불러오는 중…</p> : <fieldset disabled={busy || !ready}>
      <legend>계정 수신 동의</legend>
      <label><input type="checkbox" checked={settings.preferences.announcements} onChange={e => void run(() => saveNotificationPreferences({ ...settings.preferences, announcements: e.target.checked }), '신규 공연 알림 동의를 저장했습니다.')} />찜한 밴드의 신규 공개·페스티벌 라인업 추가</label>
      <label><input type="checkbox" checked={settings.preferences.ticket_reminders} onChange={e => void run(() => saveNotificationPreferences({ ...settings.preferences, ticket_reminders: e.target.checked }), '예매 알림 동의를 저장했습니다.')} />저장한 예매 일정의 1시간 전 알림</label>
      <p>1시간 이내에 저장하면 다음 발송 처리에서 전달합니다. 이미 지난 예매는 보내지 않습니다. 처리 주기와 기기 연결 상태에 따라 수신이 늦어질 수 있습니다.</p>
      {supported && publicKey ? <div className="notification-register"><label>기기 이름<input maxLength={80} value={label} onChange={e => setLabel(e.target.value)} /></label><button className="outline" disabled={!label.trim()} onClick={() => void run(() => registerPushDevice(userId, label.trim(), publicKey), '이 기기를 등록했습니다. 테스트 알림으로 실제 수신을 확인해 주세요.')}>이 기기 알림 허용·등록</button></div> : <p>{!supported ? '이 환경에서 웹 푸시를 사용할 수 없습니다. HTTPS와 브라우저 지원을 확인해 주세요. 아이폰은 홈 화면에 추가한 웹앱에서 확인하세요.' : '웹 푸시 공개 키 설정이 필요합니다. 아직 기기 등록과 발송을 사용할 수 없습니다.'}</p>}
      <ul className="notification-devices">{settings.devices.map(device => <li key={device.id}><span>{device.label} · {device.active ? '활성' : '해제됨'}</span>{device.active && <div><button className="outline" disabled={!settings.preferences.announcements && !settings.preferences.ticket_reminders} onClick={() => void run(() => requestPushTest(device.id), '테스트 발송을 요청했습니다. 서버 처리 후 휴대폰 알림을 확인해 주세요. 요청 성공은 실제 수신 확인과 다릅니다.')}>테스트 알림 요청</button><button className="outline" onClick={() => void run(() => removePushDevice(device.id), '기기 수신을 해제했습니다.')}>기기 해제</button></div>}</li>)}</ul>
      {!settings.devices.some(d => d.active) && <p>활성 기기가 없습니다. 수신하려면 이 기기를 등록해 주세요. 수신 동의는 기기 등록 전에 저장할 수 있습니다.</p>}
    </fieldset>}
    {error && <p className="account-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <p>실제 기기 수신 검증을 진행 중입니다. 로그아웃으로 수신 동의가 해제되지는 않습니다. 알림을 중단하려면 동의 또는 기기를 해제해 주세요.</p>
  </section>
}
