// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ArtistReviewReadiness } from '../src/ArtistReviewReadiness'

const mock = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../src/backend', () => ({ backend: { rpc: mock.rpc } }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

test.each(['idle', 'ready', 'busy'])('admin sees %s work without claiming it or starting a model', async state => {
  mock.rpc.mockResolvedValue({ data: { current: { state, reason: state === 'ready' ? 'review_due' : 'no_work', eligible: state === 'ready' ? 10 : 0, notices: 0 }, lastCheckedAt: '2026-10-17T16:00:00Z', lastScheduled: null } })
  render(<ArtistReviewReadiness />)
  expect(mock.rpc).not.toHaveBeenCalled()
  const details = screen.getByText('검수 대기 확인 · 모델 자동 호출 없음').closest('details')!
  details.open = true; fireEvent(details, new Event('toggle'))
  await screen.findByText(state === 'ready' ? '수동 검수가 필요합니다.' : state === 'busy' ? '다른 검수가 진행 중입니다.' : '지금 배정할 검수 대상이 없습니다.')
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('admin_artist_review_readiness')
  expect(screen.queryByRole('button', { name: /검수 시작|모델 실행/ })).toBeNull()
})
test('failed reload clears the old actionable status and supports an explicit retry', async () => {
  mock.rpc.mockResolvedValueOnce({ data: { current: { state: 'ready', reason: 'lease_recovery', eligible: 0, notices: 0 }, lastCheckedAt: null, lastScheduled: null } })
    .mockResolvedValueOnce({ error: { message: 'ADMIN_REQUIRED' } })
  render(<ArtistReviewReadiness />)
  fireEvent.click(screen.getByRole('button', { name: '검수 대기 상태 조회' }))
  await screen.findByText('수동 검수가 필요합니다.')
  expect(screen.getByText(/이전 실행의 임대가 만료/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '검수 대기 상태 조회' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('alert').textContent).toBe('관리자 권한이 필요합니다.')
  expect(screen.queryByText('수동 검수가 필요합니다.')).toBeNull()
})
