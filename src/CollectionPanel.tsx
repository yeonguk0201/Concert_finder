import { useEffect, useState } from 'react'
import { backend } from './backend'
import type { AdminCatalog, AdminConcert } from './adminApi'
import { adminError } from './adminApi'
import { candidatePeriod } from './collectionPeriod'

type Candidate = { id: string; source_url: string; payload: AdminConcert; previous_payload: AdminConcert | null; revision: number; fetched_at: string; status: string }
export function CollectionPanel({ catalog, onSelect }: { catalog: AdminCatalog; onSelect: (concert: AdminConcert) => void }) {
  const [rows, setRows] = useState<Candidate[]>([])
  const [runs, setRuns] = useState<{ source?: string; excluded?: unknown[]; created_at: string; candidate_count: number; failures: { source_url: string; error: string }[] }[]>([])
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [period, setPeriod] = useState('upcoming')
  useEffect(() => {
    let active = true
    if (!backend) return
    void Promise.all([backend.from('collection_candidates').select('*').eq('status', 'pending').order('fetched_at', { ascending: false }), backend.from('collection_runs').select('source,excluded,created_at,candidate_count,failures').order('created_at', { ascending: false }).limit(3)])
      .then(([candidates, history]) => { if (!active) return; if (candidates.error || history.error) throw new Error('collection'); setRows(candidates.data); setRuns(history.data); setError('') })
      .catch(() => { if (active) setError('수집 후보를 불러오지 못했습니다. 마이그레이션과 연결을 확인하세요.') })
    return () => { active = false }
  }, [revision])
  const resolve = async (row: Candidate, resolution: string) => {
    if (!backend || busy) return
    setBusy(true)
    const { error } = await backend.rpc('admin_resolve_candidate', { candidate_id: row.id, expected_revision: row.revision, resolution })
    setBusy(false)
    if (error) setError(adminError(error)); else setRevision(v => v + 1)
  }
  const select = (row: Candidate) => {
    const existing = catalog.concerts.find(c => c.sources.some(s => s.url === row.source_url))
    // Preserve verified announcement/lineup/ticket identity; collection is a proposed edit.
    onSelect(existing ? { ...structuredClone(existing), title: row.payload.title, venue: row.payload.venue, starts_on: row.payload.starts_on, ends_on: row.payload.ends_on, sessions: row.payload.sessions,
      discovered_artists: row.payload.discovered_artists, review_reasons: row.payload.review_reasons,
      artwork: existing.artwork?.url === row.payload.artwork?.url ? existing.artwork : row.payload.artwork ?? existing.artwork } : structuredClone(row.payload))
  }
  const visible = rows.filter(row => period === 'all' || candidatePeriod(row.payload) === period)
  return <section aria-label="자동 수집 후보" className="collection-panel">
    <h2>자동 수집 후보</h2><p>수집 정보는 검수 후 공개합니다. 발표일·출연 밴드·예매 시각은 공식 출처로 보완하세요.</p>
    <button className="outline" disabled={busy} onClick={() => setRevision(v => v + 1)}>수집 후보 다시 불러오기</button>
    <label>후보 일정 <select value={period} onChange={event => setPeriod(event.target.value)}><option value="upcoming">예정 공연</option><option value="unknown">날짜 미확인</option><option value="past">지난 공연</option><option value="all">전체</option></select></label>
    {error && <p role="alert">{error}</p>}
    {runs.map(run => <div key={`${run.source}-${run.created_at}`}><p>최근 실행 ({run.source ?? 'ualive'}): {new Date(run.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST · {run.candidate_count}개 수집 · {run.failures.length}개 실패 · {run.excluded?.length ?? 0}개 제외</p>{run.failures.map(f => <p key={f.source_url}>{f.source_url}: {f.error}</p>)}</div>)}
    <p role="status">예정 {rows.filter(row => candidatePeriod(row.payload) === 'upcoming').length}개 · 날짜 미확인 {rows.filter(row => candidatePeriod(row.payload) === 'unknown').length}개 · 지난 공연 {rows.filter(row => candidatePeriod(row.payload) === 'past').length}개</p>
    {!visible.length && <p>선택한 일정에 검수 대기 후보가 없습니다.</p>}
    {visible.map(row => <article key={row.id}><h3>{row.payload.title}</h3><a href={row.source_url} target="_blank" rel="noopener noreferrer">공식 원문 ↗</a><p>{row.payload.starts_on ?? '공연일 미정'} · {row.payload.venue ?? '장소 미정'} · 수정 {row.revision}</p>
      {row.payload.discovered_artists && <div><strong>원문 출연진</strong><ul>{row.payload.discovered_artists.map((artist, index) => <li key={`${artist.name}-${index}`}>{artist.name ?? '이름 미확인'} · {artist.band_id ? '아티스트 연결됨 · 장르 검수 필요' : artist.reason ?? '신원·장르 검수 필요'}{artist.profile_url?.startsWith('https://') && <> · <a href={artist.profile_url} target="_blank" rel="noopener noreferrer">출연진 프로필 ↗</a></>}{artist.matches?.map(match => <p key={match.key}><a href={match.evidence} target="_blank" rel="noopener noreferrer">{match.name}</a> ({match.country ?? '국적 미확인'}) {match.disambiguation}</p>)}</li>)}</ul></div>}
      {row.previous_payload && <details><summary>이전 수집 내용 비교</summary><pre>{JSON.stringify(row.previous_payload, null, 2)}</pre><pre>{JSON.stringify(row.payload, null, 2)}</pre></details>}
      {row.payload.review_reasons?.map(reason => <p key={reason}>{reason}</p>)}
      {row.payload.artwork && <p>포스터 후보 · <a href={row.payload.artwork.url} target="_blank" rel="noopener noreferrer">이미지 원문 ↗</a> · {row.payload.artwork.selection_reason} · 이용 조건 검토 전 표시 안 함</p>}
      <button className="outline" disabled={busy} onClick={() => select(row)}>검수 입력에 반영</button>
      <button className="outline" disabled={busy} onClick={() => void resolve(row, 'reviewed')}>검수 완료 표시</button>
      <button className="outline" disabled={busy} onClick={() => void resolve(row, 'dismissed')}>후보 제외</button>
    </article>)}
  </section>
}
