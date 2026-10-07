// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useAccountStorage } from '../src/useAccountStorage'

const api = vi.hoisted(() => ({ readAccount: vi.fn(), writeAccount: vi.fn() }))
vi.mock('../src/accountApi', () => api)
vi.mock('../src/useRealtime', () => ({ useRealtime: () => 'connected' }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }

test('failed writes keep the old list, double click is blocked, retry commits only after success', async () => {
  api.readAccount.mockResolvedValue({ bands: [], schedules: [] })
  const { result } = renderHook(() => useAccountStorage('a'))
  await waitFor(() => expect(result.current.loading).toBe(false))
  api.writeAccount.mockRejectedValueOnce(new Error('offline'))
  await act(() => result.current.toggle('bands', 'band'))
  expect(result.current.bands).toEqual([])
  const write = deferred<void>()
  api.writeAccount.mockReturnValueOnce(write.promise)
  let operation!: Promise<boolean | undefined>
  act(() => { operation = result.current.toggle('bands', 'band') })
  await act(() => result.current.toggle('bands', 'band'))
  expect(api.writeAccount).toHaveBeenCalledTimes(2)
  expect(result.current.bands).toEqual([])
  await act(async () => { write.resolve(); await operation })
  expect(result.current.bands).toEqual(['band'])
  expect(result.current.pending).toEqual([])
})
test('changing accounts hides previous rows and ignores a late write', async () => {
  api.readAccount.mockResolvedValueOnce({ bands: ['a-band'], schedules: ['a-ticket'] }).mockResolvedValueOnce({ bands: ['b-band'], schedules: [] })
  const { result, rerender } = renderHook(({ user }) => useAccountStorage(user), { initialProps: { user: 'a' as string | null } })
  await waitFor(() => expect(result.current.bands).toEqual(['a-band']))
  const write = deferred<void>()
  api.writeAccount.mockReturnValueOnce(write.promise)
  let operation!: Promise<boolean | undefined>
  act(() => { operation = result.current.toggle('bands', 'late') })
  rerender({ user: 'b' })
  expect(result.current.bands).not.toContain('a-band')
  await waitFor(() => expect(result.current.bands).toEqual(['b-band']))
  await act(async () => { write.resolve(); expect(await operation).toBeUndefined() })
  expect(result.current.bands).toEqual(['b-band'])
  rerender({ user: null })
  expect(result.current.bands).toEqual([])
  expect(result.current.schedules).toEqual([])
})
test('late read from A cannot overwrite B, read failures block writes until reload', async () => {
  const a = deferred<{ bands: string[]; schedules: string[] }>()
  api.readAccount.mockReturnValueOnce(a.promise).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ bands: [], schedules: ['b-ticket'] })
  const { result, rerender } = renderHook(({ user }) => useAccountStorage(user), { initialProps: { user: 'a' } })
  rerender({ user: 'b' })
  await waitFor(() => expect(result.current.error).toContain('불러오지 못했습니다'))
  await act(() => result.current.toggle('schedules', 'new'))
  expect(api.writeAccount).not.toHaveBeenCalled()
  await act(async () => a.resolve({ bands: ['private-a'], schedules: [] }))
  expect(result.current.bands).toEqual([])
  act(() => result.current.reload())
  await waitFor(() => expect(result.current.schedules).toEqual(['b-ticket']))
})
