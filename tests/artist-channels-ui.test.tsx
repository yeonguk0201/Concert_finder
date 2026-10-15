// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ArtistChannelEditor } from '../src/ArtistChannelEditor'
import { ArtistOfficialLinks } from '../src/ArtistOfficialLinks'
import { mapBands } from '../src/catalog'
import { validYouTubePhoto } from '../src/artistChannels'
const mock=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('../src/backend',()=>({backend:{rpc:mock.rpc}}))
const band={id:'band',name:'Ado',country_code:'JP',aliases:[],updated_at:'band-v1',musicbrainz_id:'00000000-0000-4000-8000-000000000001'}
const channel=`https://www.youtube.com/channel/UC${'a'.repeat(22)}`
afterEach(()=>{cleanup();vi.resetAllMocks()})
async function openEditor() {
  fireEvent.click(screen.getByText('공식 사이트·YouTube 채널 검수'))
  return screen.findByLabelText('YouTube 채널 HTTPS URL')
}
test('administrator channel review loads lazily and preserves edits after a version conflict',async()=>{
  mock.rpc.mockResolvedValueOnce({data:{profile:null,history:[]}}).mockResolvedValueOnce({error:{message:'EDIT_CONFLICT'}}).mockResolvedValue({error:null})
  const saved=vi.fn()
  render(<ArtistChannelEditor band={band} onSaved={saved} />)
  expect(mock.rpc).not.toHaveBeenCalled()
  fireEvent.change(await openEditor(),{target:{value:channel}})
  fireEvent.change(screen.getByLabelText('공식 사이트 HTTPS URL'),{target:{value:'https://official.example.com'}})
  fireEvent.change(screen.getByLabelText('채널 검수 상태'),{target:{value:'verified'}})
  fireEvent.change(screen.getByLabelText('채널을 직접 연결한 공식 근거 HTTPS URL'),{target:{value:'https://official.example.com/artist'}})
  expect(screen.getByRole('button',{name:'공식 링크·검수 저장'}).matches(':disabled')).toBe(true)
  fireEvent.click(screen.getByLabelText('공식 페이지의 아티스트 신원과 연결된 채널을 확인했습니다'))
  fireEvent.submit(screen.getByLabelText('YouTube 채널 HTTPS URL').closest('form')!)
  await screen.findByText(/다른 관리자가 수정했습니다/)
  expect((screen.getByLabelText('YouTube 채널 HTTPS URL') as HTMLInputElement).value).toBe(channel)
  expect(saved).not.toHaveBeenCalled()
  fireEvent.submit(screen.getByLabelText('YouTube 채널 HTTPS URL').closest('form')!)
  await waitFor(()=>expect(saved).toHaveBeenCalledOnce())
  expect(mock.rpc).toHaveBeenLastCalledWith('admin_save_artist_channel',expect.objectContaining({expected_band_updated_at:'band-v1',expected_updated_at:null,profile:expect.objectContaining({verification:'verified',evidence:[expect.objectContaining({identityMatched:true,linkedChannelUrl:channel})]})}))
})
test('held artists cannot save channels and saved statuses expose review exceptions',async()=>{
  mock.rpc.mockResolvedValue({data:{profile:{channel_url:channel,evidence:[],verification:'needs_review',last_status:'needs_review',last_reason:'CHANNEL_SHARED_ACROSS_IDENTITIES'},history:[]}})
  render(<ArtistChannelEditor band={{...band,curation_status:'held'}} onSaved={vi.fn()} />)
  await openEditor()
  expect(screen.getByText('여러 아티스트가 같은 채널을 사용합니다.')).toBeTruthy()
  expect(screen.getByRole('button',{name:'공식 링크·검수 저장'}).matches(':disabled')).toBe(true)
})
test('official links map by internal identity and reject unsafe destinations',()=>{
  const mapped=mapBands([band], [{band_id:band.id,website_url:'https://official.example.com',channel_url:channel,photo:null}])[0]
  expect(mapped.officialProfile?.channelUrl).toBe(channel)
  const view=render(<ArtistOfficialLinks name="Ado" profile={mapped.officialProfile} />)
  expect(screen.getByRole('link',{name:'공식 사이트 ↗'}).getAttribute('href')).toBe('https://official.example.com')
  expect(screen.getByRole('link',{name:'YouTube 채널 ↗'}).getAttribute('rel')).toContain('noopener')
  view.rerender(<ArtistOfficialLinks name="Ado" profile={{websiteUrl:'javascript:alert(1)',channelUrl:'https://youtube.com.evil.example/@artist',photo:null}} />)
  expect(screen.queryAllByRole('link')).toHaveLength(0)
  const photo={url:'https://yt3.googleusercontent.com/avatar',channelUrl:channel,checkedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()}
  expect(validYouTubePhoto(photo)).toBe(true)
  expect(validYouTubePhoto({...photo,url:'https://yt3.googleusercontent.com.evil.example/avatar'})).toBe(false)
  expect(validYouTubePhoto({...photo,expiresAt:new Date(Date.now()+31*86400000).toISOString()})).toBe(false)
})
