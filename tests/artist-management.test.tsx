// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ArtistManagement } from '../src/ArtistManagement'
import { CollectionOperations } from '../src/CollectionOperations'
const mock=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('../src/backend',()=>({backend:{rpc:mock.rpc}}))
const band={id:'band',name:'Ado',country_code:'JP',aliases:['아도'],updated_at:'v1',musicbrainz_id:'mbid'}
afterEach(()=>{cleanup();vi.resetAllMocks()})

test('editor sends optimistic version and complete image rights; failed saves preserve edits', async()=>{
  mock.rpc.mockRejectedValueOnce({message:'EDIT_CONFLICT'}).mockResolvedValue({error:null})
  const onSaved=vi.fn()
  render(<ArtistManagement bands={[band]} onSaved={onSaved} />)
  fireEvent.change(screen.getByLabelText('관리할 아티스트'),{target:{value:'band'}})
  fireEvent.change(screen.getByLabelText('대표 이미지 방식'),{target:{value:'manual'}})
  const fields={
    '대표 이미지 HTTPS URL':'https://images.example.com/ado.png','이미지 원본 출처 HTTPS URL':'https://official.example.com/photo',
    '사진 저작자':'Author','라이선스 / 허락 명칭':'CC BY','이용 조건 / 허락 근거 HTTPS URL':'https://official.example.com/terms','사용 근거 · 허락 범위':'display permission',
  }
  for(const [label,value] of Object.entries(fields))fireEvent.change(screen.getByLabelText(label),{target:{value}})
  expect((screen.getByRole('button',{name:'별칭·대표 이미지 저장'}) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByLabelText('대상 아티스트와 이미지 이용 조건을 확인했습니다'))
  fireEvent.click(screen.getByRole('button',{name:'별칭·대표 이미지 저장'}))
  await screen.findByText(/다른 관리자가 수정했습니다/)
  expect((screen.getByLabelText('사진 저작자') as HTMLInputElement).value).toBe('Author')
  fireEvent.click(screen.getByRole('button',{name:'별칭·대표 이미지 저장'}))
  await waitFor(()=>expect(onSaved).toHaveBeenCalledOnce())
  expect(mock.rpc).toHaveBeenLastCalledWith('admin_update_artist',expect.objectContaining({expected_updated_at:'v1',mode:'manual',photo:expect.objectContaining({author:'Author',usageBasis:'display permission'})}))
})

test('deletion suppresses auto photo and switching selection ignores an old save completion', async()=>{
  let done!:(value:unknown)=>void
  mock.rpc.mockImplementation(()=>new Promise(resolve=>{done=resolve}))
  const onSaved=vi.fn()
  render(<ArtistManagement bands={[band,{...band,id:'other',name:'Other'}]} onSaved={onSaved} />)
  fireEvent.change(screen.getByLabelText('관리할 아티스트'),{target:{value:'band'}})
  fireEvent.change(screen.getByLabelText('대표 이미지 방식'),{target:{value:'hidden'}})
  fireEvent.click(screen.getByRole('button',{name:'별칭·대표 이미지 저장'}))
  expect(mock.rpc).toHaveBeenCalledWith('admin_update_artist',expect.objectContaining({mode:'hidden',photo:null}))
  fireEvent.change(screen.getByLabelText('관리할 아티스트'),{target:{value:'other'}})
  done({error:null})
  await waitFor(()=>expect(screen.getByText('Other 관리')).toBeTruthy())
  expect(onSaved).not.toHaveBeenCalled()
})

test('operator sees stalled source and can stop publication without ending backfill', async()=>{
  mock.rpc.mockImplementation(async(name:string)=>name==='admin_collection_health'?{data:[{source:'yes24',collection_enabled:true,publication_enabled:true,live_after:null,last_success:null,attention_required:true}],error:null}:{error:null})
  render(<CollectionOperations />)
  const details=screen.getByText('수집 자동 운영·중단').closest('details')!
  details.open=true;fireEvent(details,new Event('toggle'))
  await screen.findByText(/운영 확인 필요/)
  fireEvent.click(screen.getByLabelText('조건부 자동 공개'))
  await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith('admin_collection_policy',{source_name:'yes24',collect_enabled:true,publish_enabled:false,end_backfill:false}))
})
