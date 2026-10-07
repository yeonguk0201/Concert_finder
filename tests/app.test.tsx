// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from '../src/App'
import { mapBands, mapConcerts } from '../src/catalog'

const mocks = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  toggle: vi.fn(), reload: vi.fn(),
  bands: [] as unknown[], concerts: [] as unknown[], follows: [] as string[], saves: [] as string[],
}))
vi.mock('../src/backend', () => ({ accountMode: true, backend: {}, configurationError: '' }))
vi.mock('../src/useAuth', () => ({ useAuth: () => ({ session: mocks.session, loading: false, error: '', busy: false, message: '', requestLink: vi.fn(), signOut: vi.fn() }) }))
vi.mock('../src/useCatalog', () => ({ useCatalog: () => ({ bands: mocks.bands, concerts: mocks.concerts, loading: false, error: '', reload: mocks.reload }) }))
vi.mock('../src/useAccountStorage', () => ({ useAccountStorage: () => ({ bands: mocks.follows, schedules: mocks.saves, loading: false, error: '', pending: [], toggle: mocks.toggle, reload: mocks.reload }) }))
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  Element.prototype.scrollIntoView = vi.fn()
  mocks.bands = mapBands([{ id: 'real-band', name: 'Verified band', country_code: 'GB', aliases: [], description: null }])
  mocks.concerts = mapConcerts([{ id: 'real-concert', title: 'Verified concert', format: 'solo', city: '서울', venue: null, starts_on: '2026-12-12', ends_on: null, announced_on: '2026-10-06', cancelled: false,
    concert_bands: [{ band_id: 'real-band' }], ticket_schedules: { id: 'real-ticket', opens_at: null, price_description: null, booking_url: null }, concert_sources: [] }], mocks.bands as ReturnType<typeof mapBands>)
  mocks.session = null; mocks.follows = []; mocks.saves = []
  localStorage.setItem('encore.bands', '["oasis"]'); localStorage.setItem('encore.saved', '["oasis-seoul"]')
  history.replaceState(null, '', '/')
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

test('notification deep link explains unavailable or withdrawn concert', () => {
  history.replaceState(null, '', '/?page=discover&event=removed-concert')
  render(<App />)
  expect(screen.getByText('이 공연 정보는 삭제되었거나 공개가 중단되었습니다.')).toBeTruthy()
})
test('direct admin URL does not expose an editor to an unsigned user', () => {
  history.replaceState(null, '', '/?page=admin')
  render(<App />)
  expect(screen.getByText('로그인된 관리자만 공연을 등록·검수할 수 있습니다.')).toBeTruthy()
  expect(screen.queryByLabelText('관리자 공연 검수')).toBeNull()
})
test('failed schedule save shows failure without success and permits a retry', async () => {
  mocks.session = { user: { id: 'account', email: 'account@example.test' } }
  mocks.toggle.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Verified concert 상세 보기' }))
  const button = await screen.findByRole('button', { name: '예매 일정 저장', exact: true })
  fireEvent.click(button)
  await waitFor(() => expect(screen.getByText('일정을 저장하지 못했습니다. 다시 시도해 주세요.')).toBeTruthy())
  expect(screen.queryByText('계정에 일정을 저장했어요. 알림 수신은 별도 동의·기기 등록이 필요합니다.')).toBeNull()
  expect((button as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(button)
  await waitFor(() => expect(screen.getByText('계정에 일정을 저장했어요. 알림 수신은 별도 동의·기기 등록이 필요합니다.')).toBeTruthy())
  expect(mocks.toggle).toHaveBeenCalledTimes(2)
})
test('an unknown opening time still allows saving the one-to-one ticket schedule', async () => {
  mocks.session = { user: { id: 'account', email: 'account@example.test' } }
  mocks.toggle.mockResolvedValue(true)
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Verified concert 상세 보기' }))
  const button = await screen.findByRole('button', { name: '예매 일정 저장', exact: true })
  expect((button as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(button)
  await waitFor(() => expect(mocks.toggle).toHaveBeenCalledWith('schedules', 'real-ticket'))
})
test('band search finds aliases and supports following without concerts', async () => {
  mocks.session = { user: { id: 'account', email: 'account@example.test' } }
  mocks.bands = mapBands([{ id: 'only-band', name: 'Only band', country_code: 'GB', aliases: ['공연 없는 밴드'], description: null }])
  mocks.concerts = []; mocks.toggle.mockResolvedValue(true)
  render(<App />)
  fireEvent.change(screen.getByLabelText('밴드 또는 공연 검색'), { target: { value: '공연 없는' } })
  fireEvent.click(screen.getByRole('button', { name: 'Only band 찜하기' }))
  await waitFor(() => expect(mocks.toggle).toHaveBeenCalledWith('bands', 'only-band'))
  fireEvent.click(screen.getAllByRole('button', { name: /찜한 밴드/ })[0])
  fireEvent.change(screen.getByLabelText('밴드 또는 공연 검색'), { target: { value: '없는 이름' } })
  expect(screen.getByRole('heading', { name: '좋아하는 밴드를 찜하세요.' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Only band 찜하기' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '검색 지우기' }))
  expect(screen.getByRole('button', { name: 'Only band 찜하기' })).toBeTruthy()
})
test('empty catalog explains why bands cannot be followed', () => {
  mocks.bands = []; mocks.concerts = []
  history.replaceState(null, '', '/?page=bands')
  render(<App />)
  expect(screen.getByRole('heading', { name: '등록된 밴드가 아직 없어요.' })).toBeTruthy()
})
test('account mode excludes local samples and login prompt keeps the original event URL', async () => {
  render(<App />)
  expect(screen.queryByText(/가상 샘플/)).toBeNull()
  expect(screen.queryByText('Oasis')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Verified concert 상세 보기' }))
  await waitFor(() => expect(screen.getByRole('dialog').hasAttribute('open')).toBe(true))
  fireEvent.click(screen.getByRole('button', { name: '예매 일정 저장', exact: true }))
  await waitFor(() => expect(screen.getByLabelText('이메일')).toBeTruthy())
  expect(new URLSearchParams(location.search).get('event')).toBe('real-concert')
  expect(mocks.toggle).not.toHaveBeenCalled()
  expect(localStorage.getItem('encore.bands')).toBe('["oasis"]')
})
test('saved unknown times disable calendar, unavailable saves can still be deleted', async () => {
  mocks.session = { user: { id: 'account', email: 'account@example.test' } }
  mocks.saves = ['real-ticket', 'hidden-ticket']; mocks.toggle.mockResolvedValue(true)
  history.replaceState(null, '', '/?page=saved')
  render(<App />)
  expect(screen.getAllByRole('button', { name: '캘린더 저장' }).every(button => (button as HTMLButtonElement).disabled)).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '공개 중단 또는 삭제된 공연 저장한 일정 삭제' }))
  await waitFor(() => expect(mocks.toggle).toHaveBeenCalledWith('schedules', 'hidden-ticket'))
})
