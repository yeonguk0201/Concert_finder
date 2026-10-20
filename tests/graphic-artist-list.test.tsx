// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ArtistAvatar, ArtistIdentity } from '../src/ArtistIdentity'
import { bands } from '../src/data'

vi.mock('../src/backend', () => ({ backend:null }))
afterEach(cleanup)
const band = {...bands[0],officialProfile:{channelUrl:`https://www.youtube.com/channel/UC${'a'.repeat(22)}`,photo:{url:'https://yt3.googleusercontent.com/profile',channelUrl:`https://www.youtube.com/channel/UC${'a'.repeat(22)}`,checkedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString()}}}

test('home, search, related and followed avatars do not render photos or photo attribution', () => {
  const view = render(<ArtistIdentity band={band} variant="home" onOpen={() => {}} />)
  for (const variant of ['home','result'] as const) {
    view.rerender(<ArtistIdentity band={band} variant={variant} onOpen={() => {}} />)
    expect(view.container.querySelector('img')).toBeNull()
    expect(view.container.querySelector('figcaption')).toBeNull()
    expect(screen.getByRole('img',{name:`${band.name} 그래픽 아바타`})).toBeTruthy()
  }
  view.rerender(<ArtistAvatar band={band} />)
  expect(view.container.querySelector('img')).toBeNull()
})
test('detail identity still displays the photo and its source link', () => {
  render(<ArtistIdentity band={band} onOpen={() => {}} />)
  expect(screen.getByAltText(`${band.name} YouTube 채널 사진`)).toBeTruthy()
  expect(screen.getByRole('link',{name:`${band.name} 사진 출처 · YouTube 채널`}).getAttribute('href')).toBe(band.officialProfile.channelUrl)
})
