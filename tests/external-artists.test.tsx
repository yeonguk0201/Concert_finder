// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ExternalArtistResults } from '../src/ExternalArtistResults'

const mock = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('../src/backend', () => ({ backend: { functions: { invoke: mock.invoke } } }))
const artist = { key: 'mb:first-id', name: 'FLOW', country: 'JP', aliases: ['フロウ'], evidence: 'https://musicbrainz.org/artist/first-id', disambiguation: 'Japanese rock band', type: 'Group' }
const band = { id: 'new-band', name: 'FLOW', country_code: 'JP', aliases: ['フロウ'], description: '장르 미검수' }
const props = { query: 'FLOW', userId: 'user-a', disabled: false, onLogin: vi.fn(), onSelected: vi.fn() }
afterEach(() => { cleanup(); vi.resetAllMocks() })

test('debounced public search distinguishes namesakes and imports only the selected ID', async () => {
  mock.invoke.mockResolvedValueOnce({ data: { artists: [artist, { ...artist, key: 'mb:second-id', country: 'GB', disambiguation: 'British band' }] } }).mockResolvedValueOnce({ data: { band_id: band.id, band } })
  props.onSelected.mockResolvedValue(undefined)
  render(<ExternalArtistResults {...props} />)
  expect(mock.invoke).not.toHaveBeenCalled()
  await screen.findByText('British band')
  expect(props.onSelected).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'FLOW (GB · British band) 등록하고 찜하기' }))
  await waitFor(() => expect(props.onSelected).toHaveBeenCalledWith(band))
  expect(mock.invoke).toHaveBeenLastCalledWith('artist-search', { body: { action: 'import', id: 'second-id' } })
  await screen.findByText('찜 완료')
})

test('visitors can search and are sent to login before registration', async () => {
  mock.invoke.mockResolvedValue({ data: { artists: [artist] } })
  render(<ExternalArtistResults {...props} userId={null} />)
  fireEvent.click(await screen.findByRole('button', { name: /FLOW .*등록하고 찜하기/ }))
  expect(props.onLogin).toHaveBeenCalledOnce()
  expect(mock.invoke).toHaveBeenCalledTimes(1)
  expect(props.onSelected).not.toHaveBeenCalled()
})

test('old query results never replace the current search', async () => {
  let resolveOld!: (value: unknown) => void
  mock.invoke.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce({ data: { artists: [{ ...artist, name: 'New artist' }] } })
  const view = render(<ExternalArtistResults {...props} />)
  await waitFor(() => expect(mock.invoke).toHaveBeenCalledOnce())
  view.rerender(<ExternalArtistResults {...props} query="New" />)
  await screen.findByText('New artist')
  resolveOld({ data: { artists: [artist] } })
  await waitFor(() => expect(screen.queryByText('FLOW')).toBeNull())
})

test('repeated normalized searches reuse public results without another request', async () => {
  mock.invoke.mockResolvedValue({ data: { artists: [artist] } })
  const view = render(<ExternalArtistResults {...props} />)
  await screen.findByText('FLOW')
  view.rerender(<ExternalArtistResults {...props} query="F" />)
  view.rerender(<ExternalArtistResults {...props} query="flow" />)
  await screen.findByText('FLOW')
  expect(mock.invoke).toHaveBeenCalledOnce()
})

test('account changes during registration prevent following for the new account', async () => {
  let resolveImport!: (value: unknown) => void
  mock.invoke.mockResolvedValueOnce({ data: { artists: [artist] } }).mockImplementationOnce(() => new Promise(resolve => { resolveImport = resolve }))
  const view = render(<ExternalArtistResults {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: /FLOW .*등록하고 찜하기/ }))
  view.rerender(<ExternalArtistResults {...props} userId="user-b" />)
  resolveImport({ data: { band_id: band.id, band } })
  await waitFor(() => expect(screen.queryByText('저장 중…')).toBeNull())
  expect(props.onSelected).not.toHaveBeenCalled()
})

test('follow failures stay retryable without reporting a successful save', async () => {
  mock.invoke.mockResolvedValueOnce({ data: { artists: [artist] } }).mockResolvedValue({ data: { band_id: band.id, band } })
  props.onSelected.mockRejectedValueOnce(new Error('SAVE_FAILED')).mockResolvedValueOnce(undefined)
  render(<ExternalArtistResults {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: /FLOW .*등록하고 찜하기/ }))
  expect((await screen.findByRole('alert')).textContent).toContain('찜을 저장하지 못했습니다')
  expect(screen.queryByText('찜 완료')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /FLOW .*등록하고 찜하기/ }))
  await screen.findByText('찜 완료')
})

test('empty search, provider errors, and unknown country have explicit states', async () => {
  const view = render(<ExternalArtistResults {...props} query="F" />)
  expect(screen.getByText('두 글자 이상 입력해 주세요.')).toBeTruthy()
  expect(mock.invoke).not.toHaveBeenCalled()
  mock.invoke.mockResolvedValueOnce({ error: { context: { json: async () => ({ error: 'SEARCH_BUSY' }) } } }).mockResolvedValueOnce({ data: { artists: [{ ...artist, country: null }] } })
  view.rerender(<ExternalArtistResults {...props} />)
  expect((await screen.findByRole('alert')).textContent).toContain('다른 검색')
  fireEvent.click(screen.getByRole('button', { name: '다시 검색' }))
  const button = await screen.findByRole('button', { name: /FLOW .*등록하고 찜하기/ })
  expect((button as HTMLButtonElement).disabled).toBe(true)
})
