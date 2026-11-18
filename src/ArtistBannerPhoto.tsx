import { useState } from 'react'
import type { ArtistProfilePreview } from './artistProfilePreview'

export function ArtistBannerPhoto({ photo, name }: { photo: NonNullable<ArtistProfilePreview['banner']>; name: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null

  const illustration = photo.illustration
  return <figure className="artist-banner-photo">
    <img src={photo.url}
      srcSet={illustration && `${illustration.thumbnailUrl} 407w, ${photo.url} ${illustration.width}w`}
      sizes={illustration && '(max-width: 760px) 100vw, 56vw'}
      alt={illustration ? `${name} 공식 일러스트` : name} decoding="async" onError={() => setFailed(true)} />
    <figcaption>
      <a href={photo.source} target="_blank" rel="noopener noreferrer">{photo.author}</a>
      {photo.licenseUrl ? <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.license}</a> : <span>{photo.license}</span>}
      <span>일부를 잘라 표시</span>
    </figcaption>
  </figure>
}
