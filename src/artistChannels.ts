export type YouTubePhoto = { url: string; channelUrl: string; checkedAt: string; expiresAt: string }
export type ArtistOfficialProfile = { websiteUrl: string | null; channelUrl: string; photo: YouTubePhoto | null }
export type OfficialProfileRow = { band_id: string; website_url: string | null; channel_url: string; photo: YouTubePhoto | null }
export type ChannelEvidence = { kind: 'official_artist_page' | 'musicbrainz_relation'; url: string; linkedChannelUrl: string; identityMatched: boolean; checkedAt: string }
export type ManagedChannel = { band_id: string; musicbrainz_id: string; website_url: string | null; channel_url: string; verification: 'candidate' | 'verified' | 'needs_review'; evidence: ChannelEvidence[]; locked: boolean; previous_channel_id: string | null; updated_at: string; last_status: string; last_reason: string; last_attempt_at: string | null }
export type ChannelHistory = { id: string; changed_at: string; actor_id: string | null; before_record: Partial<ManagedChannel> | null; after_record: ManagedChannel }

export function channelUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash
      && ['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)
      && /^\/(?:channel\/UC[A-Za-z0-9_-]{22}|@[^/?#\s]{1,100}|user\/[A-Za-z0-9._-]{1,100})\/?$/u.test(url.pathname)
  } catch { return false }
}
export function websiteUrl(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && /\.[a-z]{2,}$/i.test(url.hostname) } catch { return false }
}
export function validYouTubePhoto(photo: YouTubePhoto | null | undefined, now = Date.now()): photo is YouTubePhoto {
  if (!photo || !channelUrl(photo.channelUrl)) return false
  const checked = Date.parse(photo.checkedAt), expires = Date.parse(photo.expiresAt)
  return /^https:\/\/(?:[a-z0-9_-]+\.)*(?:ggpht\.com|googleusercontent\.com|ytimg\.com)\/\S+$/i.test(photo.url)
    && Number.isFinite(checked) && checked <= now && expires > now && expires <= checked + 30 * 86400000
}
