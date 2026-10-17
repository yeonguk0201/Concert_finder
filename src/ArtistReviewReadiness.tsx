import { useEffect, useRef, useState } from 'react'
import { backend } from './backend'
import { adminError } from './adminApi'

type Counts = { state: 'ready' | 'idle' | 'busy'; reason: string; eligible: number; notices: number }
type Status = { current: Counts; lastCheckedAt: string | null; lastScheduled: Counts | null }

export function ArtistReviewReadiness() {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const active = useRef(true), pending = useRef(false), opened = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const load = async () => {
    if (!backend || pending.current) return
    pending.current = true; setBusy(true); setError(''); setStatus(null)
    try {
      const { data, error } = await backend.rpc('admin_artist_review_readiness')
      if (error) throw error
      if (active.current) setStatus(data as Status)
    } catch (e) { if (active.current) setError(adminError(e)) }
    finally { pending.current = false; if (active.current) setBusy(false) }
  }
  return <details onToggle={e => {
    if (e.target === e.currentTarget && e.currentTarget.open && !opened.current) {
      opened.current = true; void load()
    }
  }}>
    <summary>검수 대기 확인 · 모델 자동 호출 없음</summary>
    <p>서버가 5시간 단위로 대기 여부를 확인합니다. 이 검사와 아래 조회는 모델을 호출하거나 아티스트 검수를 시작하지 않습니다.</p>
    <button type="button" className="outline" disabled={busy} onClick={() => void load()}>검수 대기 상태 조회</button>
    {busy && <p role="status">대기 상태를 확인하는 중…</p>}
    {error && <p role="alert">{error}</p>}
    {status && <div role="status">
      <p>{status.current.state === 'busy' ? '다른 검수가 진행 중입니다.' : status.current.state === 'ready' ? '수동 검수가 필요합니다.' : '지금 배정할 검수 대상이 없습니다.'}</p>
      <p>현재 배정 가능: 최대 {status.current.eligible}팀 · 확인할 알림: {status.current.notices}건</p>
      {status.current.reason === 'lease_recovery' && <p>이전 실행의 임대가 만료됐습니다. 승인된 실행기로 복구와 미완료 대상을 확인해 주세요.</p>}
      <p>최근 서버 예약 검사: {status.lastCheckedAt ? new Date(status.lastCheckedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + ' KST' : '첫 검사 대기'}</p>
      <p>작업이 있으면 클라우드에서 아티스트 검수를 요청하세요. 아티스트별 설정 조치를 해결한 경우 아래에서 팀을 선택해 재개 요청을 합니다.</p>
    </div>}
  </details>
}
