// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

test('DB photo takes precedence without provider work, replacement and deletion reset the display', async () => {
  const view=render(<ArtistPhoto name="Ado" bandId="00000000-0000-4000-8000-000000000009" photoMode="manual" representativePhoto={{...photo,retrievedAt:''}} />)
  let img=screen.getByRole('img')
  expect(img.getAttribute('src')).toBe(photo.url)
  expect(mock.invoke).not.toHaveBeenCalled()
  fireEvent.error(img)
  expect(screen.getByLabelText('Ado 이니셜')).toBeTruthy()
  view.rerender(<ArtistPhoto name="Ado" photoMode="manual" representativePhoto={{...photo,url:'https://images.example.com/replacement.jpg',retrievedAt:''}} />)
  img=screen.getByRole('img')
  expect(img.getAttribute('src')).toContain('replacement')
  view.rerender(<ArtistPhoto name="Ado" photoMode="hidden" />)
  expect(screen.queryByRole('img')).toBeNull()
  expect(mock.invoke).not.toHaveBeenCalled()
})

test('photo loads after initials; attribution expands on request and failed images return to initials', async () => {
  mock.invoke.mockResolvedValue({ data: { photo } })
  render(<ArtistPhoto name="Test Artist" mbid="00000000-0000-4000-8000-000000000001" />)
  expect(screen.getByLabelText('Test Artist 이니셜')).toBeTruthy()
  expect(mock.invoke).not.toHaveBeenCalled()
  const image = await screen.findByRole('img', { name: 'Test Artist 프로필' }, { timeout: 4000 })
  const details = screen.getByText('사진 출처').closest('details')!
  expect(details.hasAttribute('open')).toBe(false)
  fireEvent.click(screen.getByText('사진 출처'))
  expect(details.hasAttribute('open')).toBe(true)
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

const youtube = () => ({url:'https://yt3.googleusercontent.com/avatar=s800',channelUrl:`https://www.youtube.com/channel/UC${'a'.repeat(22)}`,checkedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()})

test('YouTube photo keeps its visible compact source link, skips per-card lookup, and manual/hidden choices win', () => {
  const official=youtube()
  const view=render(<ArtistPhoto name="Ado" bandId="00000000-0000-4000-8000-000000000009" youtubePhoto={official} />)
  expect(screen.getByRole('img',{name:'Ado YouTube 채널 사진'}).getAttribute('src')).toBe(official.url)
  expect(screen.getByRole('link',{name:'Ado 사진 출처 · YouTube 채널'}).getAttribute('href')).toBe(official.channelUrl)
  expect(screen.getByRole('link',{name:'Ado 사진 출처 · YouTube 채널'}).textContent).toBe('YouTube ↗')
  expect(screen.queryByRole('img',{name:'YouTube'})).toBeNull()
  expect(mock.invoke).not.toHaveBeenCalled()
  view.rerender(<ArtistPhoto name="Ado" photoMode="manual" youtubePhoto={official} representativePhoto={{...photo,retrievedAt:''}} />)
  expect(screen.getByRole('img',{name:'Ado 프로필'}).getAttribute('src')).toBe(photo.url)
  expect(screen.queryByRole('img',{name:'YouTube'})).toBeNull()
  view.rerender(<ArtistPhoto name="Ado" photoMode="hidden" youtubePhoto={official} />)
  expect(screen.queryByRole('img')).toBeNull()
})

test('failed and expired YouTube images show initials and do not retain their source branding', () => {
  const official=youtube()
  const view=render(<ArtistPhoto name="Ado" youtubePhoto={official} />)
  fireEvent.error(screen.getByRole('img',{name:'Ado YouTube 채널 사진'}))
  expect(screen.getByLabelText('Ado 이니셜')).toBeTruthy()
  expect(screen.queryByRole('link')).toBeNull()
  view.rerender(<ArtistPhoto name="Ado" youtubePhoto={{...official,url:'https://yt3.googleusercontent.com/expired',expiresAt:new Date(Date.now()-1).toISOString()}} />)
  expect(screen.queryByRole('img')).toBeNull()
})

test('YouTube photo is removed when its expiry passes while the page remains open', async () => {
  vi.useFakeTimers()
  try {
    const official={...youtube(),expiresAt:new Date(Date.now()+1000).toISOString()}
    render(<ArtistPhoto name="Ado" youtubePhoto={official} />)
    expect(screen.getByRole('img',{name:'Ado YouTube 채널 사진'})).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
    expect(screen.queryByRole('img')).toBeNull()
  } finally {vi.useRealTimers()}
})
