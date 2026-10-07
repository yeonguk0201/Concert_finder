import { backend } from './backend'

export type Preferences = { announcements: boolean; ticket_reminders: boolean }
export type PushDevice = { id: string; label: string; active: boolean; updated_at: string }
export type NotificationSettings = { preferences: Preferences; devices: PushDevice[] }
async function rpc(name: string, args: Record<string, unknown> = {}) {
  if (!backend) throw new Error('BACKEND_REQUIRED')
  const { data, error } = await backend.rpc(name, args)
  if (error) throw error
  return data
}
export const loadNotificationSettings = () => rpc('notification_settings') as Promise<NotificationSettings>
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
  if (message.includes('PERMISSION_DENIED')) return '알림 권한이 허용되지 않았습니다. 브라우저 사이트 설정에서 변경해 주세요.'
  if (message.includes('TEST_RATE_LIMIT')) return '테스트 알림은 1분에 한 번 요청할 수 있습니다.'
  if (message.includes('CONSENT_AND_DEVICE_REQUIRED')) return '수신 동의와 활성 기기 등록을 먼저 확인해 주세요.'
  if (message.includes('DEVICE_OWNED_BY_OTHER_ACCOUNT')) return '이 브라우저의 이전 구독을 해제한 뒤 다시 등록해 주세요.'
  if (message.includes('ACCOUNT_CHANGED')) return '등록 중 계정이 변경되었습니다. 현재 계정에서 다시 등록해 주세요.'
  return '알림 설정을 처리하지 못했습니다. 연결과 설정을 확인하고 다시 시도해 주세요.'
}
