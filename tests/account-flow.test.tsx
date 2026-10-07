// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useAccountStorage } from '../src/useAccountStorage'

const transport = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('../src/useRealtime', () => ({ useRealtime: () => 'connected' }))
vi.mock('../src/backend', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  return { backend: createClient('https://failure-probe.example.test', 'sb_publishable_local_test', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: transport.fetch },
  }) }
})
afterEach(() => { cleanup(); vi.resetAllMocks() })

test('SDK transport failures preserve schedules and allow save, delete and read recovery', async () => {
  const stored = new Set<string>()
  let offline = false
  transport.fetch.mockImplementation(async (url: string, init: RequestInit) => {
    if (offline) throw new TypeError('Failed to fetch')
    const path = new URL(url).pathname
    const method = init?.method ?? 'GET'
    if (method === 'POST') {
      const row = JSON.parse(init.body as string)
      expect(row.user_id).toBe('00000000-0000-0000-0000-000000000001')
      stored.add(row.ticket_schedule_id)
      return new Response(null, { status: 201 })
    }
    if (method === 'DELETE') {
      const id = new URL(url).searchParams.get('ticket_schedule_id')?.replace(/^eq\./, '')
      stored.delete(id!)
      return new Response(null, { status: 204 })
    }
    return new Response(JSON.stringify(path.endsWith('/saved_schedules')
      ? [...stored].map(id => ({ ticket_schedule_id: id })) : []),
    { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  const { result } = renderHook(() => useAccountStorage('00000000-0000-0000-0000-000000000001'))
  await waitFor(() => expect(result.current.loading).toBe(false))

  offline = true
  await act(async () => expect(await result.current.toggle('schedules', 'ticket')).toBe(false))
  expect(result.current.schedules).toEqual([])
  expect(stored.size).toBe(0)
  expect(result.current.pending).toEqual([])
  offline = false
  await act(async () => expect(await result.current.toggle('schedules', 'ticket')).toBe(true))
  expect(result.current.schedules).toEqual(['ticket'])
  expect([...stored]).toEqual(['ticket'])

  offline = true
  await act(async () => expect(await result.current.toggle('schedules', 'ticket')).toBe(false))
  expect(result.current.schedules).toEqual(['ticket'])
  expect([...stored]).toEqual(['ticket'])
  offline = false
  await act(async () => expect(await result.current.toggle('schedules', 'ticket')).toBe(true))
  expect(result.current.schedules).toEqual([])
  expect(stored.size).toBe(0)

  offline = true
  act(() => result.current.reload())
  await waitFor(() => expect(result.current.error).toContain('불러오지 못했습니다'), { timeout: 10000 })
  const attempts = transport.fetch.mock.calls.length
  await act(async () => expect(await result.current.toggle('schedules', 'ticket')).toBe(false))
  expect(transport.fetch).toHaveBeenCalledTimes(attempts)
  offline = false
  act(() => result.current.reload())
  await waitFor(() => expect(result.current.error).toBe(''))
  await act(async () => expect(await result.current.toggle('schedules', 'ticket')).toBe(true))
  expect(result.current.schedules).toEqual(['ticket'])
}, 20000)
