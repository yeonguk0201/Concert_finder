// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ArtistReviewControl } from '../src/ArtistReviewControl'

const mock = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../src/backend', () => ({ backend: { rpc: mock.rpc } }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const paused = { name: '=LOVE', band_version: 'version-1', curation_status: 'unreviewed', target_enabled: true, can_resume: true,
  state: { outcome: 'action_required', checked_at: '2026-10-16T07:28:18.034883+00:00', error: 'YOUTUBE_ACTION_REQUIRED', genre_summary: null, channel_summary: null } }
async function open() {
  const details = screen.getByText('자동 검수 상태·재개').closest('details')!
  details.open = true
  fireEvent(details, new Event('toggle'))
  await screen.findByText(/관리자 확인 후 재개 필요/)
}
function confirm() {
  fireEvent.change(screen.getByLabelText('재개 사유 · 10자 이상'), { target: { value: 'Supabase 서버에 YouTube API 키를 등록하고 중단 원인을 확인했습니다.' } })
  fireEvent.click(screen.getByLabelText('중단 원인을 해결하고 최신 상태를 확인했습니다'))
}
test('lazy status read, confirmation, exact snapshot resume and success feedback', async () => {
  mock.rpc.mockResolvedValueOnce({ data: paused, error: null }).mockResolvedValue({ error: null })
  const onSaved = vi.fn()
  render(<ArtistReviewControl bandId="band" onSaved={onSaved} />)
  expect(mock.rpc).not.toHaveBeenCalled()
  await open()
  expect(mock.rpc).toHaveBeenCalledWith('admin_artist_review_status', { target_band_id: 'band' })
  expect(screen.getByText(/서버 YouTube API 키/)).toBeTruthy()
  expect((screen.getByRole('button', { name: '자동 검수 재개 요청' }) as HTMLButtonElement).disabled).toBe(true)
  confirm()
  fireEvent.click(screen.getByRole('button', { name: '자동 검수 재개 요청' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  expect(mock.rpc).toHaveBeenLastCalledWith('admin_resume_artist_review', {
    target_band_id: 'band', expected_version: paused.band_version, expected_checked_at: paused.state.checked_at,
    reason: 'Supabase 서버에 YouTube API 키를 등록하고 중단 원인을 확인했습니다.',
  })
  expect(onSaved.mock.calls[0][0]).toMatch(/다음 허용 실행/)
  expect(screen.queryByRole('button', { name: '자동 검수 재개 요청' })).toBeNull()
})
test('a conflict requires a fresh read and preserves the reason; stale retry is unavailable', async () => {
  mock.rpc.mockResolvedValueOnce({ data: paused }).mockResolvedValueOnce({ error: { message: 'EDIT_CONFLICT' } })
  const onSaved = vi.fn()
  render(<ArtistReviewControl bandId="band" onSaved={onSaved} />)
  await open(); confirm()
  fireEvent.click(screen.getByRole('button', { name: '자동 검수 재개 요청' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('alert').textContent).toMatch(/검수 상태를 다시 불러와/)
  expect(onSaved).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: '자동 검수 재개 요청' })).toBeNull()
  mock.rpc.mockResolvedValueOnce({ data: { ...paused, band_version: 'version-2' } })
  fireEvent.click(screen.getByRole('button', { name: '검수 상태 다시 불러오기' }))
  await screen.findByLabelText('재개 사유 · 10자 이상')
  expect((screen.getByLabelText('재개 사유 · 10자 이상') as HTMLTextAreaElement).value).toMatch(/YouTube API 키/)
  expect((screen.getByLabelText('중단 원인을 해결하고 최신 상태를 확인했습니다') as HTMLInputElement).checked).toBe(false)
})
test.each(['disabled', 'held', 'complete'])('blocked %s state never offers resume', async kind => {
  const data = kind === 'disabled' ? { ...paused, target_enabled: false, can_resume: false }
    : kind === 'held' ? { ...paused, curation_status: 'held', can_resume: false }
      : { ...paused, can_resume: false, state: { ...paused.state, outcome: 'complete' } }
  mock.rpc.mockResolvedValue({ data })
  render(<ArtistReviewControl bandId="band" onSaved={vi.fn()} />)
  const details = screen.getByText('자동 검수 상태·재개').closest('details')!
  details.open = true; fireEvent(details, new Event('toggle'))
  await waitFor(() => expect(mock.rpc).toHaveBeenCalledOnce())
  await screen.findByText(/=LOVE ·/)
  expect(screen.queryByRole('button', { name: '자동 검수 재개 요청' })).toBeNull()
})
test('an old request cannot update a different selected artist', async () => {
  let resolve!: (value: unknown) => void
  mock.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const onSaved = vi.fn()
  const view = render(<ArtistReviewControl key="first" bandId="first" onSaved={onSaved} />)
  const details = screen.getByText('자동 검수 상태·재개').closest('details')!
  details.open = true; fireEvent(details, new Event('toggle'))
  await waitFor(() => expect(mock.rpc).toHaveBeenCalledOnce())
  view.rerender(<ArtistReviewControl key="second" bandId="second" onSaved={onSaved} />)
  resolve({ data: paused })
  await waitFor(() => expect(screen.queryByText(/=LOVE ·/)).toBeNull())
  expect(onSaved).not.toHaveBeenCalled()
})
