import { useState } from 'react'
import type { Band, Concert } from './data'
import { concertArtworkStyle } from './approvedStyle'

export function ApprovedArtwork({ concert, bands }: { concert: Concert; bands: Band[] }) {
  const image = concert.artwork?.display_approved ? concert.artwork.url : null
  const [failed, setFailed] = useState<string | null>(null)
  const band = bands.find(b => b.id === concert.bandIds[0])
  const style = concertArtworkStyle(concert.id)
  let headline = concert.headline
  if (band?.id === 'silicagel' || band?.musicbrainzId === '2c8b5bb2-6110-488d-bc15-abb08379d3c6') headline = 'SILICA\nGEL'
  if (band?.name === 'ONE OK ROCK') headline = 'ONE\nOK\nROCK'
  return <div className={`artwork ${style}${image && image !== failed ? ' approved-poster-image' : ''}${headline.length > 30 ? ' long-artwork' : ''}`}>
    {image && image !== failed ? <img src={image} alt={`${concert.title} 공식 포스터`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(image)} /> : <><span className="art-top">encore. live selection</span><div className="art-shape" /><strong>{headline.split('\n').map((line, index) => <span key={index}>{index > 0 && <br />}{line}</span>)}</strong><span className="art-bottom">{concert.date ? concert.date.slice(0, 10).replaceAll('-', '.') : '일정 미정'}<span>In Korea</span></span></>}
  </div>
}
