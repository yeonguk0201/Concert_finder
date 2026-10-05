export type Band = { id: string; name: string; country: string; genre: string; color: string; initials: string }
export type Concert = { id: string; title: string; bandIds: string[]; type: '내한' | '국내' | '페스티벌'; date: string; venue: string; city: string; announcedAt: string; ticketAt: string; price: string; palette: string; headline: string; description: string }

// Fictional preview data: these are not verified concert announcements.
export const bands: Band[] = [
  { id: 'oasis', name: 'Oasis', country: '영국', genre: '브릿팝', color: '#cde99c', initials: 'oa' },
  { id: 'oneokrock', name: 'ONE OK ROCK', country: '일본', genre: '얼터너티브 록', color: '#ff926e', initials: 'OR' },
  { id: 'silicagel', name: '실리카겔', country: '한국', genre: '사이키델릭 록', color: '#a8abfa', initials: 'SG' },
  { id: 'hyukoh', name: '혁오', country: '한국', genre: '인디 록', color: '#e7bc79', initials: 'hy' },
  { id: 'nothing', name: 'Nothing But Thieves', country: '영국', genre: '얼터너티브 록', color: '#94cadd', initials: 'NB' },
  { id: 'wave', name: 'wave to earth', country: '한국', genre: '인디 팝', color: '#b6d0bd', initials: 'we' },
]
export const concerts: Concert[] = [
  { id: 'oasis-seoul', title: 'Oasis · Live in Seoul', bandIds: ['oasis'], type: '내한', date: '2026-12-12T19:00:00+09:00', venue: '고양종합운동장', city: '고양', announcedAt: '2026-10-06', ticketAt: '2026-10-15T12:00:00+09:00', price: '132,000원부터', palette: 'lime', headline: 'OASIS', description: '두 손을 높이 들고, 함께 부를 시간. 브릿팝 사운드로 채워질 겨울밤을 상상해보세요.' },
  { id: 'oneokrock-seoul', title: 'ONE OK ROCK · Korea Tour', bandIds: ['oneokrock'], type: '내한', date: '2026-11-21T18:00:00+09:00', venue: '인스파이어 아레나', city: '인천', announcedAt: '2026-10-05', ticketAt: '2026-10-12T20:00:00+09:00', price: '121,000원부터', palette: 'coral', headline: 'ONE\nOK\nROCK', description: '폭발적인 에너지와 떼창으로 가득한 무대. ONE OK ROCK의 라이브를 만나보세요.' },
  { id: 'nothing-seoul', title: 'Nothing But Thieves · Seoul', bandIds: ['nothing'], type: '내한', date: '2026-11-28T19:00:00+09:00', venue: 'YES24 라이브홀', city: '서울', announcedAt: '2026-10-04', ticketAt: '2026-10-09T18:00:00+09:00', price: '99,000원', palette: 'blue', headline: 'NOTHING\nBUT\nTHIEVES', description: '선명한 보컬과 묵직한 기타 리프. 가까운 거리에서 만나는 얼터너티브 록의 밤.' },
  { id: 'silicagel-seoul', title: '실리카겔 · 새로운 세계', bandIds: ['silicagel'], type: '국내', date: '2026-11-14T18:00:00+09:00', venue: '올림픽홀', city: '서울', announcedAt: '2026-10-03', ticketAt: '2026-10-08T20:00:00+09:00', price: '110,000원', palette: 'violet', headline: 'SILICA\nGEL', description: '경계를 넘나드는 사운드, 낯설고 아름다운 세계. 실리카겔의 단독 공연입니다.' },
  { id: 'autumn-fest', title: 'Autumn Frequencies 2026', bandIds: ['hyukoh', 'wave', 'silicagel'], type: '페스티벌', date: '2026-10-31T13:00:00+09:00', venue: '난지한강공원', city: '서울', announcedAt: '2026-10-02', ticketAt: '2026-10-07T12:00:00+09:00', price: '1일권 88,000원', palette: 'sand', headline: 'AUTUMN\nFREQUENCIES', description: '선선한 바람, 잔디, 그리고 좋아하는 밴드들. 혁오 · wave to earth · 실리카겔과 함께하는 가상의 가을 페스티벌.' },
  { id: 'wave-busan', title: 'wave to earth · Busan', bandIds: ['wave'], type: '국내', date: '2026-12-05T18:00:00+09:00', venue: '부산 드림씨어터', city: '부산', announcedAt: '2026-10-01', ticketAt: '2026-10-16T19:00:00+09:00', price: '88,000원', palette: 'sage', headline: 'wave\nto earth', description: '파도처럼 잔잔하게 번지는 멜로디. 부산에서 만나는 wave to earth의 라이브.' },
]
