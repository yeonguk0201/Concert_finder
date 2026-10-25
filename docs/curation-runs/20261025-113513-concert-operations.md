# 공연 운영 읽기 전용 감시 — 2026-10-25 11:35:13 KST

직전 실패 뒤 **GitHub 정기 수집 최근2회 성공**, KOPIS 최근4회 후보100/검수100/실패0/공개0을 확인했다. GitHub 최신 run40149391529는 2026-10-25 10:07:33~10:11:58 KST 성공이다. 이전 실패 run40131151065와 구분한다. 다만 `PF303833` 후보는 여전히0이며, 후속 슬롯에서 해당 공연을 다시 처리했는지는 미확정이다. 전체 실행 성공을 개별 오류 해소로 세지 않는다.

| 출처 | 최신 상태 | 후보/공개/검수 | 실패 수 |
| --- | --- | --- | --- |
| KOPIS | success | 100/0/100 | 0 |
| ualive | success | 1/0/1 | 0 |
| mintpaper | success | 1/0/1 | 0 |
| radwimps | success | 2/0/2 | 0 |
| YES24 | 과거 partial, 현재 수집 OFF | 0/0/0 | 45 (10월14일 이력) |

- 선언 일정 매시17분과 최근 GitHub 시작 간격117분29초의 차이를 보존한다. 실제 지연 원인/새 임계값을 만들지 않았다. 현재 유효 source lease0이며 다른 채팅 실행기를 수정하거나 실행하지 않았다. 최신 GitHub 코드9aa7f1a 유지다.
- KOPIS 연결 공백 **4건 추가 관측, 이력상 미복구36→40건**이다. 새 관측은 김장훈 부산/시인과촌장45주년 대구/정동환의 어쿠스틱 룸/이창섭 대구다. 기존36건도 전부 현재 artist_keys·band_ids0으로 재조회했다. rolling 비교15건 및 전체 no-key801→799/817을 기존 공백 해소로 해석하지 않는다. 원래 연결의 정확성·발생 시각·생산자는 미확정이다.
- 기존 알림 cron active/매분, 최근5회 succeeded·HTTP200, claimed/sent/failed0이다. 대상 없음이며 실제 기기 수신/신규 발송 성공이 아니다. sent36은10월10일 과거 집계다.
- 요네즈 등록 아티스트·공개 공연0, 후보revision3·신원연결/발표/일반·선예매 절대시각/정확회차 미완료다. [Reissue](https://reissuerecords.net/2026/10/22/kenshi-yonezu-2026-2027-world-tour-ghost/) HTTP200의 Seoul/INSPIRE만 현재 재확인했다. 업데이트 일자를 최초 발표로 보지 않는다. [NOL](https://nol.yanolja.com/ticket/products/26015024)은 robots 허용·상품200, 기간과 휠체어석 전화 문구를 확인했으나 이를 일반예매/매일회차로 추정하지 않았다. 일반·선예매 시각은 미확정, 서면 이용허가 없음이다. 과거 개별 공연일 기록은 현재 제한 추출로 재검증하지 못했다.
- MCR 표본은 approved 및 mcr 공개신원 승인 존재, RADWIMPS는 unreviewed/승인 없음, YES24 표본 band_ids의 강진·진성은 excluded/관련key 승인 없음으로 현재 재조회했다. key와 band의 일대일 대응을 순서로 추정하지 않았다. 아티스트 작업은 수행하지 않았다.
- 출처별 표본 필수값 fail, 이용허가·실제 전체 중복/취소/중요변경·동의/기기조건 unverified, 기존 수동차단1건과 초기무알림 보호 보존이다. **NOT_READY**이며 수동 publication OFF 승인만 남은 상태가 아니다. 동일 OFF/허가/예매 차단은 반복 통지하지 않는다.

환경 current/running·network enforced·보안 바인딩 ready와 실제 Supabase schema/집계 SELECT 성공을 확인했다. HEAD f54e738은 복구 조상 f267be1/fd45938을 포함한다. 최신·fingerprint·마지막 통지 기록은 영속 경로에서 읽고 갱신했다. queue2367/cloud/active null/transfer null, SHA `b75f3c2c0694c9742b18fb183b842a0bbcaf5bf28cbdefa85b543f79bfcd43ef`를 전후 동일하게 보존했다. Last.fm은 역할 경계상 API/발굴0이다.

검증: 직전 감시의 격리 fixture6파일 통과 결과를 재사용했다. scripts/tests가323d5a5 이후 동일하여 새 테스트0이며, 앱/lint/build 재실행 없음이다. 운영 DB/RPC 쓰기·queue명령·수집재실행·공개ON·알림발송·Cron/DDL·예약변경·원격Git작업0이다. 개인사용자행/Vault/cron command/기기endpoint·키/원본HTML·API이미지·토큰을 읽거나 저장하지 않았다. UTF-8 JSON·건수·fingerprint·queue SHA·diff 확인. 상세 [JSON](20261025-113513-concert-operations.json).
