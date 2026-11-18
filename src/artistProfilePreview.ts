export type ArtistVideo = { id: string; title: string; publisher?: string; channelId?: string; checkedAt?: string }

type Banner = {
  url: string
  source: string
  author: string
  license: 'CC BY 2.0' | 'CC BY 3.0' | 'CC BY 4.0' | '편집 용도 한정'
  licenseUrl?: string
  illustration?: { thumbnailUrl: string; width: number }
  logo?: { url: string; source: string }
}

export type ArtistProfilePreview = {
  bio: string
  wikipedia: string
  language: string
  theme: 'cobalt' | 'walnut' | 'blue-rose' | 'stage-violet'
  banner?: Banner
  channel: string
  music: ArtistVideo[]
  live: ArtistVideo[]
}

// Editor-selected examples for the local preview catalog.
export const artistProfilePreviews: Partial<Record<string, ArtistProfilePreview>> = {
  changsub: {
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
    music: [{"id": "JaIMSzE5yLA", "title": "실리카겔 (Silica Gel) - NO PAIN [M/V]", "publisher": "Silica Gel 실리카겔", "channelId": "UCXteMTpHAvyDP05G0QULuZA", "checkedAt": "2026-11-18T14:10:05.859602+00:00"}, {"id": "DIPxnt5vnhU", "title": "실리카겔 (Silica Gel) - T + Tik Tak Tok (feat. So!YoON!) [M/V]", "publisher": "Silica Gel 실리카겔", "channelId": "UCXteMTpHAvyDP05G0QULuZA", "checkedAt": "2026-11-18T14:10:05.859602+00:00"}],
    live: [{"id": "qg40imnWXG8", "title": "실리카겔 (Silica Gel) - NO PAIN [LIVE From YES24 LIVE HALL]", "publisher": "Silica Gel 실리카겔", "channelId": "UCXteMTpHAvyDP05G0QULuZA", "checkedAt": "2026-11-18T14:10:05.859602+00:00"}],
  },
  ado: {
    bio: "Ado는 일본의 가수다. 2020년 디지털 싱글 「웃세와(うっせぇわ)」로 데뷔했으며, 2021년부터 아티스트 매니지먼트 회사 클라우드 나인에 소속되어 있다.",
    wikipedia: "https://ko.wikipedia.org/wiki/Ado_(%EA%B0%80%EC%88%98)",
    language: '한국어',
    theme: 'blue-rose',
    // User authorized editorial preview use; this is not a production reuse grant.
    banner: {
      url: 'https://shorefire.com/images/uploads/gallery/NEW_Ado_pressshot.jpg',
      source: 'https://shorefire.com/roster/ado',
      author: 'Shore Fire Media',
      license: '편집 용도 한정',
      illustration: {
        thumbnailUrl: 'https://shorefire.com/images/made/f6e51e1825ad4a24/NEW_Ado_pressshot_407_500_s.jpg',
        width: 9000,
      },
    },
    channel: 'https://www.youtube.com/channel/UCln9P4Qm3-EAY4aiEPmRwEA',
    music: [{"id": "Qp3b-RXtz4w", "title": "【Ado】うっせぇわ", "publisher": "Ado", "channelId": "UCln9P4Qm3-EAY4aiEPmRwEA", "checkedAt": "2026-11-18T14:10:05.859602+00:00"}],
    live: [{"id": "ujyJRxAKpVE", "title": "Ado - うっせぇわ / THE FIRST TAKE", "publisher": "THE FIRST TAKE", "channelId": "UC9zY_E8mcAo_Oq772LEZq8Q", "checkedAt": "2026-11-18T14:10:05.859602+00:00"}],
  },
  mcr: {
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
    music: [{"id": "RRKJiM9Njr8", "title": "My Chemical Romance - Welcome To The Black Parade [Official Music Video] [HD]", "publisher": "My Chemical Romance", "channelId": "UCCZGYab5SpD0I7Z5JqJZgww", "checkedAt": "2026-11-18T14:10:05.859602+00:00"}],
    live: [{"id": "Ud2eziOjjTo", "title": "My Chemical Romance - The Black Parade Is Dead! [Full Concert Video]", "publisher": "My Chemical Romance", "channelId": "UCCZGYab5SpD0I7Z5JqJZgww", "checkedAt": "2026-11-18T14:10:05.859602+00:00"}],
  },
}
