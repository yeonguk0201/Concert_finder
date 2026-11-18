import { useState } from 'react'
import type { ArtistProfilePreview } from './artistProfilePreview'

export function ArtistBannerPhoto({ photo, name, initials }: { photo?: ArtistProfilePreview['banner']; name: string; initials: string }) {
  const [failed, setFailed] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)
  const illustration = photo?.illustration
  const logo = logoFailed ? undefined : photo?.logo
  if (!photo || (failed && !logo)) return <figure className="artist-banner-photo artist-banner-initials"><span aria-label={`${name} 이니셜 배너`}>{initials}</span><figcaption>{photo ? '이미지를 불러오지 못해 이니셜로 표시' : '이미지 사용 근거 확인 전 · 이니셜 배너'}</figcaption></figure>

  return <figure className="artist-banner-photo">
    {!failed && <img className="artist-banner-image" src={photo.url}
      srcSet={illustration && `${illustration.thumbnailUrl} 407w, ${photo.url} ${illustration.width}w`}
      sizes={illustration && '(max-width: 760px) 100vw, 56vw'}
      alt={logo ? '' : illustration ? `${name} 공식 일러스트` : name} decoding="async" onError={() => setFailed(true)} />}
    {logo && <img className="artist-banner-mark" src={logo.url} alt={`${name} 2019 로고`} decoding="async" onError={() => setLogoFailed(true)} />}
    <figcaption>
      {logo && <a href={logo.source} target="_blank" rel="noopener noreferrer">로고 출처</a>}
      {!failed && <>
        <a href={photo.source} target="_blank" rel="noopener noreferrer">{photo.author}</a>
        {photo.licenseUrl ? <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.license}</a> : <span>{photo.license}</span>}
        <span>일부를 잘라 표시</span>
      </>}
    </figcaption>
  </figure>
}
