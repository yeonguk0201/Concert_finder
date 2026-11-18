// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import ArtistProfilePilot from '../src/ArtistProfilePilot'
import { ArtistBannerPhoto } from '../src/ArtistBannerPhoto'
import { ArtistProfileMedia } from '../src/ArtistProfileMedia'
import { artistProfilePreviews } from '../src/artistProfilePreview'
import type { Band } from '../src/data'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); history.replaceState(null, '', '/') })

test('Ado editorial preview keeps approved colors, image-use notice and Korean attribution without production APIs', () => {
  history.replaceState(null, '', '/?artistProfilePreview=ado')
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
  const { container } = render(<ArtistProfilePilot />)
  expect(container.querySelector('.artist-banner')?.getAttribute('data-theme')).toBe('blue-rose')
  const image = screen.getByRole('img', { name: 'Ado 공식 일러스트' })
  expect(image.getAttribute('src')).toBe('https://shorefire.com/images/uploads/gallery/NEW_Ado_pressshot.jpg')
  expect(screen.getByText('편집 용도 한정')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Shore Fire Media' }).getAttribute('href')).toBe('https://shorefire.com/roster/ado')
  expect(screen.getByRole('link', { name: '위키백과 원문 (한국어)' }).getAttribute('href')).toContain('ko.wikipedia.org')
  expect(screen.getByRole('link', { name: '저작자·기여 이력' }).getAttribute('href')).toContain('action=history')
  expect(screen.getByText('THE FIRST TAKE · YouTube')).toBeTruthy()
  expect(fetcher).not.toHaveBeenCalled()
})

test('image failure keeps an initials banner rather than collapsing its slot', () => {
  render(<ArtistBannerPhoto photo={artistProfilePreviews.changsub!.banner} name="이창섭" initials="CS" />)
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByLabelText('이창섭 이니셜 배너')).toBeTruthy()
  expect(screen.getByText('이미지를 불러오지 못해 이니셜로 표시')).toBeTruthy()
})

test('media is capped at six per category with exact video links and official channel more links', () => {
  const band: Band = { id: 'test', name: 'Test', initials: 'T', color: '#000', country: '', genre: '' }
  const profile = { ...artistProfilePreviews.ado!, music: Array.from({ length: 8 }, (_, i) => ({ id: `video${i}`, title: `Title ${i}` })), live: [] }
  const { container } = render(<ArtistProfileMedia band={band} profile={profile} />)
  const links = container.querySelectorAll('.artist-video')
  expect(links.length).toBe(6)
  expect(links[0].getAttribute('href')).toBe('https://www.youtube.com/watch?v=video0')
  expect([...container.querySelectorAll('.media-more')].every(a => a.getAttribute('href') === profile.channel)).toBe(true)
})
