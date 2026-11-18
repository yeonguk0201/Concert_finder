import { useState } from 'react'
import type { ArtistProfilePreview } from './artistProfilePreview'

export function ArtistBannerPhoto({ photo, name }: { photo: NonNullable<ArtistProfilePreview['banner']>; name: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null

  return <figure className="artist-banner-photo">
    <img src={photo.url} alt={name} decoding="async" onError={() => setFailed(true)} />
    <figcaption>
      <a href={photo.source} target="_blank" rel="noopener noreferrer">{photo.author}</a>
      <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.license}</a>
      <span>일부를 잘라 표시</span>
    </figcaption>
  </figure>
}
