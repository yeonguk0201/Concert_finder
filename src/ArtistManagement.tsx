import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { backend } from './backend'
import { adminError } from './adminApi'
import type { AdminBand } from './adminApi'
import { ArtistPhoto } from './ArtistPhoto'
import type { ArtistPhotoData } from './artistPhotoTypes'

export function ArtistManagement({ bands, onSaved }: { bands: AdminBand[]; onSaved: () => void }) {
  const [selected, setSelected] = useState('')
  const [savedMessage, setSavedMessage] = useState('')
  const band = bands.find(b => b.id === selected)
  return <section aria-label="아티스트 DB 관리"><h2>아티스트 DB·대표 이미지</h2>
    <p>등록된 아티스트의 검색 별칭과 대표 이미지를 관리합니다. 이미지는 출처·저작자·이용 근거를 확인하고 지정하세요.</p>
    <label>관리할 아티스트<select value={selected} onChange={e => {setSelected(e.target.value);setSavedMessage('')}}><option value="">아티스트 선택</option>{bands.map(b => <option key={b.id} value={b.id}>{b.name} ({b.country_code})</option>)}</select></label>
    {savedMessage && <p role="status">{savedMessage}</p>}
    {band && <ArtistEditor key={`${band.id}:${band.updated_at}`} band={band} onSaved={() => {setSavedMessage(`${band.name} 별칭·대표 이미지를 저장했습니다.`);onSaved()}} />}
  </section>
}

function ArtistEditor({ band, onSaved }: { band: AdminBand; onSaved: () => void }) {
  const [aliases, setAliases] = useState(band.aliases.join(', '))
  const [mode, setMode] = useState<'auto' | 'manual' | 'hidden'>(band.photo_mode ?? 'auto')
  const [photo, setPhoto] = useState<ArtistPhotoData>(band.representative_photo ?? {url:'',source:'',author:'',credit:'',license:'',licenseUrl:'',usageBasis:'',identity:band.id,retrievedAt:''})
  const [approved, setApproved] = useState(false)
  const [evidence, setEvidence] = useState('')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const active = useRef(true), pending = useRef(false)
  useEffect(() => { active.current=true; return () => { active.current=false } }, [])
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return
    pending.current=true; setBusy(true); setError(''); setMessage('')
    try { await action() } catch(e) { if(active.current) setError(adminError(e)) }
    finally { pending.current=false; if(active.current) setBusy(false) }
  }
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (mode==='manual' && !approved) return
    void run(async () => {
      if (!backend || !band.updated_at) throw new Error('MIGRATION_REQUIRED')
      const {error}=await backend.rpc('admin_update_artist',{band_id:band.id,expected_updated_at:band.updated_at,aliases:aliases.split(',').map(s=>s.trim()).filter(Boolean),photo:mode==='manual'?photo:null,mode})
      if(error) throw error
      if(active.current) {setMessage('별칭·대표 이미지를 저장했습니다.'); onSaved()}
    })
  }
  return <div className="artist-editor"><form onSubmit={save}><fieldset disabled={busy}>
    <legend>{band.name} 관리</legend>
    {band.musicbrainz_id && <p><a href={`https://musicbrainz.org/artist/${band.musicbrainz_id}`} target="_blank" rel="noopener noreferrer">검증된 외부 신원 ↗</a></p>}
    <label>검색 별칭 · 쉼표로 구분<textarea value={aliases} onChange={e=>setAliases(e.target.value)} /></label>
    <label>대표 이미지 방식<select value={mode} onChange={e=>{setMode(e.target.value as typeof mode);setApproved(false)}}><option value="auto">외부 사진 자동 연결</option><option value="manual">관리자 지정 이미지</option><option value="hidden">이미지 삭제 · 이니셜 표시</option></select></label>
    {mode==='manual' && <><div className="admin-fields">{([
      ['url','대표 이미지 HTTPS URL'],['source','이미지 원본 출처 HTTPS URL'],['author','사진 저작자'],['license','라이선스 / 허락 명칭'],['licenseUrl','이용 조건 / 허락 근거 HTTPS URL'],['usageBasis','사용 근거 · 허락 범위'],['credit','추가 크레딧'],
    ] as const).map(([field,label])=><label key={field}>{label}<input required={field!=='credit'} type={['url','source','licenseUrl'].includes(field)?'url':'text'} pattern={['url','source','licenseUrl'].includes(field)?'https://.+':undefined} value={photo[field]??''} onChange={e=>{setPhoto(p=>({...p,[field]:e.target.value}));setApproved(false)}} /></label>)}</div>
      <label className="admin-check"><input type="checkbox" required checked={approved} onChange={e=>setApproved(e.target.checked)} />대상 아티스트와 이미지 이용 조건을 확인했습니다</label></>}
    <p>저장 전 미리보기</p><ArtistPhoto name={band.name} bandId={band.id} photoMode={mode} representativePhoto={photo} />
    <button className="outline" disabled={mode==='manual'&&!approved}>별칭·대표 이미지 저장</button>
    </fieldset></form>
    <form onSubmit={e=>{e.preventDefault();void run(async()=>{
      if(!backend) throw new Error('BACKEND_REQUIRED')
      const {error}=await backend.rpc('admin_approve_band',{band_id:band.id,evidence_url:evidence})
      if(error) throw error
      if(active.current) setMessage('공식 근거로 대상 장르를 승인했습니다. 공연 공개 조건은 별도로 검사합니다.')
    })}}><label>대상 록·밴드 성격의 공식 근거 URL<input type="url" pattern="https://.+" required value={evidence} onChange={e=>setEvidence(e.target.value)} /></label><button className="outline" disabled={busy}>대상 장르 승인</button></form>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  </div>
}
