# 아티스트 상세 콘텐츠 재점검 · 2026-11-19 KST

이번 범위는 콘텐츠 근거·현재 계약 조사와 작업 브랜치의 보완 코드다. 디자인 파일과 화면 구성은 수정하지 않았다. 조사 시각은 2026-11-18 16:40~16:55 UTC(11/19 01:40~01:55 KST)다. 이전 기록의 확인 시각을 이번 시각으로 덮어쓰지 않았다.

## 코드와 원격 기준

실제 `git ls-remote --symref`를 시작과 완료 단계에 실행했다.

| 원격 ref | SHA |
| --- | --- |
| HEAD → main | `702a89d05819386ccb716553ce7b9b0e4428ae72` |
| dev | `ea6ab3d15bb573d2ccfadd0320170e3a7f2d256f` |
| codex/feat-artist-profile-cloud-preparation | `9000cf02a6f0aed85516ed339af28bd6ab057d4c` |

초기 checkout은 깨끗한 `work`/`63d6f7d`였고 origin/dev는 `f931913`에 머물렀다. 제한된 fetch 설정 때문에 명시적인 refspec으로 두 원격 ref를 갱신하고 요청한 작업 브랜치로 전환했다. dev가 작업 HEAD의 조상임을 확인했다. 기존 시안 전체로 최신 코드를 덮어쓰지 않았다. 이 작업의 로컬 구현 커밋은 `aa0a1be`이며 원격 push/PR/merge는 하지 않았다.

- `src/artistProfilePreview.ts`: 정확한 band ID/MBID/Wikidata, 한국어 원문 revision·저작자 이력·라이선스·변경 표시·원래 확인 시각을 미리보기 데이터에 보존했다. 표시 영상에는 공식성 판단과 근거 URL도 함께 보존했다. 기존 출처 표시와 영상 목록은 유지한다.
- `scripts/artist-profile-state.mjs`: `readAttempt({runId, bandId, attempt})`와 `--read-attempt`를 추가했다. 원본 event 파일이 없는 새 환경에서도 이미 존재하는 후보를 읽을 수 있다. 경로를 검증하고 비공개 버킷만 허용하며 gzip/UTF-8/스키마/내용의 경로 일치를 검사한다. 기존 event 기반 `read`는 MBID·sourceVersion 불일치도 거부한다.
- 기존 immutable create/upsert:false, 충돌 거부, 승인 제한, 과거 이벤트·수동 값·다른 작업 상태 보존은 유지한다. 새 writer/workflow/예약은 없다.

## 현재 DB 신원·버전

서비스 REST 조회와 연결된 DB의 읽기 전용 SQL로 대조했다. 요청한 band/MBID와 후보의 sourceVersion이 모두 일치한다. `private.artist_identities`의 `mb:<MBID>`도 네 팀 모두 존재한다. MCR에는 기존 `mcr` 키가 추가로 있으며 수정하지 않았다.

| 아티스트 | band ID | MBID | updated_at UTC | curation_status |
| --- | --- | --- | --- | --- |
| 이창섭 | dcb90080-9164-478b-a728-b0f0172e2db0 | 4561aee5-6cf6-41a6-9b7b-f7be15a00a65 | 2026-10-21 21:34:52.658091 | approved |
| 실리카겔 | 143af425-ea27-4e44-832a-c3215196d7a5 | 2c8b5bb2-6110-488d-bc15-abb08379d3c6 | 2026-10-12 14:45:03.460022 | unreviewed |
| Ado | 1bb57d2e-eef1-419e-82c7-fe7e4dac7a55 | e134b52f-2e9e-4734-9bc3-bea9648d1fa1 | 2026-10-22 07:39:53.542950 | approved |
| My Chemical Romance | 8f0b57b1-a196-44ae-92a3-5ab463fc6901 | c07f0676-9143-4217-8a9f-4c26bd636f13 | 2026-10-24 05:35:56.854118 | approved |

실리카겔의 실제 DB 이름은 `Silica Gel`이다. 검수 상태를 변경하지 않았으며 신규 생성·동명이인 연결도 하지 않았다.

## 소개와 사진의 출처·이용 근거

MusicBrainz url-rels → Wikidata 항목 → 비deprecated P434의 요청 MBID 및 kowiki sitelink를 재대조했다. 아래 한국어 원문 revision의 실제 내용을 API로 읽어 기존 요약과 대조했다. 모두 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)이며 원문·`?action=history` 저작자/기여 이력·한국어 요약/수정 표시를 유지한다.

| 아티스트 | Wikidata | 확인한 한국어 원문 revision |
| --- | --- | --- |
| 이창섭 | [Q16183546](https://www.wikidata.org/wiki/Q16183546) | [이창섭 (가수), 42752542](https://ko.wikipedia.org/wiki/이창섭_(가수)?oldid=42752542) |
| 실리카겔 | [Q122294833](https://www.wikidata.org/wiki/Q122294833) | [실리카겔 (밴드), 42326891](https://ko.wikipedia.org/wiki/실리카겔_(밴드)?oldid=42326891) |
| Ado | [Q104012678](https://www.wikidata.org/wiki/Q104012678) | [Ado (가수), 42749273](https://ko.wikipedia.org/wiki/Ado_(가수)?oldid=42749273) |
| MCR | [Q483285](https://www.wikidata.org/wiki/Q483285) | [마이 케미컬 로맨스, 42143697](https://ko.wikipedia.org/wiki/마이_케미컬_로맨스?oldid=42143697) |

Commons imageinfo/extmetadata에서 각 사진의 저작자·라이선스·restrictions를 재확인했다. 세 사진 모두 restrictions는 비어 있었고 실제 이미지 CDN도 200이었다. Ado 실제 삽화 URL도 200이며 Shore Fire 페이지의 editorial-only/all rights reserved 표시를 확인했다.

| 아티스트 | 원본·저작자 | 사용 근거/제한 |
| --- | --- | --- |
| 이창섭 | [170617 Lee Chang-sub (5)](https://commons.wikimedia.org/wiki/File:170617_Lee_Chang-sub_(5).jpg), leechapusopu | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), 출처·저작자·라이선스·크롭 표시 유지 |
| 실리카겔 | [Silica Gel members in 2022](https://commons.wikimedia.org/wiki/File:Silica_Gel_members_in_2022.jpg), SBS Radio (에라오) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), 원 방송에서 자른 사진의 크레딧 및 크롭 표시 유지 |
| MCR | [My Chemical Romance en vivo](https://commons.wikimedia.org/wiki/File:My_Chemical_Romance_en_vivo.jpg), DOliphant | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/), 출처·저작자·크롭 표시 유지 |
| Ado | [Shore Fire Media](https://shorefire.com/roster/ado) | 사용자의 편집용 미리보기 요청만 유효. 운영 배너 재사용 범위 미확인·게시 보류 |

Commons 자동 조회 허용 호스트/라이선스 범위를 다른 사이트로 확대하지 않았다. 별도 사진 API 키는 필요 없다. MCR 로고의 기존 제외 판단도 유지한다.

## 영상 목록과 재확인

YouTube Data API videos(snippet,status) 9건, channels(snippet) 6개를 재조회했다. 영상 9건 모두 public/embeddable이며 게시자 ID는 기존 기록과 일치했다. 이는 공식성 독립 근거나 실제 재생 검증을 대신하지 않는다. API 데이터의 영구 운영 캐시를 새로 만들지 않았다.

| 아티스트/분류 | 영상 | 게시자 | channel ID | 미리보기 |
| --- | --- | --- | --- | --- |
| 이창섭 MV | [33 · kq4GcIzcwXc](https://www.youtube.com/watch?v=kq4GcIzcwXc) | fantagio 판타지오 | UC3Ea2-Ut3navgOlTfoq790g | 보류 |
| 이창섭 live | [33 Live Clip · RBRFhmZpKjU](https://www.youtube.com/watch?v=RBRFhmZpKjU) | 창타지오 (LEECHANGSUB OFFICIAL) | UCycx2ChXHC9bPXoyrPr98cg | 보류 |
| 실리카겔 MV | [NO PAIN · JaIMSzE5yLA](https://www.youtube.com/watch?v=JaIMSzE5yLA) | Silica Gel 실리카겔 | UCXteMTpHAvyDP05G0QULuZA | 표시 |
| 실리카겔 MV | [T + Tik Tak Tok · DIPxnt5vnhU](https://www.youtube.com/watch?v=DIPxnt5vnhU) | Silica Gel 실리카겔 | UCXteMTpHAvyDP05G0QULuZA | 표시 |
| 실리카겔 live | [NO PAIN · qg40imnWXG8](https://www.youtube.com/watch?v=qg40imnWXG8) | Silica Gel 실리카겔 | UCXteMTpHAvyDP05G0QULuZA | 표시 |
| Ado MV | [うっせぇわ · Qp3b-RXtz4w](https://www.youtube.com/watch?v=Qp3b-RXtz4w) | Ado | UCln9P4Qm3-EAY4aiEPmRwEA | 표시 |
| Ado live | [THE FIRST TAKE · ujyJRxAKpVE](https://www.youtube.com/watch?v=ujyJRxAKpVE) | THE FIRST TAKE | UC9zY_E8mcAo_Oq772LEZq8Q | 표시 |
| MCR MV | [Welcome to the Black Parade · RRKJiM9Njr8](https://www.youtube.com/watch?v=RRKJiM9Njr8) | My Chemical Romance | UCCZGYab5SpD0I7Z5JqJZgww | 표시 |
| MCR live | [The Black Parade Is Dead! · Ud2eziOjjTo](https://www.youtube.com/watch?v=Ud2eziOjjTo) | My Chemical Romance | UCCZGYab5SpD0I7Z5JqJZgww | 표시 |

실리카겔과 MCR은 기존 MB YouTube 관계의 channel ID를 재확인했다. Ado는 [Universal 아티스트 페이지](https://www.universal-music.co.jp/ado/)의 공식 채널 링크 및 [공식 레이블 게시물](https://www.universal-music.co.jp/ado/news/2026-01-01/)의 정확한 FIRST TAKE 영상/채널 링크를 재확인했다. 이창섭은 판타지오 루트·도메인 변형·아티스트 경로 접근이 실패해 소속사↔두 채널의 독립 연결 근거를 이번에도 확보하지 못했다. 채널명·자체 설명만으로 승인하지 않는다.

표시 수(MV/live)는 이창섭 0/0, 실리카겔 2/1, Ado 1/1, MCR 1/1을 유지한다. 각 분류 최대 6개이며 YouTube 링크로 제공한다. 영상·썸네일의 복제/재배포 허가를 추론하지 않는다.

## 환경·브라우저·writer 계약

필수 환경 5종과 기존 runner endpoint/secret 모두 존재했다. VITE 공개 키는 `sb_publishable_` 형식이며 서버 키와 달랐다. 서버/공개 URL은 일치했고 공개 키의 catalog GET은 200, 같은 키의 비공개 후보 GET은 400으로 내용 반환이 거부됐다. 서버 키의 실제 bands/Storage 조회와 YouTube API 요청도 성공했다. 값은 보고서·소스·로그에 출력하지 않았다. 이번 실행 환경에서 확인한 사실이며 재사용 환경 설정의 편집 이력이나 과거 노출 키의 폐기 여부까지 확인한 것은 아니다. 키 생성·교체는 실행하지 않았다.

GitHub 원격 fetch/ls-remote, MB/Wikidata/한국어 Wikipedia/Commons API, 실제 이미지 4장, Universal/Shore Fire HTTP 접근은 성공했다. 판타지오/MCR 공식 사이트, YouTube 웹 페이지/i.ytimg.com 요청은 프록시 연결 단계에서 실패했다. Chromium 154는 실행됐으나 GitHub/Universal 이동에서 `ERR_CERT_AUTHORITY_INVALID`, 판타지오에서 `ERR_TUNNEL_CONNECTION_FAILED`였다. 인증서 검증을 끄지 않았다. 외부 페이지 브라우저 접근과 영상 재생은 검증 완료로 세지 않는다.

인증한 runner GET은 405였다. 원격 `public.service_checkpoint_artist_review`의 현재 함수 정의를 읽어 result의 허용 최상위 키가 `genre`/`channel`뿐임을 확인했다. channel은 기존 `service_save_artist_channel`을 사용하고 신원·버전·수동 결정·채널 잠금 보호가 있다. 소개/배너/영상 목록은 허용 계약에 없다. 변경 action(begin/claim/checkpoint 등)을 호출하지 않았다. 키가 있어도 상세 writer는 준비된 상태가 아니다.

Supabase changelog/문서 직접 HTTP 접근은 실패했다. 연결된 Supabase 문서 검색의 [private download 계약](https://supabase.com/docs/reference/javascript/file-buckets-download)을 확인하고 기존 SDK download 경로를 유지했다.

## 비공개 기록과 새 환경의 읽기

버킷 `concert-scheduler-state`, 경로:

`artist-profile-preparation/v1/runs/5054d095-437d-429f-8f33-7599d85b6bc3/bands/<band ID>/attempts/<attempt>.json.gz`

네 팀 attempt 1과 Ado attempt 2, 총 5건을 새 readAttempt로 실제 재읽었다. 모든 최상위 상태는 candidate, application.status는 not_attempted다. 이창섭 영상 보류와 Ado attempt 1 보류 → attempt 2 편집용 미리보기 판단, 원본 version/snapshot·근거·확인 시각·retry를 보존했다. 이번 조사에서는 새 원격 attempt 생성·기존 객체 수정·운영 상태 초기화를 하지 않았다.

로컬 ignored JSON에 다음 locator만 UTF-8로 작성하면 된다. 후보 내용을 새로 작성할 필요가 없다.

```json
{"runId":"5054d095-437d-429f-8f33-7599d85b6bc3","bandId":"1bb57d2e-eef1-419e-82c7-fe7e4dac7a55","attempt":2}
```

```sh
node --use-env-proxy scripts/artist-profile-state.mjs --read-attempt .local/artist-profile/read-locator.json > .local/artist-profile/readback.json
```

이 명령의 표준출력에는 비공개 후보 전체가 포함되므로 ignored 파일로 받아 로컬에서 확인한다. 키는 서버 환경으로만 전달한다. CLI의 실제 Ado attempt 2 결과가 최초 다운로드 JSON과 같음을 확인했다. `.local`·임시 스크립트는 Git 인계에 포함되지 않으므로 다음 채팅은 위 원격 읽기를 다시 수행한다.

## 검증·배포·운영의 구분과 남은 범위

구현 검증: 상태/키 경계 Node 5개, 미리보기 Vitest 6개, lint, build, diff check 통과. 새 상태 검사는 locator만으로 읽기, 읽기 전후 객체 불변, 경로 주입·다른 경로에 담긴 event·MBID/버전 불일치 거부를 다룬다. 기존 동시 중복 생성·내용 충돌·불확실한 응답 readback 검사도 통과했다. 빌드 산출물에서 실제 서버 키/runner secret/YouTube key 값과 미리보기 진입점·Ado 이미지·소개 revision marker가 없음을 확인했다. 전체 회귀 검사는 이번에 실행하지 않았다.

배포/운영: 원격 저장소 생성, SQL/함수/사이트 배포, 운영 콘텐츠 적용, 신규 아티스트/채널 생성, 검수 상태 변경은 실행하지 않았다. KOPIS 수집/공개·상태·lease·cooldown·알림·중지 예약도 변경하지 않았다.

남은 별도 범위:

1. 접근 가능한 공식 출처에서 이창섭 두 영상의 소속사↔채널/정확한 영상 교차 근거 확보.
2. Ado 삽화의 운영 서비스 재사용 범위 확인. 편집용 미리보기 허용을 운영 게시 승인으로 확대하지 않기.
3. Chromium CA/공식 사이트/YouTube 썸네일·실제 재생 접근 보완.
4. 상세 필드용 명시적 승인 이벤트, 필드별 이용 범위, 적용 직전 신원/버전 CAS, 수동 값 보호, 멱등 적용 receipt 계약 준비. 기존 채널 writer/workflow와 소유권을 맞추고 중복 writer를 만들지 않기.
5. 위 계약을 구현·격리 검증한 후 SQL/함수 배포와 운영 콘텐츠 반영을 각각 별도 범위로 검토. 예약 생성·반복 주기·운영 자동 게시 결정은 이번 작업 밖이다.
