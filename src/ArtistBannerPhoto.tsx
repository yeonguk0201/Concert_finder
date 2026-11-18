import { useState } from 'react'
import type { ArtistProfilePreview } from './artistProfilePreview'

export function ArtistBannerPhoto({ photo, name }: { photo: NonNullable<ArtistProfilePreview['banner']>; name: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null

  const logo = photo.kind === 'logo'
  return <figure className={logo ? 'artist-banner-photo artist-banner-logo' : 'artist-banner-photo'}>
    <img src={photo.url} alt={logo ? `${name} 공식 로고` : name} decoding="async" onError={() => setFailed(true)} />
    <figcaption>
      <a href={photo.source} target="_blank" rel="noopener noreferrer">{photo.author}</a>
      {photo.licenseUrl ? <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.license}</a> : <span>{photo.license}</span>}
      {!logo && <span>일부를 잘라 표시</span>}
    </figcaption>
  </figure>
}
