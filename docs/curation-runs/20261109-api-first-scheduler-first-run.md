# 일반 API 예약 재개와 첫 실제 무알림 공개

아래 공개14건은 최초 실행 당시 수치다. 이후 [테스트/MCR 공개 목록 정리](20261109-catalog-test-data-cleanup.md)로 실제6건을 남겼다. 최신 관측과 정기 실행 미확인은 [로컬 인계](../release/local-ui-and-concert-dedup-handoff.md)에 구분했다.

2026-11-09 UTC. 사용자가 “예약 재개하고 바로 실행해서 확인해봐”로 일반 스케줄러 재개와 즉시 1회 실행을 승인했다. 기존 ChatGPT·아티스트·감시 예약 3개는 중지 상태 그대로다. 정상 경로는 AI·검수 계획 파일·외부 공지 조회·아티스트 writer를 호출하지 않는다.

## 재개와 실제 실행

- GitHub 연결 도구는 variable 변경·workflow dispatch를 제공하지 않아 기존 workflow 재개 설정을 정규 PR [#80](https://github.com/yeonguk0201/Concert_finder/pull/80)·[#81](https://github.com/yeonguk0201/Concert_finder/pull/81)로 반영했다. 기본 switch는 true, 명시적 repository false·durable paused/executing 보호는 유지한다. 단일 concurrency·source lease·최근1시간·HTTP400 cooldown 코드는 바꾸지 않았다.
- 두 PR 및 main CI 전체 통과. main `c7aeff8bc2ad057232f3454e5d6d6d2565df2b4d`, Vercel production `dpl_9Uz9MaYqdq2zSzatFBtMZ7HhiUvC` READY. 실행 코드/계약이 같아 기존 검사 결과를 재사용했고 YAML/diff/기존 permissions·environment·concurrency 보존을 확인했다.
- 실행 직전 v4 두 pin/정책/출처 설정 일치, active lease0·최근 KOPIS run이 1시간 이전·기존 nextAttemptAt 경과를 확인했다. 지원 Storage client로 동일한 원본 파일 묶음의 paused generation1→idle generation2만 기록·재확인했다.
- main push의 [실제 Actions run 42620744328](https://github.com/yeonguk0201/Concert_finder/actions/runs/42620744328), job129171924382가 성공했다. 기존 `node --use-env-proxy scripts/collect-concerts-scheduled.mjs`가 source lease 하나로 한 회차 실행됐다. 추가 source begin/재수집/공개 재시도는 하지 않았다.
- 같은 DB run **cc96d47e-7147-469a-96a9-cbd31747b503**, 12:53:51.376127Z 시작→12:56:39.893888Z 완료, attempts1, state **partial**, candidate_count5 / published_count5 / review_count0. 공개 결정 5건 모두 `VERIFIED_NEW_EVENT`다.

## 실제 공개·무알림 receipt

이번에 공개한 다섯 ID 모두 실행 전 공개9개 목록에 없었다. 실제 site/API 공개 수는 **9→14개**다. 각 공연의 KOPIS source1개, 모든 band의 현재 승인/신원 연결, 실제 회차1개, ticket행, 공개 snapshot history1개와 publication change를 확인했다. 모든 change의 initial_import=true, 같은 change_id 또는 ticket_schedule_id에 연결된 notification_deliveries/notification_attempts 각각0이다. 중복 source0, 종료 후 active lease0이다. 개인행·endpoint·token은 조회/출력하지 않았다.

| 실제 공연 | 날짜/회차(KST) | 승인 band 연결 | 공개 ID | delivery / attempt |
| --- | --- | --- | --- | --- |
| V.O.S 전국투어 콘서트: 제2회 동창회 [부산] | 2026-12-20 18:00 | 3/3 | `0b3fa5af-5024-4234-9616-0e1a8b76a1d0` | 0 / 0 |
| 신해경 단독 콘서트: 나의 가역반응 사가 [부산] | 2026-11-21 18:00 | 1/1 | `3ecb95d5-f3b3-420b-b575-7f48e634317a` | 0 / 0 |
| 신해경 단독 콘서트: 나의 가역반응 사가 [서울] | 2026-11-15 17:00 | 1/1 | `1ddf647a-b13f-43a0-ad61-7f44d1f18907` | 0 / 0 |
| V.O.S 전국투어 콘서트: 제2회 동창회 [성남] | 2026-11-29 17:00 | 3/3 | `511e01ab-7994-49a8-9aa9-60228e3dea70` | 0 / 0 |
| 소란스런 가을밤 [인천] | 2026-11-27 19:30 | 1/1 | `4bf84629-d935-480e-aa01-fc2fa245996b` | 0 / 0 |

익명 API로 같은 다섯 ID의 published 상태·source/band/session/ticket/announcement를 재조회해 일치를 확인했다. 발표일/발표 시각/일반예매 시각은 다섯 공연 모두 **null**, announcement_verified=false로 남아 있다. KOPIS가 제공하지 않은 값을 날짜/자정/업데이트일로 만들지 않았다. v4의 필수 공연 사실 공개이며, 공지/예매 사실까지 별도로 검증 완료했다고 세지 않는다. 외부 공지 본문·포스터·이미지·로고나 NOL/YES24 상품 딥링크를 취득/공개하지 않았다.

## 보류·실패·상태 구분

- 클라이언트 보류 **94건**은 실제 공개5건 및 DB review_count0과 구분한다. 기존 수동/검수 사실 보호 등이 포함될 수 있다. 현재 영속 결과에는 보류 세부 사유별 목록이 없어 원인별 확정 집계나 수동 검수 완료로 쓰지 않는다.
- 현재 source 실패는 **1건**, KOPIS PF303833 `KOPIS event fields missing`이다. 정확히 어느 필드가 빠졌는지는 이 고정 오류만으로 확정하지 않는다. 추가 즉시 요청을 하지 않았으며 정상 provider 슬롯의 다음 관측 대상으로 남긴다.
- latest의 failed=true는 이 partial 결과와 일치한다. 다만 failureCount12/deferredCandidates12는 이전 raw checkpoint에서 보존된 필드이므로 **이번 실패 수로 세지 않는다**. 이번 실패1은 같은 DB run에서 별도로 대조했다. 이는 향후 상태 표시 정리 시 보존/현재 필드를 구분할 항목이다.
- 현재 source nextAttemptAt **2026-11-09T13:56:40.262Z / 22:56:40.262 KST**. 매시23분 UTC cron이므로 명목 예정 시각대로라면 다음13:23Z/22:23KST tick은 cooldown으로 skip하고, 첫 수집 가능한 정기 tick은14:23Z/**23:23KST**다. GitHub의 실제 시작 지연·새 lease/정책 변경 가능성은 남는다. 즉시 추가 수집이나 같은 미변경 보류의 새 성과 집계를 하지 않는다.

## 원본·활성 상태 보존

원래 로컬 네 파일은 폐기하지 않은 이관 전 snapshot으로 SHA를 모두 유지했다. active owner는 GitHub/private Storage이며 활성 latest.json만 새 DB run으로 갱신됐다. 원래 baseline·고정 14개 목록·보류·알림 지문이 들어 있는 review-checkpoint/review-batch-current/schedule-observation의 세 SHA는 원격 활성 묶음에서도 그대로다. 새 batch를 만들거나 수동 검수 완료로 덮어쓰지 않았다.

| 활성 파일 | 실행 전 SHA256 | 실행 후 SHA256 |
| --- | --- | --- |
| `latest.json` | `36cae7de7f911495f66c594c7306698125967d84473bcf872e8a0c9ec811e882` | `fd5430c132044f802567fa03ebe82b660b3c8fca4923573ab60ec764088959ae` |
| `review-checkpoint.json` | `d6edd2ba62ad44f23e93a1455c8b0d33cc83aa61dbe0e863c92685c42b5c5d6e` | `d6edd2ba62ad44f23e93a1455c8b0d33cc83aa61dbe0e863c92685c42b5c5d6e` |
| `review-batch-current.json` | `73eb8bcf2e51665422b78f84d4bec0bbd8b33170b2c575b1cb40b065b0e40d86` | `73eb8bcf2e51665422b78f84d4bec0bbd8b33170b2c575b1cb40b065b0e40d86` |
| `schedule-observation.json` | `4be58381d5142014d84cca8138be060fcd99549b7449e95f2d9d325a7b033282` | `4be58381d5142014d84cca8138be060fcd99549b7449e95f2d9d325a7b033282` |

활성 state는 idle generation4, SHA `02b04f48219d564f9692e20fdc5cdfdfd185ed1af1a273983b5242725bcb69aa`다. executing intent generation3을 먼저 저장하고 완료 후 같은 run의 latest를 저장·읽기 확인했다. 초기 원본과 journal은 비공개로 보존했다. KOPIS만 ON/live_after=null, 다른 source 공개 OFF·YES24 OFF·NOL/Reissue 자동 취득 OFF를 유지했다.

이번에는 **최초 실제 일반 스케줄러의 API 검증→공개→익명 조회→무알림 확인**까지 완료했다. 설치/CI 성공만으로 주장한 결과가 아니다. 다음 정기 회차의 지속 실행 관측은 아직 없으며 예약은 활성 상태로 남긴다. source 필수 사실 미확인·수동 차단·기존 근거 충돌이 있는 모든 공연의 전체 검수 완료나 앞으로의 무실패 운영을 보장하지 않는다.
