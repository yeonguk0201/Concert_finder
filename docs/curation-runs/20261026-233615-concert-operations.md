# 공연 운영 읽기 전용 감시 M22 — 2026-10-26 23:36:15 KST

현재 복구 checkout HEAD e41a972와 f267be1/fd45938 포함, UTF-8 지침·복구 기록·M21 latest/fingerprint/마지막 통지의 연속성을 확인했다. 환경 current/running, restricted network enforced, 바인딩 ready와 실제 DB SELECT 성공을 구분했다. 운영 DB/RPC 쓰기 및 아티스트 queue 변경 없음.

## 새 변화

- GitHub 예약 실행 [40326222813](https://github.com/yeonguk0201/Concert_finder/actions/runs/40326222813)이 수집·업로드 단계 실패로 종료했다(12:55:00→12:59:13 UTC). 직전40278117655는 성공이므로 연속 실패로 표현하지 않는다. 배포 head9aa7f1a는 동일하다. 실제 시작은 선언된 매시17분과 다르지만 임의 지연 임계값이나 재실행으로 판정/해결하지 않았다.
- 같은 시간대 KOPIS12:56:04→12:59:08 UTC 실행은 후보/검수96, 공개0, 오류 기록4의 partial. PF303084/PF303093/PF303095에서 각각 HTTP400, 네 번째는 반복 상세 실패로 남은 요청 중단이라는 정확한 오류 상수와 일치했다. 오류4를 독립 공연4건의 실패로 세지 않는다. 10:52 및12:50의 별도KOPIS 실행은 각각100 성공했다. 제공처 요청·수집·재전송을 추가하지 않았으며 원인까지 인증 실패로 확정하지 않는다.
- 후보 `4e866dbd-cab6-4d3b-8497-b8f31aab9a0c` **부평아트센터 브런치콘서트, 작가의 재즈 (11월)** revision9에 새로2개의 artist key/band 참조가 나타났다. 김영하/최인환은 실제 DB 재조회에서 둘 다 unreviewed/publication approval=false다. 국가 KR은 후보에 저장돼 있으나 발표·정확 일반/선예매·회차가 미완료이므로 공연 공개 완료로 세지 않는다.
- 알려진64후보의 참조 상태는 동일하며61건이 비어 있다. rolling15→14는 V.O.S 대구·경산 후보의 previous_payload가 다시 덮여 한 단계 과거 연결 증거가 현재 행에서 사라진 영향이다. 현재 key/band0/0이므로 복구 성과가 아니다. 지난15행 증거를 보존했다. The entry to Jazz의 rev10 참조 없음도 미변경이며 재통지하지 않는다.

## 출처별 최신 운영 기록

| 출처 | 최신 상태 | 후보 | 공개 | 검수 | 오류 기록 |
| --- | --- | ---: | ---: | ---: | ---: |
| kopis | partial | 96 | 0 | 96 | 4 |
| mintpaper | success | 1 | 0 | 1 | 0 |
| radwimps | success | 2 | 0 | 2 | 0 |
| ualive | success | 1 | 0 | 1 | 0 |
| yes24 | partial | 0 | 0 | 0 | 45 |

YES24는 collection OFF이므로 과거 partial을 현재 실행 실패로 재통지하지 않는다. 모든 source publication OFF/live_after=null, 현재 유효 collection lease0. 실행 시각만으로 GitHub 외 별도 KOPIS 수집기의 생산 주체나 다른 채팅 코드 전달을 가정하지 않았다.

## 공개·발송과 요네즈

- KOPIS819후보 중 artist key 없음801, sessions/발표/일반예매 시각 없음 각각819. 나머지 출처에도 실제 필수 필드 누락이 있어 모두 fail/미확인 조건을 보존했고 **NOT_READY**다. OFF 승인만 남은 상태가 아니므로 READY_FOR_PUBLICATION_APPROVAL를 보고하지 않는다. 수동 blocked1 보존. 취소/중복/중요 변경·실제 동의/기기 권한은 전체 운영 데이터 검증 완료가 아니다.
- 요네즈 아티스트0, 기존 후보rev6의 신원·아티스트·정확 발표/예매·회차 연결은 미완료다. PF303833도 현재 후보에 없다. 과거 KOPIS_EVENT_FIELDS_MISSING이 고쳐졌다고 주장하지 않는다.
- Reissue 공식 페이지와 NOL robots/상품은 현재 HTTP200. robots 허용은 서면 이용허가가 아니다. NOL 서면 허가 없음. Reissue 업데이트 날짜를 최초 발표로, 휠체어 전화예매 시각을 일반예매로, 상품 기간을 매일 회차나 한국 공연 신원으로 사용하지 않는다. 일반/선예매 절대시각은 unverified 유지.
- 기존 encore-notification-delivery active/매분, 최근5회 succeeded. 해당 응답 형식의 최근 HTTP200에 claimed/sent/failed0이며 새 대상 없음이다. 과거 sent36/invalidated7 그대로이며 이번 발송 성공·실제 기기 수신 완료를 뜻하지 않는다. cron command/Vault/개인 사용자·구독키·endpoint 미조회.

## 보존·검증

- 읽은 실제 collection_runs/policies/candidates/lease 정의와 제한된 cron/실행 이력·비식별 발송 집계를 사용했다. 후보에 연결된 아티스트28팀의 상태를 현재 재조회했다. 요네즈/기존 OFF/이용허가/미지원 차단은 같은 fingerprint 의미로 보존하고 새 실패·참조 변화만 마지막 통지에 기록한다.
- Last.fm 연결 확인만1회 HTTP200/API 성공·정확 MBID를 확인했다. 지표·차트 발굴/재수집과 캐시 checkedAt 갱신0. 공연 연결·공개·발송 완료 증거로 세지 않는다.
- 새 테스트 실행0. M21 collection-artist-links 및 M18의 NOL/worker 격리 fixture 통과 기록3파일을 재사용했다. `git diff --quiet f74ac31 -- scripts tests` exit0으로 검증된 코드 불변 확인. 이를 운영 배포/다른 채팅 실행기·실제 후보 복구·이용허가 완료로 확대하지 않는다.
- queueId `db6258b5-7ac7-47dd-88b3-dbe0f72d75ef`, owner cloud, revision3156, active=null/transfer=null, SHA before/after `9e9c0b0af479a2172d5fd5aa27607bc8c95f61eee52b3072d34fc852ff87fb2d` 동일. 환경/스테이트 초기화·과거 인계 수락·수동조작 없음.
- UTF-8/JSON·현재/이전 비교·비밀/원문 제외·git diff 검사로 결과 문서만 검증했다. 로컬 기록만 저장·커밋하며 예약/수집/알림/공개/운영 DDL/배포/push/PR/merge 변경 없음.
