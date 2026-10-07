import { useEffect, useState } from 'react'
import { backend } from './backend'
import type { AdminCatalog, AdminConcert } from './adminApi'
import { adminError } from './adminApi'

type Candidate = { id: string; source_url: string; payload: AdminConcert; previous_payload: AdminConcert | null; revision: number; fetched_at: string; status: string }
export function CollectionPanel({ catalog, onSelect }: { catalog: AdminCatalog; onSelect: (concert: AdminConcert) => void }) {
  const [rows, setRows] = useState<Candidate[]>([])
  const [runs, setRuns] = useState<{ created_at: string; candidate_count: number; failures: { source_url: string; error: string }[] }[]>([])
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    if (!backend) return
    void Promise.all([backend.from('collection_candidates').select('*').eq('status', 'pending').order('fetched_at', { ascending: false }), backend.from('collection_runs').select('created_at,candidate_count,failures').order('created_at', { ascending: false }).limit(1)])
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
    onSelect(existing ? { ...structuredClone(existing), title: row.payload.title, venue: row.payload.venue, starts_on: row.payload.starts_on, ends_on: row.payload.ends_on, sessions: row.payload.sessions } : structuredClone(row.payload))
  }
  return <section aria-label="자동 수집 후보" className="collection-panel">
    <h2>자동 수집 후보</h2><p>수집 정보는 검수 후 공개합니다. 발표일·출연 밴드·예매 시각은 공식 출처로 보완하세요.</p>
    <button className="outline" disabled={busy} onClick={() => setRevision(v => v + 1)}>수집 후보 다시 불러오기</button>
    {error && <p role="alert">{error}</p>}
    {runs.map(run => <div key={run.created_at}><p>마지막 실행: {new Date(run.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST · {run.candidate_count}개 수집 · {run.failures.length}개 실패</p>{run.failures.map(f => <p key={f.source_url}>{f.source_url}: {f.error}</p>)}</div>)}
    {!rows.length && <p>검수 대기 후보가 없습니다.</p>}
    {rows.map(row => <article key={row.id}><h3>{row.payload.title}</h3><a href={row.source_url} target="_blank" rel="noopener noreferrer">주최사 원문 ↗</a><p>{row.payload.starts_on} · {row.payload.venue} · 수정 {row.revision}</p>
      {row.previous_payload && <details><summary>이전 수집 내용 비교</summary><pre>{JSON.stringify(row.previous_payload, null, 2)}</pre><pre>{JSON.stringify(row.payload, null, 2)}</pre></details>}
      <button className="outline" disabled={busy} onClick={() => select(row)}>검수 입력에 반영</button>
      <button className="outline" disabled={busy} onClick={() => void resolve(row, 'reviewed')}>검수 완료 표시</button>
      <button className="outline" disabled={busy} onClick={() => void resolve(row, 'dismissed')}>후보 제외</button>
    </article>)}
  </section>
}
