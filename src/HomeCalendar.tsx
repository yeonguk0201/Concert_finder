import { useEffect, useRef, useState } from 'react'
import type { Band, Concert } from './data'
import { dayLabel, koreaDay, monthDays, shiftMonth } from './designDates'
import { imminentTickets } from './catalogViews'
import { Icon } from './UiIcon'

export function HomeCalendar({ concerts, bands, onOpen, onAccount }: {
  concerts: Concert[]; bands: Band[]; onOpen: (concert: Concert) => void; onAccount: () => void
}) {
  const [today] = useState(() => koreaDay(new Date().toISOString()))
  const [{ month, direction }, setView] = useState(() => ({ month: today.slice(0, 7), direction: 0 }))
  const [selected, setSelected] = useState('')
  const disclosure = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const media = matchMedia('(max-width:760px)')
    const update = () => { if (disclosure.current) disclosure.current.open = !media.matches }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const moveMonth = (direction: -1 | 1) => {
    setView(view => ({ month: shiftMonth(view.month, direction), direction }))
    setSelected('')
  }

  const ticketsByDay = new Map<string, Concert[]>()
  for (const concert of concerts) {
    if (concert.cancelled || concert.unavailable) continue
    const day = koreaDay(concert.ticketAt)
    if (!day) continue
    const tickets = ticketsByDay.get(day)
    if (tickets) tickets.push(concert)
    else ticketsByDay.set(day, [concert])
  }
  const tickets = selected
    ? (ticketsByDay.get(selected) ?? []).sort((a, b) => Date.parse(a.ticketAt) - Date.parse(b.ticketAt))
    : imminentTickets(concerts)

  return <aside className="combined-calendar" aria-label="예매 일정">
    <details className="calendar-disclosure" ref={disclosure} open>
      <summary><span><Icon name="calendar" />{Number(month.slice(5))}월 예매 캘린더</span><span className="calendar-expand">펼치기 +</span></summary>
      <div className="calendar">
        <div className="calendar-month">
          <span aria-live="polite">{month.slice(0, 4)}년 {Number(month.slice(5))}월</span>
          <div className="home-calendar-controls">
            {today.startsWith(month) && <span>오늘 {Number(today.slice(8))}일</span>}
            <button type="button" aria-label="이전 달" onClick={() => moveMonth(-1)}>‹</button>
            <button type="button" aria-label="다음 달" onClick={() => moveMonth(1)}>›</button>
          </div>
        </div>
        <div className="week" aria-hidden="true">{['일', '월', '화', '수', '목', '금', '토'].map(day => <span key={day}>{day}</span>)}</div>
        <div className="home-calendar-viewport">
          <div className="days" key={month} data-direction={direction}>{monthDays(month).map((day, index) => {
            if (!day) return <span key={index} />
            const hasTicket = ticketsByDay.has(day)
            return <button key={day} className={`${day === today ? 'today' : ''} ${hasTicket ? 'ticket-day' : 'plain-day'}`}
              aria-current={day === today ? 'date' : undefined}
              aria-label={`${day.slice(0, 4)}년 ${dayLabel(day)}${hasTicket ? ' 티켓 오픈' : ''}`}
              aria-pressed={day === selected} onClick={() => setSelected(day)}>
              {Number(day.slice(8))}{hasTicket && <b aria-hidden="true" />}
            </button>
          })}</div>
        </div>
        <p><b />티켓 오픈일 · 날짜를 눌러보세요</p>
      </div>
    </details>
    <section className="upcoming">
      <div className="upcoming-heading">
        <h2>{selected ? `${dayLabel(selected)} 티켓 오픈` : '다가오는 티켓 오픈'}</h2>
        {selected && <button className="calendar-reset" onClick={() => setSelected('')}>전체 보기</button>}
      </div>
      <div className="ticket-open-list">{tickets.slice(0, 4).map(concert => <button key={concert.id} onClick={() => onOpen(concert)}>
        <span className="open-date">{koreaDay(concert.ticketAt).slice(5).replace('-', '.')}</span>
        <span><strong>{bands.find(b => b.id === concert.bandIds[0])?.name ?? concert.title}</strong>
          <small>{new Date(concert.ticketAt).toLocaleDateString('ko-KR', { weekday: 'short', timeZone: 'Asia/Seoul' })} {new Date(concert.ticketAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Seoul' })} 오픈</small>
        </span><Icon name="arrow" />
      </button>)}</div>
      {!tickets.length && <p>확인된 티켓 오픈 일정이 없습니다.</p>}
      <p>티켓 오픈 시간을 확인해 보세요.<br />일정 저장만으로 알림이 켜지지 않아요.</p>
    </section>
    <div className="collection-invite">
      <h3>나만의 라이브 컬렉션</h3>
      <p>찜한 아티스트와 저장한 일정을<br />다른 기기에서도 이어서 보세요.</p>
      <button onClick={onAccount}>로그인하고 시작하기 <Icon name="arrow" /></button>
    </div>
  </aside>
}
