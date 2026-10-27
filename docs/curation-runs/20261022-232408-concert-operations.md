# 공연 운영·자동 공개 출시 전 점검 — 2026-10-22 23:24 KST

이전 감시 체크포인트(19:26 KST)를 읽고 같은 프로젝트·현재 환경에서 운영 DB를 읽기 전용으로 대조했다. 아티스트 등록/검수, 실제 공연 후보 수집은 별도 Codex 예약이며 이 감시는 수집 재실행·공개 ON·발송·queue·예약 설정을 변경하지 않았다. 이전 문서의 예약 두 개 설명을 현재 구조로 간주하지 않았다.

## 새 변화

- 요네즈 켄시 내한공연이 KOPIS 후보 `647835a8-7bed-4ef8-94c8-d7123c558e63`으로 들어왔다. 출처 PF304185, fetchedAt=2026-10-22 22:48 KST, pending/revision=1/수동 차단=false다. 이전 후보 없음에서 발견 단계가 진전됐다.
- KOPIS는 이전 실패 뒤 20:35·21:47 KST 실행에서 각각 후보 100건/실패 0, 최신 22:45 KST 실행에서는 후보 85건/세부 실패 1건/검수 85건/공개 0이다. 전체 수집 복구는 확인했지만 세부 실패까지 해소된 것은 아니다.
- GitHub의 최신 22:45 KST workflow는 failure이며 개별 출처는 UALIVE/Mintpaper/RADWIMPS success, KOPIS partial이다. workflow 전체 실패와 모든 출처 수집 실패를 구분했다. KOPIS의 별도 시각 실행은 관측되나 공유 run 행만으로 어떤 실행기에서 왔는지 확정하지 않는다. 당시 source lease는 0이며 다른 채팅 코드가 자동 전달됐다고 가정하지 않았다.

## 요네즈 켄시 실제 공개 요건

| 조건 | 결과 | 남은 내용 |
| --- | --- | --- |
| 공식 상품·장소·날짜 대조 | pass | NOL 상품 26015024와 KOPIS 연결 상품·장소·기간 일치 |
| 아티스트 승인·신원 | fail | 아티스트 DB 일치 행 없음, artist_keys 빈 배열, 미연결 출연진 |
| 공식 발표 | fail | 후보 announced_on/at=null, announcement_verified=false |
| 일반 예매 절대 시각 | fail | NOL에서 2026-10-22 12:00 KST 재확인했지만 후보 ticket.opens_at=null |
| 선예매 | unverified | 공식 존재·시각 미확인, 임의 생성하지 않음 |
| 개별 회차 | fail | NOL에 2027-01-14 19:30, 01-16/17 19:00 KST 명시됐지만 후보 sessions 빈 배열 |
| 중복·취소·중요 변경 | unverified | 제목 일치 공연은 없으나 완전한 신원 기반 충돌·현재 취소 여부 검증 미완료 |
| 수동 차단 보호 | pass | 후보 차단=false 확인, 기존 publication OFF 유지 |
| 초기 채움 무알림 | pass | 후보 initial_import=true, 서버 guard 및 로컬 fixture 확인 |
| 실제 발송 대상 조건 | unverified | 로컬 동의·찜·저장·취소 테스트는 통과했지만 실제 연결 공연/발송 대상 미확인 |
| NOL 이용·외부 허가 | unverified | 공개 페이지 조회와 코드 테스트만으로 서면 허가/이용 범위를 확정하지 않음 |

따라서 **NOT_READY**다. publication OFF 승인만 남은 상태가 아니므로 `READY_FOR_PUBLICATION_APPROVAL`로 보고하지 않는다. 후보의 실제 미완료 필드를 외부에서 읽은 근거로 자동 보완하거나 DB를 변경하지 않았다. Reissue 최신 읽기는 실패했으므로 이전 확인 근거만 보존하고 새 확인 시각/완료로 바꾸지 않았다.

## 출처별 준비 상태

KOPIS/UALIVE/Mintpaper/RADWIMPS/YES24의 최신 후보 표본에는 발표·국가·아티스트 연결/승인·파서 검토 등의 조건이 남아 fail이다. 이는 각 출처 전체 후보를 전수 조사했다는 뜻이 아니다. Reissue/NOL은 정책 등록이 없고 운영 어댑터가 현재 checkout에 연결되지 않아 전체 준비 상태 unverified다. 세부 pass/fail/unverified와 남은 조건은 JSON sourceReadiness에 저장했다. 권리·이용 범위·출처 표시 등 외부 확인은 로컬 코드 테스트와 별도다.

## 알림과 검증

매분 워커 active, 최근 Cron 5회 succeeded, 워커 형태 HTTP 응답 5건 200/timeout=false/claimed=sent=failed=0이다. 과거 sent=36/invalidated=7이며 새로운 실제 발송이나 기기 수신을 의미하지 않는다. 사용자/기기 행·토큰·Vault·Cron command를 읽지 않았다. HTTP 응답은 형태·시각으로 확인했으며 정확한 request ID 연결은 하지 않았다.

이번에 실제 실행한 격리/모의 테스트는 총 33개 통과했다: collection/KOPIS/NOL/알림 DB 27개, 후보 ingestion/모의 발송 worker 4개, 공개·lease·중복·수동 override·초기 무알림 2개. PGlite와 mock만 사용해 운영 DB/실기기 발송에 영향이 없다. 코드가 바뀌지 않은 테스트를 무작정 반복하지 않았으며 실제 배포와 동일하거나 운영 발송이 검증됐다고 주장하지 않는다.

`.local/concert-operations/latest.json`에 최신 상태·안정적인 차단 fingerprint·마지막 통지를 보존했다. 기존 공개 OFF·미지원·인증 문제는 같은 내용으로 반복 통지하지 않는다. 원본 HTML/API 원문/이미지/비밀/개인정보를 저장하지 않았다. 문서/결과만 로컬 커밋하며 push/PR/merge/배포·운영 쓰기는 수행하지 않았다.
