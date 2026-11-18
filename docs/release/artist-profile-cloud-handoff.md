# 아티스트 상세 · 새 클라우드 채팅 인계

## 2026-11-19 후속 승인 · 후보 조사 예약과 Git 릴리스

사용자 후속 요청으로 **3일마다** 기존 다른 아티스트의 상세 콘텐츠 후보를 조사하는 예약 `아티스트 상세 콘텐츠 보완`을 생성했다. 첫 예정은 2026-11-22 10시 전후 KST이며 매회 최대 4팀, 기존 비공개 후보 journal 추가까지다. 운영 게시·검수 상태 변경·디자인·기존 KOPIS/중지 예약 변경은 포함하지 않는다. 예약 설정 완료와 실제 첫 실행·저장 성공은 구분한다.

이어 사용자가 작업 브랜치 push와 main까지 PR 병합을 승인했다. 로컬 후속 `aa0a1be`/`e772308`은 원격 작업 브랜치에 push됐다. 통합 준비에서 기존 main의 관리자 개선·CSS를 보존하고, main의 기존 일반 시안 경로도 `import.meta.env.DEV`로 제한해 후보 데이터/Ado 편집용 삽화가 운영 번들에 포함되지 않게 했다. 최신 코드·병합/CI 결과는 [dev 통합 PR #95](https://github.com/yeonguk0201/Concert_finder/pull/95)와 실제 원격 refs로 확인한다. 아래의 과거 ‘push하지 않음’·‘예약 생성 금지’는 해당 시점의 범위이며 이 후속 승인을 취소하지 않는다. SQL/함수 배포와 운영 콘텐츠 반영 제한은 유지한다.


2026-11-19 콘텐츠 후속: [콘텐츠 재점검 보고서](artist-profile-content-recheck.md)를 먼저 읽는다. 디자인 제외, 실제 키 형식/DB/비공개 5건/출처/영상 재확인 및 읽기 전용 복구 보완 결과다. 아래 과거 키 오류·디자인 후속 기록과 현재 상태를 구분한다.

2026-11-19 KST. 사용자는 재사용 환경의 공개 키를 교체하고 새 채팅에서 이어가기로 했다. 이 문서와 원격 feature branch를 사용하며 다른 채팅의 Windows 경로·`.local` 파일·임시 프로세스·스크립트를 사용할 수 있다고 가정하지 않는다.

## 후속 상태 변경 · 디자인은 현재 채팅에서 계속 진행

사용자가 새 채팅 대신 현재 채팅에서 디자인을 계속하기로 했다. 기존 110px 선형 페이드를 240px의 완만한 opacity 곡선으로 바꾸고 같은 배경 변수로 본문에 연결했다. 시안의 시스템 테마 감지·실시간 변경과 상단 수동 전환, 검정 배경으로 이어지는 다크 모드도 구현했다. 아래 목록에 마지막 요청과 후속 구현을 정리했으며 현재 구현/캡처는 `docs/artist-profile-preparation.md`의 최상단 후속 결과를 우선한다. 사용자 최종 시각 검토는 아직 남아 있다. 운영 App 전체의 테마 변경·배포는 아니다.

후속 검증: build·lint, 시안 UI 5개, 네 팀의 라이트/다크·1280/390/360/320px 실제 화면 32개 통과. 경계의 RGB 차이 0, 넘침 없음, 이미지·출처·버튼·모드 전환·실패 대체·운영 API 요청 0 확인. Git의 `docs/artist-profile-preview/theme-comparison.jpg`와 두 모드 overview가 최신 캡처다. 이전 채팅의 임시 키·로컬 파일 전달은 여전히 가정하지 않는다.

## 이어받을 코드

저장소: https://github.com/yeonguk0201/Concert_finder

작업 브랜치: `codex/feat-artist-profile-cloud-preparation`.

실제 dev 기준: `ea6ab3d15bb573d2ccfadd0320170e3a7f2d256f`. 승인 원형 시안은 `codex/feat-artist-profile-pilot`의 `d7304dd7ad44e988995e1cd8ac89c6fab62b680e`이며, 후속 사용자 요청은 작업 브랜치에 반영했다. 원형 브랜치 전체로 dev를 덮어쓰지 않는다.

이전 환경의 fetch 설정이 main만 추적해 로컬 origin/dev가 `f931913`에 머문 것을 인계 전에 발견했다. 초기 “최신 dev 기반” 보고는 잘못됐으며 실제 dev에서 작업 브랜치를 다시 구성했다. 따라서 옛 로컬 작업 커밋 `fb0a6b8` 등을 새 인계 HEAD로 사용하지 않는다. 새 채팅에서도 추적 ref 이름만 믿지 말고 실제 원격 해시를 확인한다.

```sh
git ls-remote origin HEAD refs/heads/dev refs/heads/codex/feat-artist-profile-cloud-preparation
git fetch origin refs/heads/dev:refs/remotes/origin/dev refs/heads/codex/feat-artist-profile-cloud-preparation:refs/remotes/origin/codex/feat-artist-profile-cloud-preparation
```

미커밋 변경이 있으면 보존한다. 공유 feature branch에서 이어가고, dev가 추가로 전진했으면 기존 작업을 보존하며 갱신한다. 이 feature branch는 dev에 병합하지 않았다.

먼저 읽기: `AGENTS.md`, `CONTRIBUTING.md`, `docs/artist-photos.md`, `docs/api-first-concert-publication-plan.md`, `docs/release/local-ui-and-concert-dedup-handoff.md`, 이 문서와 `docs/artist-profile-preparation.md`.

## 마지막 디자인 요청과 현재 구현 — 시각 검토 대기

1. 모바일 배치는 사진 → 이름 → 예정 공연 → 찜 버튼이다. 사진과 이름/버튼 뒤까지 해당 아티스트의 퍼스널 컬러를 유지한다.
2. 기존 마지막 110px의 단순한 색→흰색 변화가 급하고 경계가 끊겨 보인다는 피드백에 따라, 모바일은 240px의 완만한 opacity 곡선으로 수정했다. 배너와 본문이 같은 테마 배경으로 이어지며 실제 경계 픽셀 차이는 0이었다. 최종 느낌은 사용자 검토를 기다린다.
3. 시안의 시스템 테마 대응과 상단 수동 다크 버튼을 구현했다. 운영 App에는 연결할 테마 상태 계약이 없어 시안에서 시스템 설정을 기본으로 따른다. 다크에서는 본문·헤더·그라데이션 종착점이 검정이다. 운영 앱 전체에 다크 모드를 추가했다고 말하지 않는다.
4. 네 팀, 라이트/다크, 320·360·390·1280px의 실제 화면 32개를 확인했다. 공통 이미지/배너 높이·넘침·출처·대비·이미지 실패 대체·테마 전환 검사와 UI 검사 5개가 통과했다. 다음 수정은 현재 캡처에 대한 사용자 피드백을 기준으로 이어간다.

이 기능은 사용자가 현재 채팅에서 디자인을 계속하기로 한 뒤 개발용 시안에 구현했다. 기존 화면 재현에 대한 ‘나쁘지 않다’는 반응이나 구현 완료를 최종 디자인 승인·운영 게시 승인으로 해석하지 않는다.

## 파일과 진입점

- `src/ArtistProfilePilot.tsx`: 네 팀의 독립된 미리보기 화면.
- `src/ArtistProfilePilot.css`: **다음 그라데이션/다크 작업의 스타일 파일**. 기존 dev의 `src/ServiceDesign.css`와 구분한다.
- `src/artistProfilePreview.ts`: 한국어 소개, 팔레트, 출처와 검증한 영상.
- `src/ArtistBannerPhoto.tsx`: 외부 이미지·출처·편집 용도 표시·실패 시 이니셜.
- `src/ArtistProfileMedia.tsx`: 시안 전용 영상 진열. 기존 dev의 `src/ArtistMedia.tsx`를 교체하지 않는다.
- `src/RootApp.tsx`, `src/main.tsx`: `import.meta.env.DEV`에서만 미리보기 모듈을 lazy load. 프로덕션 App/API 데이터와 분리한다.
- `vite.config.ts`: 잘못된 공개용 Supabase 설정은 빌드/개발 서버 시작 전에 차단.
- `scripts/artist-profile-state.mjs`: private 후보 journal. 운영 apply나 자동 승인/스케줄 기능 없음.

개발 서버에서 `/?artistProfilePreview=changsub`, `silicagel`, `ado`, `mcr`로 연다. `npm run build`의 결과물에는 미리보기 진입점이 포함되지 않으므로 개발 서버에서 시안을 검증한다. 미리보기 찜은 메모리 상태뿐이며 운영 요청을 만들지 않는다.

## 이미지·소개·영상의 승인 범위

Ado는 사용자가 “편집용으론 가능하니까 넣어”라고 요청하여 Shore Fire Media의 외부 삽화를 편집용 미리보기에 넣었다. 남색·청록 팔레트와 출처·`편집 용도 한정`·크롭 표시를 유지한다. 운영 서비스의 재사용 범위는 미확인이며 게시하지 않는다. 이 요청은 운영 사용 허가서가 아니다.

이창섭·실리카겔·MCR은 개별 Commons 사진의 저작자와 CC BY 4.0/3.0/2.0을 확인했다. MCR 로고는 trademarked 표시 때문에 제외했다. Commons 자동 경로가 다른 사이트 이미지까지 허가한다고 해석하지 않는다. 원본 URL, 출처와 이용 근거는 상세 보고서에 있다. 별도 사진 API 키는 필요 없다.

소개는 기존 MBID→Wikidata 관계와 P434 일치, 한국어 위키백과 문서 및 revision을 확인한 한국어 요약이다. 원문·기여 이력·CC BY-SA 4.0·요약/수정 표시를 유지한다.

표시 영상 수(MV/라이브): 이창섭 0/0, 실리카겔 2/1, Ado 1/1, MCR 1/1. 이창섭 두 건은 API 게시자는 확인했으나 소속사↔채널의 독립 연결 근거가 부족해 보류했다. 영상 카드→해당 영상, 더보기→해당 공식 채널을 유지하고 각 분류 최대 6개, 확인된 개수만 표시한다. 새 채널 갱신 writer/workflow를 만들지 않는다.

## 신원 및 비공개 상태

| 아티스트 | band ID | MBID |
| --- | --- | --- |
| 이창섭 | dcb90080-9164-478b-a728-b0f0172e2db0 | 4561aee5-6cf6-41a6-9b7b-f7be15a00a65 |
| 실리카겔 | 143af425-ea27-4e44-832a-c3215196d7a5 | 2c8b5bb2-6110-488d-bc15-abb08379d3c6 |
| Ado | 1bb57d2e-eef1-419e-82c7-fe7e4dac7a55 | e134b52f-2e9e-4734-9bc3-bea9648d1fa1 |
| MCR | 8f0b57b1-a196-44ae-92a3-5ab463fc6901 | c07f0676-9143-4217-8a9f-4c26bd636f13 |

실제 DB에서는 실리카겔만 `unreviewed`, 나머지 세 팀은 `approved`였다. 상태는 변경하지 않았다. 재개 시 현재 MBID·version을 다시 읽는다. 신규 생성·동명이인 자동 연결·검수 상태 변경은 하지 않는다.

기존 비공개 버킷 `concert-scheduler-state`의 분리 경로를 사용했다.

`artist-profile-preparation/v1/runs/5054d095-437d-429f-8f33-7599d85b6bc3/bands/<band ID>/attempts/<attempt>.json.gz`

처음에는 네 팀 모두 attempt 1, 이후 Ado만 편집용 미리보기 사용자 판단을 attempt 2로 추가했다. 이전 보류를 삭제/덮어쓰지 않았다. 원본 version·snapshot·출처·사용 근거·확인 시각·후보/보류·retry·`application.status=not_attempted`를 보존했다. 처음 네 건의 정확한 재읽기·동일 재실행과 Ado attempt 2의 재읽기가 확인됐다. 올바른 공개 키로는 후보 읽기가 거부됐다.

이 기록은 콘텐츠 조사 근거다. 최초 기록의 `baseDev`는 의도한 dev 해시였으며 실제 구현 브랜치의 기준 불일치는 위와 같이 바로잡았다. 원본 콘텐츠 근거나 수동 판단을 초기화하지 않는다.

실제 runner checkpoint는 genre/channel만 허용하며 소개·배너·영상 목록 writer를 지원하지 않는다. 키의 존재만으로 writer 준비 완료로 세지 않는다. 새 버킷/테이블/함수 생성이나 SQL/함수 배포는 하지 않았다.

## 키·클라우드 접근

- 사용자는 재사용 환경의 `VITE_SUPABASE_PUBLISHABLE_KEY`를 진짜 Publishable key(`sb_publishable_`)로 교체한 뒤 새 채팅을 시작할 예정이다. **실제 수정 완료나 새 환경 적용을 미리 가정하지 말고 시작 시 값 노출 없이 분류와 공개 API 접근을 확인한다.**
- 이전 환경은 이 VITE 값이 `sb_secret_`였고 `SUPABASE_SERVICE_ROLE_KEY`와 같았다. 서버 전용 키를 프런트엔드에 넣지 않는다. 서버 키는 이미 있으므로 기능별로 새로 만들 필요는 없다.
- 이전 채팅의 임시 적용은 연결된 Supabase 프로젝트에서 읽은 공개 키를 개발/빌드 자식 프로세스에만 넣은 것이다. 저장된 환경 설정을 바꾸지 않았고 다른 채팅에 전달되지 않는다. `.local/artist-profile/public-client.json`이나 `/tmp/task-client-env.mjs`의 존재를 가정하지 않는다.
- `SUPABASE_URL`, 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`, `YOUTUBE_API_KEY`, 프런트 `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`, GitHub 및 필요한 사이트 접근을 실제로 확인한다. 값은 로그·소스·채팅에 노출하지 않는다.
- 이 환경은 필요한 Wikipedia/Wikidata/Commons API와 이미지, MusicBrainz, Universal Music, Shore Fire 응답을 받았다. YouTube 페이지/썸네일과 일부 공식 사이트는 클라우드에서 차단됐다. 사이트별 접근 가능을 다시 확인한다.
- Chromium은 프록시 CA 직접 신뢰 문제가 있었다. 실제 외부 이미지 URL의 응답을 TLS 검증이 되는 Node fetch로 전달해 캡처했다. 인증서 검증 해제·가상 사진 주입은 하지 않았다. 다음 환경도 같은 문제라고 가정하지 않는다.

## 검증과 산출물

실제 dev 위에서 다시 확인한 검사: build·lint, Node 상태/키 경계 4개, 시안 UI 3개, 기존 App/채널 카탈로그 UI 40개 통과. Ado 실제 외부 이미지 및 1280/390/320px에서 기존 크기·출처·링크·운영 API 요청 0을 확인했다. 최신 dev의 전체 테스트를 새로 전부 실행한 것은 아니며, 이전 전체 검사 수치(Node 93/UI 90)는 최초 오래된 로컬 base에서의 기록이다.

`docs/artist-profile-preview/desktop-overview.jpg`, `mobile-overview.jpg`는 Git에 포함되어 새 채팅에서도 읽을 수 있다. 모바일 그림은 마지막 사용자 피드백에서 지적한 그라데이션을 그대로 포함한다. 전체 16개 PNG·raw 연구 자료·receipt·테스트 로그는 이전 환경의 `.local`에만 있으므로 공유되었다고 가정하지 않는다. 공개 출처/라이선스/영상 목록은 `docs/artist-profile-preparation.md`에서 읽는다.

## 유지할 제한

지금은 예약을 만들거나 자동 등록 주기를 정하지 않는다. SQL/함수 배포·운영 콘텐츠 apply·아티스트 생성·검수 상태 변경·채널 갱신 writer 추가를 하지 않는다. 기존 KOPIS 수집/공개·상태·lease·cooldown·알림·기존 중지 예약을 수정하지 않는다. 이미지와 디자인 시안의 사용자 판단을 운영 콘텐츠 게시 승인으로 확대하지 않는다.
