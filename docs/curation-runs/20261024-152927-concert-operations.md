# 공연 운영 읽기 전용 감시 — 2026-10-24 15:29:27 KST

새 관측: **KOPIS 후보817건 중 아티스트 연결 없음797→800건**. 이전 payload에 연결이 있던11후보가 현재 artist_keys/band_ids 모두0이며, 그중4후보의 이전 연결 아티스트(김기태·조장혁·구창모·최재훈)는 현재 approved 및 외부 공개 승인 존재를 확인했다. 이전 연결 자체의 정확성·원인·생산 실행기는 미확인이다. fetched_at은 재조회 시각이므로 **11건 전부가 이번 관측 간격에 변경됐다고 단정하지 않는다.** 자동 재연결·수집 재실행 없이 후속 원인 조사 항목으로 보존했다.

MCR 후보의 `mcr` 외부 신원 공개 승인 존재와 bands approved를 읽기 확인했고 ualive 미승인 연결 집계는1→0이다. 이는 별도 아티스트 검수 성과의 운영 readback이며 이번 감시가 적용한 성과가 아니다. 공연 국가·발표·예매 절대시각 등 다른 요건은 미충족으로 모든 출처 **NOT_READY**다.

- 최신 수집: KOPIS14:49 KST success/후보100/검수100/공개0/오류0. ualive·mintpaper·radwimps도 최신 success. 현재 source lease0. YES24는 기존 collection OFF와 과거 partial을 구분했다.
- GitHub 최신14:48:15 KST 수집/업로드 success. 직전과5시간9분29초 간격으로 선언된 매시17분과 차이가 있으나 원인 미확정이며 연속 실패로 분류하지 않았다. runtime SHA `9aa7f1a` 유지. 추가 KOPIS 실행을 다른 채팅 실행기로 확정하지 않았다.
- 기존 `encore-notification-delivery` active/매분, 최근5회 succeeded 및 HTTP200 claimed/sent/failed=0. 대상 없음이며 실제 기기 수신 증거가 아니다. 누적 sent36은10/10 과거 집계다.
- 요네즈 후보 revision2, 아티스트/공개 공연0, keys·band_ids·sessions 없음 유지. Reissue 공식 서울2027-01-14/16/17 및 INSPIRE ARENA 재확인. 10/22는 업데이트 일자이며 최초 발표 시각이 아니다. NOL robots200/허용 및 상품200이나 서면 이용허가는 없음. 읽힌10/22 12:00 KST는 휠체어석 전화예매 시각이며 일반/선예매로 확정하지 않았다. 기간을 매일 회차로 확장하지 않았다.
- 출처별 최신 표본 필수값 fail, 이용 조건·전수 중복/취소/중요 변경·개인 동의/기기 조건 unverified 보존. 이전 격리 fixture5파일의 통과를 변경 없음 비교 후 재사용했으며 이번 신규 테스트 실행0. 모든 정책 publication OFF/live_after null 및 수동 차단1건 보존.

환경 observations_current/running, 네트워크 enforced, 바인딩 ready 및 실제 Supabase SELECT 성공. 지정 checkout HEAD `0003132`, 필수 조상 `f267be1`·`fd45938` 포함 확인. queue revision1972/cloud/active null/transfer null과 state SHA-256 `e185bb325f5b569c81b8add6a53c32ace3da94d1a1eadd68956b349de977da32` 전후 동일. Supabase 스킬 및 managed cloud runtime 네트워크 지침을 적용했다.

운영 DB/RPC 쓰기·queue CLI·수집·공개·발송·예약·DDL·배포·원격 Git 변경 없음. 개인 사용자 행·푸시 endpoint/키·Vault·cron command·원본 HTML/API 이미지/토큰을 읽거나 기록하지 않았다. 예매 페이지의 짧은 사실 요약만 보존했다.

검증: 실제 테이블 정의와 집계 SELECT, 공개 GitHub GET, 허용 공식 자료 읽기, UTF-8 JSON/내용·fingerprint·통지 상태 보존, queue 바이트 불변, `git diff --check`. 같은 미변경 차단은 재통지하지 않는다. [세부 관측](20261024-152927-concert-operations.json)
