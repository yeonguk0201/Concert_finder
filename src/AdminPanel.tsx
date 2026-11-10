import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { adminError, announcementDateError, emptyConcert, kstInput, kstTimestamp, loadAdminCatalog, saveAdminBand, saveAdminConcert } from './adminApi'
import type { AdminCatalog, AdminConcert } from './adminApi'
import './AdminPanel.css'
import { CollectionPanel } from './CollectionPanel'
import { ArtistLookup } from './ArtistLookup'
import { ArtistManagement } from './ArtistManagement'
import { CollectionOperations } from './CollectionOperations'
import { ArtistReviewReadiness } from './ArtistReviewReadiness'

const statusLabels = { draft: '초안', review: '검수 대기', published: '공개', withdrawn: '공개 중단' }
const workspaces = {
  concerts: '공연 관리',
  artists: '아티스트 관리',
  candidates: '수집 후보',
  operations: '운영 상태',
} as const
type Workspace = keyof typeof workspaces

export function AdminPanel({ onSaved }: { onSaved: () => void }) {
  const [workspace, setWorkspace] = useState<Workspace>('concerts')
  const [concertQuery, setConcertQuery] = useState('')
  const [concertStatus, setConcertStatus] = useState('all')
  const [lineupQuery, setLineupQuery] = useState('')
  const [candidateNotice, setCandidateNotice] = useState('')
  const [catalog, setCatalog] = useState<AdminCatalog>({ concerts: [], bands: [], history: [] })
  const [form, setForm] = useState<AdminConcert>(emptyConcert)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [feedbackTarget, setFeedbackTarget] = useState<'catalog' | 'concert' | 'band'>('catalog')
  const [revision, setRevision] = useState(0)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [bandName, setBandName] = useState('')
  const [country, setCountry] = useState('KR')
  const [aliases, setAliases] = useState('')
  const active = useRef(true)
  const saving = useRef(false)
  const savedId = useRef<string | null>(null)
  const concertHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    let current = true
    void loadAdminCatalog().then(data => { if (current) { setCatalog(data); setLoading(false); if (savedId.current) { setForm(data.concerts.find(c => c.id === savedId.current) ?? emptyConcert()); savedId.current = null; setNeedsRefresh(false) } } }).catch(e => { if (current) { setCatalogError(adminError(e)); setLoading(false) } })
    return () => { current = false }
  }, [revision])
  const dateError = announcementDateError(form)
  const search = concertQuery.trim().toLowerCase()
  const concerts = catalog.concerts.filter(concert =>
    (concertStatus === 'all' || (concertStatus === 'cancelled' ? concert.cancelled : concert.status === concertStatus)) &&
    [concert.title, concert.venue, concert.city, concert.starts_on].some(value => value?.toLowerCase().includes(search)))
  const lineupSearch = lineupQuery.trim().toLowerCase()
  const lineup = catalog.bands.filter(band =>
    form.band_ids.includes(band.id) ||
    [band.name, ...band.aliases].some(value => value.toLowerCase().includes(lineupSearch)))
  const selectConcert = (concert: AdminConcert, notice = '') => {
    setForm(concert)
    setLineupQuery('')
    setFeedbackTarget('concert')
    setError('')
    setMessage('')
    setCandidateNotice(notice)
    setWorkspace('concerts')
    requestAnimationFrame(() => concertHeading.current?.focus())
  }
  const edit = (patch: Partial<AdminConcert>) => { setForm(previous => ({ ...previous, ...patch })); if (feedbackTarget === 'concert') { setMessage(''); setError('') } }
  const reload = () => { setError(''); setCatalogError(''); setLoading(true); setRevision(r => r + 1) }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (saving.current || needsRefresh) return
    setFeedbackTarget('concert'); setError(''); setMessage('')
    if (dateError) { document.getElementById('admin-announced-at')?.focus(); return }
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
      setCandidateNotice('')
      setMessage(`${statusLabels[form.status]} 상태로 저장했습니다.`); onSaved()
    } catch (e) { if (active.current) { setError(savedId.current ? '저장했지만 최신 목록을 확인하지 못했습니다. 목록을 다시 불러와 주세요.' : adminError(e)); if (savedId.current) onSaved() } }
    finally { saving.current = false; if (active.current) setBusy(false) }
  }
  const addBand = async (event: FormEvent) => {
    event.preventDefault()
    if (saving.current) return
    setFeedbackTarget('band')
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
    ['announcement_verified', '발표 확인'], ['cancelled', '공연 취소'], ['sources', '공식 출처'], ['band_ids', '출연 밴드'], ['sessions', '회차'], ['ticket', '일반 예매'], ['artwork','공식 포스터'],
  ] as const
  const describe = (record: AdminConcert | null, field: typeof historyFields[number][0]): string => {
    if (!record) return '등록 전'
    if (field === 'status') return statusLabels[record.status]
    if (field === 'format') return record.format === 'solo' ? '단독 공연' : '페스티벌'
    if (field === 'sources') return record.sources.map(s => `${s.label}: ${s.url} (${s.verified_at ? '확인 완료' : '미확인'})`).join('\n') || '없음'
    if (field === 'artwork') return record.artwork ? `${record.artwork.url}\n${record.artwork.source_url}\n${record.artwork.selection_reason}\n표시 ${record.artwork.display_approved ? '승인' : '보류'} · ${record.artwork.checked_at ?? '확인 시각 미기록'}` : '없음'
    if (field === 'band_ids') return record.band_ids.map(id => catalog.bands.find(b => b.id === id)?.name ?? '삭제된 밴드').join(', ') || '없음'
    if (field === 'sessions') return record.sessions.map(s => `${s.label}: ${s.starts_on ?? '미정'} ${kstInput(s.starts_at) || '시각 미정'}`).join('\n') || '없음'
    if (field === 'ticket') return record.ticket ? `오픈: ${kstInput(record.ticket.opens_at) || '미정'}\n예매처: ${record.ticket.booking_url || '미정'}\n가격: ${record.ticket.price_description || '미정'}` : '없음'
    const value = record[field]
    return typeof value === 'boolean' ? value ? '예' : '아니요' : value || '미정'
  }
  return <section className="admin-panel" aria-label="관리자 공연 검수">
    <header className="admin-heading">
      <div><h1>카탈로그 관리</h1><p>공연과 아티스트의 공개 정보, 검수 후보와 수집 상태를 관리합니다.</p></div>
      <button className="outline" disabled={busy || loading} onClick={reload}>목록 다시 불러오기</button>
    </header>
    <nav className="admin-nav" aria-label="관리 작업">
      {(Object.keys(workspaces) as Workspace[]).map(key => <button
        key={key} type="button" aria-pressed={workspace === key} aria-controls={`admin-${key}`}
        onClick={() => setWorkspace(key)}
      >{workspaces[key]}</button>)}
    </nav>
    {loading && <p role="status">관리자 목록을 불러오는 중…</p>}
    {catalogError && <p role="alert" className="account-error">{catalogError}</p>}
    <section id="admin-concerts" hidden={workspace !== 'concerts'} aria-label="공연 관리">
    <div className="admin-layout">
      <aside className="admin-browser" aria-labelledby="admin-concert-list-title">
        <div className="admin-browser-tools">
          <h2 id="admin-concert-list-title">공연 목록</h2>
          <label>제목·장소·날짜 검색<input type="search" value={concertQuery} onChange={e => setConcertQuery(e.target.value)} /></label>
          <label>공연 상태 필터<select value={concertStatus} onChange={e => setConcertStatus(e.target.value)}>
            <option value="all">모든 상태</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            <option value="cancelled">취소</option>
          </select></label>
          <div className="admin-browser-meta">
            <p role="status">{concerts.length} / {catalog.concerts.length}건</p>
            <button className="outline" disabled={busy || needsRefresh} onClick={() => selectConcert(emptyConcert())}>새 공연 등록</button>
          </div>
        </div>
        <div className="admin-list">
          {concerts.map(c => <button className="admin-row" key={c.id} disabled={busy || needsRefresh} aria-pressed={form.id === c.id} onClick={() => selectConcert(structuredClone(c))}>
            <strong>{c.title}</strong>
            <small>{c.starts_on ?? '공연일 미정'}{c.venue ? ` · ${c.venue}` : ''}</small>
            <span className="admin-badge" data-status={c.status}>{statusLabels[c.status]}</span>
            {c.cancelled && <span className="admin-badge" data-status="cancelled">취소</span>}
          </button>)}
          {!loading && !concerts.length && <p className="admin-empty">{catalog.concerts.length ? '검색 조건에 맞는 공연이 없습니다.' : '등록된 공연이 없습니다.'}</p>}
        </div>
      </aside>
      <div className="admin-detail">
      <header className="admin-detail-heading">
        <h2 ref={concertHeading} tabIndex={-1}>{form.id || candidateNotice ? form.title : '새 공연'}</h2>
        <p>공연 정보와 공식 근거를 확인하세요. 입력 시각은 한국 시간입니다.</p>
        {candidateNotice && <p role="status">{candidateNotice}</p>}
      </header>
    <form onSubmit={save}><fieldset disabled={busy || loading || needsRefresh}>
      <section className="admin-edit-section" aria-labelledby="admin-show-basics">
      <h3 id="admin-show-basics">기본 정보와 공개 상태</h3>
      <div className="admin-fields">
      <label className="wide">공연 제목<input required value={form.title} onChange={e => edit({ title: e.target.value })} /></label>
      <label>형식<select value={form.format} onChange={e => edit({ format: e.target.value as AdminConcert['format'] })}><option value="solo">단독 공연</option><option value="festival">페스티벌</option></select></label>
      <label>저장 상태<select value={form.status} onChange={e => edit({ status: e.target.value as AdminConcert['status'] })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>도시<input value={form.city ?? ''} onChange={e => edit({ city: e.target.value })} /></label>
      <label>공연장<input value={form.venue ?? ''} onChange={e => edit({ venue: e.target.value })} /></label>
      <label>공연 시작일<input type="date" value={form.starts_on ?? ''} onChange={e => edit({ starts_on: e.target.value || null })} /></label>
      <label>공연 종료일<input type="date" min={form.starts_on ?? ''} value={form.ends_on ?? ''} onChange={e => edit({ ends_on: e.target.value || null })} /></label>
      </div>
      <label className="admin-check"><input type="checkbox" checked={form.cancelled} onChange={e => edit({ cancelled: e.target.checked })} />공식 취소 안내를 확인했습니다</label>
      </section>
      <section className="admin-edit-section" aria-labelledby="admin-show-announcement">
      <h3 id="admin-show-announcement">공식 발표</h3>
      <div className="admin-fields">
      <label>공식 발표일<input type="date" aria-invalid={Boolean(dateError)} aria-describedby={dateError ? 'admin-announcement-error' : undefined} value={form.announced_on ?? ''} onChange={e => edit({ announced_on: e.target.value || null })} /></label>
      <label>공식 발표 시각 · 미확인이면 비움<input id="admin-announced-at" type="datetime-local" aria-invalid={Boolean(dateError)} aria-describedby={dateError ? 'admin-announcement-error' : undefined} value={kstInput(form.announced_at)} onChange={e => edit({ announced_at: kstTimestamp(e.target.value) })} /></label>
      </div>
      <label className="admin-check"><input type="checkbox" checked={form.announcement_verified} onChange={e => edit({ announcement_verified: e.target.checked })} />공식 출처에서 발표일을 확인했습니다</label>
      </section>
      <section className="admin-edit-section" aria-labelledby="admin-show-lineup">
      <h3 id="admin-show-lineup">출연진 <span className="admin-count">{form.band_ids.length}팀 선택</span></h3>
      {form.discovered_artists && <p>수집 원문 출연진: {form.discovered_artists.map(a => a.name ?? '이름 미확인').join(', ')}. 출연진의 신원과 대상 장르를 확인하고 연결하세요.</p>}
      {catalog.bands.length > 0 ? <>
        <label>출연진 이름·별칭 검색<input type="search" value={lineupQuery} onChange={e => setLineupQuery(e.target.value)} /></label>
        <div className="admin-lineup">{lineup.map(b => <label className="admin-check" key={b.id}><input type="checkbox" checked={form.band_ids.includes(b.id)} onChange={e => edit({ band_ids: e.target.checked ? [...form.band_ids, b.id] : form.band_ids.filter(id => id !== b.id) })} />{b.name} ({b.country_code})</label>)}
          {!lineup.length && <p>검색 조건에 맞는 아티스트가 없습니다.</p>}
        </div>
      </> : <p>아티스트 관리에서 밴드를 먼저 등록하세요.</p>}
      </section>
      <section className="admin-edit-section" aria-labelledby="admin-show-sources">
      <h3 id="admin-show-sources">공식 출처 <span className="admin-count">{form.sources.length}건</span></h3>
      {form.artwork && <fieldset><legend>공식 포스터</legend><p><a href={form.artwork.url} target="_blank" rel="noopener noreferrer">이미지 원문 ↗</a> · {form.artwork.selection_reason}</p><p>이미지 발견만으로 이용 허락이 확인되지는 않습니다. 원문과 같은 공연인지, 외부 표시 조건을 확인하세요.</p><label className="admin-check"><input type="checkbox" checked={form.artwork.display_approved} onChange={e => edit({ artwork: { ...form.artwork!, display_approved: e.target.checked, checked_at: new Date().toISOString() } })} />공연 매칭과 이미지 이용 조건을 확인하여 외부 표시 승인</label><button type="button" className="outline" onClick={() => edit({ artwork: null })}>포스터 연결 제거</button></fieldset>}
      {form.sources.map((s, index) => <div className="admin-repeat" key={index}>
        <label>출처 이름<input required value={s.label} onChange={e => edit({ sources: form.sources.map((v, i) => i === index ? { ...v, label: e.target.value } : v) })} /></label>
        <label>공식 HTTPS 링크<input required type="url" pattern="https://.+" value={s.url} onChange={e => edit({ sources: form.sources.map((v, i) => i === index ? { ...v, url: e.target.value } : v) })} /></label>
        <label className="admin-check"><input type="checkbox" checked={Boolean(s.verified_at)} onChange={e => edit({ sources: form.sources.map((v, i) => i === index ? { ...v, verified_at: e.target.checked ? new Date().toISOString() : null } : v) })} />내용 확인 완료</label>
        <button type="button" className="outline" onClick={() => edit({ sources: form.sources.filter((_, i) => i !== index) })}>출처 삭제</button>
      </div>)}
      <button className="outline" type="button" onClick={() => edit({ sources: [...form.sources, { label: '', url: '', verified_at: null }] })}>출처 추가</button>
      </section>
      <section className="admin-edit-section" aria-labelledby="admin-show-sessions">
      <h3 id="admin-show-sessions">공연 회차 <span className="admin-count">{form.sessions.length}회</span></h3>
      {form.sessions.map((s, index) => <div className="admin-repeat" key={index}>
        <label>회차 이름<input required value={s.label} onChange={e => edit({ sessions: form.sessions.map((v, i) => i === index ? { ...v, label: e.target.value } : v) })} /></label>
        <label>회차 날짜<input type="date" value={s.starts_on ?? ''} onChange={e => edit({ sessions: form.sessions.map((v, i) => i === index ? { ...v, starts_on: e.target.value || null } : v) })} /></label>
        <label>회차 시각<input type="datetime-local" value={kstInput(s.starts_at)} onChange={e => edit({ sessions: form.sessions.map((v, i) => i === index ? { ...v, starts_at: kstTimestamp(e.target.value) } : v) })} /></label>
        <button className="outline" type="button" onClick={() => edit({ sessions: form.sessions.filter((_, i) => i !== index) })}>회차 삭제</button>
      </div>)}
      <button className="outline" type="button" onClick={() => edit({ sessions: [...form.sessions, { label: '', starts_on: null, starts_at: null }] })}>회차 추가</button>
      </section>
      <section className="admin-edit-section" aria-labelledby="admin-show-ticket">
      <h3 id="admin-show-ticket">일반 예매</h3><p>미정인 값은 비워 두세요. 예매 정보를 저장해도 푸시 알림이 예약되지 않습니다.</p>
      <div className="admin-fields">
        <label>예매 오픈 시각<input type="datetime-local" value={kstInput(form.ticket?.opens_at)} onChange={e => edit({ ticket: { booking_url: null, price_description: null, ...form.ticket, opens_at: kstTimestamp(e.target.value) } })} /></label>
        <label>예매처 HTTPS 링크<input type="url" pattern="https://.+" value={form.ticket?.booking_url ?? ''} onChange={e => edit({ ticket: { opens_at: null, price_description: null, ...form.ticket, booking_url: e.target.value || null } })} /></label>
        <label className="wide">가격 안내<input value={form.ticket?.price_description ?? ''} onChange={e => edit({ ticket: { opens_at: null, booking_url: null, ...form.ticket, price_description: e.target.value || null } })} /></label>
      </div>
      </section>
      <div className="admin-save">
      <p className="admin-publication-note">{form.publication_basis === 'kopis-api-v1' ? '공식 공연 정보로 공개된 공연입니다. 발표일·예매 시각은 미확인 상태로 유지할 수 있습니다. 확인된 출처·출연진·공연 회차는 유지해 주세요.' : '공개하려면 공연일, 확인된 발표일, 확인된 공식 출처와 출연 밴드가 필요합니다.'} 공개 중단은 일반 목록에서 숨깁니다.</p>
      <label className="admin-check"><input type="checkbox" checked={form.initial_import ?? false} onChange={e => edit({ initial_import: e.target.checked })} />기존 정보 보완 등록 · 이번 공개/라인업 추가 알림 보내지 않기</label>
      <button className="primary" type="submit" disabled={needsRefresh}>{busy ? '저장 중…' : `${statusLabels[form.status]} 상태로 저장`}</button>
      </div>
    </fieldset>
      <div className="admin-save-feedback" aria-label="공연 저장 결과">
        {dateError && <p id="admin-announcement-error" role="alert" className="admin-feedback-error">{dateError}</p>}
        {feedbackTarget === 'concert' && <>
          {busy && <p role="status">공연을 저장하고 최신 목록을 확인하는 중…</p>}
          {error && <p role="alert" className="admin-feedback-error">{error}{needsRefresh && <button type="button" className="outline" disabled={loading} onClick={reload}>목록 다시 확인</button>}</p>}
          {message && <p role="status" className="admin-feedback-success">{message}</p>}
        </>}
      </div>
    </form>
    {form.id && <details className="admin-history admin-tool"><summary>공연 변경 이력</summary><p>최초 공개: {form.first_published_at ? new Date(form.first_published_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '아직 공개하지 않음'} · 예매 수정 번호: {form.ticket?.revision ?? '없음'}</p><p>관리자 화면에서 저장한 최근 100건 중 이 공연의 기록입니다.</p>
      {selectedHistory.map(h => <details key={h.id}><summary>{new Date(h.changed_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · {h.before_record ? '수정' : '등록'} · {statusLabels[h.after_record.status]}</summary><dl>{historyFields.filter(([field]) => describe(h.before_record, field) !== describe(h.after_record, field)).map(([field, label]) => <div key={field}><dt>{label}</dt><dd>변경 전: {describe(h.before_record, field)}</dd><dd>변경 후: {describe(h.after_record, field)}</dd></div>)}</dl></details>)}
    </details>}
    </div></div>
    </section>
    <section id="admin-artists" hidden={workspace !== 'artists'} aria-label="아티스트 관리">
    <ArtistManagement bands={catalog.bands} onSaved={() => { reload(); onSaved() }} />
    <details className="admin-tool"><summary>외부 아티스트 검색·가져오기</summary><ArtistLookup onImported={() => { reload(); onSaved() }} /></details>
    <details className="admin-band"><summary>밴드 직접 등록</summary><form onSubmit={addBand}><fieldset disabled={busy || loading}><div className="admin-fields"><label>밴드 공식 이름<input required value={bandName} onChange={e => setBandName(e.target.value)} /></label><label>국가 코드<input required pattern="[A-Za-z]{2}" maxLength={2} value={country} onChange={e => setCountry(e.target.value)} /></label><label className="wide">검색 별칭 · 쉼표로 구분<input value={aliases} onChange={e => setAliases(e.target.value)} /></label></div><button className="outline">밴드 등록</button></fieldset>
      {feedbackTarget === 'band' && <div className="admin-save-feedback" aria-label="밴드 등록 결과">{error && <p role="alert" className="admin-feedback-error">{error}</p>}{message && <p role="status" className="admin-feedback-success">{message}</p>}</div>}
    </form></details>
    </section>
    <section id="admin-candidates" hidden={workspace !== 'candidates'} aria-label="수집 후보">
      <CollectionPanel catalog={catalog} canSelect={!busy && !needsRefresh} onSelect={concert => selectConcert(concert, '수집 후보를 입력했습니다. 출처와 기존 내용을 확인하고 저장하세요.')} />
    </section>
    <section id="admin-operations" hidden={workspace !== 'operations'} aria-label="운영 상태">
      <div className="admin-tool"><CollectionOperations /></div>
      <div className="admin-tool"><ArtistReviewReadiness /></div>
    </section>
  </section>
}
