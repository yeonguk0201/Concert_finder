import { useState } from 'react'
import type { Concert } from './data'
import { dayLabel, koreaDay, monthDays, performsOn, shiftMonth } from './designDates'

export function TicketCalendar({ schedules, concerts, selected, onSelect }: {
  schedules: Concert[]; concerts: Concert[]; selected: string; onSelect: (day: string) => void
}) {
  const [today] = useState(() => koreaDay(new Date().toISOString()))
  const [month, setMonth] = useState(() => (selected || today).slice(0, 7))
  return <section className="calendar saved-calendar" aria-label="예매 캘린더">
    <div className="calendar-heading"><h2>{month.slice(0, 4)}년 {Number(month.slice(5))}월</h2><div>
      <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="이전 달">‹</button>
      <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="다음 달">›</button>
    </div></div>
    <div className="week" aria-hidden="true">{['일', '월', '화', '수', '목', '금', '토'].map(day => <span key={day}>{day}</span>)}</div>
    <div className="days">{monthDays(month).map((day, index) => {
      if (!day) return <span key={`blank-${index}`} />
      const saved = schedules.some(concert => koreaDay(concert.ticketAt) === day && !concert.cancelled && !concert.unavailable)
      const live = concerts.some(concert => performsOn(concert, day))
      return <button key={day} className={`${saved ? 'has-saved' : ''} ${live ? 'has-concert' : ''}`} aria-label={`${day.slice(0, 4)}년 ${dayLabel(day)}${saved ? ' 예매 일정 있음' : ''}${live ? ' 공연 있음' : ''}`} aria-pressed={selected === day} aria-current={day === today ? 'date' : undefined} onClick={() => onSelect(day)}>
        {Number(day.slice(8))}{(saved || live) && <b aria-hidden="true" />}
      </button>
    })}</div>
    <div className="calendar-legend"><span><b />저장한 티켓 오픈</span><span><b />공연 있는 날</span></div>
    <p className="calendar-help">날짜를 누르면 옆에서 일정을 볼 수 있어요.</p>
  </section>
}
