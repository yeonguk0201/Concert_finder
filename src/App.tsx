import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { bands as fixtureBands, concerts as fixtureConcerts } from './data'
import type { Band, Concert } from './data'
import { calendarFile, formatDate, readIds } from './lib'
import './App.css'
import { useAuth } from './useAuth'
import { AccountPanel } from './AccountPanel'
import { NotificationPanel } from './NotificationPanel'
import { ServiceGuide } from './ServiceGuide'
import { accountMode } from './backend'
import { useCatalog } from './useCatalog'
import { useAdminAccess } from './useAdminAccess'
import { AdminPanel } from './AdminPanel'
import { useAccountStorage } from './useAccountStorage'
import { unavailableConcert } from './catalog'
import { hasOverseasBand, imminentTickets, isUpcoming, sortConcerts } from './catalogViews'
import type { ConcertOrder } from './catalogViews'

type Page = 'home' | 'discover' | 'bands' | 'saved' | 'admin'
type IconName = 'home' | 'search' | 'heart' | 'bell' | 'arrow' | 'close' | 'calendar' | 'pin'
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10H3Z" /><path d="M9 20v-7h6v7" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    heart: <path d="M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z" />,
    bell: <><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Z" /><path d="M10 21h4M12 2v2" /></>,
    arrow: <><path d="M4 12h15m-6-6 6 6-6 6" /></>, close: <path d="m6 6 12 12M6 18 18 6" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 2v6M17 2v6M3 11h18" /></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
function Poster({ concert }: { concert: Concert }) {
  return <div className={`poster ${concert.palette}`} aria-hidden="true"><span className="poster-top">ENCORE PRESENTS · LIVE IN KOREA</span><div className="poster-orbit" /><strong>{concert.headline}</strong><span className="poster-bottom">{concert.date.slice(0, 10).replaceAll('-', '.')}<span>TURN IT UP ↗</span></span></div>
}
const navigation: { id: Page; label: string; icon: IconName }[] = [{ id: 'home', label: '홈', icon: 'home' }, { id: 'discover', label: '공연 둘러보기', icon: 'search' }, { id: 'bands', label: '찜한 밴드', icon: 'heart' }, { id: 'saved', label: '내 예매 일정', icon: 'calendar' }]

function App() {
  const auth = useAuth()
  const catalog = useCatalog()
  const admin = useAdminAccess(auth.session?.user.id ?? null)
  const { bands, concerts } = catalog
  const linkedEvent = new URLSearchParams(location.search).get('event')
  const missingLinkedEvent = accountMode && linkedEvent && !catalog.loading && !catalog.error && !concerts.some(c => c.id === linkedEvent)
  const account = useAccountStorage(auth.session?.user.id ?? null)
  const [page, setPage] = useState<Page>(() => { const page = new URLSearchParams(location.search).get('page'); return page === 'admin' || navigation.some(n => n.id === page) ? page as Page : 'home' })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('전체')
  const [city, setCity] = useState('전국')
  const [order, setOrder] = useState<ConcertOrder>('announcement')
  const [localFollowed, setLocalFollowed] = useState(() => readIds('encore.bands', ['silicagel', 'oneokrock'], fixtureBands.map(b => b.id)))
  const [localSaved, setLocalSaved] = useState(() => readIds('encore.saved', [], fixtureConcerts.map(c => c.id)))
  const followed = accountMode ? account.bands : localFollowed
  const saved = accountMode ? account.schedules.map(id => concerts.find(c => c.ticketScheduleId === id)?.id ?? `unavailable-${id}`) : localSaved
  const unavailable = accountMode && !catalog.loading && !catalog.error ? account.schedules.filter(id => !concerts.some(c => c.ticketScheduleId === id)).map(unavailableConcert) : []
  const savingDisabled = accountMode && (auth.loading || Boolean(auth.session && (account.loading || account.error)))
  const pending = (collection: 'bands' | 'schedules', id: string) => accountMode && account.pending.includes(`${collection}:${id}`)
  const [selected, setSelected] = useState<Concert | null>(null)
  const [toast, setToast] = useState('')
  const [loginPrompt, setLoginPrompt] = useState(0)
  const detailDialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => { if (accountMode) return; try { localStorage.setItem('encore.bands', JSON.stringify(localFollowed)); localStorage.setItem('encore.saved', JSON.stringify(localSaved)) } catch { queueMicrotask(() => setToast('브라우저 저장 공간을 사용할 수 없어 이번 방문에만 저장됩니다.')) } }, [localFollowed, localSaved])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer) }, [toast])
  useEffect(() => { if (selected) detailDialog.current?.showModal(); else detailDialog.current?.close() }, [selected])
  const updateUrl = (nextPage: Page, event?: string) => { const url = new URL(location.href); url.searchParams.set('page', nextPage); if (event) url.searchParams.set('event', event); else url.searchParams.delete('event'); history.replaceState(null, '', url) }
  const navigate = (value: Page) => { setPage(value); setQuery(''); setFilter('전체'); setCity('전국'); setOrder('announcement'); updateUrl(value) }
  useEffect(() => {
    const event = new URLSearchParams(location.search).get('event')
    const target = concerts.find(c => c.id === event)
    if (target) queueMicrotask(() => setSelected(target))
    else if (event) queueMicrotask(() => setSelected(null))
  }, [concerts])
  const requestLogin = () => { detailDialog.current?.close(); setSelected(null); setLoginPrompt(n => n + 1); setToast('저장하려면 이메일로 로그인해 주세요.'); document.querySelector('.account-panel')?.scrollIntoView({ block: 'center' }) }
  const toggleBand = async (id: string) => {
    if (!accountMode) { setLocalFollowed(prev => prev.includes(id) ? prev.filter(value => value !== id) : [...prev, id]); return }
    if (!auth.session) { requestLogin(); return }
    const success = await account.toggle('bands', id)
    if (success === undefined) return
    setToast(success ? '밴드 찜을 계정에 저장했어요.' : '찜을 저장하지 못했습니다. 다시 시도해 주세요.')
  }
  const toggleSaved = async (id: string) => {
    const exists = saved.includes(id)
    if (!accountMode) { setLocalSaved(prev => exists ? prev.filter(value => value !== id) : [...prev, id]); setToast(exists ? '예매 일정에서 삭제했어요.' : '내 예매 일정에 저장했어요. 자동 푸시 알림은 아직 제공하지 않습니다.'); return }
    if (!auth.session) { requestLogin(); return }
    const concert = [...concerts, ...unavailable].find(c => c.id === id)
    if (!concert?.ticketScheduleId || (!exists && concert.cancelled)) { setToast('저장 가능한 일반 예매 일정이 없습니다.'); return }
    const success = await account.toggle('schedules', concert.ticketScheduleId)
    if (success === undefined) return
    setToast(success ? exists ? '예매 일정에서 삭제했어요.' : '계정에 일정을 저장했어요. 알림 수신은 별도 동의·기기 등록이 필요합니다.' : '일정을 저장하지 못했습니다. 다시 시도해 주세요.')
  }
  const openDetails = (concert: Concert) => { opener.current = document.activeElement as HTMLElement; setSelected(concert); updateUrl(page, concert.id) }
  const closeDetails = () => { detailDialog.current?.close(); setSelected(null); updateUrl(page); opener.current?.focus() }
  const matches = (concert: Concert) => (filter === '전체' || (filter === '페스티벌' ? concert.type === '페스티벌' : concert.bandIds.some(id => { const b = bands.find(b => b.id === id); return b && (filter === '국내' ? b.country === '한국' || b.countryCode === 'KR' : b.country !== '한국' && b.countryCode !== 'KR') }))) && (city === '전국' || concert.city === city) && `${concert.title} ${concert.venue} ${concert.bandIds.map(id => bands.find(b => b.id === id) ? [bands.find(b => b.id === id)?.name, ...(bands.find(b => b.id === id)?.aliases ?? [])].join(' ') : '').join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())
  const matchingBands = bands.filter(b => [b.name, ...(b.aliases ?? [])].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
  const upcoming = sortConcerts(concerts.filter(c => matches(c) && (page !== 'home' || (isUpcoming(c) && hasOverseasBand(c, bands)))), order)
  const tickets = imminentTickets(concerts).slice(0, 6)
  const followedConcerts = sortConcerts(concerts.filter(c => isUpcoming(c) && c.bandIds.some(id => followed.includes(id))), 'performance')
  const savedConcerts = [...concerts, ...unavailable].filter(c => saved.includes(c.id)).sort((a, b) => (a.ticketAt || '9999').localeCompare(b.ticketAt || '9999'))
  const downloadCalendar = (concert: Concert) => { const url = URL.createObjectURL(new Blob([calendarFile(concert, !accountMode)], { type: 'text/calendar;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `${concert.id}${accountMode ? '' : '-sample'}.ics`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
  const card = (concert: Concert) => <article className="concert-card" key={concert.id}><button className="poster-button" onClick={() => openDetails(concert)} aria-label={`${concert.title} 상세 보기`}><Poster concert={concert} /></button><div className="card-content"><div className="card-tags"><span className={`tag ${concert.type === '내한' ? 'green' : ''}`}>{concert.type}</span><span className="announcement">{concert.announcedAt ? `${concert.announcedAt.slice(5).replace('-', '.')} 발표` : '발표일 미확인'}</span><button className={`save-icon ${saved.includes(concert.id) ? 'active' : ''}`} aria-label={`${concert.title} 일정 ${saved.includes(concert.id) ? '삭제' : '저장'}`} aria-pressed={saved.includes(concert.id)} disabled={savingDisabled || pending('schedules', concert.ticketScheduleId ?? concert.id) || (accountMode && !saved.includes(concert.id) && (!concert.ticketScheduleId || concert.cancelled))} onClick={() => void toggleSaved(concert.id)}><Icon name="calendar" size={18} /></button></div><button className="card-title" onClick={() => openDetails(concert)}>{concert.title}</button><p>{formatDate(concert.date)}</p><span className="venue"><Icon name="pin" size={14} />{concert.venue}</span></div></article>
  const bandCard = (b: Band) => <article className="band-card" key={b.id}><span className="band-art" style={{ background: b.color }}>{b.initials}</span><div><h2>{b.name}</h2><p>{b.country} · {b.genre}</p></div><button className={`follow-button ${followed.includes(b.id) ? 'active' : ''}`} aria-label={`${b.name} ${followed.includes(b.id) ? '찜 해제' : '찜하기'}`} aria-pressed={followed.includes(b.id)} disabled={savingDisabled || pending('bands', b.id)} onClick={() => void toggleBand(b.id)}><Icon name="heart" size={17} />{followed.includes(b.id) ? '찜한 밴드' : '찜하기'}</button></article>
  const empty = (message: string) => <div className="empty"><Icon name="search" size={30} /><h3>{message}</h3><p>다른 검색어로 찾아보거나 밴드를 찜해보세요.</p><button className="outline" onClick={() => navigate('discover')}>공연 둘러보기</button></div>

  return <div className="app-shell">
    <a className="skip-link" href="#main" onClick={() => document.getElementById('main')?.focus()}>본문으로 건너뛰기</a>
    <aside className="sidebar"><a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('home') }}><span className="brand-mark">e</span>encore<span className="brand-dot">.</span></a><p className="brand-caption">다음 라이브를 만나는 곳</p><nav aria-label="주 메뉴">{navigation.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'selected' : ''}`} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><Icon name={item.icon} /><span>{item.label}</span>{item.id === 'bands' && <span className="count">{followed.length}</span>}</button>)}</nav><div className="sidebar-following"><span className="eyebrow">MY ARTISTS</span>{bands.filter(b => followed.includes(b.id)).map(b => <button key={b.id} onClick={() => { navigate('discover'); setQuery(b.name) }}><span className="avatar" style={{ background: b.color }}>{b.initials}</span>{b.name}<span className="online-dot" /></button>)}{!followed.length && <p>좋아하는 밴드를 찜해보세요.</p>}</div><div className="sidebar-note"><span>FOR THE LOVE OF LIVE</span><p>좋아하는 음악은<br />라이브로 완성되니까.</p><div className="sound-bars">▂ ▅ ▃ █ ▆ ▂ ▄ ▇ ▃ ▅</div></div><div className="profile"><span className="profile-avatar">♪</span><div><strong>음악을 좋아하는 당신</strong><span>{accountMode ? auth.session ? '계정 저장' : '이메일 로그인 지원' : '로컬 프리뷰 · 로그인 없이 체험'}</span></div></div></aside>
    <main id="main" tabIndex={-1}><header className="topbar"><span className="breadcrumb">DISCOVER YOUR NEXT LIVE</span><label className="search-box"><Icon name="search" size={18} /><input aria-label="밴드 또는 공연 검색" placeholder="밴드, 공연을 검색해보세요" value={query} onChange={e => { setQuery(e.target.value); if (page !== 'discover' && page !== 'bands') { setPage('discover'); updateUrl('discover') } }} />{query && <button onClick={() => setQuery('')} aria-label="검색 지우기"><Icon name="close" size={16} /></button>}</label><button className="top-calendar" aria-label="저장한 예매 일정 보기" onClick={() => navigate('saved')}><Icon name="calendar" />{saved.length > 0 && <span>{saved.length}</span>}</button></header>
    <div className="content">{!accountMode && <div className="demo-notice"><span className="status-dot" />PREVIEW<span>모든 공연 정보는 가상 샘플입니다. 실제 일정·예매 정보가 아닙니다.</span></div>}
    <AccountPanel key={`account:${auth.session?.user.id ?? 'signed-out'}:${loginPrompt}`} auth={auth} initiallyExpanded={Boolean(loginPrompt)} />
    {accountMode && auth.session && <NotificationPanel key={`notifications:${auth.session.user.id}`} userId={auth.session.user.id} />}
    {admin.allowed && <button className="outline" onClick={() => navigate(page === 'admin' ? 'home' : 'admin')}>{page === 'admin' ? '홈으로 돌아가기' : '관리자 공연 검수'}</button>}
    {page === 'admin' && (admin.allowed ? <AdminPanel key={`admin:${auth.session!.user.id}`} onSaved={catalog.reload} /> : <div className="info-banner" role="status">{admin.error || '로그인된 관리자만 공연을 등록·검수할 수 있습니다.'}{admin.error && <button className="outline" onClick={admin.reload}>권한 다시 확인</button>}</div>)}
    {accountMode && <p role="status">{catalog.syncStatus === 'connected' ? '공연 정보 · 실시간 연결됨' : '공연 정보 · 연결 복구 중, 주기적으로 갱신합니다.'}</p>}
    {catalog.loading && <p role="status">공연 정보를 불러오는 중…</p>}
    {catalog.error && <div className="info-banner" role="alert">{catalog.error}<button className="outline" onClick={catalog.reload}>다시 불러오기</button></div>}
    {missingLinkedEvent && <div className="info-banner" role="status">이 공연 정보는 삭제되었거나 공개가 중단되었습니다.</div>}
    {accountMode && auth.session && <div className="account-sync"><span role="status">{account.loading ? '계정 저장 목록을 불러오는 중…' : account.pending.length ? '계정에 저장 중…' : account.syncStatus === 'connected' ? '계정 저장 · 실시간 연결됨' : '계정 저장 · 연결 복구 중, 주기적으로 갱신합니다.'}</span><button className="outline" disabled={account.loading || Boolean(account.pending.length)} onClick={() => { account.reload(); catalog.reload() }}>다시 불러오기</button></div>}
    {accountMode && account.error && <p role="alert" className="account-error">{account.error}</p>}
    {page === 'home' && <>
      <div className="page-heading"><div><span className="eyebrow">GOOD MUSIC. GREAT NIGHTS.</span><h1>다음엔, 어떤 라이브?</h1><p>기다리던 밴드부터 새로운 발견까지. 한국에서 만나요.</p></div><span className="region"><Icon name="pin" size={16} />대한민국 전체</span></div>
      {!accountMode && <section className="hero"><div className="hero-copy"><span className="hero-label"><span className="status-dot" /> SPOTLIGHT · 내한</span><h2>Some nights<br />stay <em>forever.</em></h2><p>플레이리스트 밖에서 만나는 우리.<br />Oasis와 함께할 다음 라이브를 확인하세요.</p><button className="primary" onClick={() => openDetails(concerts[0])}>공연 자세히 보기 <Icon name="arrow" size={18} /></button><span className="hero-meta">2026.12.12 SAT <span> / </span> 고양종합운동장 · 샘플</span></div><div className="hero-art" aria-hidden="true"><div className="vinyl"><div className="vinyl-label">oasis<span>LIVE FOREVER</span></div></div><span className="art-caption">LOUDER<br />TOGETHER.</span><span className="art-star">✳</span></div></section>}
      <section className="followed-section"><div className="section-heading"><h2><Icon name="heart" />내 밴드의 다음 소식 <span>{followedConcerts.length}</span></h2><button className="text-button" onClick={() => navigate('bands')}>밴드 관리 <Icon name="arrow" size={16} /></button></div>{followedConcerts.length ? <div className="updates">{followedConcerts.map(c => <button className="update" key={c.id} onClick={() => openDetails(c)}><span className={`update-symbol ${c.palette}`}><Icon name="bell" /></span><div><strong>{c.title}</strong><span>{c.unavailable ? '공개 중단 또는 삭제' : c.cancelled ? '공연 취소' : `${formatDate(c.ticketAt, true)} 티켓 오픈`}</span></div><Icon name="arrow" size={16} /></button>)}</div> : empty('찜한 밴드의 공연 소식을 모아볼게요.')}</section>
    </>}
    {page === 'home' && <section aria-label="예매 임박"><div className="section-heading"><h2>다가오는 예매 <span>{tickets.length}</span></h2></div>{tickets.length ? <div className="concert-grid">{tickets.map(card)}</div> : <p>확인된 다가오는 예매 일정이 없습니다.</p>}</section>}
    {page === 'discover' && query.trim() && matchingBands.length > 0 && <section aria-label="밴드 검색 결과"><div className="section-heading"><h2>밴드 검색 결과 <span>{matchingBands.length}</span></h2></div><div className="band-grid">{matchingBands.map(bandCard)}</div></section>}
    {(page === 'home' || page === 'discover') && <section className="discovery"><div className="section-heading"><div><span className="eyebrow">{page === 'home' ? 'JUST ANNOUNCED' : 'FIND YOUR LIVE'}</span><h2>{page === 'home' ? '최근 내한 소식' : '공연 둘러보기'}<span className="result-count">{upcoming.length}</span></h2>{page === 'home' && <p>찜하지 않은 밴드의 내한 소식도 놓치지 마세요.</p>}</div>{page === 'home' && <button className="text-button" onClick={() => { navigate('discover'); setFilter('내한') }}>내한 전체 보기 <Icon name="arrow" size={16} /></button>}</div><div className="filters"><div className="filter-tabs" aria-label="공연 분류">{['전체', '내한', '국내', '페스티벌'].map(value => <button key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div><div className="filter-right"><select aria-label="공연 지역" value={city} onChange={e => setCity(e.target.value)}>{['전국', ...new Set(concerts.map(c => c.city).filter(c => c !== '지역 미정'))].map(value => <option key={value}>{value}</option>)}</select><select aria-label="공연 정렬" value={order} onChange={e => setOrder(e.target.value as ConcertOrder)}><option value="announcement">최근 발표순</option><option value="performance">공연일순</option><option value="ticket">다가오는 예매순</option></select></div></div>{upcoming.length ? <div className="concert-grid">{upcoming.map(card)}</div> : empty('검색 결과가 없어요.')}</section>}
    {page === 'bands' && <section><div className="page-heading"><div><span className="eyebrow">YOUR MUSIC, YOUR LIVE</span><h1>좋아하는 밴드를 찜하세요.</h1><p>국내 공연도, 내한도, 페스티벌 출연도 한곳에서.</p></div><span className="region">{followed.length}팀 찜하는 중</span></div><div className="band-grid">{matchingBands.map(bandCard)}</div>{!matchingBands.length && <div className="empty"><h3>{bands.length ? '검색 결과가 없어요.' : '등록된 밴드가 아직 없어요.'}</h3><p>{bands.length ? '밴드 이름이나 별칭으로 다시 검색해 주세요.' : '밴드가 등록되면 이곳에서 검색하고 찜할 수 있어요.'}</p></div>}<p className="local-note">{accountMode ? '로그인한 계정에 밴드 찜을 저장합니다. 다른 기기의 변경은 연결 중 자동 반영되며, 다시 불러오기로도 확인할 수 있습니다.' : '찜한 밴드는 이 브라우저에 저장됩니다. 기기 간 동기화는 계정 모드에서 지원합니다.'}</p></section>}
    {page === 'saved' && <section><div className="page-heading"><div><span className="eyebrow">MAKE IT A DATE</span><h1>내 예매 일정</h1><p>기다리는 공연의 티켓 오픈 시간을 모아보세요.</p></div></div><div className="info-banner"><Icon name="bell" />{accountMode ? '일정 저장만으로 알림이 켜지지 않습니다. 알림 설정에서 수신 동의와 기기를 등록하고 실제 수신을 확인해 주세요.' : '현재는 일정 저장과 캘린더 다운로드를 지원합니다. 자동 푸시 알림은 아직 제공하지 않습니다.'}</div>{savedConcerts.length ? <div className="schedule-list">{savedConcerts.map(c => <article key={c.id}><div className="schedule-date"><strong>{(c.ticketAt ? new Date(c.ticketAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', day: '2-digit' }).replace('일', '') : '—')}</strong><span>{formatDate(c.ticketAt)}</span></div><div className="schedule-info"><button className="card-title" onClick={() => openDetails(c)}>{c.title}</button><p>{c.unavailable ? '공개 중단 또는 삭제' : c.cancelled ? '공연 취소' : `${formatDate(c.ticketAt, true)} 티켓 오픈`}</p><span>{c.venue}</span></div><button className="outline" disabled={!c.ticketAt || c.cancelled || c.unavailable} onClick={() => downloadCalendar(c)}><Icon name="calendar" size={16} />캘린더 저장</button><button className="save-icon" disabled={savingDisabled || pending('schedules', c.ticketScheduleId ?? c.id)} onClick={() => void toggleSaved(c.id)} aria-label={`${c.title} 저장한 일정 삭제`}><Icon name="close" /></button></article>)}</div> : empty('아직 저장한 예매 일정이 없어요.')}</section>}
    <ServiceGuide /><footer><span className="footer-brand">encore.</span><span>당신의 다음 라이브를 위해.</span><span>© 2026 ENCORE · Prototype</span></footer></div></main>
    <nav className="mobile-nav" aria-label="모바일 메뉴">{navigation.map(item => <button key={item.id} className={page === item.id ? 'active' : ''} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><Icon name={item.icon} size={21} /><span>{item.label}</span></button>)}</nav>
    <dialog ref={detailDialog} className="detail-dialog" aria-labelledby="detail-title" onCancel={e => { e.preventDefault(); closeDetails() }} onClick={e => { if (e.target === e.currentTarget) closeDetails() }} onClose={() => setSelected(null)}>{selected && <div className="detail-content"><button className="dialog-close" aria-label="공연 상세 닫기" onClick={closeDetails}><Icon name="close" /></button><Poster concert={selected} /><div className="detail-body"><span className="tag green">{selected.type}{!accountMode ? ' · 가상 샘플' : selected.cancelled ? ' · 취소' : ''}</span><h2 id="detail-title">{selected.title}</h2><p>{selected.description}</p><dl><div><dt>공연 일시</dt><dd>{formatDate(selected.date, true)}{selected.endsOn && selected.endsOn !== selected.date ? ` ~ ${formatDate(selected.endsOn)}` : ''}</dd></div><div><dt>공연 장소</dt><dd>{selected.city} · {selected.venue}</dd></div><div><dt>티켓 오픈</dt><dd>{formatDate(selected.ticketAt, true)}</dd></div><div><dt>{accountMode ? '가격' : '샘플 가격'}</dt><dd>{selected.price}</dd></div></dl><div className="detail-bands">{bands.filter(b => selected.bandIds.includes(b.id)).map(b => <button className={`outline ${followed.includes(b.id) ? 'is-followed' : ''}`} key={b.id} disabled={savingDisabled || pending('bands', b.id)} onClick={() => void toggleBand(b.id)} aria-pressed={followed.includes(b.id)}><Icon name="heart" size={16} />{b.name} {followed.includes(b.id) ? '찜 해제' : '찜하기'}</button>)}</div><button className="primary full" disabled={savingDisabled || pending('schedules', selected.ticketScheduleId ?? selected.id) || (accountMode && !saved.includes(selected.id) && (!selected.ticketScheduleId || selected.cancelled || selected.unavailable))} onClick={() => void toggleSaved(selected.id)}><Icon name="calendar" size={18} />{saved.includes(selected.id) ? '예매 일정 저장 해제' : '예매 일정 저장'}</button>{accountMode ? <div className="detail-sources">{selected.sources?.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">공식 출처: {source.label} ↗</a>)}{selected.bookingUrl && <a href={selected.bookingUrl} target="_blank" rel="noopener noreferrer">공식 예매처 ↗</a>}<p>일정 저장과 알림 동의는 별개입니다. 알림 설정에서 수신 동의·기기를 등록하고 실제 수신을 확인해 주세요.</p></div> : <p className="detail-disclaimer">실제 공연 발표가 아닙니다. 예매 링크와 공식 출처는 실제 데이터 연결 후 제공됩니다.</p>}</div></div>}</dialog>
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>
}
export default App
