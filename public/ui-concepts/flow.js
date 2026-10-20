// Screen prototypes share in-memory state only. No account or network operations.
if (mode === 'combined') {
  const flowRoot = document.querySelector('#app')
  const homeMarkup = content
  // Fictional dates to exercise same-day recommendations, the three-card cap and empty days.
  events.push(
    {...events[0], sub:'Autumn Session · 서울', date:'2026.10.25', open:'10.21 수 20:00'},
    {...events[1], sub:'Autumn Session · 인천', date:'2026.10.25', open:'10.22 목 18:00'},
    {...events[2], sub:'Autumn Session · 서울', date:'2026.10.25', open:'10.22 목 20:00'},
    {...events[3], sub:'Autumn Session · 페스티벌', date:'2026.10.25', open:'10.21 수 18:00'},
    {...events[2], sub:'Evening Session', date:'2026.10.26', open:'10.22 목 19:00'},
  )
  const follows = new Set(['실리카겔', 'wave to earth'])
  const schedules = new Set([0, 1])
  const artistEvents = events.slice(0, 3)
  let currentPage = 'home'
  let searchTerm = ''
  let category = '전체'
  let activeEvent = 0
  let activeArtist = 0
  let resultType = '전체'
  let discoverDate = ''
  let discoverArtist = ''
  let selectedDate = ''
  let calendarMonth = '2026-10'
  let signedIn = false
  let loginStep = 'email'
  let lastFocus = null
  let flowToastTimer
  const escapeText = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]))
  const pageNames = {home:'홈', discover:'공연 둘러보기', search:'검색', artist:'아티스트 상세', artists:'찜한 아티스트', saved:'내 예매 일정', detail:'공연 상세'}
  const meta = event => event.type === '내한' ? '일본 · 얼터너티브 록' : event.style === 'gel' ? '한국 · 사이키델릭 록' : '한국 · 인디 팝'
  const initials = event => event.style === 'gel' ? 'SG' : event.style === 'rock' ? 'OR' : 'we'
  const profiles = [
    {english:'Silica Gel', line:'익숙한 플레이리스트 밖으로.', intro:'선명한 기타와 전자음, 무대에서 더 크게 번지는 사운드. 실리카겔의 음악과 다음 공연을 한곳에서 만나보세요.', more:'좋아하는 곡을 영상으로 다시 듣고, 기다리는 무대의 예매 시간을 모아두세요. 이 소개와 배너는 디자인 확인을 위한 편집 시안입니다.', videos:[['T + Tik Tak Tok (feat. So!YoON!)','DIPxnt5vnhU']], live:[['NO PAIN · YES24 LIVE HALL','qg40imnWXG8'],['NO PAIN · Syn.THE.Size X','KaYT_O0CwLE']]},
    {english:'ONE OK ROCK', line:'이어폰에서, 무대의 한가운데로.', intro:'뜨거운 기타 사운드와 함께 부르는 순간. ONE OK ROCK의 영상과 다음 공연을 이어서 발견해 보세요.', more:'취향에 맞는 라이브를 먼저 살펴보고 다음 만남을 준비하세요. 이 소개와 배너는 디자인 확인을 위한 편집 시안입니다.', videos:[['Stand Out Fit In','IGInsosP0Ac']], live:[]},
    {english:'wave to earth', line:'잔잔한 파동이 라이브가 되는 밤.', intro:'오래 머무는 멜로디를 화면 밖에서 만나보세요. wave to earth의 영상과 다음 공연을 모았습니다.', more:'좋아하는 아티스트를 찜하고 티켓 오픈 시간을 저장해 보세요. 이 소개와 배너는 디자인 확인을 위한 편집 시안입니다.', videos:[['courage','CEfjpeSownQ'],['babo','INBhi8KuYCk'],['heaven and hell','53Ot9E5QG_I']], live:[]},
  ]

  function flowHeader() {
    return `<header class="site-header"><a href="#home" data-page="home" class="brand" aria-label="encore 홈">encore<span>.</span></a><nav aria-label="주요 메뉴"><button data-page="discover" ${currentPage==='discover'?'aria-current="page"':''}>공연 둘러보기</button><button data-page="artists" ${currentPage==='artists'?'aria-current="page"':''}>찜한 아티스트</button><button data-page="saved" ${currentPage==='saved'?'aria-current="page"':''}>내 예매 일정</button></nav><button class="header-search" data-page="search" aria-label="검색 화면 열기">${icon('search')}</button><button class="login-button" data-login>${icon('user')}${signedIn?'내 계정':'로그인'}</button></header>`
  }
  function mobileNav() {
    return `<nav class="flow-mobile-nav" aria-label="모바일 메뉴">${[['home','home','홈'],['discover','calendar','공연'],['search','search','검색'],['artists','heart','찜'],['saved','calendar','예매 일정']].map(([page,graphic,label])=>`<button data-page="${page}" ${page===currentPage?'aria-current="page"':''}>${icon(graphic)}<span>${label}</span></button>`).join('')}</nav>`
  }
  function previewBar() {
    return `<aside class="flow-preview-bar" aria-label="시안 화면 바로가기"><span>화면 시안</span>${Object.entries(pageNames).map(([page,name])=>`<button data-page="${page}" aria-pressed="${page===currentPage}">${name}</button>`).join('')}<button data-login>로그인 창</button></aside>`
  }
  function searchForm(value = '') {
    return `<form class="search flow-search" role="search">${icon('search')}<input aria-label="아티스트 또는 공연 검색" placeholder="아티스트, 공연 이름으로 검색" value="${escapeText(value)}"><button aria-label="검색">${icon('arrow')}</button></form>`
  }
  function followButton(event, compact = false) {
    const active = follows.has(event.name)
    return `<button class="${compact?'heart':'follow-control'}" data-follow="${event.name}" aria-pressed="${active}" aria-label="${event.name} ${active?'찜 해제':'찜하기'}">${icon('heart')}${compact?'':active?'찜하는 중':'찜하기'}</button>`
  }
  function concertCards(list) {
    return `<div class="cards">${list.map(event=>`<article class="event"><button class="art-link" data-event="${events.indexOf(event)}" aria-label="${event.name} 공연 상세 보기">${artwork(event)}</button><div class="event-info"><div class="event-label"><span class="badge">${event.type}</span>${followButton(event,true)}</div><button class="event-name" data-event="${events.indexOf(event)}">${event.name}</button><p>${event.sub}</p><div class="event-meta">${event.date}<br>${event.venue}</div></div></article>`).join('')}</div>`
  }
  function artistResult(event) {
    return `<article class="flow-artist-result"><button class="artist-identity" data-artist="${artistEvents.indexOf(event)}"><span class="avatar ${event.style}">${initials(event)}</span><span><strong>${event.name}</strong><small>${meta(event)}</small><span>아티스트 보기 ${icon('arrow')}</span></span></button>${followButton(event)}</article>`
  }
  function emptyState(title, description, action, page) {
    return `<div class="flow-empty"><span>${icon(page==='search'?'search':'heart')}</span><h2>${title}</h2><p>${description}</p><button class="primary" data-page="${page}">${action} ${icon('arrow')}</button></div>`
  }
  function searchPage() {
    const term = searchTerm.toLowerCase().trim()
    const matching = events.filter(event=>(event.name+' '+event.sub).toLowerCase().includes(term))
    const artists = artistEvents.filter(event=>event.name.toLowerCase().includes(term))
    const concerts = matching.filter(event=>category==='전체'||event.type===category).sort((a,b)=>a.date.localeCompare(b.date))
    return `<div class="flow-page-heading"><span class="flow-kicker">취향이 다음 라이브가 되도록</span><h1>${term?`“${escapeText(searchTerm)}” 검색 결과`:'어떤 음악을 찾으세요?'}</h1><p>아티스트와 공연, 이름으로 찾아보세요.</p></div>
      ${searchForm(searchTerm)}<div class="flow-search-tags"><span>이런 검색은 어때요?</span>${['실리카겔','ONE OK ROCK','wave to earth'].map(name=>`<button data-search="${name}">${name}</button>`).join('')}</div>
      <div class="search-kind filters" aria-label="검색 결과 종류">${['전체','아티스트','공연'].map(type=>`<button data-searchtype="${type}" aria-pressed="${type===resultType}">${type}</button>`).join('')}</div>
      <div class="result-summary" role="status">아티스트 <strong>${artists.length}</strong> · 공연 <strong>${matching.length}</strong></div>
      ${resultType!=='공연'?`<section class="flow-result-artists"><div class="section-heading"><h2>아티스트 <span>${artists.length}</span></h2></div>${artists.length?`<div class="flow-artist-results">${artists.map(artistResult).join('')}</div>`:'<p class="muted-result">일치하는 아티스트가 없어요. 다른 이름으로 검색해 보세요.</p>'}</section>`:''}
      ${resultType!=='아티스트'?`<section><div class="section-heading"><h2>공연 <span>${concerts.length}</span></h2><span>공연일순</span></div>${concerts.length?concertCards(concerts):emptyState('아직 찾는 공연이 없어요.','다른 이름으로 검색하거나 전체 공연을 둘러보세요.','공연 둘러보기','discover')}</section>`:''}`
  }
  function discoverPage() {
    const list=events.filter(event=>(category==='전체'||event.type===category)&&(!discoverDate||event.date.replaceAll('.','-')===discoverDate)&&(!discoverArtist||event.name===discoverArtist)).sort((a,b)=>a.date.localeCompare(b.date))
    return `<div class="flow-page-heading"><span class="flow-kicker">당신의 다음 라이브</span><h1>공연 둘러보기</h1><p>마음이 가는 공연을 골라보세요. 아티스트는 ${'<button class="inline-search" data-page="search">검색에서 찾아보세요.</button>'}</p></div><div class="discover-controls"><div class="filters" aria-label="공연 분류">${['전체','내한','국내','페스티벌'].map(type=>`<button data-category="${type}" aria-pressed="${category===type}">${type}</button>`).join('')}</div><label>공연 날짜<input type="date" id="discover-date" value="${discoverDate}" aria-label="공연 날짜"></label>${discoverDate?'<button class="clear-date" data-clear-date>날짜 해제</button>':''}</div><div class="section-heading"><h2>${discoverDate?`${Number(discoverDate.slice(5,7))}월 ${Number(discoverDate.slice(8))}일 공연`:(discoverArtist ? discoverArtist+'의 공연' : '모든 공연')} <span>${list.length}</span></h2><span>공연일순</span></div>${list.length?concertCards(list):emptyState('이 날짜에 확인된 공연이 없어요.','날짜를 해제하거나 다른 날의 공연을 둘러보세요.','전체 공연 보기','discover')}`
  }
  function videoSection(title, items, event) {
    return `<section class="artist-media"><div class="section-heading"><h2>${title}</h2><span>YouTube에서 열립니다</span></div>${items.length?`<div class="artist-video-grid">${items.map(([name,id],index)=>`<a class="artist-video" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer"><div class="video-thumb ${event.style} video-tone-${index}"><span class="video-graphic" aria-hidden="true">${initials(event)}</span><span class="video-play" aria-hidden="true">▶</span><span class="video-label">${title==='라이브 공연 영상'?'Live':'Music video'}</span></div><h3>${name}</h3><p>${event.name} · YouTube</p></a>`).join('')}</div>`:'<div class="video-awaiting">공식 라이브 영상은 확인 후 이곳에 모을게요.</div>'}<p class="video-caption">그래픽 썸네일은 시안입니다. 영상 링크는 확인한 공식 출처로 연결합니다.</p></section>`
  }
  function artistPage() {
    const event=artistEvents[activeArtist]
    const profile=profiles[activeArtist]
    const next=events.filter(item=>item.name===event.name).sort((a,b)=>a.date.localeCompare(b.date))
    return `<button class="flow-back" data-back>${icon('arrow')} 이전 화면</button><section class="artist-banner ${event.style}"><div class="artist-banner-art" aria-hidden="true"><span>${initials(event)}</span><i></i></div><div class="artist-banner-copy"><span class="artist-country">${meta(event)}</span><h1>${event.name}</h1><p>${profile.english}</p><strong>${profile.line}</strong>${followButton(event)}</div></section><section class="artist-about"><div><h2>아티스트 소개</h2><p>${profile.intro}</p><details><summary>더보기</summary><p>${profile.more}</p></details></div><div class="artist-profile-note"><span>다음 라이브</span><strong>${next[0].date}</strong><span>공연 정보 · 가상 샘플</span></div></section><section class="artist-concerts"><div class="section-heading"><h2>예정된 공연 <span>${next.length}</span></h2><button class="artist-manage" data-artist-concerts>공연 전체 보기 ${icon('arrow')}</button></div>${concertCards(next.slice(0,3))}</section>${videoSection('동영상',profile.videos,event)}${videoSection('라이브 공연 영상',profile.live,event)}<section class="related-artists"><div class="section-heading"><div><h2>함께 발견할 아티스트</h2><p>이런 음악도 만나보세요. 추천 구성은 시안입니다.</p></div></div><div class="related-artist-list">${artistEvents.filter(item=>item!==event).map(item=>`<button data-artist="${artistEvents.indexOf(item)}"><span class="avatar ${item.style}">${initials(item)}</span><strong>${item.name}</strong><small>${meta(item)}</small></button>`).join('')}</div></section>`
  }
  function artistsPage() {
    const list=artistEvents.filter(event=>follows.has(event.name))
    return `<div class="flow-page-heading collection-heading"><div><span class="flow-kicker">나의 라이브 컬렉션</span><h1>찜한 아티스트 <span>${list.length}</span></h1><p>좋아하는 이름들의 다음 무대를 모았어요.</p></div><button class="primary" data-page="search">${icon('search')} 아티스트 찾기</button></div><div class="flow-collection-note">${icon('heart')}<p>찜한 아티스트의 공연이 없어도, 이곳에 계속 보관돼요.</p><button class="text-demo" data-empty="artists">빈 목록 시안</button></div>${list.length?`<div class="flow-followed-grid">${list.map(event=>`<article class="flow-followed-card"><div class="artist-cover ${event.style}"><span>${initials(event)}</span><span class="cover-orbit"></span></div><div class="followed-card-body"><div><span class="avatar ${event.style}">${initials(event)}</span>${followButton(event)}</div><h2>${event.name}</h2><p>${meta(event)}</p><button class="next-show" data-event="${events.indexOf(event)}"><span><small>다음 공연</small><strong>${event.sub}</strong><span>${event.date} · ${event.venue}</span></span>${icon('arrow')}</button></div></article>`).join('')}</div>`:emptyState('처음으로 찜할 아티스트는 누구인가요?','좋아하는 밴드나 가수의 이름을 검색해 보세요.','아티스트 찾기','search')}<div class="flow-bottom-note">시안에서는 찜 상태가 화면 이동 중에만 유지됩니다. <button data-reset="artists">샘플 찜 복원</button></div>`
  }
  function savedPage() {
    const all=events.filter((_,index)=>schedules.has(index))
    const list=all.filter(event=>!selectedDate||ticketDate(event)===selectedDate)
    const suggested=selectedDate?events.filter(event=>event.date.replaceAll('.','-')===selectedDate):[]
    const result=list.length?list.map(event=>`<article class="flow-schedule"><div class="schedule-day"><strong>${event.open.slice(3,5)}</strong><span>${Number(event.open.slice(0,2))}월 ${event.open.slice(6,7)}요일</span></div><div class="schedule-content"><span class="badge">${event.open.slice(8)} 티켓 오픈</span><button data-event="${events.indexOf(event)}">${event.name}</button><p>${event.sub}</p><small>${event.date} 공연 · ${event.venue}</small><div class="schedule-actions"><button class="secondary" data-event="${events.indexOf(event)}">공연 상세</button><button class="remove-schedule" data-remove="${events.indexOf(event)}">저장 해제</button></div></div><div class="schedule-mini-art ${event.style}" aria-hidden="true">${initials(event)}</div></article>`).join(''):suggested.length?`<div class="date-recommendation"><span class="recommendation-symbol">${icon('calendar')}</span><h3>이날의 라이브를 발견해 보세요.</h3><p>저장한 티켓 오픈 일정은 없지만,<br>이날 열리는 공연 ${suggested.length}개가 있어요.</p>${concertCards(suggested.slice(0,3))}${suggested.length>3?`<button class="secondary more-date-concerts" data-date-discover="${selectedDate}">이날 공연 ${suggested.length}개 모두 보기 ${icon('arrow')}</button>`:''}</div>`:emptyState(selectedDate?'이날은 저장한 예매 일정이 없어요.':'기다리는 공연을 모아보세요.',selectedDate?'이날 열리는 공연도 아직 없어요. 다른 날을 선택하거나 공연을 둘러보세요.':'공연 상세에서 예매 일정을 저장하면 이곳에서 볼 수 있어요.','공연 둘러보기','discover')
    return `<div class="flow-page-heading collection-heading"><div><span class="flow-kicker">기다리는 라이브를 위해</span><h1>내 예매 일정 <span>${all.length}</span></h1><p>날짜를 골라 티켓 오픈 시간을 확인해 보세요.</p></div><button class="secondary" data-page="discover">공연 더 찾아보기 ${icon('arrow')}</button></div><div class="flow-collection-note">${icon('calendar')}<p>일정 저장과 알림 수신은 별개예요. 이 시안은 알림을 예약하지 않습니다.</p><button class="text-demo" data-empty="saved">빈 목록 시안</button></div><div class="saved-layout"><section class="flow-schedule-list"><div class="schedule-list-heading"><h2>${selectedDate?`${dateLabel(selectedDate)} 예매 일정`:'저장한 전체 예매 일정'} <span>${list.length}</span></h2>${selectedDate?'<button data-all-schedules>전체 일정 보기</button>':''}</div>${result}</section><aside class="saved-rail">${scheduleCalendar()}<div class="saved-aside"><span>${icon('calendar')}</span><h2>그날의 함성까지,<br>한 걸음 더 가까이.</h2><p>공연 상세에서 티켓 오픈 시간을 확인하고, 기다리는 무대를 모아보세요.</p><div class="barcode"></div><small>공연·예매 일정은 가상 샘플입니다.</small></div></aside></div><div class="flow-bottom-note">공연·예매 일정은 가상 샘플입니다. <button data-reset="saved">샘플 일정 복원</button></div>`
  }
  const ticketDate = event => '2026-'+event.open.slice(0,5).replace('.','-')
  const dateLabel = date => `${Number(date.slice(5,7))}월 ${Number(date.slice(8))}일`
  function scheduleCalendar() {
    const [year,month]=calendarMonth.split('-').map(Number)
    const offset=new Date(Date.UTC(year,month-1,1)).getUTCDay()
    const count=new Date(Date.UTC(year,month,0)).getUTCDate()
    const cells=Array.from({length:Math.ceil((offset+count)/7)*7},(_,index)=>{
      const day=index-offset+1
      if(day<1||day>count) return '<span></span>'
      const key=calendarMonth+'-'+String(day).padStart(2,'0')
      const saved=events.some((event,eventIndex)=>schedules.has(eventIndex)&&ticketDate(event)===key)
      const live=events.some(event=>event.date.replaceAll('.','-')===key)
      return `<button data-schedule-date="${key}" class="${saved?'has-saved':''} ${live?'has-concert':''}" aria-label="${year}년 ${month}월 ${day}일${saved?' 저장한 예매 있음':''}${live?' 공연 있음':''}" aria-pressed="${key===selectedDate}">${day}${saved||live?'<b></b>':''}</button>`
    }).join('')
    return `<section class="calendar saved-calendar" aria-label="예매 캘린더"><div class="calendar-heading"><h2>${year}년 ${month}월</h2><div><button data-calendar-month="-1" aria-label="이전 달">‹</button><button data-calendar-month="1" aria-label="다음 달">›</button></div></div><div class="week">${['일','월','화','수','목','금','토'].map(day=>`<span>${day}</span>`).join('')}</div><div class="days">${cells}</div><div class="calendar-legend"><span><b></b> 저장한 티켓 오픈</span><span><b></b> 공연 있는 날</span></div><p class="calendar-help">날짜를 누르면 옆에서 일정을 볼 수 있어요.</p></section>`
  }
  function detailPage() {
    const event=events[activeEvent]
    const active=schedules.has(activeEvent)
    return `<button class="flow-back" data-back>${icon('arrow')} 이전 화면</button><section class="flow-detail"><div class="detail-poster">${artwork(event)}<p>디자인 시안용 그래픽 포스터</p></div><div class="detail-main"><div class="detail-badges"><span class="badge">${event.type}</span><span>가상 공연 샘플</span></div><h1>${event.name}</h1><p class="detail-subtitle">${event.sub}</p><div class="detail-artist">아티스트 ${followButton(event)}</div><dl><div><dt>공연 날짜</dt><dd>${event.date}</dd></div><div><dt>공연 장소</dt><dd>${event.venue}</dd></div><div><dt>티켓 오픈</dt><dd>2026.${event.open}</dd></div><div><dt>예매 정보</dt><dd>공식 예매 정보 연결 전</dd></div></dl><div class="ticket-save-panel"><div><span>${icon('calendar')} 기다리는 무대, 잊지 않도록</span><p>티켓 오픈 시간을 내 예매 일정에 모아두세요.</p></div><button class="primary" data-save="${activeEvent}" aria-pressed="${active}">${icon('calendar')}${active?'저장한 일정 해제':'예매 일정 저장'}</button><small>일정 저장만으로 푸시 알림이 예약되지 않습니다.</small></div><p class="detail-disclosure">이 화면의 공연·일정은 UI 확인을 위한 가상 샘플이며 실제 공연 발표가 아닙니다.</p></div></section><section class="flow-detail-bottom"><h2>같은 취향으로 발견하기</h2><p>다른 아티스트의 다음 무대도 살펴보세요.</p>${concertCards(events.filter((_,index)=>index!==activeEvent).slice(0,3))}</section>`
  }
  let previousPage='home'
  function render(page=currentPage, focusHeading=true) {
    if(page!==currentPage) {
      clearTimeout(flowToastTimer)
      document.querySelector('#toast').classList.remove('show')
    }
    const focused=document.activeElement
    const focusAttribute=['data-follow','data-category','data-searchtype','data-schedule-date','data-calendar-month','data-save','data-remove','data-empty','data-reset','data-login'].find(attribute=>focused?.hasAttribute(attribute))
    const focusValue=focusAttribute?focused.getAttribute(focusAttribute):null
    if (page!==currentPage && (page==='detail'||page==='artist')) previousPage=currentPage
    currentPage=page
    if(['file:','http:','https:'].includes(location.protocol) && location.hash!==`#${page}`) history.pushState(null,'',`#${page}`)
    document.title=`${pageNames[page]} · encore. 디자인 시안`
    if (page==='home') {
      flowRoot.innerHTML=homeMarkup.replace(header,flowHeader()+previewBar()).replace('<button class="artist-manage" data-login','<button class="artist-manage" data-page="artists"')+mobileNav()
      const disclosure=document.querySelector('.calendar-disclosure')
      disclosure.open=!matchMedia('(max-width:760px)').matches
      document.querySelectorAll('.artist-item').forEach(item=>{
        const index=artistEvents.findIndex(event=>event.name===item.dataset.follow)
        const event=artistEvents[index]
        item.outerHTML=`<div class="artist-item"><button class="home-artist-profile" data-artist="${index}"><span class="avatar ${event.style}">${initials(event)}</span><span class="artist-text"><strong>${event.name}</strong><small>${meta(event)}</small></span></button><button class="artist-add" data-follow="${event.name}" aria-label="${event.name} 찜하기" aria-pressed="false">+</button></div>`
      })
    } else {
      const body=page==='discover'?discoverPage():page==='search'?searchPage():page==='artist'?artistPage():page==='artists'?artistsPage():page==='saved'?savedPage():detailPage()
      flowRoot.innerHTML=`${flowHeader()}${previewBar()}<main class="page flow-page">${notice}${body}${footer}</main>${mobileNav()}`
      if(page==='artists') document.querySelectorAll('.flow-followed-card').forEach(card=>{
        const title=card.querySelector('h2')
        const index=artistEvents.findIndex(event=>event.name===title.textContent)
        title.innerHTML=`<button class="followed-artist-title" data-artist="${index}">${artistEvents[index].name}</button>`
        const cover=card.querySelector('.artist-cover')
        cover.outerHTML=`<button class="${cover.className}" data-artist="${index}" aria-label="${artistEvents[index].name} 아티스트 상세">${cover.innerHTML}</button>`
      })
      if(page==='detail'&&activeEvent!==3&&events[activeEvent].name!=='Autumn Sound') {
        const index=artistEvents.findIndex(event=>event.name===events[activeEvent].name)
        document.querySelector('.detail-artist').insertAdjacentHTML('afterbegin',`<button class="inline-search" data-artist="${index}">${events[activeEvent].name} 아티스트 보기 ${icon('arrow')}</button>`)
      }
    }
    syncFollows()
    if (focusHeading) {
      window.scrollTo({top:0,behavior:'instant'})
      const title=document.querySelector('h1')
      title.tabIndex=-1
      title.focus({preventScroll:true})
    } else if (focusAttribute) {
      const replacement=Array.from(document.querySelectorAll(`[${focusAttribute}]`)).find(button=>button.getAttribute(focusAttribute)===focusValue)
      if(replacement) replacement.focus({preventScroll:true})
      else {const title=document.querySelector('h1');title.tabIndex=-1;title.focus({preventScroll:true})}
    }
  }
  function syncFollows() {
    document.querySelectorAll('[data-follow]').forEach(button=>{
      const active=follows.has(button.dataset.follow)
      button.setAttribute('aria-pressed',String(active))
      button.setAttribute('aria-label',`${button.dataset.follow} ${active?'찜 해제':'찜하기'}`)
      const plus=button.querySelector('.artist-add')
      if(plus) plus.textContent=active?'✓':'+'
      if(button.classList.contains('artist-add')) button.textContent=active?'✓':'+'
    })
  }
  function flowNotify(message) {
    const toast=document.querySelector('#toast')
    toast.textContent=message
    toast.classList.add('show')
    clearTimeout(flowToastTimer)
    flowToastTimer=setTimeout(()=>toast.classList.remove('show'),3000)
  }
  const login=document.querySelector('#login')
  login.classList.add('flow-login')
  function renderLogin() {
    login.innerHTML=`<form method="dialog"><button class="close" aria-label="로그인 시안 닫기">×</button></form><span class="brand">encore.</span><span class="login-illustration" aria-hidden="true">${icon(loginStep==='email'?'heart':'user')}</span>${signedIn?`<h2 id="login-title">반가워요, 라이브 메이트.</h2><p>로그인한 상태의 화면 시안입니다.<br>실제 계정이 생성되거나 연결되지 않았습니다.</p><button class="primary" data-logout>로그아웃 화면 체험</button>`:loginStep==='email'?`<h2 id="login-title">좋아하는 음악이<br>다음 만남이 되도록.</h2><p>이메일로 간편하게 시작하고,<br>찜한 아티스트와 예매 일정을 모아보세요.</p><form id="flow-email-form"><label for="flow-email">이메일 주소</label><input id="flow-email" type="email" placeholder="you@example.com" required autocomplete="off"><button class="primary" type="submit">이메일로 계속하기 ${icon('arrow')}</button></form><div class="login-benefits"><span>${icon('heart')} 나의 아티스트</span><span>${icon('calendar')} 나의 예매 일정</span></div>`:`<h2 id="login-title">메일함을 확인해 주세요.</h2><p>이메일 인증번호를 입력하는 화면 시안이에요.<br>실제 인증 메일은 발송하지 않았습니다.</p><form id="flow-code-form"><label for="flow-code">인증번호 6자리</label><input id="flow-code" class="code-input" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required autocomplete="off"><small>화면 체험용으로 숫자 6자리를 입력하세요.</small><button class="primary" type="submit">로그인 완료 화면 체험</button></form><button class="login-retry" data-email-step>이메일 다시 입력하기</button>`}<small class="login-preview-note">디자인 시안입니다. 입력한 이메일과 인증번호는 전송·저장되지 않습니다.</small>`
  }
  function openLogin() {
    lastFocus=document.activeElement
    loginStep='email'
    renderLogin()
    login.showModal()
    login.querySelector('input, .primary')?.focus()
  }
  login.addEventListener('close',()=>lastFocus?.isConnected&&lastFocus.focus())
  document.addEventListener('submit',event=>{
    if(event.target.matches('#flow-email-form')) {
      event.preventDefault(); loginStep='code'; renderLogin(); login.querySelector('input').focus(); return
    }
    if(event.target.matches('#flow-code-form')) {
      event.preventDefault(); signedIn=true; login.close(); render(currentPage,false); flowNotify('로그인 완료 상태의 시안입니다. 실제 인증은 진행하지 않았어요.'); return
    }
    if(event.target.matches('.search')) {
      event.preventDefault(); searchTerm=event.target.querySelector('input').value.trim(); category='전체'; resultType='전체'; render('search')
    }
  })
  document.addEventListener('change',event=>{
    if(event.target.id==='discover-date') {
      discoverDate=event.target.value
      render('discover',false)
      document.querySelector('#discover-date').focus({preventScroll:true})
    }
  })
  document.addEventListener('click',event=>{
    const button=event.target.closest('button, a')
    if(!button) return
    if(button.hasAttribute('data-page')) {
      event.preventDefault()
      if(button.dataset.page==='search') {searchTerm='';category='전체';resultType='전체'}
      if(button.dataset.page==='discover') {discoverDate='';discoverArtist='';category='전체'}
      if(button.dataset.page==='artist') activeArtist=0
      render(button.dataset.page); return
    }
    if(button.hasAttribute('data-login')) {openLogin();return}
    if(button.hasAttribute('data-email-step')) {loginStep='email';renderLogin();login.querySelector('input').focus();return}
    if(button.hasAttribute('data-logout')) {signedIn=false;login.close();render(currentPage,false);return}
    if(button.hasAttribute('data-back')) {render(previousPage);return}
    if(button.hasAttribute('data-search')) {searchTerm=button.dataset.search;category='전체';resultType='전체';render('search');return}
    if(button.hasAttribute('data-category')) {category=button.dataset.category;render(currentPage,false);return}
    if(button.hasAttribute('data-searchtype')) {resultType=button.dataset.searchtype;render('search',false);return}
    if(button.hasAttribute('data-artist')) {activeArtist=Number(button.dataset.artist);render('artist');return}
    if(button.hasAttribute('data-artist-concerts')) {discoverArtist=artistEvents[activeArtist].name;discoverDate='';category='전체';render('discover');return}
    if(button.hasAttribute('data-clear-date')) {discoverDate='';discoverArtist='';render('discover',false);return}
    if(button.hasAttribute('data-date-discover')) {discoverDate=button.dataset.dateDiscover;discoverArtist='';category='전체';render('discover');return}
    if(button.hasAttribute('data-schedule-date')) {selectedDate=button.dataset.scheduleDate;render('saved',false);return}
    if(button.hasAttribute('data-all-schedules')) {selectedDate='';render('saved',false);return}
    if(button.hasAttribute('data-calendar-month')) {
      const [year,month]=calendarMonth.split('-').map(Number)
      calendarMonth=new Date(Date.UTC(year,month-1+Number(button.dataset.calendarMonth),1)).toISOString().slice(0,7)
      selectedDate=calendarMonth+'-01';render('saved',false);return
    }
    if(button.hasAttribute('data-follow')) {
      const name=button.dataset.follow
      if(follows.has(name)) follows.delete(name); else follows.add(name)
      if(currentPage==='home') syncFollows(); else render(currentPage,false)
      flowNotify(follows.has(name)?`${name} 아티스트를 찜했어요.`:`${name} 찜을 해제했어요.`);return
    }
    if(button.hasAttribute('data-event')) {activeEvent=Number(button.dataset.event);render('detail');return}
    if(button.hasAttribute('data-save')) {
      const index=Number(button.dataset.save)
      if(schedules.has(index)) schedules.delete(index); else schedules.add(index)
      render('detail',false);flowNotify(schedules.has(index)?'내 예매 일정에 저장했어요.':'일정 저장을 해제했어요.');return
    }
    if(button.hasAttribute('data-remove')) {schedules.delete(Number(button.dataset.remove));render('saved',false);flowNotify('일정 저장을 해제했어요.');return}
    if(button.hasAttribute('data-empty')) {(button.dataset.empty==='artists'?follows:schedules).clear();render(currentPage,false);return}
    if(button.hasAttribute('data-reset')) {
      if(button.dataset.reset==='artists') {follows.add('실리카겔');follows.add('wave to earth')} else {schedules.add(0);schedules.add(1)}
      render(currentPage,false);return
    }
    if(button.hasAttribute('data-day')||button.classList.contains('calendar-reset')) {
      const day=button.dataset.day??''
      document.querySelectorAll('[data-day]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.day===day)))
      document.querySelectorAll('[data-open-day]').forEach(item=>{item.hidden=Boolean(day)&&item.dataset.openDay!==day})
      document.querySelector('#upcoming-title').textContent=day?`10월 ${day}일 티켓 오픈`:'다가오는 티켓 오픈'
      document.querySelector('.calendar-reset').hidden=!day
    }
    if(button.getAttribute('href')==='#concerts') {event.preventDefault();discoverDate='';discoverArtist='';category='전체';render('discover')}
  })
  matchMedia('(max-width:760px)').addEventListener('change',event=>{
    const disclosure=document.querySelector('.calendar-disclosure')
    if(disclosure) disclosure.open=!event.matches
  })
  const initialScreen=location.hash.slice(1)
  render(Object.hasOwn(pageNames,initialScreen)?initialScreen:'home',false)
  if(initialScreen==='login') openLogin()
  window.addEventListener('hashchange',()=>{
    const screen=location.hash.slice(1)
    if(screen==='login') {openLogin();return}
    if(Object.hasOwn(pageNames,screen)&&screen!==currentPage) {
      if(login.open) login.close()
      render(screen)
    }
  })
}
