# 공연 운영 읽기 전용 감시 — 2026-10-26 03:28:17 KST

**이전 점검에서 관측한 KOPIS 후보9건의 DB 아티스트 참조가 다시 비어 있다.** 신해경 서울·부산2건을 포함한9건 모두 revision4→5, 현재 artist_keys/band_ids0, previous_payload에는 이전 MB key가 남아 있다. 기존 추적50건도 여전히 비어 있어 누적 미복구 공백59건이다. rolling previous_payload 비교는34건이며 누적59건과 혼동하지 않는다. KOPIS817건 중 artist_keys 없음799→808.

새 공백9건: 주현미 크리스마스 디너쇼, 로맨틱 펀치 단독 공연: 116번째 로맨틱 파티 [서울], Awesome Stage X FTISLAND: FaTe PE, 최인경 단독 콘서트: 오늘도 너에게, 신해경 단독 콘서트: 나의 가역반응 사가 [부산], 여운, 그리고 함께 [공주], 코리아 반도네온 페스티벌, 주현미, 가요백년을 노래하다 [의령], 신해경 단독 콘서트: 나의 가역반응 사가 [서울]. 신해경 개인은 현재 approved/동일MB publication 승인이 유지됨을 실제 다시 읽었지만 공연 후보2건의 참조는0이다. 아티스트 승인만으로 후보 연결이 자동 보존되지 않은 관측이다. 원래 연결 정당성·정확한 삭제 시각·변경 생산자·원인은 이 관측만으로 확정하지 않았다. fetched_at은 후보 재조회 시각이며 링크 삭제 시각으로 단정하지 않는다. 자동/수동 복원0.

| 출처 | 최신 실제 lifecycle (UTC) | 후보/공개/검수 | 실패 |
| --- | --- | --- | --- |
| kopis | 2026-10-25T17:51:44.610317+00:00 partial | 99/0/99 | 1 |
| ualive | 2026-10-25T16:13:05.408196+00:00 success | 1/0/1 | 0 |
| mintpaper | 2026-10-25T16:13:14.020529+00:00 success | 1/0/1 | 0 |
| radwimps | 2026-10-25T16:13:30.109191+00:00 success | 2/0/2 | 0 |
| yes24 | 2026-10-14T10:11:39.417905+00:00 partial | 0/0/0 | 45 |

KOPIS는 직전 관측 이후14:43→14:46Z와16:13→16:16Z 성공2회 뒤17:48→17:51Z partial99/실패1이다. 안전한 SQL prefix 추출로 PF303833의 KOPIS event fields missing을 확인했고 해당 후보는 여전히0건이다. 기존 개별 필수값 오류의 재발이며 API 키 실패나 출처 전체 장애로 확대하지 않는다. GitHub 정기 run40210562828는16:12:21→16:16:33Z success, 서버코드9aa7f1a. 최근5회success이며 연속 실패가 아니다. 선언 cron17 * * * *와 실제 최근 시작 간격17481초를 기록하되 운영 기준 없는 누락 횟수/실패 임계값은 만들지 않았다. 유효 source lease0, started_at 없는 legacy 결과를 중복 lifecycle로 세지 않음.

모든 source publication OFF/live_after null, YES24 collection OFF, 수동 차단1건을 보존한다. source별 최신 후보 표본의 발표/일반·선예매/국가/회차 필수값 fail, 이용조건·실제 전수 중복/취소/중요변경·동의/기기 조건 unverified, 수동 보호 pass와 기존 격리 fixture 초기무알림 pass를 구분해 보존했다. NOT_READY이며 publication OFF 승인만 남은 상태가 아니다.

요네즈 후보revision5/pending, 국가null·artist_keys/band_ids/sessions0·발표/일반·선예매 시각 미완성, 아티스트 등록0·공개 공연0이다. 이전 KR→null 통지는 반복하지 않는다. [Reissue](https://reissuerecords.net/2026/10/22/kenshi-yonezu-2026-2027-world-tour-ghost/) HTTP200/Seoul·INSPIRE, [NOL](https://nol.yanolja.com/ticket/products/26015024) robots허용/상품HTTP200·기간2027.01.14~01.17·휠체어석/전화 문구를 실제 읽었다. 업데이트 날짜를 최초 발표, 상품 기간을 매일 회차, 휠체어석 전화 시각을 일반예매로 확정하지 않았다. 일반/선예매 절대시각과 NOL 서면허가는 미확정이다.

현재 MCR approved/MB 승인, RADWIMPS unreviewed/MB미승인, 강진·진성 excluded/MB미승인을 실제 읽었다. globalMcrKeyApproved는 전체 mcr key의 승인 존재만 뜻하며 다른 아티스트의 승인이 아니다. 알림 cron active/매분, 최근5회 succeeded·HTTP200 및 claimed/sent/failed0. 대상없음이며 신규 발송·실제 기기 수신 완료가 아니다. 과거 sent36/invalidated7 유지. 개인 사용자행·endpoint/키·Vault·cron command 읽기0.

환경 current/running·network enforced/restricted·바인딩ready 및 실제 metadata/SELECT·외부 읽기를 확인했다. HEAD7ca8570, f267be1/fd45938 포함, 복구 checkout/.local 연속성 확인. queue2730/cloud/active null/transfer null SHA a3edd6412b55b10f0486fafdd8fb7b07b774cac17b549806e382280fbd330fec 전후 불변. Last.fm0, 아티스트 queue명령0.

scripts/tests는323d5a5 이후 동일함을 실제 확인해 기존 격리 fixture6파일 결과를 재사용했다. 새 테스트/lint/build0. 새 공백9·기존50/누적59 readback·집계·UTF-8/JSON·fingerprint/마지막 통지·queue SHA·변경 범위/git diff --check 검증. DB/RPC 쓰기·신규/별칭·수집/발송 재실행·공개ON·예약/Cron/스키마/권한·배포·push/PR/merge0, 원문 HTML/API이미지/토큰/개인정보 저장0.

새 fingerprint `cc73c07abb7abb4e7e9afbab1d651b9862918ed013a07c65764e3e6b4f7995f4`와 새 통지 항목을 .local latest에 영속화했다. 상세 [JSON](20261026-032817-concert-operations.json).
