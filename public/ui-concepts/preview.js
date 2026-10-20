const concept = new URLSearchParams(location.search).get('concept')
const mode = ['combined', 'poster', 'night', 'personal'].includes(concept) ? concept : 'combined'
document.body.className = mode
const icons = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  heart: '<path d="M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6M17 2v6M3 11h18"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
}
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`
const events = [
  { name: '실리카겔', sub: 'Syn. THE. Size.', type: '국내', date: '2026.11.28', venue: '서울 · 올림픽홀', style: 'gel', art: 'SILICA<br>GEL', open: '10.23 금 20:00' },
  { name: 'ONE OK ROCK', sub: 'Korea Tour 2026', type: '내한', date: '2026.11.21', venue: '인천 · 인스파이어 아레나', style: 'rock', art: 'ONE<br>OK<br>ROCK', open: '10.24 토 12:00' },
  { name: 'wave to earth', sub: 'A room for us', type: '국내', date: '2026.12.05', venue: '서울 · 블루스퀘어', style: 'wave', art: 'wave<br><i>to earth</i>', open: '10.27 화 18:00' },
  { name: 'Autumn Sound', sub: 'Seoul music weekend', type: '페스티벌', date: '2026.11.07', venue: '서울 · 올림픽공원', style: 'festival', art: 'Autumn<br>Sound', open: '10.28 수 14:00' },
]
const notice = '<div class="notice"><span class="notice-dot"></span>디자인 미리보기 · 모든 공연·일정은 가상 샘플입니다.</div>'
const loginButton = `<button class="login-button" data-login>${icon('user')}로그인</button>`
const nav = '<nav aria-label="주요 메뉴"><a href="#concerts">공연 둘러보기</a><button data-login>찜한 아티스트</button><button data-login>내 예매 일정</button></nav>'
const search = `<form class="search" role="search">${icon('search')}<input aria-label="아티스트 또는 공연 검색" placeholder="어떤 아티스트를 좋아하세요?"><button aria-label="검색">${icon('arrow')}</button></form>`
const filters = '<div class="filters" aria-label="공연 분류">'+['전체','내한','국내','페스티벌'].map((name,i)=>`<button data-filter="${name}" aria-pressed="${i===0}">${name}</button>`).join('')+'</div>'
function artwork(event) { return `<div class="artwork ${event.style}" aria-hidden="true"><span class="art-top">encore. live selection</span><div class="art-shape"></div><strong>${event.art}</strong><span class="art-bottom">${event.date} <span>In Korea</span></span></div>` }
function cards() { return `<div class="cards">${events.map((e,i)=>`<article class="event" data-type="${e.type}" data-name="${e.name.toLowerCase()} ${e.sub.toLowerCase()}"><button class="art-link" data-event="${i}" aria-label="${e.name} 공연 상세 보기">${artwork(e)}</button><div class="event-info"><div class="event-label"><span class="badge">${e.type}</span><button class="heart" data-follow="${e.name}" aria-label="${e.name} 찜하기" aria-pressed="false">${icon('heart')}</button></div><button class="event-name" data-event="${i}">${e.name}</button><p>${e.sub}</p><div class="event-meta">${e.date}<br>${e.venue}</div></div></article>`).join('')}</div><p id="empty" hidden>검색 결과가 없습니다. 다른 아티스트 이름을 입력해 보세요.</p>` }
const footer = '<footer><span class="brand">encore.</span><p>다음 라이브에서 만나요.</p><span>디자인 시안 · 2026</span></footer>'
const heading = (title,sub='') => `<div class="section-heading"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>`:''}</div><a href="#concerts">공연 둘러보기 ${icon('arrow')}</a></div>`
const header = `<header class="site-header"><a href="#" class="brand" aria-label="encore 홈">encore<span>.</span></a>${nav}${loginButton}</header>`
let content = ''
if (mode === 'poster' || mode === 'combined') content = `${header}<main class="page">${notice}<section class="poster-hero"><div class="hero-copy"><div class="intro-line"><span class="little-cross">✳</span> 당신의 다음 라이브를 찾아서</div><h1>좋아하는 음악,<br>직접 만나는 순간.</h1><p>국내 밴드부터 기다리던 내한 공연까지.<br>플레이리스트 다음은, 라이브.</p>${search}<div class="popular">지금 많이 찾는 <button data-search="실리카겔">실리카겔</button><button data-search="ONE OK ROCK">ONE OK ROCK</button></div></div><div class="poster-installation" aria-label="라이브 공연을 표현한 그래픽 포스터"><div class="floating-ticket"><span>당신의 다음 라이브</span><strong>SEE<br>YOU<br>THERE<span>✳</span></strong><div>음악이 시작되는 곳에서 만나요.<br>encore. live in your city</div><div class="barcode"></div></div><div class="ticket-sticker">음악은<br>계속된다.</div><div class="ticket-shadow"></div></div></section><section id="concerts">${heading('다음 공연은 여기서', '마음이 가는 공연을 골라보세요.')}${filters}${cards()}</section><section class="join-banner"><div><h2>좋아하는 밴드가 있다면.</h2><p>로그인하고 나만의 공연 목록을 시작하세요.</p></div><button class="primary" data-login>로그인하고 찜하기 ${icon('arrow')}</button></section>${footer}</main>`
if (mode === 'night') content = `${header}<main class="page">${notice}<section class="night-hero"><div class="stage-art" aria-hidden="true"><div class="beam beam-one"></div><div class="beam beam-two"></div><div class="stage-rings"></div><span class="stage-type">LIVE<br>LOUD.</span><div class="stage-floor"></div></div><div class="night-copy"><span class="live-tag"><span></span>라이브가 필요한 밤</span><h1>오늘의 재생목록을<br>내일의 함성으로.</h1><p>같은 음악을 좋아하는 우리가 만나는 곳.<br>다음 라이브의 첫 장면을 찾아보세요.</p><a class="primary" href="#concerts">공연 둘러보기 ${icon('arrow')}</a></div><div class="hero-caption"><span>이어폰을 벗고, 무대 앞으로.</span><span>Seoul & beyond</span></div></section><section class="night-search">${search}<span>록 · J-pop · 인디 · 페스티벌</span></section><section id="concerts">${heading('곧, 이 무대에서', '당신의 취향을 더 크게 틀어보세요.')}${filters}${cards()}</section><section class="night-ticket"><div class="ticket-notch"></div><span class="ticket-symbol">✳</span><div><h2>당신의 취향에도, 맨 앞자리.</h2><p>좋아하는 아티스트를 찜하고 공연 소식을 모아보세요.</p></div><button class="primary" data-login>로그인 ${icon('arrow')}</button><div class="barcode"></div></section>${footer}</main>`
if (mode === 'personal') {
  const days = Array.from({length:35},(_,i)=> { const d=i-3; return d>0 && d<=31 ? `<span class="${[23,24,27,28].includes(d)?'has-event':''} ${d===20?'today':''}">${d}${[23,24,27,28].includes(d)?'<b></b>':''}</span>`:'<span></span>' }).join('')
  content = `${header}<main class="page">${notice}<div class="personal-layout"><div class="personal-main"><section class="personal-intro"><span class="date-label">2026년 10월 20일 화요일</span><h1>취향은 모으고,<br>라이브는 가까이.</h1><p>좋아하는 아티스트의 다음 무대를 찾아보세요.</p>${search}</section><section class="artist-section"><div class="section-heading"><h2>요즘, 이 아티스트</h2><span>먼저 찜해보세요</span></div><div class="artist-list">${events.slice(0,3).map(e=>`<button class="artist-item" data-follow="${e.name}" aria-label="${e.name} 찜하기" aria-pressed="false"><span class="avatar ${e.style}">${e.name==='실리카겔'?'SG':e.name==='ONE OK ROCK'?'OR':'we'}</span><strong>${e.name}</strong><span class="artist-add">+</span></button>`).join('')}</div></section><section id="concerts">${heading('새롭게 만날 공연')}${filters}${cards()}</section></div><aside class="personal-side"><section class="account-card"><div class="account-icon">${icon('heart')}</div><h2>나의 라이브 컬렉션</h2><p>찜한 아티스트와 저장한 일정을<br>한곳에서 이어서 보세요.</p><button class="primary" data-login>로그인하고 시작하기</button></section><section class="calendar"><div class="calendar-heading"><h2>10월 예매 캘린더</h2>${icon('calendar')}</div><div class="week">${['일','월','화','수','목','금','토'].map(d=>`<span>${d}</span>`).join('')}</div><div class="days">${days}</div><p><b></b> 예매 오픈일 · 가상 샘플</p></section><section class="upcoming"><h2>다가오는 티켓 오픈</h2>${events.slice(0,3).map((e,i)=>`<button data-event="${i}"><span class="open-date">${e.open.split(' ')[0]}</span><span><strong>${e.name}</strong><small>${e.open.split(' ').slice(1).join(' ')} 오픈</small></span>${icon('arrow')}</button>`).join('')}<p>일정 저장과 알림 수신은 별개예요.</p></section></aside></div>${footer}</main>`
}
if (mode === 'combined') {
  const artists = `<section class="artist-section"><div class="section-heading"><div><h2>요즘, 이 아티스트</h2><p>좋아하는 이름을 발견하면, 먼저 찜해두세요.</p></div><button class="artist-manage" data-login>내 아티스트 ${icon('arrow')}</button></div><div class="artist-list">${events.slice(0,3).map(event => `<button class="artist-item" data-follow="${event.name}" aria-label="${event.name} 찜하기" aria-pressed="false"><span class="avatar ${event.style}">${event.name === '실리카겔' ? 'SG' : event.name === 'ONE OK ROCK' ? 'OR' : 'we'}</span><span class="artist-text"><strong>${event.name}</strong><small>${event.type === '내한' ? '일본 · 얼터너티브 록' : event.style === 'gel' ? '한국 · 사이키델릭 록' : '한국 · 인디 팝'}</small></span><span class="artist-add">+</span></button>`).join('')}</div></section>`
  const days = Array.from({length:35}, (_,index) => {
    const day = index - 3
    if (day < 1 || day > 31) return '<span></span>'
    const event = events.find(item => Number(item.open.slice(3,5)) === day)
    if (event) return `<button data-day="${day}" aria-label="10월 ${day}일 ${event.name} 티켓 오픈" aria-pressed="false">${day}<b></b></button>`
    return `<span${day === 20 ? ' class="today" aria-current="date"' : ''}>${day}</span>`
  }).join('')
  const calendar = `<aside class="combined-calendar" aria-label="예매 일정"><details class="calendar-disclosure" open><summary><span>${icon('calendar')}10월 예매 캘린더</span><span class="calendar-expand">펼치기 +</span></summary><div class="calendar"><div class="calendar-month"><span>2026년 10월</span><span>오늘 20일</span></div><div class="week">${['일','월','화','수','목','금','토'].map(day => `<span>${day}</span>`).join('')}</div><div class="days">${days}</div><p><b></b> 티켓 오픈일 · 날짜를 눌러보세요</p></div></details><section class="upcoming"><div class="upcoming-heading"><h2 id="upcoming-title" aria-live="polite">다가오는 티켓 오픈</h2><button class="calendar-reset" hidden>전체 보기</button></div><div class="ticket-open-list">${events.map((event,index) => `<button data-event="${index}" data-open-day="${Number(event.open.slice(3,5))}"><span class="open-date">${event.open.slice(0,5)}</span><span><strong>${event.name}</strong><small>${event.open.slice(6)} 오픈</small></span>${icon('arrow')}</button>`).join('')}</div><p>가상 예매 일정입니다.<br>일정 저장만으로 알림이 켜지지 않아요.</p></section><div class="collection-invite"><h3>나만의 라이브 컬렉션</h3><p>찜한 아티스트와 저장한 일정을<br>다른 기기에서도 이어서 보세요.</p><button data-login>로그인하고 시작하기 ${icon('arrow')}</button></div></aside>`
  content = content.replace('<section id="concerts">', `<div class="combined-layout">${artists}${calendar}<section id="concerts">`)
    .replace('</section><section class="join-banner">', '</section></div><section class="join-banner">')
}
document.querySelector('#app').innerHTML = content
if (mode === 'combined') {
  const disclosure = document.querySelector('.calendar-disclosure')
  const narrow = matchMedia('(max-width: 760px)')
  const resizeCalendar = () => { disclosure.open = !narrow.matches }
  resizeCalendar()
  narrow.addEventListener('change', resizeCalendar)
  function selectDay(day) {
    document.querySelectorAll('[data-day]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.day === day)))
    document.querySelectorAll('[data-open-day]').forEach(button => { button.hidden = Boolean(day) && button.dataset.openDay !== day })
    document.querySelector('#upcoming-title').textContent = day ? `10월 ${day}일 티켓 오픈` : '다가오는 티켓 오픈'
    document.querySelector('.calendar-reset').hidden = !day
  }
  document.querySelectorAll('[data-day]').forEach(button => button.addEventListener('click', () => selectDay(button.dataset.day)))
  document.querySelector('.calendar-reset').addEventListener('click', () => selectDay(''))
}
document.querySelectorAll('[data-login]').forEach(button => button.addEventListener('click', () => document.querySelector('#login').showModal()))
document.querySelector('#demo-login').addEventListener('click', () => { document.querySelector('#login-status').textContent='로그인 화면 시안입니다. 실제 인증 메일은 발송하지 않습니다.' })
let toastTimer
function notify(message) {
  const toast = document.querySelector('#toast')
  toast.textContent = message
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800)
}
document.querySelectorAll('[data-follow]').forEach(button => button.addEventListener('click', () => {
  const active = button.getAttribute('aria-pressed') !== 'true'
  document.querySelectorAll('[data-follow]').forEach(item => {
    if (item.dataset.follow !== button.dataset.follow) return
    item.setAttribute('aria-pressed', String(active))
    item.setAttribute('aria-label', `${item.dataset.follow} ${active?'찜 해제':'찜하기'}`)
    const add = item.querySelector('.artist-add')
    if (add) add.textContent = active?'✓':'+'
  })
  notify(active?'시안에서 아티스트를 찜했어요.':'시안에서 찜을 해제했어요.')
}))
let filter='전체'
let query=''
function updateCards() {
  let visible=0
  document.querySelectorAll('.event').forEach(card => {
    card.hidden = (filter!=='전체' && card.dataset.type!==filter) || !card.dataset.name.includes(query)
    if (!card.hidden) visible++
  })
  document.querySelector('#empty').hidden=visible!==0
}
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  filter=button.dataset.filter
  document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed',String(item===button)))
  updateCards()
}))
document.querySelector('.search').addEventListener('submit', event => {
  event.preventDefault()
  query=event.currentTarget.querySelector('input').value.trim().toLowerCase()
  updateCards()
  document.querySelector('#concerts').scrollIntoView({behavior:'instant'})
})
document.querySelectorAll('[data-search]').forEach(button => button.addEventListener('click', () => {
  document.querySelector('.search input').value=button.dataset.search
  query=button.dataset.search.toLowerCase()
  updateCards()
  document.querySelector('#concerts').scrollIntoView({behavior:'instant'})
}))
const saved=new Set()
let selected=0
const saveButton=document.querySelector('#detail-save')
function updateSave() {
  saveButton.setAttribute('aria-pressed',String(saved.has(selected)))
  saveButton.textContent=saved.has(selected)?'저장한 일정 해제':'예매 일정 저장 체험'
}
document.querySelectorAll('[data-event]').forEach(button => button.addEventListener('click', () => {
  selected=Number(button.dataset.event)
  const event=events[selected]
  document.querySelector('#detail-title').textContent=event.name+' · '+event.sub
  document.querySelector('#detail-meta').textContent=event.date+' / '+event.venue
  updateSave()
  document.querySelector('#detail').showModal()
}))
saveButton.addEventListener('click', () => {
  if(saved.has(selected)) saved.delete(selected); else saved.add(selected)
  updateSave()
  notify(saved.has(selected)?'시안에서 일정을 저장했어요.':'시안에서 일정 저장을 해제했어요.')
})
