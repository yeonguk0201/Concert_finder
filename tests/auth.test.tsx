// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useAuth } from '../src/useAuth'
import { StrictMode } from 'react'
import { authCallback } from '../src/authErrors'

const mock = vi.hoisted(() => ({
  getSession: vi.fn(), signInWithOtp: vi.fn(), signOut: vi.fn(),
  callback: null as null | ((event: string, session: unknown) => void), unsubscribe: vi.fn(),
}))
vi.mock('../src/backend', () => ({ configurationError: '', backend: { auth: {
  getSession: mock.getSession, signInWithOtp: mock.signInWithOtp, signOut: mock.signOut,
  onAuthStateChange: (callback: typeof mock.callback) => { mock.callback = callback; return { data: { subscription: { unsubscribe: mock.unsubscribe } } } },
} } }))
afterEach(() => { cleanup(); vi.clearAllMocks(); history.replaceState(null, '', '/') })

test('session restores, failed logout retains session, successful logout clears it', async () => {
  const session = { user: { id: 'a', email: 'a@example.test' } }
  mock.getSession.mockResolvedValue({ data: { session }, error: null })
  const { result } = renderHook(useAuth)
  await waitFor(() => expect(result.current.session?.user.id).toBe('a'))
  mock.signOut.mockResolvedValueOnce({ error: new Error('offline') }).mockResolvedValueOnce({ error: null })
  await act(() => result.current.signOut())
  expect(result.current.session?.user.id).toBe('a')
  expect(result.current.error).toContain('로그아웃하지 못했습니다')
  await act(() => result.current.signOut())
  expect(result.current.session).toBeNull()
})
test('expired callback is cleaned and requesting a new link preserves the target page', async () => {
  history.replaceState(null, '', '/?page=saved&event=abc#error=access_denied&error_description=expired')
  mock.getSession.mockResolvedValue({ data: { session: null }, error: null })
  mock.signInWithOtp.mockResolvedValueOnce({ error: new Error('rate limit') }).mockResolvedValueOnce({ error: null })
  const { result } = renderHook(useAuth)
  await waitFor(() => expect(result.current.error).toContain('만료'))
  expect(location.hash).toBe('')
  await act(() => result.current.requestLink(' a@example.test '))
  expect(result.current.message).toBe('')
  expect(result.current.error).toContain('요청에 실패')
  await act(() => result.current.requestLink('a@example.test'))
  expect(mock.signInWithOtp).toHaveBeenLastCalledWith({ email: 'a@example.test', options: { emailRedirectTo: 'http://localhost:3000/?page=saved&event=abc' } })
  expect(result.current.message).toContain('이메일')
})
test('auth event wins over stale session restoration and unmount unsubscribes', async () => {
  let resolve: (value: unknown) => void = () => {}
  mock.getSession.mockReturnValue(new Promise(r => { resolve = r }))
  const { result, unmount } = renderHook(useAuth)
  act(() => mock.callback?.('SIGNED_OUT', null))
  await act(async () => resolve({ data: { session: { user: { id: 'old' } } }, error: null }))
  expect(result.current.session).toBeNull()
  unmount()
  expect(mock.unsubscribe).toHaveBeenCalled()
})

test('StrictMode effect replay retains callback error after cleaning the fragment', async () => {
  history.replaceState(null, '', '/?page=saved&event=abc#error=access_denied&error_code=otp_expired&error_description=expired')
  mock.getSession.mockResolvedValue({ data: { session: null }, error: null })
  const { result } = renderHook(useAuth, { wrapper: StrictMode })
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.error).toContain('만료')
  expect(location.hash).toBe('')
  expect(location.search).toBe('?page=saved&event=abc')
})
test('query callback errors and error_code alone are recognized without displaying raw descriptions', async () => {
  history.replaceState(null, '', '/?page=bands&error_code=otp_expired&error_description=private_value#section=account')
  mock.getSession.mockResolvedValue({ data: { session: null }, error: null })
  const { result } = renderHook(useAuth, { wrapper: StrictMode })
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.error).toContain('만료')
  expect(result.current.error).not.toContain('private_value')
  expect(location.search).toBe('?page=bands')
  expect(location.hash).toBe('#section=account')
  expect(authCallback(new URL('https://app.example/#access_token=test')).error).toBe('')
})
test('an invalid link arriving by hash navigation is handled without a page reload', async () => {
  mock.getSession.mockResolvedValue({ data: { session: null }, error: null })
  const { result } = renderHook(useAuth)
  await waitFor(() => expect(result.current.loading).toBe(false))
  act(() => {
    history.replaceState(null, '', '/?page=saved#error_code=otp_expired')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
  expect(result.current.error).toContain('만료')
  expect(location.hash).toBe('')
})
