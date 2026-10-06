import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { adminError, emptyConcert, kstInput, kstTimestamp, loadAdminCatalog, saveAdminBand, saveAdminConcert } from './adminApi'
import type { AdminCatalog, AdminConcert } from './adminApi'
import './AdminPanel.css'

const statusLabels = { draft: '초안', review: '검수 대기', published: '공개', withdrawn: '공개 중단' }
export function AdminPanel({ onSaved }: { onSaved: () => void }) {
  const [catalog, setCatalog] = useState<AdminCatalog>({ concerts: [], bands: [], history: [] })
  const [form, setForm] = useState<AdminConcert>(emptyConcert)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [bandName, setBandName] = useState('')
  const [country, setCountry] = useState('KR')
  const [aliases, setAliases] = useState('')
  const active = useRef(true)
  const saving = useRef(false)
  const savedId = useRef<string | null>(null)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    let current = true
    void loadAdminCatalog().then(data => { if (current) { setCatalog(data); setLoading(false); if (savedId.current) { setForm(data.concerts.find(c => c.id === savedId.current) ?? emptyConcert()); savedId.current = null; setNeedsRefresh(false) } } }).catch(e => { if (current) { setError(adminError(e)); setLoading(false) } })
    return () => { current = false }
  }, [revision])
  const edit = (patch: Partial<AdminConcert>) => setForm(previous => ({ ...previous, ...patch }))
  const reload = () => { setError(''); setLoading(true); setRevision(r => r + 1) }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (saving.current || needsRefresh) return
    saving.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const id = await saveAdminConcert(form)
      if (!active.current) return
      savedId.current = id
      setNeedsRefresh(true)
      // Reload the saved version so a second save uses the latest conflict token.
      const data = await loadAdminCatalog()
      if (!active.current) return
      setCatalog(data); setForm(data.concerts.find(c => c.id === id) ?? emptyConcert())
      savedId.current = null
      setNeedsRefresh(false)
      setMessage(`${statusLabels[form.status]} 상태로 저장했습니다.`); onSaved()
    } catch (e) { if (active.current) { setError(savedId.current ? '저장했지만 최신 목록을 확인하지 못했습니다. 목록을 다시 불러와 주세요.' : adminError(e)); if (savedId.current) onSaved() } }
    finally { saving.current = false; if (active.current) setBusy(false) }
  }
  const addBand = async (event: FormEvent) => {
    event.preventDefault()
    if (saving.current) return
    saving.current = true; setBusy(true); setError(''); setMessage('')
    try {
      await saveAdminBand(bandName.trim(), country.toUpperCase(), aliases.split(',').map(v => v.trim()).filter(Boolean))
      if (!active.current) return
      setBandName(''); setAliases(''); setMessage('밴드를 등록했습니다.'); reload(); onSaved()
    } catch (e) { if (active.current) setError(adminError(e)) }
    finally { saving.current = false; if (active.current) setBusy(false) }
  }
  const selectedHistory = catalog.history.filter(h => h.concert_id === form.id)
  const historyFields = [
    ['title', '공연 제목'], ['format', '형식'], ['status', '공개 상태'], ['city', '도시'], ['venue', '공연장'],
    ['starts_on', '공연 시작일'], ['ends_on', '공연 종료일'], ['announced_on', '발표일'], ['announced_at', '발표 시각'],
    ['announcement_verified', '발표 확인'], ['cancelled', '공연 취소'], ['sources', '공식 출처'], ['band_ids', '출연 밴드'], ['sessions', '회차'], ['ticket', '일반 예매'],
  ] as const
  const describe = (record: AdminConcert | null, field: typeof historyFields[number][0]): string => {
    if (!record) return '등록 전'
    if (field === 'status') return statusLabels[record.status]
    if (field === 'format') return record.format === 'solo' ? '단독 공연' : '페스티벌'
    if (field === 'sources') return record.sources.map(s => `${s.label}: ${s.url} (${s.verified_at ? '확인 완료' : '미확인'})`).join('\n') || '없음'
    if (field === 'band_ids') return record.band_ids.map(id => catalog.bands.find(b => b.id === id)?.name ?? '삭제된 밴드').join(', ') || '없음'
    if (field === 'sessions') return record.sessions.map(s => `${s.label}: ${s.starts_on ?? '미정'} ${kstInput(s.starts_at) || '시각 미정'}`).join('\n') || '없음'
    if (field === 'ticket') return record.ticket ? `오픈: ${kstInput(record.ticket.opens_at) || '미정'}\n예매처: ${record.ticket.booking_url || '미정'}\n가격: ${record.ticket.price_description || '미정'}` : '없음'
    const value = record[field]
    return typeof value === 'boolean' ? value ? '예' : '아니요' : value || '미정'
  }
  return <section className="admin-panel" aria-label="관리자 공연 검수">
    <div className="admin-heading"><div><h1>공연 검수</h1><p>공식 정보를 확인하고 공개하세요. 모든 입력 시각은 한국 시간입니다.</p></div><button className="outline" disabled={busy || loading} onClick={reload}>목록 다시 불러오기</button></div>
    {loading && <p role="status">관리자 목록을 불러오는 중…</p>}
    {error && <p role="alert" className="account-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    <div className="admin-layout"><aside className="admin-list" aria-label="검수 공연 목록">
      <button className="primary" disabled={busy || needsRefresh} onClick={() => { setForm(emptyConcert()); setMessage(''); setError('') }}>새 공연 등록</button>
      {catalog.concerts.map(c => <button key={c.id} disabled={busy || needsRefresh} aria-pressed={form.id === c.id} onClick={() => { setForm(structuredClone(c)); setMessage(''); setError('') }}><span>{statusLabels[c.status]}{c.cancelled ? ' · 취소' : ''}</span><strong>{c.title}</strong><small>{c.starts_on ?? '공연일 미정'}</small></button>)}
      {!loading && !catalog.concerts.length && <p>초안부터 등록해 보세요.</p>}
    </aside><div>
    <form onSubmit={save}><fieldset disabled={busy || loading || needsRefresh}>
      <legend>{form.id ? '공연 수정' : '새 공연'}</legend>
      <div className="admin-fields">
      <label className="wide">공연 제목<input required value={form.title} onChange={e => edit({ title: e.target.value })} /></label>
      <label>형식<select value={form.format} onChange={e => edit({ format: e.target.value as AdminConcert['format'] })}><option value="solo">단독 공연</option><option value="festival">페스티벌</option></select></label>
      <label>저장 상태<select value={form.status} onChange={e => edit({ status: e.target.value as AdminConcert['status'] })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>도시<input value={form.city ?? ''} onChange={e => edit({ city: e.target.value })} /></label>
      <label>공연장<input value={form.venue ?? ''} onChange={e => edit({ venue: e.target.value })} /></label>
      <label>공연 시작일<input type="date" value={form.starts_on ?? ''} onChange={e => edit({ starts_on: e.target.value || null })} /></label>
      <label>공연 종료일<input type="date" min={form.starts_on ?? ''} value={form.ends_on ?? ''} onChange={e => edit({ ends_on: e.target.value || null })} /></label>
      <label>공식 발표일<input type="date" value={form.announced_on ?? ''} onChange={e => edit({ announced_on: e.target.value || null })} /></label>
      <label>공식 발표 시각 · 미확인이면 비움<input type="datetime-local" value={kstInput(form.announced_at)} onChange={e => edit({ announced_at: kstTimestamp(e.target.value) })} /></label>
      </div>
      <label className="admin-check"><input type="checkbox" checked={form.announcement_verified} onChange={e => edit({ announcement_verified: e.target.checked })} />공식 출처에서 발표일을 확인했습니다</label>
      <label className="admin-check"><input type="checkbox" checked={form.cancelled} onChange={e => edit({ cancelled: e.target.checked })} />공식 취소 안내를 확인했습니다</label>
      <h2>출연 밴드</h2><div className="admin-lineup">{catalog.bands.map(b => <label className="admin-check" key={b.id}><input type="checkbox" checked={form.band_ids.includes(b.id)} onChange={e => edit({ band_ids: e.target.checked ? [...form.band_ids, b.id] : form.band_ids.filter(id => id !== b.id) })} />{b.name} ({b.country_code})</label>)}</div>
      {!catalog.bands.length && <p>아래에서 밴드를 먼저 등록하세요.</p>}
      <h2>공식 출처</h2>
      {form.sources.map((s, index) => <div className="admin-repeat" key={index}>
        <label>출처 이름<input required value={s.label} onChange={e => edit({ sources: form.sources.map((v, i) => i === index ? { ...v, label: e.target.value } : v) })} /></label>
        <label>공식 HTTPS 링크<input required type="url" pattern="https://.+" value={s.url} onChange={e => edit({ sources: form.sources.map((v, i) => i === index ? { ...v, url: e.target.value } : v) })} /></label>
        <label className="admin-check"><input type="checkbox" checked={Boolean(s.verified_at)} onChange={e => edit({ sources: form.sources.map((v, i) => i === index ? { ...v, verified_at: e.target.checked ? new Date().toISOString() : null } : v) })} />내용 확인 완료</label>
        <button type="button" className="outline" onClick={() => edit({ sources: form.sources.filter((_, i) => i !== index) })}>출처 삭제</button>
      </div>)}
      <button className="outline" type="button" onClick={() => edit({ sources: [...form.sources, { label: '', url: '', verified_at: null }] })}>출처 추가</button>
      <h2>공연 회차</h2>
      {form.sessions.map((s, index) => <div className="admin-repeat" key={index}>
        <label>회차 이름<input required value={s.label} onChange={e => edit({ sessions: form.sessions.map((v, i) => i === index ? { ...v, label: e.target.value } : v) })} /></label>
        <label>회차 날짜<input type="date" value={s.starts_on ?? ''} onChange={e => edit({ sessions: form.sessions.map((v, i) => i === index ? { ...v, starts_on: e.target.value || null } : v) })} /></label>
        <label>회차 시각<input type="datetime-local" value={kstInput(s.starts_at)} onChange={e => edit({ sessions: form.sessions.map((v, i) => i === index ? { ...v, starts_at: kstTimestamp(e.target.value) } : v) })} /></label>
        <button className="outline" type="button" onClick={() => edit({ sessions: form.sessions.filter((_, i) => i !== index) })}>회차 삭제</button>
      </div>)}
      <button className="outline" type="button" onClick={() => edit({ sessions: [...form.sessions, { label: '', starts_on: null, starts_at: null }] })}>회차 추가</button>
      <h2>일반 예매</h2><p>미정인 값은 비워 두세요. 저장은 푸시 알림을 발송하지 않습니다.</p>
      <div className="admin-fields">
        <label>예매 오픈 시각<input type="datetime-local" value={kstInput(form.ticket?.opens_at)} onChange={e => edit({ ticket: { booking_url: null, price_description: null, ...form.ticket, opens_at: kstTimestamp(e.target.value) } })} /></label>
        <label>예매처 HTTPS 링크<input type="url" pattern="https://.+" value={form.ticket?.booking_url ?? ''} onChange={e => edit({ ticket: { opens_at: null, price_description: null, ...form.ticket, booking_url: e.target.value || null } })} /></label>
        <label className="wide">가격 안내<input value={form.ticket?.price_description ?? ''} onChange={e => edit({ ticket: { opens_at: null, booking_url: null, ...form.ticket, price_description: e.target.value || null } })} /></label>
      </div>
      <p className="admin-publication-note">공개하려면 공연일, 확인된 발표일, 확인된 공식 출처와 출연 밴드가 필요합니다. 공개 중단은 일반 목록에서 숨깁니다.</p>
      <button className="primary" type="submit" disabled={needsRefresh}>{busy ? '저장 중…' : `${statusLabels[form.status]} 상태로 저장`}</button>
    </fieldset></form>
    <details className="admin-band"><summary>밴드 등록</summary><form onSubmit={addBand}><fieldset disabled={busy || loading}><div className="admin-fields"><label>밴드 공식 이름<input required value={bandName} onChange={e => setBandName(e.target.value)} /></label><label>국가 코드<input required pattern="[A-Za-z]{2}" maxLength={2} value={country} onChange={e => setCountry(e.target.value)} /></label><label className="wide">검색 별칭 · 쉼표로 구분<input value={aliases} onChange={e => setAliases(e.target.value)} /></label></div><button className="outline">밴드 등록</button></fieldset></form></details>
    {form.id && <section className="admin-history"><h2>변경 이력</h2><p>최초 공개: {form.first_published_at ? new Date(form.first_published_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '아직 공개하지 않음'} · 예매 수정 번호: {form.ticket?.revision ?? '없음'}</p><p>관리자 화면에서 저장한 최근 100건 중 이 공연의 기록입니다.</p>
      {selectedHistory.map(h => <details key={h.id}><summary>{new Date(h.changed_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · {h.before_record ? '수정' : '등록'} · {statusLabels[h.after_record.status]}</summary><dl>{historyFields.filter(([field]) => describe(h.before_record, field) !== describe(h.after_record, field)).map(([field, label]) => <div key={field}><dt>{label}</dt><dd>변경 전: {describe(h.before_record, field)}</dd><dd>변경 후: {describe(h.after_record, field)}</dd></div>)}</dl></details>)}
    </section>}
    </div></div>
  </section>
}
