import { backend } from './backend'

export type Preferences = { announcements: boolean; ticket_reminders: boolean }
export type PushDevice = { id: string; label: string; active: boolean; updated_at: string }
export type NotificationSettings = { preferences: Preferences; devices: PushDevice[] }
const operationLabels: Record<string, string> = {
  notification_settings: '알림 설정 조회', set_notification_preferences: '수신 동의 저장',
  register_push_device: '기기 등록', disable_push_device: '기기 해제', request_push_test: '테스트 알림 요청',
}
class NotificationRequestError extends Error {
  code: string
  operation: string
  constructor(operation: string, failure: { message?: string; code?: string }) {
    super(failure.message ?? 'Notification request failed')
    this.code = failure.code ?? ''
    this.operation = operation
  }
}
async function rpc(name: string, args: Record<string, unknown> = {}) {
  if (!backend) throw new Error('BACKEND_REQUIRED')
  const { data, error } = await backend.rpc(name, args)
  if (error) throw new NotificationRequestError(name, error)
  return data
}
export async function loadNotificationSettings(): Promise<NotificationSettings> {
  const data = await rpc('notification_settings')
  if (!data || typeof data.preferences?.announcements !== 'boolean' ||
    typeof data.preferences?.ticket_reminders !== 'boolean' || !Array.isArray(data.devices)) {
    throw new NotificationRequestError('notification_settings', { code: 'INVALID_SETTINGS_RESPONSE' })
  }
  return data as NotificationSettings
}
export const saveNotificationPreferences = (value: Preferences) => rpc('set_notification_preferences', value)
export const disablePushDevice = (id: string) => rpc('disable_push_device', { device_id: id })
export const requestPushTest = (id: string) => rpc('request_push_test', { device_id: id })
export function pushSupported() {
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}
export async function registerPushDevice(userId: string, label: string, publicKey: string) {
  if (!pushSupported() || !publicKey) throw new Error('PUSH_NOT_CONFIGURED')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('PERMISSION_DENIED')
  await navigator.serviceWorker.register('/push-sw.js', { scope: '/' })
  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  // Browser subscriptions belong to one account. Create a new endpoint on an account switch.
  if (subscription && localStorage.getItem('encore.push.owner') !== userId) {
    await subscription.unsubscribe()
    subscription = null
  }
  if (!subscription) {
    const raw = atob(publicKey.replace(/-/g, '+').replace(/_/g, '/'))
    const key = Uint8Array.from(raw, char => char.charCodeAt(0))
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  }
  const id = await rpc('register_push_device', { subscription: subscription.toJSON(), device_label: label, expected_user_id: userId }) as string
  localStorage.setItem('encore.push.owner', userId)
  localStorage.setItem('encore.push.device', id)
  return id
}
export async function removePushDevice(id: string) {
  // Disable on the server first; browser cleanup failure cannot keep the server sending.
  await disablePushDevice(id)
  if (localStorage.getItem('encore.push.device') === id) {
    localStorage.removeItem('encore.push.device')
    localStorage.removeItem('encore.push.owner')
    try {
      const registration = await navigator.serviceWorker?.getRegistration('/')
      await (await registration?.pushManager.getSubscription())?.unsubscribe()
    } catch { /* Server revocation already succeeded. */ }
  }
}
export function notificationError(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  const rawCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  // Never display raw server messages: they can contain personal data or request values.
  const code = /^[A-Z0-9_]{1,40}$/.test(rawCode) ? rawCode : ''
  const operation = error instanceof NotificationRequestError ? operationLabels[error.operation] : ''
  const describe = (value: string) => `${operation ? `${operation}: ` : ''}${value}${code ? ` (오류 코드: ${code})` : ''}`
  if (message.includes('LOGIN_REQUIRED') || /^PGRST30[123]$/.test(code) || /JWT.*expired|Invalid JWT/i.test(message)) {
    return describe('로그인을 다시 확인해야 합니다. 로그아웃 후 새 로그인 링크로 접속해 주세요.')
  }
  if (code === 'PGRST202') return describe('현재 연결된 DB에서 알림 함수를 찾지 못했습니다. 알림 SQL 적용과 배포의 DB 연결을 확인해 주세요.')
  if (code === '42501') return describe('알림 설정에 접근하지 못했습니다. 다시 로그인한 뒤에도 계속되면 DB 함수 권한을 확인해야 합니다.')
  if (code.startsWith('42') || code === 'INVALID_SETTINGS_RESPONSE') return describe('서버의 알림 설정 처리에 문제가 있습니다. 이 오류 코드를 전달해 주세요.')
  if (/Failed to fetch|fetch failed|NetworkError|Load failed/i.test(message)) return describe('서버에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.')
  if (message.includes('PUSH_NOT_CONFIGURED')) return '이 배포의 웹 푸시 지원·공개 키 설정을 먼저 확인해 주세요. 수신 동의 저장과는 별개입니다.'
  if (message.includes('PERMISSION_DENIED')) return '알림 권한이 허용되지 않았습니다. 브라우저 사이트 설정에서 변경해 주세요.'
  if (message.includes('TEST_RATE_LIMIT')) return '테스트 알림은 1분에 한 번 요청할 수 있습니다.'
  if (message.includes('CONSENT_AND_DEVICE_REQUIRED')) return '수신 동의와 활성 기기 등록을 먼저 확인해 주세요.'
  if (message.includes('DEVICE_OWNED_BY_OTHER_ACCOUNT')) return '이 브라우저의 이전 구독을 해제한 뒤 다시 등록해 주세요.'
  if (message.includes('ACCOUNT_CHANGED')) return '등록 중 계정이 변경되었습니다. 현재 계정에서 다시 등록해 주세요.'
  return describe('알림 설정을 처리하지 못했습니다. 연결과 설정을 확인하고 다시 시도해 주세요.')
}
