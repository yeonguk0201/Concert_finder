# 아티스트 사진 연결

외부 검색 결과와 등록된 아티스트 카드에 사진을 표시한다. 이름으로 사진을 검색하지 않고 MusicBrainz MBID의 Wikidata 관계를 따라 해당 항목의 대표 이미지(P18)를 가져온다. Wikidata에 MusicBrainz ID(P434)가 있으면 요청한 MBID와 일치하는지 확인한다. 등록된 아티스트는 서버 전용 조회 함수로 내부 밴드 ID를 기존 MBID와 연결한다.

## 동작과 범위

- 검색 결과와 찜 버튼을 먼저 표시한다. 화면에 보이는 카드부터 사진을 별도로 요청하고, 대기 중 화면에서 사라진 카드의 조회는 건너뛴다. 사진 조회를 직렬화하고 MusicBrainz 공유 요청 게이트를 적용한다. 혼잡 응답은 한 번 재시도한다.
- 아티스트에 연결된 Wikidata 항목이 하나일 때 대표 이미지를 조회한다. deprecated 이미지 주장은 제외한다. Commons의 JPEG·PNG·WebP 썸네일 중 출처·저작자·지원 라이선스가 확인된 항목을 사용한다. `upload.wikimedia.org`와 `thumb.wikimedia.org`만 이미지 호스트로 허용한다.
- CC BY/BY-SA 2.0·2.5·3.0·4.0, CC0·Public Domain Mark의 명시된 라이선스 URL을 지원한다. 제한 사항이 있거나 라이선스 URL·저작자가 없으면 사진을 표시하지 않는다. 다른 사이트의 프로필 사진·로고·삽화는 자동으로 가져오지 않는다.
- 썸네일 URL, Commons 원본 페이지, 저작자, 크레딧, 라이선스 이름·URL, MBID, Wikidata 링크, 조회 시각을 기존 서버 캐시에 7일 보관한다. 사진이 없는 정상 결과도 캐시하며, 통신 실패는 캐시하지 않는다. 브라우저는 결과를 5분간 보관하고 같은 ID의 중복 요청을 합친다.
- 사진 아래에 출처·저작자·크레딧·라이선스 링크와 썸네일 표시 안내를 제공한다. 이미지 비율을 보존하며, 사진이 없거나 로딩이 실패하면 이니셜을 표시한다. 검색·등록·찜 동작은 사진 실패와 관계없이 사용할 수 있다.
- 기존 아티스트에 MBID 연결이 없으면 이니셜을 유지한다. 이름만 같은 MusicBrainz 아티스트를 자동 연결하지 않는다. 사이드바의 작은 이니셜 표시는 유지한다.

## 적용 순서

기존 카탈로그·외부 검색 SQL이 적용된 프로젝트를 기준으로 한다.

1. Supabase SQL Editor에서 [사진 ID 조회 마이그레이션](../supabase/migrations/20261011163010_artist_photo_identity.sql)을 한 번 실행한다. 일반 클라이언트에 비공개 신원 테이블의 접근 권한을 추가하지 않는다.
2. 프로젝트 폴더에서 새 함수를 배포한다.

   ```powershell
   npx supabase functions deploy artist-photo --project-ref YOUR_PROJECT_REF
   ```

3. 로컬에서는 `npm run dev`로 확인한다. 운영에서는 프런트엔드도 배포한다. 별도 사진 API 키는 필요하지 않다. `service_role` 키는 서버에서만 사용한다.
4. 외부 검색의 CN 제외 등 최신 필터도 아직 미반영했다면 `artist-search` 함수를 별도로 다시 배포한다.

사진용 함수가 배포되지 않았거나 SQL 적용 전이면 사진은 이니셜로 남는다. 등록된 아티스트의 사진은 목록에서 화면에 보일 때 조회되므로 페이지 새로고침 이후에도 MBID를 통해 다시 연결된다.

## 검증

- 전체 회귀 검사: Node 52개·UI 67개 통과. lint·build·Deno check 통과. 기존 500kB 초과 번들 경고는 남아 있다.
- PGlite에서 실제 마이그레이션과 등록된 MBID 조회, 미연결 아티스트의 null 결과, anon/authenticated의 RPC 실행 거부를 확인했다. 원격 DB advisory 검사는 수행하지 않았다.
- 신원 불일치, 임의 호스트, 지원하지 않는 라이선스·SVG, 누락된 저작자, 서버 캐시·혼잡·실패, 중복 카드 조회, 사진 로딩 오류, 아티스트 변경 중 늦은 응답을 테스트했다.
- 실제 공개 API에서 Radiohead의 Wikidata Q44190 연결, Commons 썸네일·Raph_PH 크레딧·CC BY 4.0 반환을 확인했다. Ado는 연결된 항목에서 사용할 사진이 없어 null을 반환했다. 모든 아티스트에 사진이 존재한다는 보장은 없다.
- 가상 사진 응답을 사용한 headless Edge에서 1280·390·320px 사진·출처 링크·찜 동작, 가로 넘침과 페이지 오류 없음을 확인했다. 원격 SQL 적용·함수 배포·운영 계정의 전체 흐름 검증은 수행하지 않았다.

참조: [MusicBrainz 관계](https://musicbrainz.org/relationships/artist-url), [Wikidata 데이터 접근](https://www.wikidata.org/wiki/Help:Data_access), [Commons 이미지 정보 API](https://www.mediawiki.org/wiki/API:Imageinfo), [Commons 재이용 안내](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia).
