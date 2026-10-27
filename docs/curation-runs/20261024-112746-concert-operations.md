# 공연 운영 감시 — 2026-10-24 11:27:46 KST

읽기 전용 점검 결과 **새 통지 없음**. 기존 fingerprint와 마지막 통지 시각/내용을 보존했다. 복구 checkout HEAD `c9ffe3c`와 필수 f267be1/fd45938, 최신 .local 영속성 및 실제 Supabase 접근·테이블 정의를 확인했다.

- KOPIS 최신09:39 KST 실행 success, 후보77·검수대기77·공개0·오류0. 직전 success 이후 연속 성공이며 장애 해소를 다시 통지하지 않았다. ualive/mintpaper/radwimps도 success, 후보1/1/2·공개0이다. YES24는 collection OFF로 기존 오래된 실행을 새 지연으로 분류하지 않았다.
- GitHub 최신09:38 KST 수집/업로드 success. 직전 실행과 약2시간31분47초 간격(9107초), 실행 SHA9aa7f1a 유지. 선언17 * * * *와 관측 간격은 구분하고 지연 원인이나 정상화 SLA를 임의 확정하지 않았다. 유효 source lease0, 별도 채팅 수집기의 코드/일정 자동 공유는 가정하지 않았다.
- 기존 매분 알림 worker active, 최근5회 succeeded 및 HTTP200/claimed=sent=failed=0. 대상 없음이며 실제 기기 수신/새 발송 완료가 아니다. 과거 누적 sent36과 invalidated7은 변화 없다.

현재 후보878건(KOPIS817), source별 최신 표본과 필수값 누락 집계를 다시 대조했다. KOPIS817건 모두 발표·일반예매 시각·정확한 회차 필수값은 미완료다. 수동 차단1건 및 초기 채움 보호를 보존했고 readiness는 **NOT_READY**다. 이전 통과 격리 fixture5개는 관련 수집/발송 코드·마이그레이션·테스트가9b1db14 이후 동일함을 diff로 확인해 재사용했다. 새 테스트 실행0이며 전수 운영 증빙 검증으로 세지 않는다.

요네즈 KOPIS 후보는revision2로 갱신됐다. previous_payload 대비 변경 키는 discovered_artists, 개수는1→1이며 실제 artist_keys/band_ids는 여전히0이다. 아티스트 등록/공개 공연0, 발표/일반예매 시각·회차 미완료가 계속된다. Reissue 공식 현재 페이지의 서울 날짜2027-01-14/16/17 및 INSPIRE ARENA를 다시 읽었고10/22 업데이트를 최초 발표일로 쓰지 않았다. NOL은 robots/상품 읽기200이나 서면 허가는 미확보다. 현재2026-10-22 12:00 KST 문구는 휠체어석 전화예매로만 확인돼 일반/선예매 시각으로 확정하지 않았다.

아티스트 queue는revision1890, owner cloud, active/transfer=null 및 전후 SHA-256 일치. begin/checkpoint/finish/신규·별칭 작업을 수행하지 않았다. 운영 쓰기·수집/발송·공개·예약 변경·배포·push/PR/merge 없음.

검증: 실제 schema/집계 SELECT·서버 일정/HTTP 상태·공식 근거 읽기·기존 fixture 변경 없음·UTF-8 JSON·비밀/개인정보 제외·링크·queue hash·git diff 검사.

[현재 관측과 출처별 pass/fail/unverified](20261024-112746-concert-operations.json)
