import { useRef, useState } from 'react'
import type { Band } from './data'

type Video = { id: string; title: string }
const music: Video[] = [
  { id: 'DIPxnt5vnhU', title: 'T + Tik Tak Tok (feat. So!YoON!)' },
  { id: 'JaIMSzE5yLA', title: 'NO PAIN' },
  { id: 'VB9cyPJCtok', title: 'APEX' },
]
const live: Video[] = [
  { id: 'qg40imnWXG8', title: 'NO PAIN · YES24 LIVE HALL' },
  { id: 'KaYT_O0CwLE', title: 'Syn. THE. Size. X · Live' },
  { id: '1VXjue62OrQ', title: 'APEX · EBS' },
  { id: 'P-5hvP1tALs', title: 'NO PAIN · EBS' },
]
function Thumbnail({ video }: { video: Video }) {
  const [failed, setFailed] = useState(false)
  return <div className="video-image">{!failed && <img src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt="" loading="lazy" onError={() => setFailed(true)} />}<span aria-hidden="true">▶</span></div>
}
function VideoShelf({ band, title, videos, term }: { band: Band; title: string; videos: Video[]; term: string }) {
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; scroll: number; moved: boolean } | null>(null)
  const [edges, setEdges] = useState({ first: true, last: videos.length <= 2 })
  const updateEdges = () => { const el = track.current; if (el) setEdges({ first: el.scrollLeft < 2, last: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 }) }
  const slide = (direction: number) => { const el = track.current; if (el) el.scrollBy({ left: direction * el.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }) }
  return <section className="artist-media"><div className="section-heading"><h2>{title}</h2><div className="media-controls"><a className="outline" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${band.name} ${term}`)}`} target="_blank" rel="noopener noreferrer">더보기 ↗</a><button aria-label={`${title} 이전 영상`} disabled={edges.first} onClick={() => slide(-1)}>‹</button><button aria-label={`${title} 다음 영상`} disabled={edges.last} onClick={() => slide(1)}>›</button></div></div>
    {videos.length ? <div className="video-track" ref={track} tabIndex={0} aria-label={`${title} 슬라이드`} onScroll={updateEdges} onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); slide(e.key === 'ArrowRight' ? 1 : -1) } }} onPointerDown={e => { if (e.pointerType !== 'mouse' || e.button !== 0) return; drag.current = { x: e.clientX, scroll: e.currentTarget.scrollLeft, moved: false } }} onPointerMove={e => { const state = drag.current; if (!state || !(e.buttons & 1)) return; const delta = e.clientX - state.x; if (Math.abs(delta) > 6) { state.moved = true; e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.scrollLeft = state.scroll - delta } }} onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId) }} onPointerCancel={() => { drag.current = null }} onClickCapture={e => { if (drag.current?.moved) { e.preventDefault(); e.stopPropagation() } drag.current = null }}>
      {videos.map(video => <a className="video-card" key={video.id} href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer" draggable={false} onDragStart={e => e.preventDefault()}><Thumbnail video={video} /><h3>{video.title}</h3><p>{band.name} · YouTube</p></a>)}
    </div> : <p className="media-empty">등록된 영상이 없습니다. 더보기에서 {band.name}의 영상을 찾아보세요.</p>}
  </section>
}
export function ArtistMedia({ band, preview }: { band: Band; preview: boolean }) {
  // Match an external identity, never a display name shared by different artists.
  const silica = band.musicbrainzId === '2c8b5bb2-6110-488d-bc15-abb08379d3c6' || (preview && band.id === 'silicagel')
  return <><VideoShelf key={`${band.id}:music`} band={band} title="동영상" videos={silica ? music : []} term="official music video" /><VideoShelf key={`${band.id}:live`} band={band} title="라이브 공연 영상" videos={silica ? live : []} term="live" /></>
}
