# 로컬 UI·공연 중복 작업 인계

2026-11-10 KST. 사용자는 UI와 공연 중복 문제를 로컬에서 이어가고, 클라우드의 미공유 변경을 PR로 받기로 했다. 이 문서는 운영 상태를 복제하거나 예약·DB를 다시 설정하는 실행 지시가 아니다.

## 먼저 가져올 코드

기능은 PR [#77](https://github.com/yeonguk0201/Concert_finder/pull/77)·[#78](https://github.com/yeonguk0201/Concert_finder/pull/78)·[#79](https://github.com/yeonguk0201/Concert_finder/pull/79)·[#80](https://github.com/yeonguk0201/Concert_finder/pull/80)·[#81](https://github.com/yeonguk0201/Concert_finder/pull/81)에 반영됐다. 이 인계 작성 시 dev는 `09051b1558081a159fb9409dc165a58e5c6fad0b`, main은 `c7aeff8bc2ad057232f3454e5d6d6d2565df2b4d`이며 두 tree는 `a23966aec4a42a04d7d37335c9f9e01f8e9915d9`로 같다. 이후 변경은 로컬 작업 시작 시 실제 원격 ref와 다시 대조한다.

원래 클라우드 런타임 브랜치 전체를 로컬 UI 코드에 덮어쓰지 않는다. 그 브랜치는 원본 상태 보존용 후속/역사가 있어 원격 dev와 다르다. 이번 공유 범위는 인계·운영 검증 기록이며 미병합 UI/중복 수정 코드는 없다. 로컬의 기존 미커밋 작업을 보존하고, 저장소의 dev 기반 feature branch/PR 절차로 이어간다.

## 완료한 결과와 현재 남은 확인

- 일반 Node 경로가 KOPIS API→필수 공연 사실·실제 회차·전 출연진의 기존 승인 신원 검증→같은 source lease/completion→무알림 공개까지 실제 성공했다. 정상 경로에는 AI 검색·검수 계획 파일·외부 공지 취득·아티스트 writer가 없다.
- 최초 실제 DB run `cc96d47e-7147-469a-96a9-cbd31747b503`: 2026-11-09 21:53:51~21:56:39 KST, 신규5건 공개, client hold94건, 필수 필드 누락1건, state partial. 각 신규 공연의 익명 읽기·initial_import=true·연결 delivery/attempt 각각0·source 중복0을 확인했다. 자세한 증거는 [첫 실행 기록](../curation-runs/20261109-api-first-scheduler-first-run.md)에 있다.
- 이후 사용자 요청으로 테스트6건+MCR1건을 withdrawn, 세쿠/SURL 출연진 불일치1건을 review로 돌렸다. 물리적 cascade 삭제가 아니며 저장 일정·감사/발송 이력은 유지했다. [정리 기록](../curation-runs/20261109-catalog-test-data-cleanup.md)과 고정 ID를 대조한다. 이 행들을 일반 공개 목록에 되살리지 않는다.
- 2026-11-10 **00:35 KST** DB 읽기: published6건, 공개 테스트 출처0, active KOPIS lease0, KOPIS collection/publication ON·live_after=null. 실제 공연은 요네즈1건+위 API5건이다.
- **정기 트리거 후속 실행은 미확인이다.** 같은 시각 Actions/DB 조회에 첫 main push 실행 이후의 새 KOPIS run이 없었다. cron 설정/첫 성공을 지속 무인 운영 검증으로 세지 않는다. GitHub schedule 이벤트가 도는지 읽기 전용으로 확인하고, 부재의 원인을 조사할 항목이 남아 있다. 실패 원인을 아직 GitHub 지연·비활성 등 특정 원인으로 확정하지 않았다.
- 기존 ChatGPT 수집·아티스트·감시 예약3개는 중지 유지한다. 이 버튼을 다시 켜서 일반 GitHub 예약 문제를 대신 해결하지 않는다. UI 작업이나 이 문서를 읽는 것만으로 어떤 예약도 켜거나 끄지 않는다.

## 실제 공개 6건과 중복 판단 기준

| 공연 | 날짜(KST) | 공개 ID |
| --- | --- | --- |
| 요네즈 켄시 내한공연 | 2027-01-14·16·17 (15일 회차 없음) | `9f749b53-fd15-4fb8-bfb8-9fe0d2055946` |
| 신해경 나의 가역반응 사가 서울 | 2026-11-15 | `1ddf647a-b13f-43a0-ad61-7f44d1f18907` |
| 신해경 나의 가역반응 사가 부산 | 2026-11-21 | `3ecb95d5-f3b3-420b-b575-7f48e634317a` |
| 소란스런 가을밤 인천 | 2026-11-27 | `4bf84629-d935-480e-aa01-fc2fa245996b` |
| V.O.S 제2회 동창회 성남 | 2026-11-29 | `511e01ab-7994-49a8-9aa9-60228e3dea70` |
| V.O.S 제2회 동창회 부산 | 2026-12-20 | `0b3fa5af-5024-4234-9616-0e1a8b76a1d0` |

같은 아티스트의 서울/부산·성남/부산 공연은 서로 다른 도시·날짜의 실제 공연이다. 비슷한 제목·같은 출연진만으로 병합/삭제하지 않는다. 요네즈의 세 날짜는 현재 한 공연의 세 회차다. V.O.S 한 공연에 연결된 세 출연진을 각각 별도 공연으로 복제하지 않는다.

중복 문제는 UI 반복 렌더링, 같은 공연의 여러 회차, 도시별 투어 공연, 여러 출처가 가리키는 같은 공연, 실제 중복 DB행을 먼저 구분한다. source URL/제공처 공연 ID·장소·날짜·개별 회차·전체 lineup 및 기존 concert/source 연결을 대조한다. 현재 관측한 신규5건의 중복 source는0이었다. 이것이 모든 후보 간 중복 부재를 인증하는 것은 아니다.

실제 병합이 필요하면 저장 일정/FK·공개 change/history·알림 지문·candidate revision/hash와 수동 결정을 함께 보존하는 지원 경로를 검토한다. 기존 가능 중복/중요 변경 보류·CAS·lease를 제거하거나 공연명을 비슷하게 맞춰 통과시키지 않는다. 기존 상태를 초기화하거나 대량 삭제 SQL로 중복을 해결하지 않는다.

## UI에서 보존할 동작

새 API5건의 발표일/발표 시각/일반예매 시각은 모두 null·announcement_verified=false다. ‘발표일 미확인’·‘예매 시작 시각 미확인’ 표시를 유지하고 임의 날짜/자정을 만들지 않는다. 시각 없는 예매 일정 저장/캘린더·푸시 예약을 확정하지 않는다. 요네즈는 기존 검수된 발표일과 일반예매 근거를 유지한다.

공개 UI는 published와 현재 승인 catalog를 사용한다. withdrawn/review 및 과거 테스트 출처를 다시 노출하지 않는다. `src/data.ts` 등의 개발 preview fixture는 실제 공연 근거가 아니며 연결된 운영 catalog의 대체 데이터로 사용하지 않는다. 익명 목록·직접 ID 조회·관련 자식 정보 노출, desktop/mobile·가로 넘침·runtime error를 변경에 맞게 확인한다.

## 환경·운영 계약을 자동 복제하지 않기

- UI 로컬 작업은 기존 공개용 VITE 설정을 사용하고 service role/서버 시크릿을 브라우저나 Git에 넣지 않는다. 클라우드의 secret binding·ignored `.local` 파일은 commit/pull로 전달되지 않는다.
- active owner는 GitHub Actions와 비공개 Storage이며, 원래 클라우드의 네 파일은 이관 전 snapshot으로 보존돼 있다. 로컬에 checkpoint가 없다고 새로 만들거나 과거 packet/queue를 재생하지 않는다. 영속 state·journal·baseline·고정14개 목록·통지 지문은 이번 PR에 없다.
- v4 운영 연결은 [설치 기록](../curation-runs/20261109-api-first-runtime-release.md)을 참조한다. 검토 원본 SQL 파일 버전 `20261109084718`과 실제 적용 이력 `20261109123447 / api_first_silent_publication`은 다르며 SQL SHA가 기록돼 있다. 이미 적용된 SQL 재실행·전체 db push·추측성 history repair를 하지 않는다.
- 실제 검토 pin은 executor `ae38470098f40cb3aec9582172c0b9c4`, API facts `3c356e529b6e1dc2fe04041c64a3248d`다. UI만 바꾸면 운영 함수/권한을 건드릴 이유가 없다. 서버의 중복/사실 판정을 바꾸면 격리 검증과 정규 릴리스에서 계약·pin을 함께 검토해야 한다. 조회값을 자동 승인하거나 guard를 해제하지 않는다.
- KOPIS 사실/출처 링크 허용 범위를 유지한다. NOL/Reissue 자동 취득·상품 딥링크와 YES24 OFF, 다른 source 공개 OFF, 알림 live_after=null을 보존한다. 아티스트/별칭/승인·관련 queue·알림 claim/send/test는 UI/중복 작업에 포함하지 않는다.

## 후속 작업 목록

1. UI/중복 문제의 실제 재현과 원인 분류; 정상 투어/회차를 보존하는 수정.
2. 시간 기반 schedule의 후속 실행 여부와 부재 원인 조사. 수동 push/추가 수집을 정기 실행의 증거로 바꾸지 않기.
3. client hold94건의 사유별 영속 기록과 상태 표시 정리. latest의 failureCount12/deferredCandidates12는 이전 raw 결과에서 보존된 필드이며 이번 실제 source 실패는1건이다. 과거 수치를 이번 성과/실패로 세지 않는다.

위 목록은 남은 과제를 공유한 것이며 이번 문서 PR에서 UI·중복 로직·정기 트리거를 수정하거나 운영을 추가 실행하지 않았다.
