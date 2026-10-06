// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { AdminPanel } from '../src/AdminPanel'
import { emptyConcert, kstInput, kstTimestamp } from '../src/adminApi'
import { useAdminAccess } from '../src/useAdminAccess'

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), band: vi.fn(), rpc: vi.fn() }))
vi.mock('../src/backend', () => ({ backend: { rpc: mocks.rpc } }))
vi.mock('../src/adminApi', async importOriginal => ({ ...await importOriginal<typeof import('../src/adminApi')>(), loadAdminCatalog: mocks.load, saveAdminConcert: mocks.save, saveAdminBand: mocks.band }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

test('KST input preserves unknown times and exact timezone conversion', () => {
  expect(kstInput(null)).toBe('')
  expect(kstTimestamp('')).toBeNull()
  expect(kstInput('2026-11-01T01:00:00Z')).toBe('2026-11-01T10:00')
  expect(kstTimestamp('2026-11-01T10:00')).toBe('2026-11-01T01:00:00.000Z')
})
test('admin editor retains edits after failure and saves server version after retry', async () => {
  const initial = { ...emptyConcert(), id: 'show', title: 'Original', updated_at: 'v1' }
  mocks.load.mockResolvedValueOnce({ concerts: [initial], bands: [], history: [] }).mockResolvedValueOnce({ concerts: [{ ...initial, title: 'Updated', updated_at: 'v2' }], bands: [], history: [] })
  mocks.save.mockRejectedValueOnce({ message: 'EDIT_CONFLICT' }).mockResolvedValueOnce('show')
  const onSaved = vi.fn()
  render(<AdminPanel onSaved={onSaved} />)
  fireEvent.click(await screen.findByRole('button', { name: /Original/ }))
  fireEvent.change(screen.getByLabelText('공연 제목'), { target: { value: 'Updated' } })
  fireEvent.click(screen.getByRole('button', { name: '초안 상태로 저장' }))
  await screen.findByText(/다른 관리자가 수정했습니다/)
  expect((screen.getByLabelText('공연 제목') as HTMLInputElement).value).toBe('Updated')
  expect(onSaved).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '초안 상태로 저장' }))
  await screen.findByText('초안 상태로 저장했습니다.')
  expect(onSaved).toHaveBeenCalledOnce()
  expect(mocks.save.mock.calls[1][0].updated_at).toBe('v1')
})
test('switching accounts hides admin access immediately and ignores late responses', async () => {
  let resolveA!: (value: unknown) => void
  mocks.rpc.mockReturnValueOnce(new Promise(resolve => { resolveA = resolve })).mockResolvedValueOnce({ data: false, error: null })
  const { result, rerender } = renderHook(({ id }) => useAdminAccess(id), { initialProps: { id: 'A' as string | null } })
  rerender({ id: 'B' })
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2))
  resolveA({ data: true, error: null })
  await waitFor(() => expect(result.current.allowed).toBe(false))
  rerender({ id: null })
  expect(result.current.allowed).toBe(false)
})

test('committed save with failed refresh requires reloading before another save', async () => {
  const initial = { ...emptyConcert(), id: 'show', title: 'Original', updated_at: 'v1' }
  const updated = { ...initial, title: 'Updated', updated_at: 'v2' }
  mocks.load.mockResolvedValue({ concerts: [updated], bands: [], history: [] }).mockResolvedValueOnce({ concerts: [initial], bands: [], history: [] }).mockRejectedValueOnce(new Error('network'))
  mocks.save.mockResolvedValue('show')
  render(<AdminPanel onSaved={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: /Original/ }))
  fireEvent.change(screen.getByLabelText('공연 제목'), { target: { value: 'Updated' } })
  fireEvent.click(screen.getByRole('button', { name: '초안 상태로 저장' }))
  await screen.findByText('저장했지만 최신 목록을 확인하지 못했습니다. 목록을 다시 불러와 주세요.')
  expect((screen.getByRole('button', { name: '초안 상태로 저장' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '목록 다시 불러오기' }))
  await waitFor(() => expect((screen.getByRole('button', { name: '초안 상태로 저장' }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: '초안 상태로 저장' }))
  await waitFor(() => expect(mocks.save.mock.calls[1][0].updated_at).toBe('v2'))
})
