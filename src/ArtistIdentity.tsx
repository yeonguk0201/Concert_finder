import type { Band } from './data'
import { ArtistPhoto } from './ArtistPhoto'
import { artistStyle } from './approvedStyle'
import { Icon } from './UiIcon'

/** Photo credits remain separate links rather than nesting them inside a button. */
export function ArtistAvatar({ band }: { band: Band }) {
  return <div className={`approved-avatar ${artistStyle(band)}`}><ArtistPhoto name={band.name} initials={band.initials} bandId={band.id} color="transparent" representativePhoto={band.representativePhoto} photoMode={band.photoMode} youtubePhoto={band.officialProfile?.photo} /></div>
}
export function ArtistIdentity({ band, onOpen, variant = 'detail' }: { band: Band; onOpen: () => void; variant?: 'home' | 'result' | 'detail' }) {
  return <div className={`approved-identity ${variant === 'home' ? 'home-artist-profile' : variant === 'result' ? 'artist-identity' : 'detail-artist-profile'}`}>
    <div className="profile-picture-target"><ArtistAvatar band={band} /><button className="photo-hit-target" aria-label={`${band.name} 아티스트 상세`} onClick={onOpen} /></div>
    <button className={variant === 'home' ? 'artist-text profile-name' : 'profile-name'} onClick={onOpen}><strong>{band.name}</strong>{variant === 'result' && <span className="artist-open-caption">아티스트 보기 <Icon name="arrow" /></span>}</button>
  </div>
}
