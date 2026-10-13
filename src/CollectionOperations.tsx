import { useEffect, useRef, useState } from 'react'
import { backend } from './backend'
import { adminError } from './adminApi'
type Health = {source:string;collection_enabled:boolean;publication_enabled:boolean;live_after:string|null;last_success:string|null;attention_required:boolean;last_run?:{state:string;candidate_count:number;published_count:number;review_count:number;attempts:number}|null}
export function CollectionOperations() {
  const [rows,setRows]=useState<Health[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0)
  const [expanded,setExpanded]=useState(false)
  const active=useRef(true),pending=useRef(false)
  useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
  useEffect(()=>{
    let current=true
    if(backend&&expanded) void Promise.resolve(backend.rpc('admin_collection_health')).then(({data,error})=>{
      if(!current)return
      if(error){setError('수집 운영 상태를 불러오지 못했습니다. 자동 수집 마이그레이션을 확인하세요.');return}
      setRows(Array.isArray(data)?data:[]);setError('')
    }).catch(()=>{if(current)setError('수집 운영 상태를 불러오지 못했습니다. 연결을 확인하세요.')})
    return()=>{current=false}
  },[revision,expanded])
  const update=async(row:Health,collect:boolean,publish:boolean,endBackfill=false)=>{
    if(!backend||pending.current)return
    pending.current=true;setBusy(true)
    try{
      const {error}=await backend.rpc('admin_collection_policy',{source_name:row.source,collect_enabled:collect,publish_enabled:publish,end_backfill:endBackfill})
      if(error)throw error
      if(active.current)setRevision(r=>r+1)
    }catch(e){if(active.current)setError(adminError(e))}finally{pending.current=false;if(active.current)setBusy(false)}
  }
  return <details className="collection-operations" onToggle={event=>setExpanded(event.currentTarget.open)}><summary>수집 자동 운영·중단</summary>
    <p>실제 마지막 성공과 지연을 확인하세요. 출처별 공식 발표·어댑터 검증 후 자동 공개를 켜고, 초기 채움 검증을 마친 뒤 무알림 채움을 종료합니다.</p>
    <button className="outline" disabled={busy} onClick={()=>setRevision(r=>r+1)}>운영 상태 새로고침</button>
    {error&&<p role="alert">{error}</p>}{rows.map(row=><article key={row.source}><h3>{row.source}</h3>
      <p>{row.attention_required?'운영 확인 필요':'정상'} · 마지막 성공 {row.last_success?new Date(row.last_success).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'기록 없음'}</p>
      {row.last_run&&<p>최근 {row.last_run.state} · 수집 {row.last_run.candidate_count} · 공개 {row.last_run.published_count} · 검수 {row.last_run.review_count} · 시도 {row.last_run.attempts}</p>}
      <label className="admin-check"><input type="checkbox" disabled={busy} checked={row.collection_enabled} onChange={e=>void update(row,e.target.checked,row.publication_enabled)} />수집 실행</label>
      <label className="admin-check"><input type="checkbox" disabled={busy} checked={row.publication_enabled} onChange={e=>void update(row,row.collection_enabled,e.target.checked)} />조건부 자동 공개</label>
      <p>{row.live_after?'신규 발표 알림 판정 활성 · 종료일 당일/과거 발표 무알림':'초기 채움 · 신규 공연 알림 보내지 않음'}</p>
      {!row.live_after&&<button className="outline" disabled={busy} onClick={()=>void update(row,row.collection_enabled,row.publication_enabled,true)}>검증 완료 · 초기 무알림 채움 종료</button>}
    </article>)}
  </details>
}
