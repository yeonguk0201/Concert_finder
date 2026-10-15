// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useCatalog } from '../src/useCatalog'
const mock=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}))
vi.mock('../src/backend',()=>({accountMode:true,configurationError:'',backend:{rpc:mock.rpc,from:mock.from}}))
vi.mock('../src/useRealtime',()=>({useRealtime:()=> 'connected'}))
const band={id:'band',name:'Ado',country_code:'JP',aliases:[],description:null}
afterEach(()=>{cleanup();vi.resetAllMocks()})
function catalogRows() {
  mock.from.mockImplementation(name=>({select:()=>name==='bands'?{in:()=>({order:async()=>({data:[band],error:null})})}:{eq:async()=>({data:[],error:null})}}))
}
test('catalog merges official metadata by band ID without per-card API calls',async()=>{
  catalogRows()
  mock.rpc.mockResolvedValue({data:[{band_id:'band',website_url:'https://official.example.com',channel_url:'https://youtube.com/@artist',photo:null}],error:null})
  const {result}=renderHook(()=>useCatalog())
  await waitFor(()=>expect(result.current.loading).toBe(false))
  expect(result.current.bands[0].officialProfile?.websiteUrl).toBe('https://official.example.com')
  expect(mock.rpc).toHaveBeenCalledOnce()
  expect(mock.rpc).toHaveBeenCalledWith('artist_official_profiles')
})
test('an unavailable official profile RPC keeps the base catalog and followable artists visible',async()=>{
  catalogRows()
  mock.rpc.mockResolvedValue({error:{message:'missing migration'}})
  const {result}=renderHook(()=>useCatalog())
  await waitFor(()=>expect(result.current.loading).toBe(false))
  expect(result.current.bands[0].name).toBe('Ado')
  expect(result.current.bands[0].officialProfile).toBeUndefined()
  expect(result.current.error).toBe('')
})
