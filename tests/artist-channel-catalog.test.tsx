// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useCatalog } from '../src/useCatalog'
const mock=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}))
vi.mock('../src/backend',()=>({accountMode:true,configurationError:'',backend:{rpc:mock.rpc,from:mock.from}}))
vi.mock('../src/useRealtime',()=>({useRealtime:()=> 'connected'}))
const band={id:'band',name:'Ado',country_code:'JP',aliases:[],description:null,curation_status:'approved'}
afterEach(()=>{cleanup();vi.resetAllMocks()})
function catalogRows(pages = [[band]]) {
  mock.from.mockImplementation(name=>({select:()=>name==='bands'?{eq:(field:string,value:string)=>{
    expect([field,value]).toEqual(['curation_status','approved'])
    const ordered = {order:()=>ordered,range:async(offset:number)=>({data:pages[offset/500]??[],error:null})}
    return ordered
  }}:{eq:async()=>({data:[],error:null})}}))
}

test('catalog merges official metadata by band ID without per-card API calls',async()=>{
  catalogRows()
  mock.rpc.mockResolvedValue({data:[{band_id:'band',website_url:'https://official.example.com',channel_url:'https://youtube.com/@artist',photo:null}],error:null})
  const {result}=renderHook(()=>useCatalog())
  await waitFor(()=>expect(result.current.bands[0]?.officialProfile?.websiteUrl).toBe('https://official.example.com'))
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

test('slow optional metadata never blocks names, follows or completion of the base catalog',async()=>{
  catalogRows()
  let finish!: (value: unknown) => void
  mock.rpc.mockReturnValue(new Promise(resolve=>{finish=resolve}))
  const {result}=renderHook(()=>useCatalog())
  await waitFor(()=>expect(result.current.loading).toBe(false))
  expect(result.current.bands[0].name).toBe('Ado')
  expect(result.current.initialized).toBe(true)
  await act(async()=>finish({data:[],error:null}))
})

test('approved catalog reads beyond the API page limit and reload removes revoked artists',async()=>{
  catalogRows([Array.from({length:500},(_,i)=>({...band,id:`band-${i}`})),[{...band,id:'last'}]])
  mock.rpc.mockResolvedValue({data:[],error:null})
  const {result}=renderHook(()=>useCatalog())
  await waitFor(()=>expect(result.current.loading).toBe(false))
  expect(result.current.bands).toHaveLength(501)
  expect(result.current.bands[500].id).toBe('last')
  catalogRows([[]])
  act(()=>result.current.reload())
  await waitFor(()=>expect(result.current.bands).toHaveLength(0))
})

test('metadata from an old load cannot restore artists after a newer approval refresh',async()=>{
  catalogRows()
  let finish!: (value: unknown) => void
  mock.rpc.mockReturnValueOnce(new Promise(resolve=>{finish=resolve})).mockResolvedValue({data:[],error:null})
  const {result}=renderHook(()=>useCatalog())
  await waitFor(()=>expect(result.current.loading).toBe(false))
  catalogRows([[]])
  act(()=>result.current.reload())
  await waitFor(()=>expect(result.current.bands).toHaveLength(0))
  await act(async()=>finish({data:[{band_id:'band',website_url:'https://old.example'}],error:null}))
  expect(result.current.bands).toHaveLength(0)
})
