// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { Poster } from '../src/Poster'
import { concerts } from '../src/data'
afterEach(cleanup)
test('only approved artwork loads; failure falls back and a changed URL can recover', () => {
  const base = concerts[0]
  const artwork = { url:'https://resource.ualive.com/a.jpg',source_url:'https://ualive.com/concerts/397',selection_reason:'본문 포스터',display_approved:false }
  const view = render(<Poster concert={{...base,artwork}} />)
  expect(screen.queryByRole('img')).toBeNull()
  view.rerender(<Poster concert={{...base,artwork:{...artwork,display_approved:true}}} />)
  expect(screen.getByAltText(`${base.title} 공식 포스터`).getAttribute('referrerpolicy')).toBe('no-referrer')
  fireEvent.error(screen.getByRole('img'))
  expect(screen.queryByRole('img')).toBeNull(); expect(screen.getByText('타이포 썸네일')).toBeTruthy()
  view.rerender(<Poster concert={{...base,artwork:{...artwork,url:'https://resource.ualive.com/b.jpg',display_approved:true}}} />)
  expect(screen.getByRole('img').getAttribute('src')).toContain('/b.jpg')
})
