# 공식 근거

최종 확인: 2026-10-15 KST. 실행 시 아래 공식 문서의 변경 사항을 확인한다. API 사용 가능은 개별 사진의 저작권 양도나 독립적인 무제한 재사용 허락이 아니다.

- https://developers.google.com/youtube/v3/docs/channels — snippet.thumbnails, 반환 URL 그대로 표시.
- https://developers.google.com/youtube/v3/docs/channels/list — id·forHandle·forUsername·part=snippet, 1 unit/request. URLSearchParams로 요청을 만든다.
- https://developers.google.com/youtube/v3/getting-started — Google Cloud·API 키·쿼터. 공개 snippet 조회에는 사용자 OAuth가 필요하지 않다.
- https://developers.google.com/youtube/terms/developer-policies — III.E.4 30일 갱신/삭제, III.E.6 scraping 금지, III.F.2 source attribution.
- https://developers.google.com/youtube/terms/branding-guidelines — 혼합 출처/공간 제약의 아이콘 조건, 근접 출처·클릭 링크. 최소 크기·색상은 연결된 최신 브랜드 사이트도 확인한다.
- https://support.google.com/youtubemusic/answer/6373125 — OAC/소유 운영 채널/VEVO 아바타. Music 사진이 채널 API와 항상 동일하다고 가정하지 않는다.
- https://musicbrainz.org/doc/MusicBrainz_API — MBID URL 관계·공유 rate gate·User-Agent·요청 속도.

권장 UI는 사진 옆/아래 YouTube 브랜드 링크, 상세에는 verified 공식 링크 모음이다. 출처를 보려면 반드시 상세 진입·hover가 필요하게 만들지 않는다. API 이미지 보관/갱신 조건은 별개로 충족한다.
