// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { NotificationPanel } from '../src/NotificationPanel'
const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), register: vi.fn(), remove: vi.fn(), test: vi.fn() }))
vi.mock('../src/notificationApi', () => ({ loadNotificationSettings: api.load, saveNotificationPreferences: api.save,
  registerPushDevice: api.register, removePushDevice: api.remove, requestPushTest: api.test, pushSupported: () => true,
  notificationError: () => '처리 실패 · 다시 시도해 주세요.' }))
let settings: { preferences: { announcements: boolean; ticket_reminders: boolean }; devices: { id: string; label: string; active: boolean; updated_at: string }[] }
beforeEach(() => {
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY','test-key')
  settings = { preferences: { announcements: false, ticket_reminders: false }, devices: [] }
  api.load.mockImplementation(async () => structuredClone(settings))
  api.save.mockImplementation(async prefs => { settings.preferences = prefs })
})
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllEnvs() })
test('consent is opt-in, persists only after success and failures permit retry', async () => {
  render(<NotificationPanel userId="a" />)
  const checkbox=await screen.findByRole('checkbox',{name:'찜한 밴드의 신규 공개·페스티벌 라인업 추가'})
  expect((checkbox as HTMLInputElement).checked).toBe(false)
  api.save.mockRejectedValueOnce(new Error('offline'))
  fireEvent.click(checkbox)
  await screen.findByRole('alert')
  expect((checkbox as HTMLInputElement).checked).toBe(false)
  expect((checkbox.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(false)
  fireEvent.click(checkbox)
  await waitFor(() => expect((checkbox as HTMLInputElement).checked).toBe(true))
  expect(api.save).toHaveBeenLastCalledWith({announcements:true,ticket_reminders:false})
})
test('register, test and revoke use the correct account/device; request success is not receipt', async () => {
  settings.preferences.announcements=true
  api.register.mockImplementation(async () => { settings.devices=[{id:'device-a',label:'내 휴대폰',active:true,updated_at:''}] })
  api.remove.mockImplementation(async () => { settings.devices[0].active=false })
  api.test.mockResolvedValue(undefined)
  render(<NotificationPanel userId="a" />)
  await screen.findByRole('checkbox',{name:'저장한 예매 일정의 1시간 전 알림'})
  fireEvent.click(screen.getByRole('button',{name:'이 기기 알림 허용·등록'}))
  await screen.findByText('내 휴대폰 · 활성')
  expect(api.register).toHaveBeenCalledWith('a','내 휴대폰','test-key')
  fireEvent.click(screen.getByRole('button',{name:'테스트 알림 요청'}))
  await screen.findByText(/요청 성공은 실제 수신 확인과 다릅니다/)
  expect(api.test).toHaveBeenCalledWith('device-a')
  fireEvent.click(screen.getByRole('button',{name:'기기 해제'}))
  await screen.findByText('내 휴대폰 · 해제됨')
  expect(api.remove).toHaveBeenCalledWith('device-a')
})
test('a previous account response cannot overwrite a newly mounted account panel', async () => {
  let resolve!: (value: typeof settings) => void
  api.load.mockImplementationOnce(() => new Promise(r => { resolve=r }))
  const view=render(<NotificationPanel key="a" userId="a" />)
  await waitFor(() => expect(api.load).toHaveBeenCalledTimes(1))
  view.rerender(<NotificationPanel key="b" userId="b" />)
  await screen.findByRole('checkbox',{name:'저장한 예매 일정의 1시간 전 알림'})
  resolve({ preferences:{announcements:true,ticket_reminders:true},devices:[{id:'secret-a',label:'A 기기',active:true,updated_at:''}] })
  await waitFor(() => expect(screen.queryByText('A 기기 · 활성')).toBeNull())
  expect((screen.getByRole('checkbox',{name:'저장한 예매 일정의 1시간 전 알림'}) as HTMLInputElement).checked).toBe(false)
})
