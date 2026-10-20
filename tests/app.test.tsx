// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from '../src/App'
import { mapBands, mapConcerts } from '../src/catalog'

const mocks = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  toggle: vi.fn(), reload: vi.fn(), addBand: vi.fn(), invoke: vi.fn(), requestLink: vi.fn(), verifyCode: vi.fn(), pendingEmail: '',
  adminAllowed: false, catalogLoading: false, catalogInitialized: true,
  bands: [] as unknown[], concerts: [] as unknown[], follows: [] as string[], saves: [] as string[],
}))
vi.mock('../src/backend', () => ({ accountMode: true, backend: { functions: { invoke: mocks.invoke } }, configurationError: '' }))
vi.mock('../src/useAuth', () => ({ useAuth: () => ({ session: mocks.session, loading: false, error: '', busy: false, message: '', pendingEmail: mocks.pendingEmail, requestLink: mocks.requestLink, verifyCode: mocks.verifyCode, signOut: vi.fn() }) }))
vi.mock('../src/useCatalog', () => ({ useCatalog: () => ({ bands: mocks.bands, concerts: mocks.concerts, loading: mocks.catalogLoading, initialized: mocks.catalogInitialized, error: '', reload: mocks.reload, addBand: mocks.addBand }) }))
vi.mock('../src/useAccountStorage', () => ({ useAccountStorage: () => ({ bands: mocks.follows, schedules: mocks.saves, loading: false, error: '', pending: [], toggle: mocks.toggle, reload: mocks.reload }) }))
vi.mock('../src/useAdminAccess', () => ({ useAdminAccess: () => ({ allowed: mocks.adminAllowed, error: '', reload: vi.fn() }) }))
vi.mock('../src/AdminPanel', () => ({ AdminPanel: () => <section aria-label="관리자 공연 검수">관리자 편집기</section> }))
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  Element.prototype.scrollIntoView = vi.fn()
  window.scrollTo = vi.fn()
  mocks.bands = mapBands([{ id: 'real-band', name: 'Verified band', country_code: 'GB', aliases: [], description: null }])
  mocks.concerts = mapConcerts([{ id: 'real-concert', title: 'Verified concert', format: 'solo', city: '서울', venue: null, starts_on: '2026-12-12', ends_on: null, announced_on: '2026-10-06', cancelled: false,
    concert_bands: [{ band_id: 'real-band' }], ticket_schedules: { id: 'real-ticket', opens_at: null, price_description: null, booking_url: null }, concert_sources: [] }], mocks.bands as ReturnType<typeof mapBands>)
  mocks.session = null; mocks.follows = []; mocks.saves = []
  mocks.pendingEmail = ''; mocks.requestLink.mockResolvedValue(undefined); mocks.verifyCode.mockResolvedValue(undefined)
  mocks.adminAllowed = false; mocks.catalogLoading = false; mocks.catalogInitialized = true
  localStorage.setItem('encore.bands', '["oasis"]'); localStorage.setItem('encore.saved', '["oasis-seoul"]')
  history.replaceState(null, '', '/')
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

test('ordinary search stays in the approved DB catalog', () => {
  mocks.concerts = []
  render(<App />)
  fireEvent.change(screen.getByLabelText('밴드 또는 공연 검색'), {target:{value:'Unknown artist'}})
  fireEvent.submit(screen.getByRole('search'))
  expect(screen.queryByRole('region',{name:'외부 아티스트 검색 결과'})).toBeNull()
  expect(screen.queryByRole('button',{name:'관리자 아티스트 검색·가져오기'})).toBeNull()
  expect(mocks.invoke).not.toHaveBeenCalled()
})
test('administrators can open the protected import editor from empty search', () => {
  mocks.session = {user:{id:'admin',email:'admin@example.test'}}
  mocks.adminAllowed = true
  render(<App />)
  fireEvent.change(screen.getByLabelText('밴드 또는 공연 검색'), {target:{value:'Unknown'}})
  fireEvent.submit(screen.getByRole('search'))
  fireEvent.click(screen.getByRole('button',{name:'관리자 아티스트 검색·가져오기'}))
  expect(screen.getByText('관리자 편집기')).toBeTruthy()
  expect(mocks.invoke).not.toHaveBeenCalled()
})

test('home discovers upcoming domestic performances as well as overseas bands', () => {
  mocks.bands = mapBands([{id:'kr',name:'국내 밴드',country_code:'KR',aliases:[],description:'록'}])
  mocks.concerts = [{ ...(mocks.concerts[0] as ReturnType<typeof mapConcerts>[0]), title:'국내 밴드 공연', bandIds:['kr'], type:'국내' }]
  render(<App />)
  expect(screen.getByRole('button',{name:'국내 밴드 공연 상세 보기'})).toBeTruthy()
  expect(screen.getByText('다음 공연은 여기서')).toBeTruthy()
})

test('settings and admin editors stay out of the feed, including after account changes', () => {
  const view = render(<App />)
  mocks.session = { user: { id: 'admin-account', email: 'admin@example.test' } }
  view.rerender(<App />)
  mocks.adminAllowed = true
  view.rerender(<App />)
  expect(screen.queryByRole('region', { name: '공연 알림 설정' })).toBeNull()
  expect(screen.queryByRole('button', { name: '관리자 공연 검수' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '알림·계정 설정' }))
  for (let i = 0; i < 3; i++) {
    expect(screen.getAllByRole('region', { name: '공연 알림 설정' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '관리자 공연 검수' }))
    expect(screen.queryByRole('region', { name: '공연 알림 설정' })).toBeNull()
    expect(screen.getByText('관리자 편집기')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '알림·계정 설정으로 돌아가기' }))
    view.rerender(<App />)
  }
  mocks.session = { user: { id: 'other-account', email: 'other@example.test' } }
  mocks.adminAllowed = false
  view.rerender(<App />)
  expect(screen.getAllByRole('region', { name: '공연 알림 설정' })).toHaveLength(1)
  mocks.session = null
  view.rerender(<App />)
  expect(screen.queryByRole('region', { name: '공연 알림 설정' })).toBeNull()
})

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
  fireEvent.submit(screen.getByRole('search'))
  fireEvent.click(screen.getByRole('button', { name: 'Only band 찜하기' }))
  await waitFor(() => expect(mocks.toggle).toHaveBeenCalledWith('bands', 'only-band'))
  fireEvent.click(screen.getAllByRole('button', { name: /찜한 아티스트/ })[0])
  fireEvent.click(screen.getByRole('button', { name: '검색 열기' }))
  fireEvent.change(screen.getByLabelText('밴드 또는 공연 검색'), { target: { value: '없는 이름' } })
  fireEvent.submit(screen.getByRole('search'))
  expect(screen.getByRole('heading', { name: '“없는 이름” 검색 결과' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Only band 찜하기' })).toBeNull()
  fireEvent.change(screen.getByLabelText('밴드 또는 공연 검색'), { target: { value: '' } })
  fireEvent.submit(screen.getByRole('search'))
  expect(screen.getByRole('button', { name: 'Only band 찜하기' })).toBeTruthy()
})
test('an empty followed list points to artist search', () => {
  mocks.bands = []; mocks.concerts = []
  history.replaceState(null, '', '/?page=bands')
  render(<App />)
  expect(screen.getByRole('heading', { name: '처음으로 찜할 아티스트는 누구인가요?' })).toBeTruthy()
})
test('account mode excludes local samples and login prompt keeps the original event URL', async () => {
  render(<App />)
  expect(document.querySelector('.demo-notice')).toBeNull()
  expect(screen.queryByText('Oasis')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Verified concert 상세 보기' }))
  await waitFor(() => expect(document.querySelector('.flow-detail')).toBeTruthy())
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

test('search has an explicit result page, resets stale filters and restores its query from the URL', () => {
  history.replaceState(null, '', '/?page=search&q=Verified')
  const view = render(<App />)
  expect((screen.getByLabelText('밴드 또는 공연 검색') as HTMLInputElement).value).toBe('Verified')
  expect(screen.getByRole('heading', { name: '“Verified” 검색 결과' })).toBeTruthy()
  fireEvent.click(screen.getAllByRole('button', { name: '공연 둘러보기', exact: true })[0])
  fireEvent.click(screen.getByRole('button', { name: '국내', exact: true }))
  expect(screen.queryByRole('button', { name: 'Verified concert 상세 보기' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '검색 열기' }))
  fireEvent.change(screen.getByLabelText('밴드 또는 공연 검색'), { target: { value: 'band' } })
  fireEvent.submit(screen.getByRole('search'))
  expect(screen.getAllByRole('button', { name: 'Verified band 찜하기' }).length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: 'Verified concert 상세 보기' })).toBeTruthy()
  expect(location.search).toBe('?page=search&q=band')
  fireEvent.submit(screen.getByRole('search'))
  expect(screen.getByRole('heading', { name: '“band” 검색 결과' })).toBeTruthy()
  view.unmount()
  render(<App />)
  expect((screen.getByLabelText('밴드 또는 공연 검색') as HTMLInputElement).value).toBe('band')
})


test('followed artists excludes unfollowed artists and updates after unfollowing', () => {
  mocks.bands = mapBands([
    {id:'followed',name:'Followed artist',country_code:'GB',aliases:[],description:null},
    {id:'other',name:'Unfollowed artist',country_code:'JP',aliases:[],description:null},
  ])
  mocks.follows = ['followed']
  history.replaceState(null, '', '/?page=bands')
  const view = render(<App />)
  expect(screen.getByRole('heading',{name:'Followed artist'})).toBeTruthy()
  expect(screen.queryByRole('heading',{name:'Unfollowed artist'})).toBeNull()
  mocks.follows = []
  view.rerender(<App />)
  expect(screen.queryByRole('heading',{name:'Followed artist'})).toBeNull()
  expect(screen.getByText('처음으로 찜할 아티스트는 누구인가요?')).toBeTruthy()
})

test('a visible login button opens the email form directly', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button',{name:'로그인',exact:true}))
  expect(screen.getByLabelText('이메일')).toBeTruthy()
  expect(screen.getByRole('dialog').hasAttribute('open')).toBe(true)
  expect(new URLSearchParams(location.search).get('page')).not.toBe('settings')
})

test('background catalog refresh preserves content without inserting a loading row', () => {
  mocks.catalogLoading = true; mocks.catalogInitialized = false
  const view = render(<App />)
  expect(screen.getByText('공연 정보를 불러오는 중…')).toBeTruthy()
  mocks.catalogInitialized = true
  view.rerender(<App />)
  expect(screen.queryByText('공연 정보를 불러오는 중…')).toBeNull()
  expect(screen.getByRole('button',{name:'Verified concert 상세 보기'})).toBeTruthy()
})

test('concert discovery contains only concerts and artist identity opens a deep-linkable detail', async () => {
  history.replaceState(null, '', '/?page=discover')
  render(<App />)
  expect(screen.queryByRole('button', { name: 'Verified band 아티스트 상세' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Verified concert 상세 보기' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Verified band 아티스트 상세' }))
  expect(screen.getByRole('heading', { name: '아티스트 소개' })).toBeTruthy()
  expect(new URLSearchParams(location.search).get('artist')).toBe('real-band')
  fireEvent.click(screen.getByRole('button', { name: '더보기', exact: true }))
  expect(screen.getByRole('button', { name: '접기' }).getAttribute('aria-expanded')).toBe('true')
  expect(screen.getAllByRole('link', { name: /더보기, YouTube 새 탭/ })).toHaveLength(2)
})

test('selected calendar date filters ticket opens in KST and recommends at most three performances', () => {
  mocks.session = { user: { id: 'account', email: 'account@example.test' } }
  const base = mocks.concerts[0] as ReturnType<typeof mapConcerts>[0]
  mocks.concerts = Array.from({ length: 4 }, (_, i) => ({ ...base, id: `concert-${i}`, title: `Concert ${i}`, date: '2026-10-24', ticketScheduleId: `ticket-${i}`, ticketAt: '2026-10-22T15:00:00Z' }))
  mocks.saves = ['ticket-0']
  history.replaceState(null, '', '/?page=saved')
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: '2026년 10월 23일 예매 일정 있음' }))
  expect(screen.getByRole('button', { name: 'Concert 0', exact: true })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '2026년 10월 24일 공연 있음' }))
  expect(screen.getAllByRole('button', { name: /Concert \d 상세 보기/ })).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: '이날 공연 4개 모두 보기' }))
  expect(new URLSearchParams(location.search).get('date')).toBe('2026-10-24')
  expect(screen.getAllByRole('button', { name: /Concert \d 상세 보기/ })).toHaveLength(4)
})

test('browser back restores search and artist context', () => {
  render(<App />)
  fireEvent.change(screen.getByLabelText('밴드 또는 공연 검색'), { target: { value: 'Verified' } })
  fireEvent.submit(screen.getByRole('search'))
  fireEvent.click(screen.getByRole('button', { name: 'Verified band 아티스트 상세' }))
  expect(screen.getByRole('heading', { name: '아티스트 소개' })).toBeTruthy()
  history.replaceState(null, '', '/?page=search&q=Verified')
  fireEvent.popState(window)
  expect(screen.getByRole('heading', { name: '“Verified” 검색 결과' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: '아티스트 소개' })).toBeNull()
})

test('approved login modal sends the real auth request and verifies the returned code', async () => {
  const view = render(<App />)
  fireEvent.click(screen.getByRole('button', { name: '로그인', exact: true }))
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'listener@example.test' } })
  fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
  await waitFor(() => expect(mocks.requestLink).toHaveBeenCalledWith('listener@example.test'))
  mocks.pendingEmail = 'listener@example.test'
  view.rerender(<App />)
  fireEvent.change(screen.getByLabelText('이메일 인증번호'), { target: { value: '123456' } })
  fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
  await waitFor(() => expect(mocks.verifyCode).toHaveBeenCalledWith('123456'))
  mocks.session = { user: { id: 'listener', email: 'listener@example.test' } }
  view.rerender(<App />)
  expect(document.querySelector('.flow-login')?.hasAttribute('open')).toBe(false)
})

test('production feed contains approved layout and no beta or background sync copy', () => {
  render(<App />)
  expect(document.querySelector('.poster-hero .hero-copy')).toBeTruthy()
  expect(document.querySelector('.combined-layout .combined-calendar')).toBeTruthy()
  expect(document.querySelector('.artist-item .artist-add')).toBeTruthy()
  expect(screen.queryByText(/베타 검증 중|공연 정보 · 실시간 연결됨|계정 저장 · 실시간 연결됨/)).toBeNull()
  expect(document.querySelector('.catalog-sync,.account-sync,.service-app')).toBeNull()
})

test('home search keeps the input mounted while typing and navigates on submit, like the approved design', () => {
  render(<App />)
  const input = screen.getByLabelText('밴드 또는 공연 검색')
  fireEvent.change(input, { target: { value: 'V' } })
  expect(document.querySelector('.poster-hero')).toBeTruthy()
  expect(screen.getByLabelText('밴드 또는 공연 검색')).toBe(input)
  fireEvent.change(input, { target: { value: 'Verified' } })
  fireEvent.submit(screen.getByRole('search'))
  expect(screen.getByRole('heading', { name: '“Verified” 검색 결과' })).toBeTruthy()
})

test('artist cards omit country and review metadata while the biography placeholder remains available', () => {
  mocks.bands = mapBands([{ id:'real-band', name:'Verified band', country_code:'JP', aliases:['Other name'], description:'장르 미검수' }])
  render(<App />)
  const cards = document.querySelector('.artist-list')!
  expect(cards.textContent).not.toContain('일본')
  expect(cards.textContent).not.toContain('장르 미검수')
  fireEvent.click(screen.getByRole('button', {name:'Verified band 아티스트 상세'}))
  expect(document.querySelector('#artist-bio')?.textContent).toContain('다른 이름: Other name')
  expect(document.querySelector('#artist-bio')?.textContent).toContain('공식 채널에서 음악과 최근 소식을 만나보세요.')
  expect(document.querySelector('.artist-live-summary')?.textContent).toContain('예정된 공연 1개')
  expect(document.querySelector('.artist-banner')?.textContent).not.toContain('장르 미검수')
  expect(document.querySelector('.artist-banner')?.textContent).not.toContain('음악에서 발견하고, 라이브에서 만나요.')
})
