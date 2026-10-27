# 공연 운영 감시 — 2026-10-23 23:36:31 KST

복구 checkout과 최신 체크포인트 연속성, f267be1/fd45938 ancestry, 현재 environment running/current·network enforced 및 보안 바인딩 ready, 실제 Supabase 테이블 정의·읽기 접근을 확인했다. 운영 DB 읽기 전용이다.

- KOPIS 최신22:23~22:26 KST 실행 success: 후보100·검수대기100·공개0·오류0. 직전 partial/failed에서 회복했으나 HTTP400의 영구 해소를 단정하지 않는다.
- GitHub 최신22:22 KST 실행과 Collect and upload candidates 단계 success. 이전 연속 failure가 끊겼다. 직전 실행과 약5시간55분 간격으로 시간당 :17 선언과 차이는 지속된다. 원인/SLA는 미확정이다.
- 최신 실행 SHA 9aa7f1a. PR52의 실제 수집 실행기 반영은 확인되지 않았다. 다른 채팅 수집 코드/체크포인트는 이 환경에 없으며 공통 collection_runs만으로 실행 주체를 단정하지 않는다.
- mintpaper1/radwimps2/ualive1도 최신 success·검수대기·공개0. YES24는 collection OFF이므로 오래된 이력을 활성 지연으로 세지 않는다.
- 모든 source publication OFF/live_after=null 유지. 유효 collection lease0은 조회 시점 관측이다.
- 알림 Cron active/매분, 최신5회 succeeded 및 worker HTTP200·claimed/sent/failed0. 발송 대상 없음이며 실제 발송/기기 수신 완료가 아니다. 누적 sent36/invalidated7은 과거와 같다.

전체 후보858개를 누락 필드별로 집계하고 host별 안정적 최신 표본을 대조했다. KOPIS artist_keys 없는 후보781개(이전787), 미승인 신원 포함11개(이전7)이나 원인을 이번 감시의 아티스트 성과로 해석하지 않는다. 모든 표본은 발표/예매시각 등 요건 미완료다. 출처별 pass/fail/unverified 요건표와 남은 조건을 JSON에 보존했다. READY_FOR_PUBLICATION_APPROVAL이 아니다.

요네즈 KOPIS pending 후보는 여전히 artist_keys/band_ids/회차가 없고 발표·일반예매 시각 미확정이다. 현재 이름 검색에 연결 아티스트/공연도 없다. Reissue 공식 공지는2027-01-14/16/17 INSPIRE를 확인한다. NOL robots 허용 후 상품 페이지를 읽었으며 2026-10-22 12시 문구는 휠체어석 전화예매용임을 다시 확인했다. 일반/선예매 절대시각은 미검증이다. 읽기/robots 허용은 자동 수집·재사용 허가가 아니며 NOL 허가는 계속 미확보다. 원본 HTML/이미지는 저장하지 않았다.

격리 테스트5파일(automated-catalog/collection/kopis/nol/notification-worker) 이번 실행 통과. PGlite·fixture·mock 기반의 임대/승인/중복/수동 차단/초기 채움 무알림·예매 종류/절대시각/회차 추정 금지·재인가 검증이며 운영 동의·실제 발송/수신 검증은 아니다. 코드 변경이 없어 lint/build는 반복하지 않았다.

queue revision1609·owner cloud·active/transfer null 및 state SHA `0c59311b7dcab32d671c34e447a0632efa0fa8d53722b57ff736b7471db970bf` 보존. DB/RPC/queue 쓰기·실제 수집/발송·Cron/권한/DDL/배포·push/PR/merge 없음. 비밀·개인정보 조회 없음. 새 통지는 KOPIS/GitHub 회복2항목만이며 기존 미변경 공개/신원/허가 차단은 반복 통지하지 않는다.

상세: [20261023-233631-concert-operations.json](20261023-233631-concert-operations.json)
