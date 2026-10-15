import type { ArtistOfficialProfile } from './artistChannels'
import { channelUrl, websiteUrl } from './artistChannels'

export function ArtistOfficialLinks({ name, profile }: { name: string; profile?: ArtistOfficialProfile }) {
  if (!profile) return null
  return <nav className="artist-official-links" aria-label={`${name} 공식 링크`}>
    {profile.websiteUrl && websiteUrl(profile.websiteUrl) && <a href={profile.websiteUrl} target="_blank" rel="noopener noreferrer">공식 사이트 ↗</a>}
    {channelUrl(profile.channelUrl) && <a href={profile.channelUrl} target="_blank" rel="noopener noreferrer">YouTube 채널 ↗</a>}
  </nav>
}
