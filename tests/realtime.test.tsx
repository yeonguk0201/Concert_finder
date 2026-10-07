// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useRealtime } from '../src/useRealtime'
import { useAccountStorage } from '../src/useAccountStorage'
const mock = vi.hoisted(() => ({ channels: [] as { event?: () => void; status?: (s: string) => void; filter?: unknown }[], remove: vi.fn(), read: vi.fn(), write: vi.fn() }))
vi.mock('../src/backend', () => ({ backend: {
  channel: () => { const item: typeof mock.channels[number] = {}; mock.channels.push(item); const channel = { on: (_type: string, filter: unknown, event: () => void) => { item.event = event; item.filter = filter; return channel }, subscribe: (status: (s: string) => void) => { item.status = status; return channel } }; return channel }, removeChannel: mock.remove,
} }))
vi.mock('../src/accountApi', () => ({ readAccount: mock.read, writeAccount: mock.write }))
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); mock.channels.length = 0 })
test('realtime coalesces events, catches reconnect/online gaps and cleans owner subscriptions', () => {
  vi.useFakeTimers()
  const refresh = vi.fn()
  const { rerender, unmount } = renderHook(({ owner }) => useRealtime('account_signals', owner, refresh), { initialProps: { owner: 'a' } })
  expect(mock.channels[0].filter).toMatchObject({ filter: 'user_id=eq.a' })
  act(() => { mock.channels[0].event!(); mock.channels[0].event!(); vi.advanceTimersByTime(150) })
  expect(refresh).toHaveBeenCalledTimes(1)
  act(() => { mock.channels[0].status!('SUBSCRIBED'); vi.advanceTimersByTime(150) })
  act(() => { window.dispatchEvent(new Event('online')); vi.advanceTimersByTime(150) })
  expect(refresh).toHaveBeenCalledTimes(3)
  rerender({ owner: 'b' })
  expect(mock.remove).toHaveBeenCalledTimes(1)
  act(() => { mock.channels[0].event!(); vi.advanceTimersByTime(150) })
  expect(refresh).toHaveBeenCalledTimes(3)
  unmount(); expect(mock.remove).toHaveBeenCalledTimes(2)
})
test('account invalidation during a pending write reconciles after completion without losing the write', async () => {
  mock.read.mockResolvedValueOnce({ bands: [], schedules: [] }).mockResolvedValueOnce({ bands: ['local', 'remote'], schedules: [] })
  let done!: () => void
  mock.write.mockReturnValue(new Promise<void>(resolve => { done = resolve }))
  const { result } = renderHook(() => useAccountStorage('a'))
  await waitFor(() => expect(result.current.loading).toBe(false))
  let operation!: Promise<boolean | undefined>
  act(() => { operation = result.current.toggle('bands', 'local') })
  act(() => mock.channels[0].event!())
  await new Promise(resolve => setTimeout(resolve, 200))
  expect(mock.read).toHaveBeenCalledTimes(1)
  await act(async () => { done(); await operation })
  await waitFor(() => expect(result.current.bands).toEqual(['local', 'remote']))
  expect(result.current.pending).toEqual([])
})
