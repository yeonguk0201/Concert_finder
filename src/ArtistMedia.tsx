import { useEffect, useRef, useState } from 'react'
import type { Band } from './data'
import { artistStyle } from './approvedStyle'

type Video = { id: string; title: string }
const music: Video[] = [
  { id: 'DIPxnt5vnhU', title: 'T + Tik Tak Tok (feat. So!YoON!)' },
  { id: 'JaIMSzE5yLA', title: 'NO PAIN' },
  { id: 'VB9cyPJCtok', title: 'APEX' },
  { id: 'IWYft_hOIgo', title: 'Desert Eagle · Performance Video' },
]
const live: Video[] = [
  { id: 'qg40imnWXG8', title: 'NO PAIN · YES24 LIVE HALL' },
  { id: 'KaYT_O0CwLE', title: 'Syn. THE. Size. X · Live' },
  { id: '1VXjue62OrQ', title: 'APEX · EBS' },
  { id: 'P-5hvP1tALs', title: 'NO PAIN · EBS' },
]
function Thumbnail({ video, band, live }: { video: Video; band: Band; live: boolean }) {
  const [failed, setFailed] = useState(false)
  return <div className={`video-thumb ${artistStyle(band)}`}><span className="video-graphic" aria-hidden="true">{band.initials}</span>{!failed && <img className="youtube-thumbnail" src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`} alt={`${video.title} YouTube 썸네일`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}<span className="video-play" aria-hidden="true">▶</span><span className="video-label">{live ? 'Live' : 'Music video'}</span>{failed && <span className="thumbnail-fallback">썸네일을 불러오지 못했어요</span>}</div>
}
function VideoShelf({ band, title, videos, term }: { band: Band; title: string; videos: Video[]; term: string }) {
  const track = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ first: true, last: videos.length <= 2 })
  const moveTo = (index: number) => {
    const el = track.current
    if (!el) return
    const pitch = el.children.length > 1 ? (el.children[1] as HTMLElement).offsetLeft - (el.children[0] as HTMLElement).offsetLeft : el.clientWidth
    el.scrollTo({ left: Math.max(0, Math.min(el.children.length - 2, index)) * pitch, behavior: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  const slide = (direction: number) => {
    const el = track.current
    if (!el) return
    const pitch = el.children.length > 1 ? (el.children[1] as HTMLElement).offsetLeft - (el.children[0] as HTMLElement).offsetLeft : el.clientWidth
    moveTo(Math.round(el.scrollLeft / pitch) + direction * 2)
  }
  useEffect(() => {
    const el = track.current
    if (!el) return
    const update = () => setEdges({ first: el.scrollLeft < 2, last: el.scrollWidth - el.clientWidth - el.scrollLeft < 2 })
    const pitch = () => el.children.length > 1 ? (el.children[1] as HTMLElement).offsetLeft - (el.children[0] as HTMLElement).offsetLeft : el.clientWidth
    const move = (index: number) => el.scrollTo({ left: Math.max(0,Math.min(el.children.length - 2,index)) * pitch(), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    let pointer: { id: number; x: number; y: number; left: number; dragging: boolean } | null = null
    let suppressUntil = 0
    const down = (event: PointerEvent) => { if (event.pointerType !== 'touch' && event.button === 0) pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, left: el.scrollLeft, dragging: false } }
    const drag = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId) return
      const dx = event.clientX - pointer.x
      if (!pointer.dragging && Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(event.clientY - pointer.y)) { pointer.dragging = true; el.setPointerCapture(event.pointerId); el.classList.add('is-dragging'); el.style.scrollSnapType = 'none' }
      if (pointer.dragging) { event.preventDefault(); el.scrollLeft = pointer.left - dx }
    }
    const release = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id) return
      const finished = pointer
      pointer = null
      if (finished.dragging) { suppressUntil = Date.now() + 450; el.classList.remove('is-dragging'); el.style.scrollSnapType = ''; const distance = event.type === 'pointercancel' ? 0 : event.clientX - finished.x; move(Math.round(finished.left / pitch()) + (Math.abs(distance) > 35 ? distance < 0 ? 2 : -2 : 0)) }
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId)
    }
    const click = (event: MouseEvent) => { if (Date.now() < suppressUntil) { event.preventDefault(); event.stopPropagation() } }
    const key = (event: KeyboardEvent) => { if (event.target === el && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); move(event.key === 'Home' ? 0 : event.key === 'End' ? el.children.length : Math.round(el.scrollLeft / pitch()) + (event.key === 'ArrowRight' ? 2 : -2)) } }
    el.addEventListener('scroll', update, { passive: true }); el.addEventListener('pointerdown', down); el.addEventListener('pointermove', drag); el.addEventListener('pointerup', release); el.addEventListener('pointercancel', release); el.addEventListener('click', click, true); el.addEventListener('keydown', key)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(el); update()
    return () => { observer?.disconnect(); el.removeEventListener('scroll',update); el.removeEventListener('pointerdown',down); el.removeEventListener('pointermove',drag); el.removeEventListener('pointerup',release); el.removeEventListener('pointercancel',release); el.removeEventListener('click',click,true); el.removeEventListener('keydown',key) }
  }, [videos.length])
  return <section className="artist-media" aria-label={title}><div className="section-heading"><h2>{title}</h2><div className="media-controls"><a className="media-more" aria-label={`${band.name} ${title} 더보기, YouTube 새 탭`} href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${band.name} ${term}`)}`} target="_blank" rel="noopener noreferrer">더보기</a><button aria-label={`${title} 이전 영상 2개`} disabled={edges.first} onClick={() => slide(-1)}>‹</button><button aria-label={`${title} 다음 영상 2개`} disabled={edges.last} onClick={() => slide(1)}>›</button></div></div>
    {videos.length ? <div className="artist-video-grid media-track" ref={track} role="group" tabIndex={0} aria-label={`${title} 슬라이드`}>
      {videos.map(video => <a className="artist-video" key={video.id} href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer" draggable={false} onDragStart={e => e.preventDefault()}><Thumbnail video={video} band={band} live={title === '라이브 공연 영상'} /><h3>{video.title}</h3><p>{band.name} · YouTube</p></a>)}
    </div> : <div className="video-awaiting">공식 영상은 확인 후 이곳에 모을게요.</div>}
  </section>
}
export function ArtistMedia({ band, preview }: { band: Band; preview: boolean }) {
  // Match an external identity, never a display name shared by different artists.
  const silica = band.musicbrainzId === '2c8b5bb2-6110-488d-bc15-abb08379d3c6' || (preview && band.id === 'silicagel')
  return <><VideoShelf key={`${band.id}:music`} band={band} title="동영상" videos={silica ? music : []} term="official music video" /><VideoShelf key={`${band.id}:live`} band={band} title="라이브 공연 영상" videos={silica ? live : []} term="live" /></>
}
