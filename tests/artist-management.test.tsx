// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ArtistManagement } from '../src/ArtistManagement'
import { CollectionOperations } from '../src/CollectionOperations'
const mock=vi.hoisted(()=>({rpc:vi.fn(),upload:vi.fn()}))
vi.mock('../src/backend',()=>({backend:{rpc:mock.rpc}}))
vi.mock('../src/artistPhotoUpload',()=>({saveArtistPhotoFile:mock.upload}))
const band={id:'band',name:'Ado',country_code:'JP',aliases:['아도'],updated_at:'v1',musicbrainz_id:'mbid'}
afterEach(()=>{cleanup();vi.resetAllMocks()})

test('file upload requires rights, preserves selection on failure, and saves without sending the old URL RPC', async () => {
  mock.upload.mockRejectedValueOnce(new Error('PHOTO_FILE_INVALID')).mockResolvedValue(undefined)
  const onSaved = vi.fn()
  render(<ArtistManagement bands={[band]} onSaved={onSaved} />)
  fireEvent.change(screen.getByLabelText('관리할 아티스트'),{target:{value:'band'}})
  fireEvent.change(screen.getByLabelText('대표 이미지 방식'),{target:{value:'manual'}})
  fireEvent.change(screen.getByLabelText('이미지 입력 방식'),{target:{value:'file'}})
  const file = new File(['png'], 'artist.png', {type:'image/png'})
  fireEvent.change(screen.getByLabelText('대표 사진 파일'),{target:{files:[file]}})
  for (const [label,value] of Object.entries({'이미지 원본 출처 HTTPS URL':'https://artist.example.com/photo','사진 저작자':'Author','라이선스 / 허락 명칭':'Permission','이용 조건 / 허락 근거 HTTPS URL':'https://artist.example.com/terms','사용 근거 · 허락 범위':'Display and resize'})) fireEvent.change(screen.getByLabelText(label),{target:{value}})
  expect(screen.queryByLabelText('대표 이미지 HTTPS URL')).toBeNull()
  expect(screen.getByRole('button',{name:'별칭·대표 이미지 저장'}).matches(':disabled')).toBe(true)
  fireEvent.click(screen.getByLabelText('대상 아티스트와 이미지 이용 조건을 확인했습니다'))
  // jsdom has no native file chooser; submit the form with the selected File.
  fireEvent.submit(screen.getByLabelText('대표 사진 파일').closest('form')!)
  await screen.findByText(/이미지를 읽을 수 없습니다/)
  expect(screen.getByText('선택한 파일: artist.png')).toBeTruthy()
  expect(onSaved).not.toHaveBeenCalled()
  fireEvent.submit(screen.getByLabelText('대표 사진 파일').closest('form')!)
  await waitFor(()=>expect(onSaved).toHaveBeenCalledOnce())
  expect(mock.upload).toHaveBeenLastCalledWith(band,['아도'],expect.objectContaining({author:'Author',usageBasis:'Display and resize'}),file)
  expect(mock.rpc).not.toHaveBeenCalled()
})

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

test('curation filters aliases and status, preserves failed edits and sends versioned metadata', async () => {
  mock.rpc.mockResolvedValueOnce({error:{message:'EDIT_CONFLICT'}}).mockResolvedValue({error:null})
  const onSaved = vi.fn()
  render(<ArtistManagement bands={[{...band,curation_status:'held'}, {...band,id:'other',name:'Other',aliases:[],curation_status:'approved'}]} onSaved={onSaved} />)
  fireEvent.change(screen.getByLabelText('DB 이름·별칭·국가 검색'),{target:{value:'아도'}})
  expect(screen.queryByRole('option',{name:/Other/})).toBeNull()
  fireEvent.change(screen.getByLabelText('관리 상태 필터'),{target:{value:'held'}})
  fireEvent.change(screen.getByLabelText('관리할 아티스트'),{target:{value:'band'}})
  fireEvent.change(screen.getByLabelText('아티스트 이름'),{target:{value:'Ado JP'}})
  fireEvent.change(screen.getByLabelText('국가 코드 · ISO 2자리'),{target:{value:'jp'}})
  fireEvent.change(screen.getByLabelText('대상 분류'),{target:{value:'jpop'}})
  fireEvent.change(screen.getByLabelText('노출 관리 상태'),{target:{value:'excluded'}})
  fireEvent.change(screen.getByLabelText('변경·검수 이유'),{target:{value:'범주 확인까지 제외'}})
  fireEvent.click(screen.getByRole('button',{name:'DB 정보·노출 상태 저장'}))
  await screen.findByText(/다른 관리자가 수정했습니다/)
  expect((screen.getByLabelText('아티스트 이름') as HTMLInputElement).value).toBe('Ado JP')
  expect(onSaved).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'DB 정보·노출 상태 저장'}))
  await waitFor(()=>expect(onSaved).toHaveBeenCalledOnce())
  expect(mock.rpc).toHaveBeenLastCalledWith('admin_curate_artist',{
    target_band_id:'band',expected_updated_at:'v1',artist_name:'Ado JP',country:'JP',artist_category:'jpop',artist_aliases:['아도'],review_status:'excluded',reason:'범주 확인까지 제외',evidence_url:null,
  })
  expect(screen.getByRole('button',{name:'DB 정보·노출 상태 저장'}).matches(':disabled')).toBe(true)
})

test('restoration requires fresh approval evidence and a new version resets the saved editor', async () => {
  mock.rpc.mockResolvedValue({error:null})
  const excluded = {...band,curation_status:'excluded' as const,category:'jpop' as const,curation_reason:'보류 이유'}
  const onSaved = vi.fn()
  const view = render(<ArtistManagement bands={[excluded]} onSaved={onSaved} />)
  fireEvent.change(screen.getByLabelText('관리할 아티스트'),{target:{value:'band'}})
  fireEvent.change(screen.getByLabelText('노출 관리 상태'),{target:{value:'approved'}})
  expect((screen.getByRole('button',{name:'아티스트 복구·정보 저장'}) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('대상 분류의 공식 근거 HTTPS URL'),{target:{value:'https://official.example/bio'}})
  fireEvent.change(screen.getByLabelText('변경·검수 이유'),{target:{value:'공식 근거 재검토 후 복구'}})
  fireEvent.click(screen.getByRole('button',{name:'아티스트 복구·정보 저장'}))
  await waitFor(()=>expect(onSaved).toHaveBeenCalledOnce())
  view.rerender(<ArtistManagement bands={[{...excluded,curation_status:'approved',updated_at:'v2',curation_evidence_url:'https://official.example/bio'}]} onSaved={onSaved} />)
  expect((screen.getByRole('button',{name:'DB 정보·노출 상태 저장'}) as HTMLButtonElement).disabled).toBe(false)
  expect((screen.getByLabelText('노출 관리 상태') as HTMLSelectElement).value).toBe('approved')
})

test('history failure is retryable and shows changed fields with administrator attribution', async () => {
  mock.rpc.mockResolvedValueOnce({error:{message:'offline'}}).mockResolvedValueOnce({error:null,data:[{id:'history',actor_id:'admin-id',changed_at:'2026-10-13T08:00:00Z',before_record:{...band,curation_status:'excluded'},after_record:{...band,curation_status:'held',curation_reason:'복구 검토'}}]})
  render(<ArtistManagement bands={[band]} onSaved={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('관리할 아티스트'),{target:{value:'band'}})
  const details = screen.getByText('아티스트 변경 이력 · 최근 50건').closest('details')!
  details.open = true
  await screen.findByText(/저장 또는 조회에 실패했습니다/)
  fireEvent.click(screen.getByRole('button',{name:'이력 다시 불러오기'}))
  await screen.findByText(/관리자 admin-id/)
  expect(screen.getByText('제외 → 보류')).toBeTruthy()
  expect(mock.rpc).toHaveBeenLastCalledWith('admin_artist_history',{target_band_id:'band'})
})
