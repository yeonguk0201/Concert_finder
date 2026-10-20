import { useEffect, useRef, useState } from 'react'
import { bands as fixtureBands, concerts as fixtureConcerts } from './data'
import type { Band, Concert } from './data'
import { calendarFile, formatDate, readIds } from './lib'
import './design/approved-preview.css'
import './design/approved-flow.css'
import './ServiceDesign.css'
import { TicketCalendar } from './TicketCalendar'
import { ArtistIdentity, ArtistAvatar } from './ArtistIdentity'
import { ArtistMedia } from './ArtistMedia'
import { dayLabel, koreaDay, performsOn } from './designDates'
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
import { isUpcoming, sortConcerts } from './catalogViews'
import { ApprovedArtwork } from './ApprovedArtwork'
import { artistStyle } from './approvedStyle'
import { Icon } from './UiIcon'
import type { IconName } from './UiIcon'
import { HomeCalendar } from './HomeCalendar'
import { LoginDialog } from './LoginDialog'
import { ExternalArtistResults } from './ExternalArtistResults'
import { ArtistOfficialLinks } from './ArtistOfficialLinks'
import { validYouTubePhoto } from './artistChannels'
import youtubeIcon from './assets/youtube-icon-white.png'
import { mapBands } from './catalog'
import type { ConcertOrder } from './catalogViews'

type Page = 'home' | 'discover' | 'search' | 'bands' | 'saved' | 'settings' | 'admin' | 'artist'
const navigation: { id: Page; label: string; icon: IconName }[] = [{ id: 'home', label: '홈', icon: 'home' }, { id: 'discover', label: '공연 둘러보기', icon: 'search' }, { id: 'bands', label: '찜한 아티스트', icon: 'heart' }, { id: 'saved', label: '내 예매 일정', icon: 'calendar' }]

function App() {
  const auth = useAuth()
  const catalog = useCatalog()
  const admin = useAdminAccess(auth.session?.user.id ?? null)
  const { bands, concerts } = catalog
  const linkedEvent = new URLSearchParams(location.search).get('event')
  const missingLinkedEvent = accountMode && linkedEvent && !catalog.loading && !catalog.error && !concerts.some(c => c.id === linkedEvent)
  const account = useAccountStorage(auth.session?.user.id ?? null)
  const [page, setPage] = useState<Page>(() => { const page = new URLSearchParams(location.search).get('page'); return page === 'artist' || page === 'search' || page === 'settings' || page === 'admin' || navigation.some(n => n.id === page) ? page as Page : 'home' })
  const [artistId, setArtistId] = useState(() => new URLSearchParams(location.search).get('artist') ?? '')
  const [bioExpanded, setBioExpanded] = useState(false)
  const [searchTab, setSearchTab] = useState('전체')
  const [dateFilter, setDateFilter] = useState(() => new URLSearchParams(location.search).get('date') ?? '')
  const [scheduleDay, setScheduleDay] = useState(() => koreaDay(new Date().toISOString()))
  const [allSchedules, setAllSchedules] = useState(true)
  const artist = bands.find(b => b.id === artistId)
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get('q') ?? '')
  const [filter, setFilter] = useState('전체')
  const [city, setCity] = useState('전국')
  const [order, setOrder] = useState<ConcertOrder>('performance')
  const [localFollowed, setLocalFollowed] = useState(() => readIds('encore.bands', ['silicagel', 'oneokrock'], fixtureBands.map(b => b.id)))
  const [localSaved, setLocalSaved] = useState(() => readIds('encore.saved', [], fixtureConcerts.map(c => c.id)))
  const followed = accountMode ? account.bands : localFollowed
  const saved = accountMode ? account.schedules.map(id => concerts.find(c => c.ticketScheduleId === id)?.id ?? `unavailable-${id}`) : localSaved
  const unavailable = accountMode && !catalog.loading && !catalog.error ? account.schedules.filter(id => !concerts.some(c => c.ticketScheduleId === id)).map(unavailableConcert) : []
  const savingDisabled = accountMode && (auth.loading || Boolean(auth.session && (account.loading || account.error)))
  const pending = (collection: 'bands' | 'schedules', id: string) => accountMode && account.pending.includes(`${collection}:${id}`)
  const [selected, setSelected] = useState<Concert | null>(null)
  const [toast, setToast] = useState('')
  const [loginOpen, setLoginOpen] = useState(false)
  useEffect(() => {
    document.body.classList.add('combined')
    document.body.classList.toggle('artist-screen', page === 'artist' && !selected)
    return () => { document.body.classList.remove('combined', 'artist-screen') }
  }, [page, selected])
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(location.search)
      const target = params.get('page')
      setPage(target === 'artist' || target === 'search' || target === 'settings' || target === 'admin' || navigation.some(n => n.id === target) ? target as Page : 'home')
      setQuery(params.get('q') ?? '')
      setArtistId(params.get('artist') ?? '')
      setDateFilter(params.get('date') ?? '')
      setFilter('전체'); setCity('전국'); setSearchTab('전체'); setBioExpanded(false)
      setSelected(concerts.find(c => c.id === params.get('event')) ?? null)
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [concerts])
  useEffect(() => { if (accountMode) return; try { localStorage.setItem('encore.bands', JSON.stringify(localFollowed)); localStorage.setItem('encore.saved', JSON.stringify(localSaved)) } catch { queueMicrotask(() => setToast('브라우저 저장 공간을 사용할 수 없어 이번 방문에만 저장됩니다.')) } }, [localFollowed, localSaved])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer) }, [toast])
  const updateUrl = (nextPage: Page, event?: string, searchQuery = query, push = false) => { const url = new URL(location.href); url.searchParams.set('page', nextPage); if (event) url.searchParams.set('event', event); else url.searchParams.delete('event'); if (nextPage === 'search' && searchQuery.trim()) url.searchParams.set('q', searchQuery); else url.searchParams.delete('q'); if (nextPage !== 'artist') url.searchParams.delete('artist'); url.searchParams.delete('date'); history[push ? 'pushState' : 'replaceState']({ encore: true }, '', url) }
  const navigate = (value: Page) => { setPage(value); setDateFilter(''); setSearchTab('전체'); setQuery(''); setFilter('전체'); setCity('전국'); setOrder('performance'); updateUrl(value, undefined, '', true); window.scrollTo({ top: 0, behavior: 'instant' }) }
  const search = (value: string) => { setQuery(value); setSearchTab('전체'); setDateFilter(''); setPage('search'); setFilter('전체'); setCity('전국'); setOrder('performance'); updateUrl('search', undefined, value, page !== 'search') }
  useEffect(() => {
    const event = new URLSearchParams(location.search).get('event')
    const target = concerts.find(c => c.id === event)
    if (target) queueMicrotask(() => setSelected(target))
    else if (event) queueMicrotask(() => setSelected(null))
  }, [concerts])
  const openArtist = (band: Band) => { setSelected(null); setArtistId(band.id); setBioExpanded(false); setPage('artist'); updateUrl('artist', undefined, '', true); const url = new URL(location.href); url.searchParams.set('artist', band.id); history.replaceState({ encore: true }, '', url); window.scrollTo({ top: 0, behavior: 'instant' }) }
  const requestLogin = () => { setLoginOpen(true) }
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
  const closeDetails = () => { setSelected(null); updateUrl(page); opener.current?.focus() }
  const matches = (concert: Concert) => (filter === '전체' || (filter === '페스티벌' ? concert.type === '페스티벌' : concert.bandIds.some(id => { const b = bands.find(b => b.id === id); return b && (filter === '국내' ? b.country === '한국' || b.countryCode === 'KR' : b.country !== '한국' && b.countryCode !== 'KR') }))) && (city === '전국' || concert.city === city) && `${concert.title} ${concert.venue} ${concert.bandIds.map(id => bands.find(b => b.id === id) ? [bands.find(b => b.id === id)?.name, ...(bands.find(b => b.id === id)?.aliases ?? [])].join(' ') : '').join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())
  const matchingBands = bands.filter(b => [b.name, ...(b.aliases ?? [])].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
  const followedBands = bands.filter(b => followed.includes(b.id))
  const attributedPhoto = (selected ? bands.filter(b => selected.bandIds.includes(b.id)) : page === 'artist' && artist ? [artist] : page === 'search' ? matchingBands : page === 'bands' ? followedBands : page === 'home' ? bands.slice(0,3) : []).find(b => (b.photoMode ?? 'auto') === 'auto' && validYouTubePhoto(b.officialProfile?.photo))?.officialProfile?.photo
  const upcoming = sortConcerts(concerts.filter(c => matches(c) && (!dateFilter || performsOn(c, dateFilter)) && (page !== 'home' || isUpcoming(c))), order)
  const savedConcerts = [...concerts, ...unavailable].filter(c => saved.includes(c.id)).sort((a, b) => (a.ticketAt || '9999').localeCompare(b.ticketAt || '9999'))
  const datedSchedules = savedConcerts.filter(c => koreaDay(c.ticketAt) === scheduleDay)
  const dayConcerts = sortConcerts(concerts.filter(c => performsOn(c, scheduleDay)), 'performance')
  const showDateConcerts = () => { navigate('discover'); setDateFilter(scheduleDay); const url = new URL(location.href); url.searchParams.set('date', scheduleDay); history.replaceState(null, '', url) }
  const downloadCalendar = (concert: Concert) => { const url = URL.createObjectURL(new Blob([calendarFile(concert, !accountMode)], { type: 'text/calendar;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `${concert.id}${accountMode ? '' : '-sample'}.ics`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
  const displayTime = (value: string) => value ? new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Seoul' }) : '일시 미정'
  const displayDate = (value: string) => value ? koreaDay(value).replaceAll('-', '.') : '일정 미정'
  const followControl = (band: Band, compact = false) => <button className={compact ? 'heart' : 'follow-control'} aria-label={`${band.name} ${followed.includes(band.id) ? '찜 해제' : '찜하기'}`} aria-pressed={followed.includes(band.id)} disabled={savingDisabled || pending('bands', band.id)} onClick={() => void toggleBand(band.id)}><Icon name="heart" />{!compact && (followed.includes(band.id) ? '찜하는 중' : '찜하기')}</button>
  const card = (concert: Concert) => {
    const band = bands.find(b => b.id === concert.bandIds[0])
    return <article className="event" key={concert.id}><button className="art-link" aria-label={`${concert.title} 상세 보기`} onClick={() => openDetails(concert)}><ApprovedArtwork concert={concert} bands={bands} /></button><div className="event-info"><div className="event-label"><span className="badge">{concert.type}</span>{band && followControl(band, true)}</div><button className="event-name" onClick={() => openDetails(concert)}>{band?.name ?? concert.title}</button><p>{concert.title}</p><div className="event-meta">{displayDate(concert.date)}<br />{concert.city} · {concert.venue}</div></div></article>
  }
  const cards = (list: Concert[]) => <div className="cards">{list.map(card)}</div>
  const empty = (title: string, description: string, label: string, action: () => void) => <div className="flow-empty"><span><Icon name="heart" /></span><h2>{title}</h2><p>{description}</p><button className="primary" onClick={action}>{label} <Icon name="arrow" /></button></div>
  const filters = <div className="filters" aria-label="공연 분류">{['전체', '내한', '국내', '페스티벌'].map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div>
  const searchForm = (home = false) => <form className={`search${home ? '' : ' flow-search'}`} role="search" onSubmit={event => { event.preventDefault(); search(query) }}><Icon name="search" /><input aria-label="밴드 또는 공연 검색" placeholder={home ? '어떤 아티스트를 좋아하세요?' : '아티스트, 공연 이름으로 검색'} value={query} onChange={event => home ? setQuery(event.target.value) : search(event.target.value)} /><button aria-label="검색 결과 보기"><Icon name="arrow" /></button></form>
  const suggestions = bands.slice(0,3)
  const bandResult = (band: Band) => <article className="flow-artist-result" key={band.id}><ArtistIdentity band={band} variant="result" onOpen={() => openArtist(band)} />{followControl(band)}</article>
  const artistConcerts = artist ? sortConcerts(concerts.filter(c => c.bandIds.includes(artist.id) && isUpcoming(c) && !c.cancelled), 'performance') : []
  const returnToList = () => { closeDetails(); if (page === 'artist' && !artist) navigate('discover') }
  const artistScreen = page === 'artist' && !selected
  const accountAction = () => { if (auth.session) { setSelected(null); navigate('settings') } else setLoginOpen(true) }
  const shownSchedules = allSchedules ? savedConcerts : datedSchedules

  return <>
    <a className="skip-link" href="#main">본문으로 건너뛰기</a>
    <header className="site-header"><a href="?page=home" className="brand" aria-label="encore 홈" onClick={event => { event.preventDefault(); setSelected(null); navigate('home') }}>encore<span>.</span></a><nav aria-label="주요 메뉴">{navigation.filter(item => item.id !== 'home').map(item => <button key={item.id} aria-current={page === item.id && !selected ? 'page' : undefined} onClick={() => { setSelected(null); navigate(item.id) }}>{item.label}</button>)}</nav><button className="header-search" aria-label="검색 열기" onClick={() => { setSelected(null); navigate('search') }}><Icon name="search" /></button><button className="login-button" aria-label={auth.session ? '알림·계정 설정' : '로그인'} onClick={accountAction}><Icon name="user" />{auth.session ? '내 계정' : '로그인'}</button></header>
    <main id="main" tabIndex={-1} className={`page${page === 'home' && !selected ? '' : ' flow-page'}${artistScreen ? ' artist-flow-page' : ''}`}>
      {!accountMode && !artistScreen && <div className="notice"><span className="notice-dot" />디자인 미리보기 · 모든 공연·일정은 가상 샘플입니다.</div>}
      {catalog.loading && !catalog.initialized && <p role="status" className="service-status">공연 정보를 불러오는 중…</p>}
      {catalog.error && <div role="alert" className="service-error">{catalog.error}<button className="secondary" onClick={catalog.reload}>다시 불러오기</button></div>}
      {missingLinkedEvent && <p role="status" className="service-error">이 공연 정보는 삭제되었거나 공개가 중단되었습니다.</p>}
      {accountMode && account.error && <p role="alert" className="service-error">{account.error}<button className="secondary" onClick={account.reload}>다시 불러오기</button></p>}
      {page !== 'settings' && auth.error && <p role="alert" className="service-error">{auth.error}<button onClick={accountAction}>로그인 확인</button></p>}

      {selected ? <>
        <button className="flow-back" aria-label="공연 상세 닫기" onClick={returnToList}><Icon name="arrow" /></button>
        <section className="flow-detail" aria-labelledby="detail-title"><div className="detail-poster"><ApprovedArtwork concert={selected} bands={bands} />{!accountMode && <p>디자인 시안용 그래픽 포스터</p>}</div><div className="detail-main"><div className="detail-badges"><span className="badge">{selected.type}</span>{selected.cancelled && <span>취소된 공연</span>}{!accountMode && <span>가상 공연 샘플</span>}</div><h1 id="detail-title">{bands.find(b => b.id === selected.bandIds[0])?.name ?? selected.title}</h1><p className="detail-subtitle">{selected.title}</p><div className="detail-artist"><div className="detail-lineup">{bands.filter(b => selected.bandIds.includes(b.id)).map(b => <ArtistIdentity key={b.id} band={b} onOpen={() => openArtist(b)} />)}</div>{bands.find(b => selected.bandIds.includes(b.id)) && followControl(bands.find(b => selected.bandIds.includes(b.id))!)}</div><dl><div><dt>공연 날짜</dt><dd>{displayDate(selected.date)}{selected.endsOn && selected.endsOn !== selected.date ? ` ~ ${displayDate(selected.endsOn)}` : ''}</dd></div><div><dt>공연 장소</dt><dd>{selected.city} · {selected.venue}</dd></div><div><dt>티켓 오픈</dt><dd>{formatDate(selected.ticketAt,true)}</dd></div><div><dt>예매 정보</dt><dd>{selected.bookingUrl ? <a href={selected.bookingUrl} target="_blank" rel="noopener noreferrer">공식 예매처 ↗</a> : selected.price}</dd></div></dl><div className="ticket-save-panel"><div><span><Icon name="calendar" />기다리는 무대, 잊지 않도록</span><p>티켓 오픈 시간을 내 예매 일정에 모아두세요.</p></div><button className="primary" aria-pressed={saved.includes(selected.id)} disabled={savingDisabled || pending('schedules',selected.ticketScheduleId ?? selected.id) || (accountMode && !saved.includes(selected.id) && (!selected.ticketScheduleId || selected.cancelled || selected.unavailable))} onClick={() => void toggleSaved(selected.id)}><Icon name="calendar" />{saved.includes(selected.id) ? '저장한 일정 해제' : '예매 일정 저장'}</button><small>일정 저장만으로 푸시 알림이 예약되지 않습니다.</small></div>{selected.sources?.length ? <div className="official-sources">{selected.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">공식 출처: {source.label} ↗</a>)}</div> : null}{!accountMode && <p className="detail-disclosure">이 화면의 공연·일정은 UI 확인을 위한 가상 샘플이며 실제 공연 발표가 아닙니다.</p>}</div></section><section className="flow-detail-bottom"><h2>같은 취향으로 발견하기</h2><p>다른 아티스트의 다음 무대도 살펴보세요.</p>{cards(concerts.filter(c => c.id !== selected.id && isUpcoming(c)).slice(0,3))}</section>
      </> : <>
      {page === 'home' && <>
        <section className="poster-hero"><div className="hero-copy"><div className="intro-line"><span className="little-cross">✳</span>당신의 다음 라이브를 찾아서</div><h1>좋아하는 음악,<br />직접 만나는 순간.</h1><p>국내 밴드부터 기다리던 내한 공연까지.<br />플레이리스트 다음은, 라이브.</p>{searchForm(true)}<div className="popular">지금 많이 찾는 {suggestions.slice(0,2).map(band => <button key={band.id} onClick={() => search(band.name)}>{band.name}</button>)}</div></div><div className="poster-installation" aria-label="라이브 공연을 표현한 그래픽 포스터"><div className="floating-ticket"><span>당신의 다음 라이브</span><strong>SEE<br />YOU<br />THERE<span>✳</span></strong><div>음악이 시작되는 곳에서 만나요.<br />encore. live in your city</div><div className="barcode" /></div><div className="ticket-sticker">음악은<br />계속된다.</div><div className="ticket-shadow" /></div></section>
        <div className="combined-layout"><section className="artist-section"><div className="section-heading"><div><h2>요즘, 이 아티스트</h2><p>좋아하는 이름을 발견하면, 먼저 찜해두세요.</p></div><button className="artist-manage" onClick={() => navigate('bands')}>내 아티스트 <Icon name="arrow" /></button></div><div className="artist-list">{catalog.loading && !catalog.initialized && !suggestions.length && [0,1,2].map(id => <div key={id} className="artist-item" aria-hidden="true"><div className="artist-skeleton"><span className="skeleton-avatar" /><span className="skeleton-name" /></div></div>)}{suggestions.map(band => <div className="artist-item" key={band.id}><ArtistIdentity band={band} variant="home" onOpen={() => openArtist(band)} /><button className="artist-add" aria-label={`${band.name} ${followed.includes(band.id) ? '찜 해제' : '찜하기'}`} aria-pressed={followed.includes(band.id)} disabled={savingDisabled || pending('bands',band.id)} onClick={() => void toggleBand(band.id)}>{followed.includes(band.id) ? '✓' : '+'}</button></div>)}</div></section><HomeCalendar concerts={concerts} bands={bands} onOpen={openDetails} onAccount={accountAction} /><section id="concerts"><div className="section-heading"><div><h2>다음 공연은 여기서</h2><p>마음이 가는 공연을 골라보세요.</p></div><a href="?page=discover" onClick={event => { event.preventDefault(); navigate('discover') }}>공연 둘러보기 <Icon name="arrow" /></a></div>{filters}{cards(upcoming.slice(0,6))}</section></div><section className="join-banner"><div><h2>좋아하는 밴드가 있다면.</h2><p>로그인하고 나만의 공연 목록을 시작하세요.</p></div><button className="primary" onClick={accountAction}>로그인하고 찜하기 <Icon name="arrow" /></button></section>
      </>}

      {page === 'discover' && <><div className="flow-page-heading"><span className="flow-kicker">당신의 다음 라이브</span><h1>공연 둘러보기</h1><p>마음이 가는 공연을 골라보세요.</p></div><div className="discover-controls">{filters}<label>공연 날짜<input type="date" aria-label="공연 날짜" value={dateFilter} onChange={event => { setDateFilter(event.target.value); const url = new URL(location.href); if (event.target.value) url.searchParams.set('date',event.target.value); else url.searchParams.delete('date'); history.replaceState(null,'',url) }} /></label>{dateFilter && <button className="clear-date" onClick={() => setDateFilter('')}>날짜 해제</button>}</div><div className="section-heading"><h2>{dateFilter ? `${dayLabel(dateFilter)} 공연` : '모든 공연'} <span>{upcoming.length}</span></h2><span>공연일순</span></div>{upcoming.length ? cards(upcoming) : empty('이 날짜에 확인된 공연이 없어요.','날짜를 해제하거나 다른 날의 공연을 둘러보세요.','전체 공연 보기',() => navigate('discover'))}</>}

      {page === 'search' && <><div className="flow-page-heading"><span className="flow-kicker">취향이 다음 라이브가 되도록</span><h1>{query.trim() ? `“${query.trim()}” 검색 결과` : '어떤 음악을 찾으세요?'}</h1><p>아티스트와 공연, 이름으로 찾아보세요.</p></div>{searchForm()}<div className="flow-search-tags"><span>이런 검색은 어때요?</span>{suggestions.map(band => <button key={band.id} onClick={() => search(band.name)}>{band.name}</button>)}</div><div className="search-kind filters" aria-label="검색 결과 종류">{['전체','아티스트','공연'].map(tab => <button key={tab} aria-pressed={searchTab === tab} onClick={() => setSearchTab(tab)}>{tab}</button>)}</div><div className="result-summary" role="status">아티스트 <strong>{matchingBands.length}</strong> · 공연 <strong>{upcoming.length}</strong></div>{searchTab !== '공연' && <section className="flow-result-artists" aria-label="아티스트 검색 결과"><div className="section-heading"><h2>아티스트 <span>{matchingBands.length}</span></h2></div>{matchingBands.length ? <div className="flow-artist-results">{matchingBands.map(bandResult)}</div> : <p className="muted-result">일치하는 아티스트가 없어요. 다른 이름으로 검색해 보세요.</p>}{accountMode && !matchingBands.length && <ExternalArtistResults registeredIds={bands.flatMap(b => b.musicbrainzId ? [b.musicbrainzId] : [])} query={query} userId={auth.session?.user.id ?? null} disabled={savingDisabled} onLogin={requestLogin} onSelected={async row => { if (row.curation_status === 'held' || row.curation_status === 'excluded') throw new Error('ARTIST_NOT_AVAILABLE'); catalog.addBand(mapBands([row])[0]); if (!followed.includes(row.id)) { const success = await account.toggle('bands',row.id); if (success === false) throw new Error('SAVE_FAILED'); if (success === undefined) return } setToast('아티스트를 찜했어요. 공연이 없어도 찜 목록에 보관됩니다.') }} />}</section>}{searchTab !== '아티스트' && <section><div className="section-heading"><h2>공연 <span>{upcoming.length}</span></h2><span>공연일순</span></div>{upcoming.length ? cards(upcoming) : empty('아직 찾는 공연이 없어요.','다른 이름으로 검색하거나 전체 공연을 둘러보세요.','공연 둘러보기',() => navigate('discover'))}</section>}</>}

      {page === 'bands' && <><div className="flow-page-heading collection-heading"><div><span className="flow-kicker">나의 라이브 컬렉션</span><h1>찜한 아티스트 <span>{followedBands.length}</span></h1><p>좋아하는 이름들의 다음 무대를 모았어요.</p></div><button className="primary" onClick={() => navigate('search')}><Icon name="search" />아티스트 찾기</button></div><div className="flow-collection-note"><Icon name="heart" /><p>찜한 아티스트의 공연이 없어도, 이곳에 계속 보관돼요.</p></div>{followedBands.length ? <div className="flow-followed-grid">{followedBands.map(band => { const next = sortConcerts(concerts.filter(c => c.bandIds.includes(band.id) && isUpcoming(c)), 'performance')[0]; return <article className="flow-followed-card" key={band.id}><div className={`artist-cover ${artistStyle(band)}`}><span>{band.initials}</span><span className="cover-orbit" /></div><div className="followed-card-body"><div><ArtistAvatar band={band} />{followControl(band)}</div><h2><button className="followed-artist-title" onClick={() => openArtist(band)}>{band.name}</button></h2>{next ? <button className="next-show" onClick={() => openDetails(next)}><span><small>다음 공연</small><strong>{next.title}</strong><span>{displayDate(next.date)} · {next.venue}</span></span><Icon name="arrow" /></button> : <div className="next-show"><span><small>다음 공연</small><strong>아직 확인된 공연이 없어요.</strong></span></div>}</div></article> })}</div> : empty('처음으로 찜할 아티스트는 누구인가요?','좋아하는 밴드나 가수의 이름을 검색해 보세요.','아티스트 찾기',() => navigate('search'))}</>}

      {page === 'saved' && <><div className="flow-page-heading collection-heading"><div><span className="flow-kicker">기다리는 라이브를 위해</span><h1>내 예매 일정 <span>{savedConcerts.length}</span></h1><p>날짜를 골라 티켓 오픈 시간을 확인해 보세요.</p></div><button className="secondary" onClick={() => navigate('discover')}>공연 더 찾아보기 <Icon name="arrow" /></button></div><div className="flow-collection-note"><Icon name="calendar" /><p>일정 저장과 알림 수신은 별개예요.</p></div><div className="saved-layout"><section className="flow-schedule-list"><div className="schedule-list-heading"><h2>{allSchedules ? '저장한 전체 예매 일정' : `${dayLabel(scheduleDay)} 예매 일정`} <span>{shownSchedules.length}</span></h2>{!allSchedules && <button onClick={() => setAllSchedules(true)}>전체 일정 보기</button>}</div>{shownSchedules.length ? shownSchedules.map(concert => <article className="flow-schedule" key={concert.id}><div className="schedule-day"><strong>{concert.ticketAt ? Number(koreaDay(concert.ticketAt).slice(8)) : '—'}</strong><span>{concert.ticketAt ? `${Number(koreaDay(concert.ticketAt).slice(5,7))}월` : '일시 미정'}</span></div><div className="schedule-content"><span className="badge">{concert.unavailable ? '공개 중단 또는 삭제' : concert.cancelled ? '공연 취소' : `${displayTime(concert.ticketAt)} 티켓 오픈`}</span><button aria-label={concert.title} onClick={() => openDetails(concert)}>{bands.find(b => b.id === concert.bandIds[0])?.name ?? concert.title}</button><p>{concert.title}</p><small>{displayDate(concert.date)} 공연 · {concert.venue}</small><div className="schedule-actions"><button className="secondary" onClick={() => openDetails(concert)}>공연 상세</button><button className="remove-schedule" aria-label={`${concert.title} 저장한 일정 삭제`} disabled={savingDisabled || pending('schedules',concert.ticketScheduleId ?? concert.id)} onClick={() => void toggleSaved(concert.id)}>저장 해제</button><button className="calendar-download" aria-label="캘린더 저장" title="캘린더 저장" disabled={!concert.ticketAt || concert.cancelled || concert.unavailable} onClick={() => downloadCalendar(concert)}><Icon name="calendar" /></button></div></div><div className={`schedule-mini-art ${artistStyle(bands.find(b => b.id === concert.bandIds[0]))}`} aria-hidden="true">{bands.find(b => b.id === concert.bandIds[0])?.initials ?? '♪'}</div></article>) : !allSchedules && dayConcerts.length ? <div className="date-recommendation"><span className="recommendation-symbol"><Icon name="calendar" /></span><h3>이날의 라이브를 발견해 보세요.</h3><p>저장한 티켓 오픈 일정은 없지만,<br />이날 열리는 공연 {dayConcerts.length}개가 있어요.</p>{cards(dayConcerts.slice(0,3))}{dayConcerts.length > 3 && <button className="secondary more-date-concerts" onClick={showDateConcerts}>이날 공연 {dayConcerts.length}개 모두 보기 <Icon name="arrow" /></button>}</div> : empty(allSchedules ? '기다리는 공연을 모아보세요.' : '이날은 저장한 예매 일정이 없어요.',allSchedules ? '공연 상세에서 예매 일정을 저장하면 이곳에서 볼 수 있어요.' : '이날 열리는 공연도 아직 없어요. 다른 날을 선택하거나 공연을 둘러보세요.','공연 둘러보기',() => navigate('discover'))}</section><aside className="saved-rail"><TicketCalendar schedules={savedConcerts} concerts={concerts} selected={allSchedules ? '' : scheduleDay} onSelect={day => { setScheduleDay(day); setAllSchedules(false) }} /><div className="saved-aside"><span><Icon name="calendar" /></span><h2>그날의 함성까지,<br />한 걸음 더 가까이.</h2><p>공연 상세에서 티켓 오픈 시간을 확인하고, 기다리는 무대를 모아보세요.</p><div className="barcode" /></div></aside></div></>}

      {page === 'artist' && (artist ? <><button className="flow-back" aria-label="이전 화면" onClick={() => { if (history.state?.encore) history.back(); else navigate('search') }}><Icon name="arrow" /></button><section className={`artist-banner ${artistStyle(artist)}`}>{!accountMode && <div className="notice"><span className="notice-dot" />디자인 미리보기 · 모든 공연·일정은 가상 샘플입니다.</div>}<div className="artist-banner-art" aria-hidden="true"><span>{artist.initials}</span><i /></div><div className="artist-banner-copy"><h1>{artist.name}</h1><p>{artist.aliases?.find(alias => /^[a-z\s]/i.test(alias)) ?? artist.name}</p><strong className="artist-live-summary">{artistConcerts.length ? <>예정된 공연 {artistConcerts.length}개 · 다음 라이브 {displayDate(artistConcerts[0].date)}</> : '아직 확인된 예정 공연이 없어요.'}</strong>{followControl(artist)}</div></section><section className="artist-about"><div><h2>아티스트 소개</h2><p id="artist-bio" className={`artist-bio ${bioExpanded ? 'expanded' : ''}`}>{artist.name} · {artist.country} · {artist.genre}.{artist.aliases?.length ? ` 다른 이름: ${artist.aliases.join(', ')}.` : ''} 공식 채널에서 음악과 최근 소식을 만나보세요.</p><button className="bio-toggle" aria-controls="artist-bio" aria-expanded={bioExpanded} onClick={() => setBioExpanded(!bioExpanded)}>{bioExpanded ? '접기' : '더보기'}</button><ArtistOfficialLinks name={artist.name} profile={artist.officialProfile} /></div><div className="artist-profile-note"><span>다음 라이브</span><strong>{artistConcerts[0] ? displayDate(artistConcerts[0].date) : '공연 소식 준비 중'}</strong><span>{artistConcerts[0]?.venue ?? '확인된 예정 공연이 없습니다.'}</span></div></section><section className="artist-concerts"><div className="section-heading"><h2>예정된 공연 <span>{artistConcerts.length}</span></h2><button className="artist-manage" onClick={() => search(artist.name)}>공연 전체 보기 <Icon name="arrow" /></button></div>{cards(artistConcerts.slice(0,3))}</section><ArtistMedia band={artist} preview={!accountMode} /><section className="related-artists"><div className="section-heading"><div><h2>함께 발견할 아티스트</h2><p>이런 음악도 만나보세요.</p></div></div><div className="related-artist-list">{bands.filter(b => b.id !== artist.id).slice(0,3).map(band => <div className="related-profile" key={band.id}><ArtistIdentity band={band} variant="home" onOpen={() => openArtist(band)} /></div>)}</div></section></> : empty('아티스트를 찾을 수 없습니다.','다른 아티스트를 검색해 보세요.','검색',() => navigate('search')))}

      {page === 'settings' && <section className="account-settings"><div className="flow-page-heading"><h1>알림·계정 설정</h1><p>수신 동의와 등록 기기, 로그인 계정을 관리하세요.</p></div><AccountPanel key={`account:${auth.session?.user.id ?? 'signed-out'}`} auth={auth} initiallyExpanded={!auth.session} />{accountMode && auth.session && <NotificationPanel key={`notifications:${auth.session.user.id}`} userId={auth.session.user.id} />}{admin.allowed && <button className="secondary" onClick={() => navigate('admin')}>관리자 공연 검수</button>}</section>}
      {page === 'admin' && <><button className="secondary" onClick={() => navigate('settings')}>알림·계정 설정으로 돌아가기</button>{admin.allowed ? <AdminPanel key={auth.session!.user.id} onSaved={catalog.reload} /> : <div role="status" className="service-error">{admin.error || '로그인된 관리자만 공연을 등록·검수할 수 있습니다.'}{admin.error && <button onClick={admin.reload}>권한 다시 확인</button>}</div>}</>}
      </>}
      <footer><span className="brand">encore.</span><p>다음 라이브에서 만나요.</p><span>© 2026 encore.</span></footer><details className="service-legal"><summary>서비스 이용 안내 · 개인정보 · 출처</summary><ServiceGuide />{attributedPhoto && <aside className="youtube-attribution" aria-label="YouTube 사진 안내"><a href={attributedPhoto.channelUrl} target="_blank" rel="noopener noreferrer" aria-label="사진 제공 · YouTube 채널"><img src={youtubeIcon} alt="YouTube" width={217} height={186} /></a><p>채널 사진 제공: YouTube<br />각 사진 아래의 출처 링크에서 공식 채널을 확인하세요.</p></aside>}</details>
    </main>
    <nav className="flow-mobile-nav" aria-label="모바일 메뉴">{([{id:'home',icon:'home',label:'홈'},{id:'discover',icon:'calendar',label:'공연'},{id:'search',icon:'search',label:'검색'},{id:'bands',icon:'heart',label:'찜'},{id:'saved',icon:'calendar',label:'예매 일정'}] as {id:Page;icon:IconName;label:string}[]).map(item => <button key={item.id} aria-current={page === item.id && !selected ? 'page' : undefined} onClick={() => { setSelected(null); navigate(item.id) }}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
    <LoginDialog auth={auth} open={loginOpen} onClose={() => setLoginOpen(false)} />
    {toast && <div id="toast" className="show" role="status">{toast}</div>}
  </>
}
export default App
