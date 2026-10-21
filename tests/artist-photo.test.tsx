// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  const view=render(<ArtistPhoto name="Ado" photoMode="manual" representativePhoto={{...photo,retrievedAt:''}} />)
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

test('missing DB photos stay initials without external calls, and replacement keeps attribution', async () => {
  vi.useFakeTimers()
  try {
    const view=render(<ArtistPhoto name="No Photo" />)
    await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
    expect(screen.getByLabelText('No Photo 이니셜')).toBeTruthy()
    expect(mock.invoke).not.toHaveBeenCalled()
    view.rerender(<ArtistPhoto name="Saved Photo" representativePhoto={{...photo,retrievedAt:''}} />)
    expect(screen.getByRole('img').getAttribute('loading')).toBe('lazy')
    expect(screen.getByRole('link',{name:'사진: Photographer'}).getAttribute('href')).toBe(photo.source)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByLabelText('Saved Photo 이니셜')).toBeTruthy()
    expect(mock.invoke).not.toHaveBeenCalled()
  } finally { vi.useRealTimers() }
})

const youtube = () => ({url:'https://yt3.googleusercontent.com/avatar=s800',channelUrl:`https://www.youtube.com/channel/UC${'a'.repeat(22)}`,checkedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()})

test('YouTube photo keeps its visible compact source link, skips per-card lookup, and manual/hidden choices win', () => {
  const official=youtube()
  const view=render(<ArtistPhoto name="Ado" youtubePhoto={official} />)
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


test('failure of both saved photo sources never restores a previously broken image', () => {
  render(<ArtistPhoto name="Both failed" youtubePhoto={youtube()} representativePhoto={{...photo,retrievedAt:''}} />)
  fireEvent.error(screen.getByRole('img'))
  fireEvent.error(screen.getByRole('img'))
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.getByLabelText('Both failed 이니셜')).toBeTruthy()
  expect(mock.invoke).not.toHaveBeenCalled()
})
