---
name: concert-artist-channels
description: "concert-finder 아티스트의 공식 YouTube 채널·공식 사이트를 외부 ID와 교차 검수하고 수백 팀의 채널 사진 URL을 일괄 조회·갱신한다. 공식 채널 연결·사진 자동 확보·공식 링크 검수에 사용하며 장르 승인·신규 아티스트 등록·비공식 YouTube Music 수집은 제외한다."
---

# 공식 채널과 프로필 이미지 일괄 검수

승인된 클라우드 자동 검수 실행기는 [운영 검토서](../../docs/artist-review-runner.md)와 [실행 절차](../concert-artist-curation/references/runner.md)를 따른다. 이 실행기는 공식 링크/근거만 기록하며 API 이미지 캐시를 만들지 않는다. 기존 이미지 갱신 workflow와 별개다. 운영 적용 전에는 실행기 RPC를 호출하지 않는다.

관리자가 수백 팀을 수동 입력하는 대신 공식 근거가 연결된 채널을 자동 검수하고 불확실한 항목만 예외 목록으로 남긴다. 이름 일치·구독자 수·체크 배지는 공식성의 충분한 증거가 아니다.

## 범위와 현재 연결

- 스킬 생성/설치는 실제 DB 변경이나 대량 API 실행 권한이 아니다. 사용자가 채널 조사/연결을 요청하면 지정 범위를 조사하고 manifest를 완성한다. DB 쓰기는 해당 요청의 범위와 현재 관리자 API가 지원할 때 수행한다.
- 클라우드 저장소 `/workspace/Concert_finder`(기존 로컬 경로 `C:/Users/yeonguk/Desktop/Coding/project/concert-finder`), Supabase `Concert_finder` ref `czjrzylvnewfjnfwjhwf`를 실제 환경과 대조한다. 저장소 지침을 따르고 Supabase 작업에는 해당 스킬을 사용한다.
- 현재 저장소에는 관리자용 `admin_save_artist_channel`·`admin_artist_channel`과 서비스용 `service_save_artist_channel`·`service_apply_artist_channel` 경로가 있다. 운영 DB 적용 여부와 인증을 실행 시 확인한다. `scripts/refresh-artist-channels.mjs --upload`는 DB를 변경하므로 미리보기에서 실행하지 않는다. `service_artist_channel_manifest`도 만료 캐시를 삭제하므로 읽기 전용 호출이 아니다. 자세한 인증·보존·새 작업 검증은 [클라우드 운영](references/cloud-operations.md)을 따른다. description·aliases·기존 수동 사진·장르 검수 상태를 임시 저장소로 쓰지 않는다. 스키마/UI/배포 구현은 별도의 요청 범위다.
- 이 스킬은 호출 시 실행된다. 설치만으로 예약 갱신이 시작되지 않는다. 상시 실행은 앱 서버 작업 또는 사용자가 명시적으로 요청한 automation으로 연결한다.

## 일괄 발견과 공식성 검수

1. bands의 내부 ID·MBID·이름/별칭·국가·관리 상태·버전을 읽고 기존 지정·잠금·제외·이전 결과를 대조한다. 기본 범위는 approved/unreviewed이며 held/excluded는 조회·노출 후보에서 제외한다.
2. 기존 아티스트 가져오기 도구의 MBID별 profile_links/enrichment를 재사용한다. 없으면 해당 MBID의 MusicBrainz URL 관계에서 공식 홈페이지·YouTube 후보를 읽는다. 기존 공유 MusicBrainz 요청 게이트, 의미 있는 User-Agent, 초당 1회 이하를 지킨다. 후보 확보를 위해 신규 아티스트 가져오기를 실행하지 않는다.
3. 공식 사이트/소속사의 해당 아티스트 프로필과 채널 링크를 웹·브라우저 도구로 일괄 대조한다. 직접 확인한 아티스트별 공식 페이지의 채널 링크를 기록한다. 사이트 공통 레이블 채널·동영상 임베드·댓글·팬 페이지는 아티스트 채널 확정 근거가 아니다. 검색은 후보 발견에만 쓰며 매 항목마다 사람의 승인을 요구하지 않는다.
4. MBID 신원·공식 페이지의 아티스트가 일치하고 직접 연결된 채널 링크가 API에서 해석한 ID/handle과 일치하면 verified로 판정한다. 채널→공식 도메인 역링크는 추가 근거다. MusicBrainz 관계 단독·이름/인기도 단독·Topic 자동 채널은 candidate/needs_review로 남긴다. VEVO/OAC/레이블 운영 채널은 해당 아티스트를 위한 공식 경로라는 근거를 확인하고 구분한다.
5. [입력 형식](references/manifest.md)에 맞춰 manifest를 만들고 `scripts/channel-refresh.mjs`를 실행한다. 키는 YOUTUBE_API_KEY 환경변수로만 받는다. 키가 없으면 후보와 필요한 설정까지 완성하고 실제 API 조회 미수행을 보고한다. 키를 명령줄·채팅·결과 파일에 넣지 않는다.

## 갱신·예외

- 일괄 도구는 이미 검수한 링크의 API 해석/사진 갱신을 담당한다. 공식성 증거를 새로 만들지 않는다. 채널 ID는 묶어 조회하고 handle은 forHandle로 해석한다. 이름 검색을 반복하지 않는다.
- 다른 ID로 바뀐 handle·다수 후보·신원 충돌은 자동 교체하지 않는다. 관리자 잠금은 지정 채널 ID를 보존한다. 키 부재·일시 장애로 성공 갱신 시각을 앞으로 밀거나 정상 아티스트의 장르/노출 상태를 바꾸지 않는다. 반복된 키/권한/쿼터 실패는 체크포인트를 저장하고 나머지를 deferred로 남긴다.
- API 데이터는 30일 이내 갱신 또는 삭제한다. 운영 제안은 7일마다 갱신·30일 전 실패 복구·기한 경과 시 캐시 삭제/이니셜이다. 7일은 우리 권장 간격이며 Google 의무 간격이 아니다. 이전 결과/로그/체크포인트에도 만료 이미지 URL·제목을 무기한 쌓지 않는다. 공식성 조사 근거/관리자 결정은 API 캐시와 분리한다.
- API가 반환한 HTTPS 이미지 URL을 그대로 사용한다. 주소 크기 매개변수 조작·다운로드·영구 Storage 재업로드·YouTube Music 비공식 API·YouTube 페이지 스크래핑을 사용하지 않는다. 전체 API 응답/사진 바이트를 보관하지 않는다.

## 자연스러운 출처 UI

사진 가까이에 실제 YouTube 브랜드 아이콘/로고와 해당 채널 링크를 표시한다. 단순 ▶ 문자로 대체하거나 hover·접힌 상세에만 출처를 숨기지 않는다. 혼합 목록은 이미지별 출처를 식별할 수 있게 한다. 아이콘 조건·최소 크기·대비는 최신 브랜드 지침을 확인한다.

상세에는 공식 사이트·YouTube·검증된 공식 계정과 소개 근거를 공식 링크 영역으로 정돈한다. 다른 공식 링크가 사진 출처 의무를 대신하지 않는다. 목록에도 사진을 표시하면 목록의 출처도 유지한다. 공연·소개·장르가 YouTube에서 제공된 것처럼 표현하지 않는다.

## 실행과 전달

```powershell
node <skill-path>/scripts/channel-refresh.mjs --input=.local/artist-channels/input.json --output=.local/artist-channels/latest.json
node --test <skill-path>/scripts/channel-refresh.test.mjs
```

도구는 DB와 사진 파일에 쓰지 않는다. UTF-8 결과에 신원·검수 근거·verified/candidate/needs_review·조회/재사용/실패/만료·실제 적용 여부를 기록한다. latest.json을 교체하고 과거 API 이미지 URL을 Git에 누적하지 않는다. 별도로 승인된 DB 적용에서는 기존 쓰기 경로로 현재 신원/버전·잠금을 재검사하고 기존 관리자 권한·변경 이력을 보존한다. 장르 검수의 admin_curate_artist 인증은 채널 서비스 경로와 별개다.

최종 보고는 전체/공식 확인/예외/실패/키 대기 수·API 요청 수·DB 적용/화면 표시 여부와 결과 파일을 포함한다. 조회 성공을 실제 화면 연결로 확대 해석하지 않는다. 상세 입력은 [manifest](references/manifest.md), 최신 API/정책 근거는 [sources](references/sources.md)를 필요한 단계에서 읽는다.
