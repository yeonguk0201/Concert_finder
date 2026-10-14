import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { backend } from './backend'
import { adminError, artistStatusLabels, artistCategoryLabels } from './adminApi'
import type { AdminBand, ArtistCategory, ArtistStatus, ArtistHistory } from './adminApi'
import { ArtistPhoto } from './ArtistPhoto'
import type { ArtistPhotoData } from './artistPhotoTypes'
import { saveArtistPhotoFile } from './artistPhotoUpload'

export function ArtistManagement({ bands, onSaved }: { bands: AdminBand[]; onSaved: () => void }) {
  const [selected, setSelected] = useState('')
  const [savedMessage, setSavedMessage] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const band = bands.find(b => b.id === selected)
  const filtered = bands.filter(b => (status === 'all' || (b.curation_status ?? 'unreviewed') === status) &&
    [b.name, b.country_code, ...b.aliases].some(value => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
  return <section aria-label="아티스트 DB 관리"><h2>아티스트 DB·대표 이미지</h2>
    <p>이름·국적·분류·노출 상태와 사진을 관리합니다. 보류·제외는 일반 목록과 자동 공개를 차단하며 기존 공연·찜 관계는 보존합니다. 제외 후 복구할 때 승인 근거를 다시 검토하세요.</p>
    <div className="admin-fields"><label>DB 이름·별칭·국가 검색<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label>관리 상태 필터<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">전체</option>{Object.entries(artistStatusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    <p>조건에 맞는 아티스트 {filtered.length}팀 · 전체 {bands.length}팀</p>
    <label>관리할 아티스트<select value={selected} onChange={e => {setSelected(e.target.value);setSavedMessage('')}}><option value="">아티스트 선택</option>{[...filtered, ...(band && !filtered.includes(band) ? [band] : [])].map(b => <option key={b.id} value={b.id}>{b.name} ({b.country_code}) · {artistStatusLabels[b.curation_status ?? 'unreviewed']}</option>)}</select></label>
    {band && !filtered.includes(band) && <p>선택한 아티스트는 현재 필터 밖에 있습니다. 편집 내용은 유지됩니다.</p>}
    {savedMessage && <p role="status">{savedMessage}</p>}
    {band && <ArtistEditor key={`${band.id}:${band.updated_at}`} band={band} onSaved={message => {setSavedMessage(message);onSaved()}} />}
  </section>
}

function ArtistEditor({ band, onSaved }: { band: AdminBand; onSaved: (message: string) => void }) {
  const [aliases, setAliases] = useState(band.aliases.join(', '))
  const [name, setName] = useState(band.name)
  const [country, setCountry] = useState(band.country_code)
  const [category, setCategory] = useState<ArtistCategory>(band.category ?? 'unclassified')
  const [status, setStatus] = useState<ArtistStatus>(band.curation_status ?? 'unreviewed')
  const [reason, setReason] = useState(band.curation_reason ?? '')
  const [evidence, setEvidence] = useState(band.curation_evidence_url ?? '')
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [mode, setMode] = useState<'auto' | 'manual' | 'hidden'>(band.photo_mode ?? 'auto')
  const [photo, setPhoto] = useState<ArtistPhotoData>(band.representative_photo ?? {url:'',source:'',author:'',credit:'',license:'',licenseUrl:'',usageBasis:'',identity:band.id,retrievedAt:''})
  const [approved, setApproved] = useState(false)
  const [photoInput, setPhotoInput] = useState<'url' | 'file'>('url')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const active = useRef(true), pending = useRef(false)
  useEffect(() => { active.current=true; return () => { active.current=false } }, [])
  const run = async (action: () => Promise<void>) => {
    if (pending.current || needsRefresh) return
    pending.current=true; setBusy(true); setError(''); setMessage('')
    try { await action() } catch(e) { if(active.current) setError(adminError(e)) }
    finally { pending.current=false; if(active.current) setBusy(false) }
  }
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (mode==='manual' && !approved) return
    void run(async () => {
      if (!backend || !band.updated_at) throw new Error('MIGRATION_REQUIRED')
      const values = aliases.split(',').map(s=>s.trim()).filter(Boolean)
      if (mode === 'manual' && photoInput === 'file') {
        if (!file) throw new Error('PHOTO_FILE_INVALID')
        await saveArtistPhotoFile(band, values, photo, file)
      } else {
        const {error}=await backend.rpc('admin_update_artist',{band_id:band.id,expected_updated_at:band.updated_at,aliases:values,photo:mode==='manual'?photo:null,mode})
        if(error) throw error
      }
      if(active.current) {setNeedsRefresh(true); onSaved(`${band.name} 별칭·대표 이미지를 저장했습니다.`)}
    })
  }
  const curate = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      if (!backend || !band.updated_at) throw new Error('MIGRATION_REQUIRED')
      const { error } = await backend.rpc('admin_curate_artist', {
        target_band_id: band.id, expected_updated_at: band.updated_at, artist_name: name.trim(), country: country.toUpperCase(),
        artist_category: category, artist_aliases: aliases.split(',').map(s => s.trim()).filter(Boolean),
        review_status: status, reason: reason.trim(), evidence_url: evidence.trim() || null,
      })
      if (error) throw error
      if (active.current) {setNeedsRefresh(true); onSaved(`${name.trim()} 정보를 ${artistStatusLabels[status]} 상태로 저장했습니다.`)}
    })
  }
  return <div className="artist-editor">
    <form onSubmit={curate}><fieldset disabled={busy || needsRefresh}>
      <legend>{band.name} DB 정보·노출 관리</legend>
      <p>현재 상태: {artistStatusLabels[band.curation_status ?? 'unreviewed']} · {artistCategoryLabels[band.category ?? 'unclassified']}</p>
      <div className="admin-fields">
        <label>아티스트 이름<input required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>국가 코드 · ISO 2자리<input required pattern="[A-Za-z]{2}" maxLength={2} value={country} onChange={e => setCountry(e.target.value)} /></label>
        <label>대상 분류<select value={category} onChange={e => setCategory(e.target.value as ArtistCategory)}>{Object.entries(artistCategoryLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>노출 관리 상태<select value={status} onChange={e => setStatus(e.target.value as ArtistStatus)}>{Object.entries(artistStatusLabels).map(([value,label]) => <option key={value} value={value}>{label}{band.curation_status === 'excluded' && value !== 'excluded' ? ' · 제외에서 복구' : ''}</option>)}</select></label>
      </div>
      <label>DB 검색 별칭 · 쉼표로 구분<textarea value={aliases} onChange={e => setAliases(e.target.value)} /></label>
      <label>변경·검수 이유<textarea required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <label>대상 분류의 공식 근거 HTTPS URL<input type="url" pattern="https://.+" required={status === 'approved'} value={evidence} onChange={e => setEvidence(e.target.value)} /></label>
      <p>{status === 'held' || status === 'excluded' ? '일반 목록에서 숨기고 자동 공개 승인을 해제합니다. 행과 기존 관계는 삭제하지 않습니다.' : status === 'approved' ? '신원·대상 분류·공식 근거를 확인한 경우에만 승인하세요. 공연의 공식 발표·공개 조건은 별도로 검사합니다.' : '미검수는 현재 일반 목록에 표시되지만 자동 공개 승인으로 취급하지 않습니다.'}</p>
      <button className="outline" disabled={!reason.trim() || !name.trim() || (status === 'approved' && (category === 'unclassified' || !evidence.trim()))}>{band.curation_status === 'excluded' && status !== 'excluded' ? '아티스트 복구·정보 저장' : 'DB 정보·노출 상태 저장'}</button>
    </fieldset></form>
    <form onSubmit={save}><fieldset disabled={busy || needsRefresh}>
    <legend>{band.name} 관리</legend>
    {band.musicbrainz_id && <p><a href={`https://musicbrainz.org/artist/${band.musicbrainz_id}`} target="_blank" rel="noopener noreferrer">검증된 외부 신원 ↗</a></p>}
    <label>검색 별칭 · 쉼표로 구분<textarea value={aliases} onChange={e=>setAliases(e.target.value)} /></label>
    <label>대표 이미지 방식<select value={mode} onChange={e=>{setMode(e.target.value as typeof mode);setApproved(false)}}><option value="auto">외부 사진 자동 연결</option><option value="manual">관리자 지정 이미지</option><option value="hidden">이미지 삭제 · 이니셜 표시</option></select></label>
    {mode==='manual' && <>
      <label>이미지 입력 방식<select value={photoInput} onChange={e=>{setPhotoInput(e.target.value as 'url' | 'file');setApproved(false)}}><option value="url">HTTPS URL 지정</option><option value="file">파일 업로드 · 저장소 보관</option></select></label>
      {photoInput === 'file' && <><label>대표 사진 파일<input type="file" required accept="image/jpeg,image/png,image/webp" onChange={e=>{setFile(e.target.files?.[0] ?? null);setApproved(false)}} /></label><p>JPEG·PNG·WebP, 최대 2MiB·2,400만 화소. 최대 1024px PNG로 변환해 보관하며 파일의 위치·촬영 메타데이터를 제거합니다. 저장한 사진은 공개 URL로 제공됩니다.</p>{file && <p>선택한 파일: {file.name}</p>}</>}
      <div className="admin-fields">{([
      ['url','대표 이미지 HTTPS URL'],['source','이미지 원본 출처 HTTPS URL'],['author','사진 저작자'],['license','라이선스 / 허락 명칭'],['licenseUrl','이용 조건 / 허락 근거 HTTPS URL'],['usageBasis','사용 근거 · 허락 범위'],['credit','추가 크레딧'],
    ] as const).filter(([field])=>field !== 'url' || photoInput === 'url').map(([field,label])=><label key={field}>{label}<input required={field!=='credit'} maxLength={2000} type={['url','source','licenseUrl'].includes(field)?'url':'text'} pattern={['url','source','licenseUrl'].includes(field)?'https://.+':undefined} value={photo[field]??''} onChange={e=>{setPhoto(p=>({...p,[field]:e.target.value}));setApproved(false)}} /></label>)}</div>
      <label className="admin-check"><input type="checkbox" required checked={approved} onChange={e=>setApproved(e.target.checked)} />대상 아티스트와 이미지 이용 조건을 확인했습니다</label></>}
    {mode === 'manual' && photoInput === 'file' ? <p>파일은 저장 시 검증합니다. 저장 후 목록에서 사진과 출처를 확인하세요.</p> : <><p>저장 전 미리보기</p><ArtistPhoto name={band.name} bandId={band.id} photoMode={mode} representativePhoto={photo} /></>}
    <p>이미지 삭제는 표시를 중단합니다. 교체 전 보관 파일은 변경 이력 확인을 위해 유지됩니다.</p>
    <button className="outline" disabled={mode==='manual'&&(!approved || (photoInput === 'file' && !file))}>{busy && photoInput === 'file' ? '사진 검증·저장 중…' : '별칭·대표 이미지 저장'}</button>
    </fieldset></form>
    {needsRefresh && <p role="status">저장 완료 · 최신 버전을 불러오는 중입니다. 갱신되지 않으면 상단의 목록 다시 불러오기를 눌러 주세요.</p>}
    <ArtistChangeHistory bandId={band.id} />
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  </div>
}

function ArtistChangeHistory({ bandId }: { bandId: string }) {
  const [rows, setRows] = useState<ArtistHistory[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const active = useRef(true), pending = useRef(false)
  useEffect(() => {active.current = true; return () => {active.current = false}}, [])
  const load = async () => {
    if (!backend || pending.current) return
    pending.current = true; setLoading(true); setError('')
    try {
      const {data,error} = await backend.rpc('admin_artist_history', {target_band_id: bandId})
      if (error) throw error
      if (active.current) setRows(data ?? [])
    } catch(e) {if (active.current) setError(adminError(e))}
    finally {pending.current = false; if (active.current) setLoading(false)}
  }
  const fields = {name:'이름',country_code:'국가',category:'분류',curation_status:'관리 상태',aliases:'별칭',curation_reason:'변경 이유',curation_evidence_url:'공식 근거',photo_mode:'사진 방식',representative_photo:'사진·이용 근거'} as const
  const describe = (record: Partial<AdminBand>, field: keyof typeof fields) => {
    const value = record[field]
    if (field === 'curation_status' && record.curation_status) return artistStatusLabels[record.curation_status]
    if (field === 'category' && record.category) return artistCategoryLabels[record.category]
    return value == null ? '없음' : Array.isArray(value) ? value.join(', ') || '없음' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  }
  return <details className="admin-history" onToggle={e => {if (e.target === e.currentTarget && e.currentTarget.open) void load()}}><summary>아티스트 변경 이력 · 최근 50건</summary>
    <button type="button" className="outline" disabled={loading} onClick={() => void load()}>이력 다시 불러오기</button>
    {loading && <p role="status">변경 이력을 불러오는 중…</p>}{error && <p role="alert">{error}</p>}
    {!loading && !error && !rows.length && <p>기록된 변경이 없습니다.</p>}
    {rows.map(row => <details key={row.id}><summary>{new Date(row.changed_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST · {row.actor_id ? `관리자 ${row.actor_id}` : '서버 작업'}</summary><dl>
      {Object.entries(fields).filter(([field]) => JSON.stringify(row.before_record[field as keyof AdminBand]) !== JSON.stringify(row.after_record[field as keyof AdminBand])).map(([field,label]) => <div key={field}><dt>{label}</dt><dd>{describe(row.before_record,field as keyof typeof fields)} → {describe(row.after_record,field as keyof typeof fields)}</dd></div>)}
    </dl></details>)}
  </details>
}
