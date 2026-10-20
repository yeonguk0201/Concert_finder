import type { Band } from './data'
import { ArtistPhoto } from './ArtistPhoto'

/** Photo credits remain separate links rather than nesting them inside a button. */
export function ArtistIdentity({ band, onOpen }: { band: Band; onOpen: () => void }) {
  return <div className="service-artist-identity">
    <div className="identity-photo"><ArtistPhoto name={band.name} bandId={band.id} color={band.color} representativePhoto={band.representativePhoto} photoMode={band.photoMode} youtubePhoto={band.officialProfile?.photo} />
      <button className="identity-photo-target" onClick={onOpen} aria-label={`${band.name} 아티스트 상세`} />
    </div>
    <div className="identity-info"><h2><button className="identity-name" onClick={onOpen}>{band.name}</button></h2><span>{band.country} · {band.genre}</span></div>
  </div>
}
