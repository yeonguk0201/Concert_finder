# 공연 운영 읽기 전용 감시 — 2026-10-24 19:26:59 KST

새 관측: KOPIS 후보817건 중 아티스트 연결 없음 **800→801건**. 이전 payload에는 연결이 있으나 현재 keys/band_ids가 비어 있는 관측은11→16건이며, 추가5후보는 다음과 같다: Awesome Stage Special Concert: Redoor; 렉처 콘서트 Ⅳ. 미국 음악의 탄생 [공주]; 성남아트센터 오후의 콘서트: 수요재즈클럽 (11월); The entry to Jazz [서울 성수]; 옥탑재즈 Ⅴ, LUCA MINOR.

현재 발견된 출연진 이름은 있으나 검증된 key/MBID가 없는 상태를 읽었다. 기존 연결의 정확성·오연결을 의도적으로 제거한 것인지·생산 실행기·변경 발생 시각은 미확정이다. fetched_at을 변경 시각으로 쓰거나16건 모두가 이번에 발생했다고 단정하지 않는다. 자동 재연결/수집 재실행 없이 원인 조사 항목으로 기록했다. 이전 연결 아티스트가 현재 승인인 후보는5건이며 김창완의 별도 승인 반영을 새 연결 복구로 세지 않았다.

- KOPIS 최신18:48:35 KST success/후보100/검수100/공개0/오류0. 다른 활성 출처는14:48 KST 최신 success 유지. 기존 GitHub 최신14:48:15 KST의 수집/업로드도 success이며 runtime9aa7f1a 유지. 선언된 매시17분과 실제 실행 간격 차이는 기존 차단이며 새 연속 실패로 부르지 않았다. 추가 KOPIS 실행의 다른 채팅 생산자 여부는 미확정, 현재 source lease0.
- 기존 알림 worker active/매분, 최근5회 succeeded 및 HTTP200 claimed/sent/failed0. 대상 없음이며 실제 기기 수신 증거가 아니다. 누적 sent36은10/10 이력이다.
- 요네즈는 후보 revision2/등록 아티스트0/공개 공연0 유지. Reissue 서울2027-01-14/16/17 및 INSPIRE ARENA를 다시 읽었고10/22는 업데이트 일자로 보존했다. NOL robots200/허용·상품200이지만 서면 허가는 없음. 읽힌10/22 12:00 KST는 휠체어석 전화예매이며 일반/선예매 시각으로 확정하지 않았다. 상품 기간을 매일 회차로 만들지 않았다.
- 출처별 최신 표본의 필수 요건 fail, 이용 조건·전수 중복/취소/중요 변경·실제 동의/기기 조건 unverified 보존. 모든 publication OFF/live_after null, 수동 차단1건 및 초기 채움 무알림 보존. **NOT_READY**이며 공개 승인만 남은 상태가 아니다.

환경 current/running·network enforced·보안 바인딩 ready, 지정 checkout HEAD ba4d86f와 필수 조상 f267be1/fd45938 확인. 실제 Supabase schema/집계 SELECT 성공. queue2084/cloud/active null/transfer null과 SHA-256 `323d79372e94f380301687a61faca236b81f3be8433bd907d8e757dc058f1aa2` 전후 동일. Supabase 스킬과 cloud runtime 네트워크 지침 적용. Last.fm 후보/API 요청0이며 키 부재를 주장하지 않는다.

검증: 실제 테이블 정의·비식별 집계/선택 후보 비교 SELECT, 공개 GitHub GET, 허용 공식 자료 읽기, 기존 fixture5파일과 관련 코드/마이그레이션의9b1db14 대비 변경 없음 확인(이전 통과 재사용, 신규 테스트0), UTF-8 JSON·내용·fingerprint·통지 상태·queue 불변·git diff 검사. 운영 DB/RPC 쓰기·queue CLI·아티스트 등록/수정·공연 수집/발송·공개ON·Cron/권한/DDL·예약·배포·원격 Git 변경 없음. 개인 사용자 행/기기 키/cron command/Vault·원본 HTML/API 이미지·토큰은 읽거나 저장하지 않았다.

[세부 관측](20261024-192659-concert-operations.json). 동일 publication OFF/요네즈 차단/인증·미지원 출처는 반복 통지하지 않았다.
