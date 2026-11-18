export type ArtistVideo = { id: string; title: string }

type Banner = {
  url: string
  source: string
  author: string
  license: 'CC BY 2.0' | 'CC BY 3.0' | 'CC BY 4.0'
  licenseUrl: string
}

export type ArtistProfilePreview = {
  bio: string
  wikipedia: string
  language: string
  banner?: Banner
  channel: string
  music: ArtistVideo[]
  live: ArtistVideo[]
}

// Editor-selected examples for the local preview catalog.
export const artistProfilePreviews: Partial<Record<string, ArtistProfilePreview>> = {
  changsub: {
    bio: '이창섭은 보이 그룹 비투비(BTOB)에서 데뷔한 대한민국의 가수다. 그룹 활동과 함께 솔로 음반을 발표하고 뮤지컬 무대에도 올랐다.',
    wikipedia: 'https://ko.wikipedia.org/wiki/이창섭_(가수)',
    language: '한국어',
    banner: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/0/0c/170617_Lee_Chang-sub_%285%29.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:170617_Lee_Chang-sub_(5).jpg',
      author: 'leechapusopu',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    },
    channel: 'https://www.youtube.com/channel/UCycx2ChXHC9bPXoyrPr98cg',
    music: [{ id: 'kq4GcIzcwXc', title: '33 · 뮤직비디오' }],
    live: [{ id: 'RBRFhmZpKjU', title: '33 · 라이브 클립' }],
  },
  silicagel: {
    bio: '실리카겔은 2013년 서울예술대학교 학생들을 중심으로 결성된 인디 록 밴드다. 김건재, 김춘추, 김한주, 최웅희가 활동하며, 사이키델릭 록에 전자음악과 시각 연출을 결합한다.',
    wikipedia: 'https://ko.wikipedia.org/wiki/실리카겔_(밴드)',
    language: '한국어',
    banner: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/4/46/Silica_Gel_members_in_2022.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Silica_Gel_members_in_2022.jpg',
      author: 'SBS Radio (에라오)',
      license: 'CC BY 3.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    },
    channel: 'https://www.youtube.com/channel/UCXteMTpHAvyDP05G0QULuZA',
    music: [
      { id: 'JaIMSzE5yLA', title: 'NO PAIN' },
      { id: 'DIPxnt5vnhU', title: 'T + Tik Tak Tok (feat. So!YoON!)' },
    ],
    live: [{ id: 'qg40imnWXG8', title: 'NO PAIN · YES24 LIVE HALL' }],
  },
  ado: {
    bio: 'Ado는 인터넷에 커버곡을 올리며 활동을 시작한 일본의 가수다. 2020년 「うっせぇわ」로 메이저 데뷔했고, 애니메이션 영화 《원피스 필름 레드》에서 우타의 노래를 맡았다.',
    wikipedia: 'https://ja.wikipedia.org/wiki/Ado',
    language: '일본어',
    channel: 'https://www.youtube.com/channel/UCln9P4Qm3-EAY4aiEPmRwEA',
    music: [{ id: 'Qp3b-RXtz4w', title: 'うっせぇわ (Usseewa)' }],
    live: [{ id: 'ujyJRxAKpVE', title: 'うっせぇわ · THE FIRST TAKE' }],
  },
  mcr: {
    bio: '마이 케미컬 로맨스는 2001년 미국 뉴저지에서 결성된 록 밴드다. 《Three Cheers for Sweet Revenge》와 《The Black Parade》를 발표했으며, 2013년 해체 후 2019년 재결합했다.',
    wikipedia: 'https://en.wikipedia.org/wiki/My_Chemical_Romance',
    language: '영어',
    banner: {
      url: 'https://upload.wikimedia.org/wikipedia/commons/3/39/My_Chemical_Romance_en_vivo.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:My_Chemical_Romance_en_vivo.jpg',
      author: 'DOliphant',
      license: 'CC BY 2.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
    },
    channel: 'https://www.youtube.com/channel/UCCZGYab5SpD0I7Z5JqJZgww',
    music: [{ id: 'RRKJiM9Njr8', title: 'Welcome to the Black Parade' }],
    live: [{ id: 'Ud2eziOjjTo', title: 'The Black Parade Is Dead! · 전체 공연' }],
  },
}
