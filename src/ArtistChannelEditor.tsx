import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { backend } from './backend'
import { adminError } from './adminApi'
import type { AdminBand } from './adminApi'
import type { ManagedChannel, ChannelHistory } from './artistChannels'
import { channelUrl } from './artistChannels'

const statusLabels: Record<string,string> = { pending:'첫 조회 대기',refreshed:'갱신 완료',reused:'유효한 사진 유지',candidate:'공식 근거 검수 대기',needs_review:'재검수 필요',failed:'갱신 실패',deferred:'다음 조회 대기',key_required:'서버 API 키 확인 필요',unavailable:'채널 조회 불가',skipped:'노출 관리에 따라 갱신 중단' }
const reasonLabels: Record<string,string> = { CHANNEL_SHARED_ACROSS_IDENTITIES:'여러 아티스트가 같은 채널을 사용합니다.',CHANNEL_ID_CHANGED:'채널 주소가 다른 채널 ID를 가리킵니다.',CHANNEL_AMBIGUOUS:'조회된 채널을 하나로 확정할 수 없습니다.',OFFICIAL_EVIDENCE_REQUIRED:'공식 페이지의 채널 연결을 다시 확인해 주세요.',CHANNEL_NOT_FOUND:'채널을 찾을 수 없습니다.',PHOTO_UNAVAILABLE:'채널 사진을 제공하지 않습니다.',LOCKED_ID_REQUIRED:'고정할 채널 ID와 채널 주소를 확인해 주세요.',ARTIST_CURATION_BLOCKED:'보류·제외한 아티스트입니다.' }

export function ArtistChannelEditor({ band, onSaved }: { band: AdminBand; onSaved: (message: string) => void }) {
  const [loaded,setLoaded] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState('')
  const [saved,setSaved] = useState<ManagedChannel | null>(null), [history,setHistory] = useState<ChannelHistory[]>([])
  const [website,setWebsite] = useState(''), [channel,setChannel] = useState(''), [evidence,setEvidence] = useState('')
  const [verification,setVerification] = useState<ManagedChannel['verification']>('candidate')
  const [locked,setLocked] = useState(false), [channelId,setChannelId] = useState(''), [confirmed,setConfirmed] = useState(false)
  const active = useRef(true), pending = useRef(false)
  useEffect(() => { active.current=true; return () => {active.current=false} }, [])
  const load = async () => {
    if (!backend || pending.current) return
    pending.current=true; setBusy(true); setError('')
    try {
      const {data,error}=await backend.rpc('admin_artist_channel',{target_band_id:band.id})
      if (error) throw error
      if (!active.current) return
      const profile: ManagedChannel | null=data?.profile ?? null
      setSaved(profile); setHistory(data?.history ?? []); setWebsite(profile?.website_url ?? '')
      setChannel(profile?.channel_url ?? ''); setEvidence(profile?.evidence.find(e=>e.kind==='official_artist_page')?.url ?? '')
      setVerification(profile?.verification ?? 'candidate'); setLocked(profile?.locked ?? false)
      setChannelId(profile?.previous_channel_id ?? ''); setConfirmed(false); setLoaded(true)
    } catch(e) { if (active.current) setError(adminError(e)) }
    finally { pending.current=false; if (active.current) setBusy(false) }
  }
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!backend || !loaded || pending.current || (verification==='verified' && !confirmed)) return
    pending.current=true; setBusy(true); setError('')
    void (async()=>{
      try {
        const {error}=await backend.rpc('admin_save_artist_channel',{
          target_band_id:band.id,expected_band_updated_at:band.updated_at,expected_updated_at:saved?.updated_at ?? null,
          profile:{musicBrainzId:band.musicbrainz_id,websiteUrl:website.trim() || null,channelUrl:channel.trim(),verification,locked,
            previousChannelId:channelId.trim() || null,
            evidence:evidence.trim() ? [{kind:'official_artist_page',url:evidence.trim(),linkedChannelUrl:channel.trim(),identityMatched:confirmed,checkedAt:new Date().toISOString()}] : [],
          },
        })
        if (error) throw error
        if (active.current) {
          setLoaded(false); setConfirmed(false)
          onSaved(`${band.name} 공식 링크와 검수 근거를 저장했습니다. 사진은 다음 서버 조회 후 표시됩니다.`)
        }
      } catch(e) { if (active.current) setError(adminError(e)) }
      finally { pending.current=false; if (active.current) setBusy(false) }
    })()
  }
  const unavailable = band.curation_status==='held' || band.curation_status==='excluded' || !band.musicbrainz_id
  return <details className="artist-channel-editor" onToggle={e=>{if(e.target===e.currentTarget && e.currentTarget.open && !loaded) void load()}}>
    <summary>공식 사이트·YouTube 채널 검수</summary>
    <p>공식 페이지에서 이 아티스트의 채널로 직접 연결되는지 확인합니다. 이름 일치나 채널 조회 성공만으로 공식으로 승인하지 않습니다.</p>
    <button type="button" className="outline" disabled={busy} onClick={()=>void load()}>공식 채널 정보 다시 불러오기</button>
    {busy && <p role="status">공식 채널 정보를 처리하는 중…</p>}
    {error && <p role="alert">{error}</p>}
    {unavailable && <p>먼저 아티스트 신원과 노출 상태를 확인해 주세요. 보류·제외 또는 외부 ID가 없는 아티스트는 채널을 연결하지 않습니다.</p>}
    {loaded && <>
      <p>최근 조회: {saved?.last_attempt_at ? new Date(saved.last_attempt_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST' : '아직 실행하지 않음'} · {statusLabels[saved?.last_status ?? 'pending'] ?? '조회 상태 확인 필요'}</p>
      {saved?.last_reason && <p>{reasonLabels[saved.last_reason] ?? '서버 갱신에 실패했거나 대기 중입니다. 정기 실행 결과를 확인해 주세요.'}</p>}
      <form onSubmit={save}><fieldset disabled={busy || unavailable}>
        <legend>{band.name} 공식 링크</legend>
        <div className="admin-fields">
          <label>공식 사이트 HTTPS URL<input type="url" pattern="https://.+" maxLength={2000} value={website} onChange={e=>{setWebsite(e.target.value);setConfirmed(false)}} /></label>
          <label>YouTube 채널 HTTPS URL<input required type="url" maxLength={500} value={channel} onChange={e=>{setChannel(e.target.value);setConfirmed(false)}} /></label>
          <label>채널 검수 상태<select value={verification} onChange={e=>{setVerification(e.target.value as typeof verification);setConfirmed(false)}}><option value="candidate">후보 · 공개 전 검수</option><option value="verified">공식 확인</option><option value="needs_review">재검수 · 공개 중단</option></select></label>
          <label>채널을 직접 연결한 공식 근거 HTTPS URL<input required={verification==='verified'} type="url" pattern="https://.+" maxLength={2000} value={evidence} onChange={e=>{setEvidence(e.target.value);setConfirmed(false)}} /></label>
          <label>확인된 YouTube 채널 ID<input placeholder="UC…" pattern="UC[A-Za-z0-9_-]{22}" maxLength={24} required={locked} value={channelId} onChange={e=>{setChannelId(e.target.value);setConfirmed(false)}} /></label>
        </div>
        <label className="admin-check"><input type="checkbox" checked={locked} onChange={e=>{setLocked(e.target.checked);setConfirmed(false)}} />이 채널 ID로 고정 · 일괄 입력으로 교체 금지</label>
        {locked && <p>고정하려면 채널 URL을 https://www.youtube.com/channel/UC… 형식으로 입력하세요.</p>}
        {verification==='verified' && <label className="admin-check"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />공식 페이지의 아티스트 신원과 연결된 채널을 확인했습니다</label>}
        <p>공식 근거는 90일 안에 재검수합니다. 사진은 서버에서 7일마다 갱신하고, 실패 시 매일 재시도하며 30일이 지난 캐시는 삭제합니다. 관리자 지정 사진이 우선합니다.</p>
        <button className="outline" disabled={!channelUrl(channel.trim()) || (verification==='verified'&&!confirmed)}>공식 링크·검수 저장</button>
      </fieldset></form>
      <details className="admin-history"><summary>공식 링크 변경 이력 · 최근 20건</summary>
        {!history.length && <p>기록된 변경이 없습니다.</p>}
        {history.map(row=><div key={row.id}><p>{new Date(row.changed_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST · {row.actor_id ? '관리자 검수' : '일괄 검수 입력'}</p><p>{row.before_record?.channel_url ?? '미연결'} → {row.after_record.channel_url} · {row.after_record.verification==='verified' ? '공식 확인' : '검수 대기'}</p></div>)}
      </details>
    </>}
  </details>
}
