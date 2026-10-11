// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ArtistPhoto } from '../src/ArtistPhoto'
const mock = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('../src/backend', () => ({ backend: { functions: { invoke: mock.invoke } } }))
const photo = { url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/Test.jpg/320px-Test.jpg', source: 'https://commons.wikimedia.org/wiki/File:Test.jpg', author: 'Photographer', credit: 'Own work', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', identity: 'mb:00000000-0000-4000-8000-000000000001' }
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    callback: (entries: unknown[]) => void
    constructor(callback: (entries: unknown[]) => void) { this.callback = callback }
    observe() { queueMicrotask(() => this.callback([{ isIntersecting: true }])) }
    disconnect() {}
  })
})
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals() })

test('photo loads after initials and retains visible attribution; failed image returns to initials', async () => {
  mock.invoke.mockResolvedValue({ data: { photo } })
  render(<ArtistPhoto name="Test Artist" mbid="00000000-0000-4000-8000-000000000001" />)
  expect(screen.getByLabelText('Test Artist 이니셜')).toBeTruthy()
  expect(mock.invoke).not.toHaveBeenCalled()
  const image = await screen.findByRole('img', { name: 'Test Artist 프로필' }, { timeout: 4000 })
  expect(screen.getByRole('link', { name: '사진: Photographer' }).getAttribute('href')).toBe(photo.source)
  expect(screen.getByRole('link', { name: 'CC BY 4.0' }).getAttribute('href')).toBe(photo.licenseUrl)
  fireEvent.error(image)
  expect(screen.getByLabelText('Test Artist 이니셜')).toBeTruthy()
})

test('duplicate visible cards share one lookup and absent photos remain initials', async () => {
  mock.invoke.mockResolvedValue({ data: { photo: null } })
  render(<><ArtistPhoto name="No Photo" mbid="00000000-0000-4000-8000-000000000002" /><ArtistPhoto name="Same Artist" mbid="00000000-0000-4000-8000-000000000002" /></>)
  await waitFor(() => expect(mock.invoke).toHaveBeenCalledOnce(), { timeout: 4000 })
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.getByLabelText('No Photo 이니셜')).toBeTruthy()
})

test('changing artist while a photo is pending cannot show the previous artist image', async () => {
  let resolve!: (value: unknown) => void
  mock.invoke.mockImplementationOnce(() => new Promise(done => { resolve = done })).mockResolvedValue({ data: { photo: null } })
  const view = render(<ArtistPhoto name="Old Artist" mbid="00000000-0000-4000-8000-000000000003" />)
  await waitFor(() => expect(mock.invoke).toHaveBeenCalledOnce(), { timeout: 4000 })
  view.rerender(<ArtistPhoto name="New Artist" mbid="00000000-0000-4000-8000-000000000004" />)
  resolve({ data: { photo } })
  await waitFor(() => expect(screen.getByLabelText('New Artist 이니셜')).toBeTruthy())
  expect(screen.queryByRole('img')).toBeNull()
})
