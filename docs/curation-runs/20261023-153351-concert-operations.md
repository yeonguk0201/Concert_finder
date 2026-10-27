# 공연 운영 감시 — 2026-10-23 15:33 KST

운영 DB는 읽기 전용으로 점검했다. 기존 checkout과 감시 체크포인트를 확인했고 비밀값·개인 사용자/구독 정보·Vault·cron command는 읽지 않았다.

새 변화: KOPIS 최근 실행(2026-10-23 11:48 KST)이 후보0·검수0·공개0·오류기록1의 failed로 변경. 직전 partial16건 이후 악화했으며 최신 오류 원인은 비밀 없는 분류에서 미확정.

| 출처 | 최신 상태 | 후보 | 검수 | 공개 | 실패 기록 | 최근 실행 KST |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| kopis | failed | 0 | 0 | 0 | 1 | 10-23 11:48 |
| mintpaper | success | 1 | 1 | 0 | 0 | 10-23 10:28 |
| radwimps | success | 2 | 2 | 0 | 0 | 10-23 10:29 |
| ualive | success | 1 | 1 | 0 | 0 | 10-23 10:28 |
| yes24 | partial | 0 | 0 | 0 | 45 | 10-14 19:10 |

KOPIS 직전 실행은 HTTP400 3개와 연속 실패 중단 표시 1개의 partial이었다. 최신 failed 오류는 비밀 없는 분류로 원인을 확정하지 못했다. 기존 source lease는 현재 없으며 별도 실행기의 기여를 시각만으로 단정하지 않는다.

GitHub 최신01:28 UTC 실행은 failure 그대로다. 해당 head의 시간당 :17 schedule과 약5시간 새 실행 부재를 대조했다. 지연 원인/SLA는 미확정이며 수집을 재실행하지 않았다. YES24는 collection OFF이므로 오래된 실행을 활성 수집 장애로 새 통지하지 않는다.

알림 Cron은 active=true, 매분이며 최근5회 succeeded다. 최근 worker 형태 HTTP 응답은200, claimed/sent/failed 모두0이다. 대상 없음이며 발송·기기 수신 완료가 아니다. 누적 sent36/invalidated7도 이전 기록이다.

요네즈 켄시는 KOPIS pending 후보1건이 있으나 DB 아티스트·공연 연결은 없다. 공식 Reissue/NOL에서 2027-01-14 19:30, 01-16 19:00, 01-17 19:00 KST/INSPIRE를 재확인했다. 상품 기간을 매일 회차로 확장하지 않았다. 2026-10-22 12:00 KST 안내는 휠체어석 전화예매이며 일반/선예매 절대시각은 미확인이다. 원래 발표 절대시각과 외부 자동 수집 이용 허가도 남아 있다.

출처별 최신 표본 및 전체858 후보의 누락 필드를 집계했다. 모든 출처는 pass/fail/unverified 요건표를 JSON에 남겼으며 공개 OFF 외 미완료 조건이 있어 READY_FOR_PUBLICATION_APPROVAL이 아니다. 수동 차단·초기 채움 무알림·기존 찜/동의 조건을 보존했다.

격리 검증: NOL/collection/automated-catalog/notifications-database/notification-worker의 5개 파일 단위 통과. 실제 수집·공개·발송을 시험하지 않았고 운영 배포 일치·실제 기기 수신은 검증하지 않았다. UTF-8 JSON·비밀/이미지 URL 제외·git diff --check 확인 후 로컬 커밋한다.
