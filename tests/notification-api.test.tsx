import { afterEach, expect, test, vi } from 'vitest'
import { loadNotificationSettings, saveNotificationPreferences, notificationError } from '../src/notificationApi'
const request = vi.hoisted(() => vi.fn())
vi.mock('../src/backend', () => ({ backend: { rpc: request } }))
afterEach(() => vi.resetAllMocks())

test('existing preference rows can be toggled repeatedly without sending database metadata as RPC arguments', async () => {
  let preferences = { user_id: 'test-account', updated_at: '2026-10-08T00:00:00Z', announcements: true, ticket_reminders: false }
  request.mockImplementation(async (name, args) => {
    if (name === 'notification_settings') return { data: { preferences: { ...preferences }, devices: [] }, error: null }
    if (Object.keys(args).sort().join(',') !== 'announcements,ticket_reminders') {
      return { data: null, error: { code: 'PGRST202', message: 'No function matches the supplied argument names' } }
    }
    preferences = { ...preferences, ...args }
    return { data: null, error: null }
  })
  let settings = await loadNotificationSettings()
  await saveNotificationPreferences({ ...settings.preferences, ticket_reminders: true })
  settings = await loadNotificationSettings()
  expect(settings.preferences).toEqual({ announcements: true, ticket_reminders: true })
  await saveNotificationPreferences({ ...settings.preferences, announcements: false })
  settings = await loadNotificationSettings()
  expect(settings.preferences).toEqual({ announcements: false, ticket_reminders: true })
  // Protect callers too, even if they supply a complete persisted row.
  await saveNotificationPreferences(preferences)
  expect(request).toHaveBeenLastCalledWith('set_notification_preferences', { announcements: false, ticket_reminders: true })
})

test('settings without devices or VAPID still load and persist consent', async () => {
  const settings = { preferences: { announcements: false, ticket_reminders: false }, devices: [] }
  request.mockResolvedValueOnce({ data: settings, error: null }).mockResolvedValueOnce({ data: null, error: null })
  expect(await loadNotificationSettings()).toEqual(settings)
  await saveNotificationPreferences({ announcements: true, ticket_reminders: false })
  expect(request).toHaveBeenLastCalledWith('set_notification_preferences', { announcements: true, ticket_reminders: false })
})
test('errors distinguish failed reads and writes, safely expose codes, and hide raw details', async () => {
  request.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'private-value@example.test' } })
  let failure: unknown
  try { await loadNotificationSettings() } catch (error) { failure = error }
  const readError = notificationError(failure)
  expect(readError).toContain('알림 설정 조회:')
  expect(readError).toContain('PGRST202')
  expect(readError).not.toContain('private-value@example.test')
  request.mockResolvedValueOnce({ data: null, error: { code: '42702', message: 'sensitive SQL details' } })
  try { await saveNotificationPreferences({ announcements: true, ticket_reminders: true }) } catch (error) { failure = error }
  expect(notificationError(failure)).toContain('수신 동의 저장:')
  expect(notificationError(failure)).toContain('42702')
  expect(notificationError(failure)).not.toContain('sensitive SQL details')
})
test('expired authentication, missing privilege and invalid payload provide actionable guidance', async () => {
  expect(notificationError({code:'PGRST301',message:'JWT expired'})).toContain('새 로그인 링크')
  expect(notificationError({code:'42501',message:'permission denied'})).toContain('DB 함수 권한')
  expect(notificationError({message:'TypeError: Failed to fetch'})).toContain('네트워크')
  request.mockResolvedValueOnce({data:null,error:null})
  let failure: unknown
  try { await loadNotificationSettings() } catch (error) { failure = error }
  expect(notificationError(failure)).toContain('INVALID_SETTINGS_RESPONSE')
})
