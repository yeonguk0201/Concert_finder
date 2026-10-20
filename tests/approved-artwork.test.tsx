// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { ApprovedArtwork } from '../src/ApprovedArtwork'
import { concertArtworkStyle } from '../src/approvedStyle'
import { bands, concerts } from '../src/data'

afterEach(cleanup)
test('list cards remain graphic even when an approved official poster exists', () => {
  const concert = {...concerts[0],artwork:{url:'https://example.test/poster.jpg',source_url:'https://example.test/concert',selection_reason:'공식 포스터',display_approved:true}}
  const view = render(<ApprovedArtwork concert={concert} bands={bands} />)
  expect(view.container.querySelector('img')).toBeNull()
  expect(view.container.querySelector('.art-shape')).toBeTruthy()
})
test('concert identities receive varied styles that remain stable after rerendering', () => {
  expect(new Set(Array.from({length:20},(_,i)=>concertArtworkStyle(`concert-${i}`))).size).toBe(4)
  const view = render(<ApprovedArtwork concert={concerts[0]} bands={bands} />)
  const style = view.container.firstElementChild!.className
  view.rerender(<ApprovedArtwork concert={{...concerts[0], title:'Updated title'}} bands={bands} />)
  expect(view.container.firstElementChild!.className).toBe(style)
  expect(concertArtworkStyle(concerts[0].id)).toBe(concertArtworkStyle(concerts[0].id))
})
test('official approved images take precedence and recover when the image URL changes', () => {
  const artwork = {url:'https://example.test/poster.jpg',source_url:'https://example.test/concert',selection_reason:'공식 포스터',display_approved:true}
  const concert = {...concerts[0],artwork}
  const view = render(<ApprovedArtwork concert={concert} bands={bands} showPhoto />)
  expect(screen.getByRole('img').getAttribute('src')).toBe(artwork.url)
  fireEvent.error(screen.getByRole('img'))
  expect(screen.queryByRole('img')).toBeNull()
  expect(view.container.querySelector(`.artwork.${concertArtworkStyle(concert.id)}`)).toBeTruthy()
  view.rerender(<ApprovedArtwork concert={{...concert,artwork:{...artwork,url:'https://example.test/updated.jpg'}}} bands={bands} showPhoto />)
  expect(screen.getByRole('img').getAttribute('src')).toContain('updated.jpg')
})
