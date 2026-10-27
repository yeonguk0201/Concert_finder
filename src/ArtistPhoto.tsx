import { useEffect, useState } from 'react'

import type { ArtistPhotoData as Photo } from './artistPhotoTypes'
import type { YouTubePhoto } from './artistChannels'
import { validYouTubePhoto } from './artistChannels'
export function ArtistPhoto({ name, color = '#a8c0ab', representativePhoto, photoMode = 'auto', youtubePhoto }: { name: string; color?: string; representativePhoto?: Photo | null; photoMode?: 'auto' | 'manual' | 'hidden'; youtubePhoto?: YouTubePhoto | null }) {
  const [expired, setExpired] = useState('')
  const expiryKey = `${youtubePhoto?.url}:${youtubePhoto?.expiresAt}`
  const official = photoMode === 'auto' && expired !== expiryKey && validYouTubePhoto(youtubePhoto) ? youtubePhoto : null
  useEffect(() => {
    if (!youtubePhoto) return
    const expires = Date.parse(youtubePhoto.expiresAt)
    if (!Number.isFinite(expires)) return
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const remaining = expires - Date.now()
      if (remaining <= 0) { setExpired(expiryKey); return }
      timer = setTimeout(schedule, Math.min(remaining, 2147483647))
    }
    schedule()
    return () => clearTimeout(timer)
  }, [youtubePhoto, expiryKey])
  const [failedUrls, setFailedUrls] = useState<string[]>([])
  const fail = (url: string) => setFailedUrls(current => current.includes(url) ? current : [...current, url])
  const selectedPhoto = photoMode === 'hidden' ? null : representativePhoto ?? null
  const photo = selectedPhoto && !failedUrls.includes(selectedPhoto.url) ? selectedPhoto : null
  const visibleYouTube = official && !failedUrls.includes(official.url) ? official : null
  return <figure className={`artist-photo${visibleYouTube ? ' artist-photo-youtube' : ''}`}>
    {visibleYouTube ? <><img className="youtube-profile-image" src={visibleYouTube.url} alt={`${name} YouTube 채널 사진`} width={80} height={80} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => fail(visibleYouTube.url)} />
      <figcaption className="youtube-photo-source"><a href={visibleYouTube.channelUrl} target="_blank" rel="noopener noreferrer" aria-label={`${name} 사진 출처 · YouTube 채널`}>YouTube ↗</a></figcaption></> : <>
    {photo ? <img src={photo.url} alt={`${name} 프로필`} width={80} height={80} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => fail(photo.url)} /> : <span className="artist-photo-fallback" style={{ background: color }} aria-label={`${name} 이니셜`}>{Array.from(name).slice(0, 2).join('')}</span>}
    {photo && <figcaption><details><summary aria-label={`${name} 사진 출처`}>사진 출처</summary><div className="artist-photo-credits"><a href={photo.source} target="_blank" rel="noopener noreferrer">사진: {photo.author}</a>{photo.credit && <span>{photo.credit}</span>}<a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.license}</a><span>정사각형으로 잘라 표시</span></div></details></figcaption>}</>}
  </figure>
}
