# 공연 운영 감시 — 2026-10-23 19:33 KST

운영 DB 읽기 전용. 현재 환경/checkout/이전 체크포인트 연속성 및 실제 테이블 정의를 확인했다.

- KOPIS가 후보0 실패 이후 최근 후보50·검수50·공개0의 부분 실패로 바뀜. HTTP400 3개 후 연속 실패 중단1개로 정상 회복은 아님.
- GitHub 수집 workflow 최신07:27 UTC와 직전01:28 UTC가 연속 failure. 최신 Collect and upload candidates 단계 실패를 확인.

| 출처 | 최신 상태 | 후보 | 검수 | 공개 | 실패 기록 |
| --- | --- | ---: | ---: | ---: | ---: |
| kopis | partial | 50 | 50 | 0 | 4 |
| mintpaper | success | 1 | 1 | 0 | 0 |
| radwimps | success | 2 | 2 | 0 | 0 |
| ualive | success | 1 | 1 | 0 | 0 |
| yes24 | partial | 0 | 0 | 0 | 45 |

KOPIS 최근3회는 partial/failed/partial이다. 오류4개를 독립 공연4개의 실패로 세지 않았다. 현재 source lease는 없으며 별도 실행기의 기여를 공통 이력만으로 단정하지 않는다. GitHub 실행 간격은 약5시간59분으로 시간당 선언과 차이가 있지만 정확한 지연 원인/SLA는 미확정이다.

공개 정책은 전 출처 OFF로 유지됐다. YES24는 수집도 OFF다. 알림 Cron active/매분, 최근5회 succeeded와 worker 형태 HTTP200·claimed/sent/failed0을 확인했다. 발송 대상 없음이며 실제 발송/기기 수신 완료가 아니다. 누적 sent36/invalidated7은 동일한 과거 기록이다.

요네즈 켄시 KOPIS pending 후보1건과 아티스트/공연 연결 부재가 계속된다. Reissue/NOL에서 2027-01-14 19:30, 01-16 19:00, 01-17 19:00 KST/INSPIRE를 다시 읽었다. 2026-10-22 정오 안내는 휠체어석 전화예매용이고 일반/선예매 절대시각은 미확인이다. 원래 발표 절대시각·공식 이용 허가와 DB 회차/신원 연결도 남아 있다.

전체858개 후보 누락 필드와 안정적 최신 표본을 재조회하여 출처별 pass/fail/unverified 요건표를 보존했다. KOPIS 미연결 artist_keys 후보는787건이며 이전785건과 다르지만 원인을 대조 없이 단정하지 않는다. 공개 OFF 외에도 미완료 요건이 있어 READY_FOR_PUBLICATION_APPROVAL이 아니다. 동일한 차단은 다시 통지하지 않는다.

검증: 이전5개 격리 테스트 파일 통과 기록을 재사용했다. 관련 파서/테스트/worker/마이그레이션에 Git 변경이 없음을 확인했으며 이번 새 테스트 통과로 세지 않았다. 실제 수집/공개/알림, 운영 DB/RPC 쓰기, Vault/cron command/개인 사용자·푸시 구독 조회, 배포/push/PR/merge 없음. UTF-8 JSON/집계/비밀·이미지 URL 제외와 git diff --check를 검증해 로컬 커밋한다.
