import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { backend } from './backend'
import { adminError, artistStatusLabels } from './adminApi'
import type { ArtistStatus } from './adminApi'

type Review = {
  name: string
  band_version: string
  curation_status: ArtistStatus
  target_enabled: boolean
  can_resume: boolean
  state: null | {
    outcome: 'complete' | 'failed' | 'action_required'
    checked_at: string
    error: string | null
    genre_summary: string | null
    channel_summary: string | null
  }
}
const reasons: Record<string, string> = {
  YOUTUBE_ACTION_REQUIRED: '서버 YouTube API 키·권한·할당량을 확인해 주세요.',
  CONFIGURATION_REQUIRED: '실행 환경과 허용 출처 설정을 확인해 주세요.',
  EDIT_CONFLICT: '아티스트 정보가 변경됐습니다. 최신 정보와 근거를 확인해 주세요.',
  CHANNEL_LOCKED: '관리자가 지정한 채널입니다. 기존 지정과 검수 근거를 확인해 주세요.',
  CHANNEL_ID_CHANGED: '기존 채널과 다른 ID입니다. 공식 근거를 다시 확인해 주세요.',
}
const outcomes = { complete: '검수 완료', failed: '다음 실행 재시도 대기', action_required: '관리자 확인 후 재개 필요' }

export function ArtistReviewControl({ bandId, onSaved }: { bandId: string; onSaved: (message: string) => void }) {
  const [review, setReview] = useState<Review | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const active = useRef(true), pending = useRef(false), opened = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const load = async () => {
    if (!backend || pending.current) return
    pending.current = true; setBusy(true); setError(''); setReview(null); setConfirmed(false)
    try {
      const { data, error } = await backend.rpc('admin_artist_review_status', { target_band_id: bandId })
      if (error) throw error
      if (active.current) setReview(data as Review)
    } catch (e) { if (active.current) setError(adminError(e)) }
    finally { pending.current = false; if (active.current) setBusy(false) }
  }
  const resume = async (event: FormEvent) => {
    event.preventDefault()
    if (!backend || pending.current || !review?.can_resume || !review.state || !confirmed || reason.trim().length < 10) return
    pending.current = true; setBusy(true); setError('')
    try {
      const { error } = await backend.rpc('admin_resume_artist_review', {
        target_band_id: bandId,
        expected_version: review.band_version,
        expected_checked_at: review.state.checked_at,
        reason: reason.trim(),
      })
      if (error) throw error
      if (active.current) {
        setReview(null); setConfirmed(false); setReason('')
        onSaved(`${review.name} 자동 검수 재개를 요청했습니다. 다음 허용 실행에서 처리하며 즉시 실행되지는 않습니다.`)
      }
    } catch (e) {
      if (active.current) {
        // The server may have committed despite a lost response. Require a fresh snapshot before retrying.
        setReview(null); setConfirmed(false)
        setError(`${adminError(e)} 검수 상태를 다시 불러와 반영 여부를 확인해 주세요.`)
      }
    } finally { pending.current = false; if (active.current) setBusy(false) }
  }
  return <details onToggle={e => {
    if (e.target === e.currentTarget && e.currentTarget.open && !opened.current) {
      opened.current = true; void load()
    }
  }}>
    <summary>자동 검수 상태·재개</summary>
    <p>중단 원인을 해결한 뒤 재개합니다. 다음 허용 실행에서 다시 조사하며 기존 수동 판단과 채널 잠금은 유지합니다.</p>
    <button type="button" className="outline" disabled={busy} onClick={() => void load()}>검수 상태 다시 불러오기</button>
    {busy && <p role="status">자동 검수 상태를 처리하는 중…</p>}
    {error && <p role="alert">{error}</p>}
    {review && <>
      <p>{review.name} · {artistStatusLabels[review.curation_status]} · {review.state ? outcomes[review.state.outcome] : '자동 검수 기록 없음'}</p>
      {!review.target_enabled && <p>자동 검수 대상이 비활성 상태입니다. 운영 대상 설정을 먼저 확인해 주세요.</p>}
      {review.state && <>
        <p>최근 검수: {new Date(review.state.checked_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST</p>
        {review.state.error && <p>{reasons[review.state.error] ?? '조사에 필요한 출처와 실행 환경을 확인해 주세요.'}</p>}
        {review.state.genre_summary && <p>장르 검수: {review.state.genre_summary}</p>}
        {review.state.channel_summary && <p>채널 검수: {review.state.channel_summary}</p>}
      </>}
      {review.state?.outcome === 'action_required' && review.curation_status !== 'unreviewed' && <p>먼저 아티스트 관리 상태를 검토해 미검수로 복원해야 재개할 수 있습니다.</p>}
      {review.can_resume && <form onSubmit={e => void resume(e)}><fieldset disabled={busy}>
        <legend>자동 검수 재개</legend>
        <label>재개 사유 · 10자 이상<textarea required minLength={10} maxLength={1500} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <label className="admin-check"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />중단 원인을 해결하고 최신 상태를 확인했습니다</label>
        <button className="outline" disabled={!confirmed || reason.trim().length < 10}>자동 검수 재개 요청</button>
      </fieldset></form>}
    </>}
  </details>
}
