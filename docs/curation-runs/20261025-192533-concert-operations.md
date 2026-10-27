# 공연 운영 읽기 전용 감시 — 2026-10-25 19:25:33 KST

**새 통지 대상 변화 없음**. 기존 연결 공백50건을 현재 DB에서 모두 다시 읽어 artist_keys/band_ids0을 확인했다. rolling previous_payload 비교25건의 ID도 기존50건 안에 있고 새 공백0/복구0이다. KOPIS 전체817건 중 artist_keys 없음808건 유지. 원래 연결 정당성·변경 시각·생산자는 미확정으로 보존하며 자동 복원하지 않았다.

| 출처 | 최신 lifecycle 결과 | 후보/공개/검수 | 실패 |
| --- | --- | --- | --- |
| KOPIS | 2026-10-25 18:52:13~18:55:40 KST success | 100/0/100 | 0 |
| mintpaper | 15:04:48~15:04:55 KST success | 1/0/1 | 0 |
| radwimps | 15:04:55~15:05:14 KST success | 2/0/2 | 0 |
| ualive | 15:04:27~15:04:47 KST success | 1/0/1 | 0 |
| YES24 | 10월14일 과거 partial·현재 수집 OFF | 0/0/0 | 과거45 |

KOPIS는 직전 감시 후07:48~07:52Z와09:52~09:55Z의 성공2회를 추가로 관측했다. 기존 GitHub 최신 정기 run40167791698는 여전히06:04:14~06:08:11Z 성공이며 코드9aa7f1a다. 선언 cron은17 * * * *, 실제 최근 시작 간격17801초 기록을 유지한다. 새 GitHub 실행이 없는 관측을 자체 임계값의 실패나 누락 횟수로 단정하지 않았다. 기존 GitHub/다른 채팅 KOPIS가 공유하는 collection_runs와 현재 유효 source lease0을 함께 확인했다. started_at 없는 legacy 결과행은 실제 lifecycle 행과 별도로 읽어 중복 성공/실패로 세지 않았다.

현재 모든 source publication OFF/live_after null, YES24 collection OFF 유지다. PF303833 후보0은 미해소이며 새 수집 성공을 해당 사례 해결로 세지 않는다. source별 최신 표본의 발표·일반/선예매·국가·회차·신원 승인 필수값 **fail**, 이용조건·실제 전수 중복/취소/중요변경·사용자 동의/기기 조건 **unverified**를 유지한다. 수동 차단1건과 초기무알림 보호를 보존했다. **NOT_READY**이며 수동 공개ON 승인만 남은 상태가 아니다.

요네즈 아티스트 등록·공개 공연0, 후보revision3/pending 및 KR은 유지됐으나 artist_keys/band_ids/sessions가 비어 있고 발표·일반/선예매 절대시각은 미검증이다. [Reissue](https://reissuerecords.net/2026/10/22/kenshi-yonezu-2026-2027-world-tour-ghost/) HTTP200의 Seoul/INSPIRE를 확인했다. 업데이트 일자를 최초 발표로 바꾸지 않았고 제한된 날짜 추출로 개별 회차를 다시 확인하지 못했다. [NOL](https://nol.yanolja.com/ticket/products/26015024)은 robots허용·상품HTTP200, 기간2027.01.14~01.17과 휠체어석/전화 문구를 확인했다. 기간을 매일 회차로, 휠체어석 전화 시각을 일반예매로 해석하지 않았다. NOL 외부 서면허가는 아직 없으며 코드/fixture 통과로 대체할 수 없다. 기존 같은 차단은 반복 통지하지 않는다.

표본 연결은 MCR approved/mcr승인 있음, RADWIMPS unreviewed/승인 없음, YES24 강진·진성 excluded/해당key승인 없음으로 실제 재조회했고 변화 없다. 아티스트 쓰기/별칭/queue 명령0이다. 기존 알림 cron은 active/매분, 최근5회 succeeded·HTTP200 및 claimed/sent/failed0이다. 이는 처리 대상 없음이며 새 발송이나 실제 기기 수신 증거가 아니다. 과거 sent36/invalidated7 집계 유지, 사용자 개인행·구독endpoint/키·Vault·cron command는 읽지 않았다.

환경 current/running·network enforced/restricted·필요 바인딩 ready와 실제 Supabase metadata/SELECT·외부 읽기 응답을 확인했다. HEAD5ae04a6에 f267be1/fd45938 포함. 현재 경로/.local 기록 연속성을 실제 확인했다. queue2534/cloud/active null/transfer null, SHA `c975d182c626fbc3b672fc866f1f23e0f519638bf3fc6db0a0518f169fcbe08d` 전후 보존. Last.fm 요청0이며 키 상태를 공연 연결·공개·발송 성과로 세지 않는다.

검증은 현재 UTF-8/JSON·집계·50건 재조회·fingerprint 동일·마지막 통지 불변·queue SHA·변경 범위/diff다. scripts/tests는323d5a5 이후 동일하므로 과거 격리 fixture6파일 결과를 재사용했다. 새 테스트·lint/build0이며 배포 성공으로 확대하지 않는다. 운영 DB/RPC 쓰기·아티스트 queue·수집재실행·공개ON·알림·예약/Cron/스키마/권한·배포·push/PR/merge0, 원본 HTML/API이미지/개인정보/토큰 저장0. 같은 fingerprint `4ac77980eb1cf669bd1859da30bd7ef6fdc2a7537b817774c7bd8ea801371cfb`와 마지막 통지를 보존하고 정상 후속 읽기 관측만 기록했다. 상세 [JSON](20261025-192533-concert-operations.json).
