# 공연 운영 읽기 전용 감시 M28 — 2026-10-27 23:28:37 KST

의미 있는 새 장애·해소·성과·사용자 조치 없음. 기존 fingerprint와 lastNotified를 그대로 보존하고 중복 통지하지 않는다.

| 출처 | 최신 상태 | 후보 | 공개 | 검수 | 실패 |
| --- | --- | ---: | ---: | ---: | ---: |
| kopis | success | 100 | 0 | 100 | 0 |
| mintpaper | success | 1 | 0 | 1 | 0 |
| radwimps | success | 2 | 0 | 2 | 0 |
| ualive | success | 1 | 0 | 1 | 0 |
| yes24 | partial | 0 | 0 | 0 | 45 |

- 최신 GitHub 예약 실행40469269136 및 DB KOPIS16:52 KST 성공은 동일하다. 배포 workflow active/매시간17분, 23:27 KST 관측까지 이후 새 실행 없음. 대응 실행이 안 보이는 08:17~14:17 UTC 7개 시각은 같은 기존 실행 공백이며 새 연속 실패나 임의 SLA 위반으로 세지 않는다.
- source lease0. 모든 publicationOFF/live_after=null, YES24 collectionOFF 유지. 기존 서버·다른 채팅 실행기를 실행/수정하지 않았다.
- 알림 cron active/매분, 최근5회 succeeded/HTTP200 claimed·sent·failed0. 과거 sent36/invalidated7 동일. 대상 없음은 현재 발송·기기 수신 성공이 아니다.
- KOPIS819 중 키없음791/참조28, 추적64 중 빈 연결56, rolling gap14 및 연결 아티스트68의 상태가 동일하다. 후보ID별 버전/참조/필수필드와 기존 경고를 대조했다.
- 요네즈 아티스트0, 후보revision7/KR/신원키·밴드·회차0, 발표·일반/선예매 절대시각 미확정 유지. 현재 Reissue/NOL 읽기HTTP200/robots허용. 업데이트 일자·휠체어 전화예매·상품 기간을 최초 발표/일반예매/매일 회차로 확정하지 않는다. NOL 서면 이용허가 없음.

출시 전 검증은 동일하게 NOT_READY다. 출처별 필수 발표·일반예매 필드 fail, 전체 신원/국가·장르가 아닌 실제 출연 연결·이용 허가·중복/취소/중요 변경·동의/기기 흐름은 unverified다. 수동OFF·차단 보존 pass, 초기 채움 무알림은 기존 격리 fixture pass만 재사용한다. 중복hash 초과0/취소0 관측을 전체 흐름 완료로 쓰지 않는다. 공개 승인만 남은 출처 없음.

HEAD fc4bb5f와 f267be1/fd45938 조상 포함을 확인했다. queue3645/cloud/active=null/transfer=null 및 SHA `cae3a9a502c140b103d09925663793b2da718ac9eab9e65436a620750535c7ca` 전후 동일. 이전 감시3548→3645는 중간 아티스트 R40 완료 기록이며 이번 감시 쓰기가 아니다. DB/RPC 쓰기·아티스트queue명령·수집 실행·공개ON·발송·예약/Cron/권한/스키마 변경·배포/push/PR/merge0.

현재 환경 current/running·network restricted/enforced·승인 바인딩ready와 실제 Last.fm getInfo1회 HTTP200/API성공/정확MBID를 구분해 확인했다. 후보 발굴/지표 갱신/공개·발송 성과가 아니다. 원본 HTML/API 이미지·비밀값/Vault/cron command/구독 endpoint·키/개인 사용자 행은 보존하지 않았다.

scripts/tests는 f74ac31 이후 변경 없음. 기존 fixture3파일 결과 재사용, 새 테스트0. UTF-8/JSON/상대 링크·후보/아티스트 비교·queue SHA·변경 범위/git diff 확인. 상세 [JSON](./20261027-232837-concert-operations.json), 이전 [M27](./20261027-193630-concert-operations.json).
