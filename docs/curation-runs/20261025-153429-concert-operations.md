# 공연 운영 읽기 전용 감시 — 2026-10-25 15:34:29 KST

**KOPIS 연결 공백10건 추가 관측, 이력상 미복구40→50건**이다. 기존40건도 현재 artist_keys/band_ids0으로 재조회했으며 복구0이다. rolling 비교25건과 이력상50건을 구분한다. 전체 KOPIS 연결 키 없음은799→808/817이다. 기존 연결의 정당성·정확한 변경 시각·생산자는 미확정이므로 자동 복원하지 않았다.

새 관측은 제1023회 목요예술무대: 일곱 번째 파장, 산만한시선, 로맨틱 펀치 단독 공연: 116번째 로맨틱 파티 [부산], 이은하 콘서트 [서울 (앵콜) ], 김창완 밴드 콘서트 [고양], 웅산 데뷔 30주년 콘서트: Here's To Life [부산], 아람 크리스마스 콘서트 #2. 리베란테, 소수빈 단독공연: 늘 그래왔던 것처럼 앞으로도, 이은미 콘서트 with 오케스트라: 추억이 핀다 [평택], 리프 단독공연: 여지의 시간, 바티멘토 듀오 내한공연, Batimento Dúo Tango Live Tour with Tanaka Shinji, Koh Sangji다. 이 중 **이은하 콘서트**는 previous band의 현재 approved/domestic_rock 및 mb 공개신원 승인이 존재하지만 후보revision7의 current artist_keys/band_ids는0이다. 아티스트 승인만으로 후보 연결이 완료되지 않았음을 확인했으며 원인 단정이나 쓰기는 하지 않았다.

| 출처 | 최신 상태 | 후보/공개/검수 | 실패 수 |
| --- | --- | --- | --- |
| KOPIS | success | 100/0/100 | 0 |
| ualive | success | 1/0/1 | 0 |
| mintpaper | success | 1/0/1 | 0 |
| radwimps | success | 2/0/2 | 0 |
| YES24 | 과거 partial, 현재 수집 OFF | 0/0/0 | 45 (10월14일 이력) |

- 최신 GitHub 정기 run40167791698는 2026-10-25 15:04:14~15:08:11 KST 성공이다. 최근3회 연속 성공, 코드9aa7f1a 유지다. 선언 매시17분과 실제 최근 시작 간격4시간56분41초의 차이를 기록했다. 실행 누락 수/지연 원인/완료 임계값은 추정하지 않았다. 기존 GitHub와 다른 채팅 KOPIS의 공용 source run/현재 유효lease0을 함께 읽었으며 수집을 새로 실행하지 않았다.
- PF303833 후보는 여전히0이며 최근 성공을 해당 오류의 해소로 세지 않는다. 기존 source publication OFF/live_after null, YES24 collection OFF는 그대로다.
- 기존 알림 cron active/매분, 최근5회 succeeded·HTTP200, claimed/sent/failed0이다. 대상 없음이며 신규 발송/실제 기기 수신 성공이 아니다. sent36은10월10일 과거 집계다.
- 요네즈 등록 아티스트·공개 공연0, 후보revision3/pending, 신원연결·발표·정확회차·일반/선예매 시각 미완료다. [Reissue](https://reissuerecords.net/2026/10/22/kenshi-yonezu-2026-2027-world-tour-ghost/) HTTP200에서 Seoul/INSPIRE를 재확인했으나 업데이트를 최초 발표로 보지 않는다. [NOL](https://nol.yanolja.com/ticket/products/26015024)은 robots 허용·상품200/기간·휠체어석 전화 문구를 확인했다. 이를 일반예매 시각이나 매일회차로 추정하지 않았다. 과거 개별 공연일은 이번 제한 추출에서 재검증 못했고 일반·선예매 절대시각 및 NOL 서면허가는 미확정이다.
- 현재 표본 MCR은 approved/해당key 승인 있음, RADWIMPS는 unreviewed/해당key 승인 없음, YES24 표본 강진·진성은 excluded/해당key 승인 없음으로 실제 재조회했다. 아티스트 검수·별칭 쓰기를 수행하지 않았다.
- 출처별 최신 표본 필수값 **fail**, 출처 이용허가·전수 중복/취소/중요변경 및 동의·기기 조건 **unverified**, 수동차단1건/초기무알림 보호 보존이다. **NOT_READY**이며 수동 공개ON 승인만 남은 상태가 아니다. 동일 OFF/허가·예매 차단을 반복 통지하지 않는다.

환경 current/running·network enforced/restricted·바인딩 ready와 실제 Supabase 테이블/cron 정의·집계 SELECT를 확인했다. HEAD e42f1d0에 필수 f267be1/fd45938 수정이 포함됐고 영속 latest/fingerprint/마지막 통지 기록을 읽고 갱신했다. queue2451/cloud/active null/transfer null, SHA `f649a6bacb883ad289c15737d79b04bae10341f5ff0096912c13f368496396ab`를 전후 보존했다. API 키 성공을 공연 연결/공개/발송 완료로 세지 않으며 역할상 Last.fm 요청0이다.

검증: scripts/tests는323d5a5 이후 동일하여 이전 격리 fixture6파일 통과를 재사용했다. 새 테스트·lint/build0이며 운영 배포 검증으로 확대하지 않는다. UTF-8/JSON/현재 집계/50고정 이력 재조회/변화10건/fingerprint/queue SHA/diff 확인. 운영 DB/RPC 쓰기·queue 명령·수집재실행·공개ON·발송·예약/Cron/DDL·배포/원격Git 변경0이다. 개인 사용자행·Vault·cron command·기기endpoint/키·원본HTML/API이미지/토큰을 읽거나 저장하지 않았다. 상세 [JSON](20261025-153429-concert-operations.json).
