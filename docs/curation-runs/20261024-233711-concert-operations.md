# 공연 운영 읽기 전용 감시 — 2026-10-24 23:37:11 KST

새 관측은 **KOPIS partial1회: 후보99/검수99/공개0/실패1**이다. 22:53:10 KST 시작·22:56:27 종료 실행에서 `PF303833`의 `KOPIS event fields missing`을 확인했다. 직전21:44 실행은100건 성공이며, 과거 실패와 합쳐 새 연속 실패라고 하지 않는다. 해당 ID 후보는 현재 DB에 없다. 이후23:30:41 KST 시작한 기존 KOPIS 수집은23:33:06에 후보77/검수77/실패0/success로 끝났으며 최종 source lease0이다. PF303833의 후속 대상 포함 여부는 확인되지 않아 해당 이벤트 복구를 주장하지 않는다.

이전 payload 연결은 있으나 현재 artist_keys/band_ids가 빈 후보는 **16→26건**, 추가10건을 관측했다. V.O.S 투어5건(청주·전남광주·천안·대구경산·전주), DAVICHI, 이은미, 하현상, MBC 대학가요제, 라라라온이다. 전체 아티스트 연결 없음 **801→802/817건**으로 늘었다. 기존 연결 정당성·의도적 오연결 제거 여부·변경 시각·생산자는 미확정이다. fetched_at을 변경 시각으로 해석하지 않고 자동 복원하지 않았다. 이전 연결 아티스트가 현재 승인인 후보13건도 실제 공연 연결 복구가 아니다.

- GitHub latest run40102735095는23:29:40 KST 시작·23:33:10 종료 success이며 수집/업로드·보고 단계까지 성공. 직전19:53:42 시작 run40087713315도 success. runtime9aa7f1a 유지. 선언 매시17분과 latest 시작 간격 **12958초** 차이는 지속되며 원인은 미확정이다. 별도 채팅 전용 실행기 코드나 추가 실행 전체 생산자를 공유했다고 가정하지 않았다.
- ualive/mintpaper/radwimps 최신23:29~23:30 KST success. YES24 collection OFF의10/14 옛 partial을 새 장애로 세지 않았다. 기존 알림 cron active/매분, 최근5회 succeeded·HTTP200 및 claimed/sent/failed0. 대상 없음이고 실제 기기 수신 또는 새 발송 성공이 아니다.
- 요네즈 후보revision2·등록 아티스트0·공개 공연0 유지. Reissue의 서울2027-01-14/16/17·INSPIRE ARENA와10/22 업데이트를 재확인했다. NOL robots/상품200이지만 서면 허가 없음. 읽힌10/22 12:00 KST는 휠체어석 전화예매이며 일반/선예매 절대시각과 구분한다. 상품 기간을 매일 회차로 만들지 않았다.
- 출처별 최신 후보 표본 필수 요건 fail, 이용 조건/실제 후보 전수 중복·취소·중요변경/실제 동의·기기 조건 unverified. 모든 publication OFF/live_after null, 수동차단1건·초기 채움 무알림 보존. **NOT_READY**이며 공개 승인만 남은 단계가 아니다.

현재 지정 checkout HEAD8ffd010과 필수 조상 f267be1/fd45938, 환경 current/running·network enforced·보안 바인딩 ready를 확인했다. Supabase 스킬과 cloud runtime 네트워크 지침 적용. 실제 schema·집계 SELECT 성공. 후보 필드는 실제 payload 정의의 country_code로 대조했으며 중간 잘못된 country-key 집계는 최종 관측에 사용하지 않았다. 순차 관측 중 서버 작업이 계속 실행돼 시간대를 구분했다.

queue2167/cloud/active null/transfer null, SHA `e08c98653b5fa0651738a4ff9f8580bb014050ebad1265945c6728133d6d3bdf` 전후 보존. 읽기 전용 역할에서 Last.fm API·후보 발굴0, DB/RPC 쓰기·queue CLI·아티스트/공연 수집 실행·공개ON·발송·Cron/권한/DDL·예약·배포·원격 Git 변경0. 비밀/Vault/cron command/개인 사용자 행·기기 endpoint/key·원본 HTML/API이미지를 기록하지 않았다.

검증: 실제 schema/비식별 집계·선택 후보 비교, 공개 GitHub GET와 공식 자료 읽기. 관련 코드·migration·fixture5파일은9b1db14 대비 변경 없음(exit0)으로 이전 격리 검증 통과를 재사용했다. 신규 테스트0. UTF-8 JSON·내용·fingerprint/통지 상태·queue 불변·diff를 확인했다. 동일 publication OFF/요네즈 시간·허가 차단은 반복 통지하지 않는다. [세부 관측](20261024-233711-concert-operations.json)
