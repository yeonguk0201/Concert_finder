import { useState } from 'react'
import type { Band } from './data'
import { ArtistBannerPhoto } from './ArtistBannerPhoto'
import { ArtistProfileMedia } from './ArtistProfileMedia'
import { artistProfilePreviews } from './artistProfilePreview'
import './ArtistProfilePilot.css'

const artists: Band[] = [
  { id: 'changsub', name: '이창섭', aliases: ['LEE CHANGSUB'], initials: 'CS', color: '#1d367d', country: '대한민국', genre: '보컬', musicbrainzId: '4561aee5-6cf6-41a6-9b7b-f7be15a00a65' },
  { id: 'silicagel', name: '실리카겔', aliases: ['Silica Gel'], initials: 'SG', color: '#553d31', country: '대한민국', genre: '록', musicbrainzId: '2c8b5bb2-6110-488d-bc15-abb08379d3c6' },
  { id: 'ado', name: 'Ado', initials: 'Ad', color: '#0d2850', country: '일본', genre: '팝', musicbrainzId: 'e134b52f-2e9e-4734-9bc3-bea9648d1fa1' },
  { id: 'mcr', name: 'My Chemical Romance', initials: 'MCR', color: '#252343', country: '미국', genre: '록', musicbrainzId: 'c07f0676-9143-4217-8a9f-4c26bd636f13' },
]

export default function ArtistProfilePilot() {
  const slug = new URLSearchParams(location.search).get('artistProfilePreview')
  const band = artists.find(artist => artist.id === slug) ?? artists[0]
  const profile = artistProfilePreviews[band.id]!
  const [followed, setFollowed] = useState(false)
  return <div className="combined artist-screen">
    <header className="site-header"><a className="brand" href="/">encore<span>.</span></a><nav aria-label="아티스트 시안">{artists.map(artist => <a key={artist.id} href={`?artistProfilePreview=${artist.id}`} aria-current={band.id === artist.id ? 'page' : undefined}>{artist.name}</a>)}</nav></header>
    <main className="artist-flow-page">
      <section className="artist-banner" data-theme={profile.theme}>
        <div className="notice"><span className="notice-dot" />디자인 미리보기 · 운영 데이터와 분리된 시안입니다.</div>
        <ArtistBannerPhoto key={band.id} photo={profile.banner} name={band.name} initials={band.initials} />
        <div className="artist-banner-copy"><h1>{band.name}</h1><p>{band.aliases?.[0] ?? band.name}</p><strong className="artist-live-summary">아직 확인된 예정 공연이 없어요.</strong><button className="follow-control" aria-pressed={followed} onClick={() => setFollowed(!followed)}>{followed ? '♥ 찜한 아티스트' : '♡ 찜하기'}</button></div>
      </section>
      <section className="artist-about"><div><h2>아티스트 소개</h2><p className="artist-bio expanded">{profile.bio}</p><a className="artist-bio-source" href={profile.wikipedia} target="_blank" rel="noopener noreferrer">위키백과 원문 ({profile.language})</a><a className="artist-bio-source" href={`${profile.wikipedia}?action=history`} target="_blank" rel="noopener noreferrer">저작자·기여 이력</a><a className="artist-bio-source" href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0 · 한국어 요약·수정</a></div><div className="artist-profile-note"><span>다음 라이브</span><strong>공연 소식 준비 중</strong><span>확인된 예정 공연이 없습니다.</span></div></section>
      <section className="artist-concerts"><div className="section-heading"><h2>예정된 공연 <span>0</span></h2></div><p>확인된 예정 공연이 없습니다.</p></section>
      <ArtistProfileMedia key={band.id} band={band} profile={profile} />
      <section className="related-artists"><div className="section-heading"><h2>함께 발견할 아티스트</h2></div><nav className="related-artist-list">{artists.filter(artist => artist.id !== band.id).map(artist => <a key={artist.id} href={`?artistProfilePreview=${artist.id}`}>{artist.name}</a>)}</nav></section>
      <footer><span className="brand">encore.</span><p>다음 라이브에서 만나요.</p></footer>
    </main>
  </div>
}
