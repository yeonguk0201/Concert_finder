import { useState } from 'react'
import type { Concert } from './data'

export function Poster({ concert }: { concert: Concert }) {
  const url = concert.artwork?.display_approved ? concert.artwork.url : null
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (url && url !== failedUrl) return <div className="poster poster-image"><img src={url} alt={`${concert.title} 공식 포스터`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} /></div>
  return <div className={`poster poster-layout ${concert.palette}${concert.headline.length > 24 ? ' poster-long' : ''}`} aria-hidden="true"><span className="poster-top">{concert.type} · {concert.city}</span><div className="poster-orbit" /><strong>{concert.headline}</strong><span className="poster-bottom">{concert.date ? concert.date.slice(0, 10).replaceAll('-', '.') : '일정 미정'}<span>타이포 썸네일</span></span></div>
}
