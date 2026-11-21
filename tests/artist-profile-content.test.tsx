// @vitest-environment jsdom
import {act,cleanup,renderHook,waitFor} from '@testing-library/react'
import {afterEach,expect,test,vi} from 'vitest'
import {useArtistProfile} from '../src/useArtistProfile'
import {artistProfilePreviews} from '../src/artistProfilePreview'
const mocks=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('../src/backend',()=>({backend:{rpc:mocks.rpc}}))
const base=artistProfilePreviews.changsub!
const band={id:base.identity.bandId,musicbrainzId:base.identity.musicBrainzId,name:'이창섭',initials:'CS',color:'#000',country:'KR',genre:'보컬'}
afterEach(()=>{cleanup();vi.resetAllMocks()})
test('loads public detail by exact band/MBID and does not send server credentials or per-card queries',async()=>{
 mocks.rpc.mockResolvedValue({data:base,error:null})
 const {result}=renderHook(()=>useArtistProfile(band))
 await waitFor(()=>expect(result.current.profile?.bio).toBe(base.bio))
 expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('artist_profile_content',{target_band_id:band.id})
})
test('unavailable migration falls back while a successful null or wrong identity never becomes visible detail',async()=>{
 for(const response of [{error:{message:'missing'}},{data:null,error:null},{data:{...base,identity:{...base.identity,musicBrainzId:'wrong'}},error:null}]){
  mocks.rpc.mockResolvedValue(response)
  const {result,unmount}=renderHook(()=>useArtistProfile(band))
  await waitFor(()=>expect(mocks.rpc).toHaveBeenCalled())
  await act(async()=>{})
  expect(result.current.profile).toBeUndefined()
  expect(result.current.available).toBe(!response.error)
  unmount();mocks.rpc.mockClear()
 }
})
test('a late response cannot show the previous artist after navigation or an identity refresh',async()=>{
 let finish!:(value:unknown)=>void
 mocks.rpc.mockReturnValueOnce(new Promise(resolve=>{finish=resolve})).mockResolvedValue({data:null,error:null})
 const {result,rerender}=renderHook(({artist})=>useArtistProfile(artist),{initialProps:{artist:band}})
 rerender({artist:{...band,id:'other'}})
 await act(async()=>finish({data:base,error:null}))
 expect(result.current.profile).toBeUndefined()
})
