export type ArtistVideo = { id: string; title: string; publisher?: string; channelId?: string; checkedAt?: string; officialityBasis?: string; evidenceUrls?: string[] }

type Banner = {
  url: string
  source: string
  author: string
  license: string
  licenseUrl?: string
  illustration?: { thumbnailUrl: string; width: number }
  logo?: { url: string; source: string }
}

export type ArtistProfilePreview = {
  bio: string
  identity: { bandId: string; musicBrainzId: string; wikidata: string }
  bioSource: { revision: number; revisionUrl: string; authorsUrl: string; licenseUrl: string; checkedAt: string; modification: string }
  wikipedia: string
  language: string
  theme: 'cobalt' | 'walnut' | 'blue-rose' | 'stage-violet'
  banner?: Banner
  channel: string
  music: ArtistVideo[]
  live: ArtistVideo[]
}

// Editorial profiles shared by the catalog and the isolated design preview.
export const artistProfilePreviews: Partial<Record<string, ArtistProfilePreview>> = {
  changsub: {
    identity: {"bandId": "dcb90080-9164-478b-a728-b0f0172e2db0", "musicBrainzId": "4561aee5-6cf6-41a6-9b7b-f7be15a00a65", "wikidata": "https://www.wikidata.org/wiki/Q16183546"},
    bioSource: {"revision": 42752542, "authorsUrl": "https://ko.wikipedia.org/wiki/%EC%9D%B4%EC%B0%BD%EC%84%AD_(%EA%B0%80%EC%88%98)?action=history", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/", "checkedAt": "2026-11-18T14:10:05.859602+00:00", "revisionUrl": "https://ko.wikipedia.org/wiki/%EC%9D%B4%EC%B0%BD%EC%84%AD_(%EA%B0%80%EC%88%98)?oldid=42752542", "modification": "한국어 요약·수정"},
    bio: "이창섭은 대한민국의 가수로, 보이 그룹 비투비(BTOB)에서 리드보컬을 맡고 있다.",
    wikipedia: "https://ko.wikipedia.org/wiki/%EC%9D%B4%EC%B0%BD%EC%84%AD_(%EA%B0%80%EC%88%98)",
    language: '한국어',
    theme: 'cobalt',
    banner: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/0/0c/170617_Lee_Chang-sub_%285%29.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:170617_Lee_Chang-sub_(5).jpg',
      author: 'leechapusopu',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    },
    channel: '',
    music: [],
    live: [],
  },
  silicagel: {
    identity: {"bandId": "143af425-ea27-4e44-832a-c3215196d7a5", "musicBrainzId": "2c8b5bb2-6110-488d-bc15-abb08379d3c6", "wikidata": "https://www.wikidata.org/wiki/Q122294833"},
    bioSource: {"revision": 42326891, "authorsUrl": "https://ko.wikipedia.org/wiki/%EC%8B%A4%EB%A6%AC%EC%B9%B4%EA%B2%94_(%EB%B0%B4%EB%93%9C)?action=history", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/", "checkedAt": "2026-11-18T14:10:05.859602+00:00", "revisionUrl": "https://ko.wikipedia.org/wiki/%EC%8B%A4%EB%A6%AC%EC%B9%B4%EA%B2%94_(%EB%B0%B4%EB%93%9C)?oldid=42326891", "modification": "한국어 요약·수정"},
    bio: "실리카겔은 2013년 서울예술대학교 학생들을 중심으로 결성된 인디 록 밴드다. 김건재, 김춘추, 김한주, 최웅희가 활동하며, 사이키델릭 록에 전자음악과 시각 연출을 결합한다.",
    wikipedia: "https://ko.wikipedia.org/wiki/%EC%8B%A4%EB%A6%AC%EC%B9%B4%EA%B2%94_(%EB%B0%B4%EB%93%9C)",
    language: '한국어',
    theme: 'walnut',
    banner: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/4/46/Silica_Gel_members_in_2022.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Silica_Gel_members_in_2022.jpg',
      author: 'SBS Radio (에라오)',
      license: 'CC BY 3.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    },
    channel: 'https://www.youtube.com/channel/UCXteMTpHAvyDP05G0QULuZA',
    music: [{"id": "JaIMSzE5yLA", "title": "실리카겔 (Silica Gel) - NO PAIN [M/V]", "publisher": "Silica Gel 실리카겔", "channelId": "UCXteMTpHAvyDP05G0QULuZA", "checkedAt": "2026-11-18T14:10:05.859602+00:00", "officialityBasis": "MB artist youtube relationship matches API uploader; channel description names all four band members.", "evidenceUrls": ["https://musicbrainz.org/artist/2c8b5bb2-6110-488d-bc15-abb08379d3c6", "https://www.wikidata.org/wiki/Q122294833"]}, {"id": "DIPxnt5vnhU", "title": "실리카겔 (Silica Gel) - T + Tik Tak Tok (feat. So!YoON!) [M/V]", "publisher": "Silica Gel 실리카겔", "channelId": "UCXteMTpHAvyDP05G0QULuZA", "checkedAt": "2026-11-18T14:10:05.859602+00:00", "officialityBasis": "MB artist youtube relationship matches API uploader; channel description names all four band members.", "evidenceUrls": ["https://musicbrainz.org/artist/2c8b5bb2-6110-488d-bc15-abb08379d3c6", "https://www.wikidata.org/wiki/Q122294833"]}],
    live: [{"id": "qg40imnWXG8", "title": "실리카겔 (Silica Gel) - NO PAIN [LIVE From YES24 LIVE HALL]", "publisher": "Silica Gel 실리카겔", "channelId": "UCXteMTpHAvyDP05G0QULuZA", "checkedAt": "2026-11-18T14:10:05.859602+00:00", "officialityBasis": "MB artist youtube relationship matches API uploader; channel description names all four band members.", "evidenceUrls": ["https://musicbrainz.org/artist/2c8b5bb2-6110-488d-bc15-abb08379d3c6", "https://www.wikidata.org/wiki/Q122294833"]}],
  },
  ado: {
    identity: {"bandId": "1bb57d2e-eef1-419e-82c7-fe7e4dac7a55", "musicBrainzId": "e134b52f-2e9e-4734-9bc3-bea9648d1fa1", "wikidata": "https://www.wikidata.org/wiki/Q104012678"},
    bioSource: {"revision": 42749273, "authorsUrl": "https://ko.wikipedia.org/wiki/Ado_(%EA%B0%80%EC%88%98)?action=history", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/", "checkedAt": "2026-11-18T14:10:05.859602+00:00", "revisionUrl": "https://ko.wikipedia.org/wiki/Ado_(%EA%B0%80%EC%88%98)?oldid=42749273", "modification": "한국어 요약·수정"},
    bio: "Ado는 일본의 가수다. 2020년 디지털 싱글 「웃세와(うっせぇわ)」로 데뷔했으며, 2021년부터 아티스트 매니지먼트 회사 클라우드 나인에 소속되어 있다.",
    wikipedia: "https://ko.wikipedia.org/wiki/Ado_(%EA%B0%80%EC%88%98)",
    language: '한국어',
    theme: 'blue-rose',
    // The press illustration is cleared for the design preview only.
    banner: import.meta.env.DEV ? {
      url: 'https://shorefire.com/images/uploads/gallery/NEW_Ado_pressshot.jpg',
      source: 'https://shorefire.com/roster/ado',
      author: 'Shore Fire Media',
      license: '편집 용도 한정',
      illustration: {
        thumbnailUrl: 'https://shorefire.com/images/made/f6e51e1825ad4a24/NEW_Ado_pressshot_407_500_s.jpg',
        width: 9000,
      },
    } : undefined,
    channel: 'https://www.youtube.com/channel/UCln9P4Qm3-EAY4aiEPmRwEA',
    music: [{"id": "Qp3b-RXtz4w", "title": "【Ado】うっせぇわ", "publisher": "Ado", "channelId": "UCln9P4Qm3-EAY4aiEPmRwEA", "checkedAt": "2026-11-18T14:10:05.859602+00:00", "officialityBasis": "Universal Music artist page links official channel; Universal news 2026-01-01 links exact THE FIRST TAKE video and uploader channel.", "evidenceUrls": ["https://musicbrainz.org/artist/e134b52f-2e9e-4734-9bc3-bea9648d1fa1", "https://www.wikidata.org/wiki/Q104012678", "https://www.universal-music.co.jp/ado/news/2026-01-01/"]}],
    live: [{"id": "ujyJRxAKpVE", "title": "Ado - うっせぇわ / THE FIRST TAKE", "publisher": "THE FIRST TAKE", "channelId": "UC9zY_E8mcAo_Oq772LEZq8Q", "checkedAt": "2026-11-18T14:10:05.859602+00:00", "officialityBasis": "Universal Music artist page links official channel; Universal news 2026-01-01 links exact THE FIRST TAKE video and uploader channel.", "evidenceUrls": ["https://musicbrainz.org/artist/e134b52f-2e9e-4734-9bc3-bea9648d1fa1", "https://www.wikidata.org/wiki/Q104012678", "https://www.universal-music.co.jp/ado/news/2026-01-01/"]}],
  },
  mcr: {
    identity: {"bandId": "8f0b57b1-a196-44ae-92a3-5ab463fc6901", "musicBrainzId": "c07f0676-9143-4217-8a9f-4c26bd636f13", "wikidata": "https://www.wikidata.org/wiki/Q483285"},
    bioSource: {"revision": 42143697, "authorsUrl": "https://ko.wikipedia.org/wiki/%EB%A7%88%EC%9D%B4_%EC%BC%80%EB%AF%B8%EC%BB%AC_%EB%A1%9C%EB%A7%A8%EC%8A%A4?action=history", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/", "checkedAt": "2026-11-18T14:10:05.859602+00:00", "revisionUrl": "https://ko.wikipedia.org/wiki/%EB%A7%88%EC%9D%B4_%EC%BC%80%EB%AF%B8%EC%BB%AC_%EB%A1%9C%EB%A7%A8%EC%8A%A4?oldid=42143697", "modification": "한국어 요약·수정"},
    bio: "마이 케미컬 로맨스는 2001년 결성된 미국의 록 밴드다. 《Three Cheers for Sweet Revenge》와 《The Black Parade》를 발표했으며, 2013년 해체 후 2019년 재결합했다.",
    wikipedia: "https://ko.wikipedia.org/wiki/%EB%A7%88%EC%9D%B4_%EC%BC%80%EB%AF%B8%EC%BB%AC_%EB%A1%9C%EB%A7%A8%EC%8A%A4",
    language: '한국어',
    theme: 'stage-violet',
    banner: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/3/39/My_Chemical_Romance_en_vivo.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:My_Chemical_Romance_en_vivo.jpg',
      author: 'DOliphant',
      license: 'CC BY 2.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
    },
    channel: 'https://www.youtube.com/channel/UCCZGYab5SpD0I7Z5JqJZgww',
    music: [{"id": "RRKJiM9Njr8", "title": "My Chemical Romance - Welcome To The Black Parade [Official Music Video] [HD]", "publisher": "My Chemical Romance", "channelId": "UCCZGYab5SpD0I7Z5JqJZgww", "checkedAt": "2026-11-18T14:10:05.859602+00:00", "officialityBasis": "MB youtube relation and Wikidata P2397 match API uploader; channel describes itself as official.", "evidenceUrls": ["https://musicbrainz.org/artist/c07f0676-9143-4217-8a9f-4c26bd636f13", "https://www.wikidata.org/wiki/Q483285"]}],
    live: [{"id": "Ud2eziOjjTo", "title": "My Chemical Romance - The Black Parade Is Dead! [Full Concert Video]", "publisher": "My Chemical Romance", "channelId": "UCCZGYab5SpD0I7Z5JqJZgww", "checkedAt": "2026-11-18T14:10:05.859602+00:00", "officialityBasis": "MB youtube relation and Wikidata P2397 match API uploader; channel describes itself as official.", "evidenceUrls": ["https://musicbrainz.org/artist/c07f0676-9143-4217-8a9f-4c26bd636f13", "https://www.wikidata.org/wiki/Q483285"]}],
  },
}

export function catalogArtistProfile(artist: { id: string; musicbrainzId?: string }): Pick<ArtistProfilePreview, 'bio' | 'bioSource' | 'language' | 'theme' | 'banner'> | undefined {
  const profile = Object.values(artistProfilePreviews).find(candidate =>
    candidate?.identity.bandId === artist.id && candidate.identity.musicBrainzId === artist.musicbrainzId)
  if (!profile) return undefined
  const { bio, bioSource, language, theme, banner } = profile
  return { bio, bioSource, language, theme, banner: banner?.license === '편집 용도 한정' ? undefined : banner }
}
