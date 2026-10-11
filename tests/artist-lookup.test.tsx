// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ArtistLookup } from '../src/ArtistLookup'
const mock = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('../src/backend', () => ({backend:{functions:{invoke:mock.invoke}}}))
afterEach(()=>{cleanup();vi.resetAllMocks()})
test('search displays identity distinctions and imports only the selected provider ID', async()=>{
  mock.invoke.mockResolvedValueOnce({data:{artists:[{key:'mb:artist-id',name:'New Band',aliases:['새 밴드'],country:'JP',evidence:'https://musicbrainz.org/artist/artist-id',disambiguation:'Japanese band'}]},error:null}).mockResolvedValueOnce({data:{band_id:'band-id'},error:null})
  const onImported=vi.fn()
  render(<ArtistLookup onImported={onImported} />)
  fireEvent.change(screen.getByLabelText('외부 아티스트 이름'),{target:{value:'New Band'}})
  fireEvent.click(screen.getByRole('button',{name:'외부 아티스트 검색'}))
  await screen.findByText('New Band')
  expect(onImported).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'이 아티스트 가져오기'}))
  await waitFor(()=>expect(onImported).toHaveBeenCalledOnce())
  expect(mock.invoke).toHaveBeenLastCalledWith('artist-search',{body:{action:'import',id:'artist-id'}})
})
test('provider failure is visible and leaves catalog unchanged', async()=>{
  mock.invoke.mockResolvedValue({error:{context:{json:async()=>({error:'ARTIST_PROVIDER_UNAVAILABLE'})}}})
  const onImported=vi.fn()
  render(<ArtistLookup onImported={onImported} />)
  fireEvent.change(screen.getByLabelText('외부 아티스트 이름'),{target:{value:'New Band'}})
  fireEvent.click(screen.getByRole('button',{name:'외부 아티스트 검색'}))
  expect((await screen.findByRole('alert')).textContent).toContain('혼잡')
  expect(onImported).not.toHaveBeenCalled()
})
