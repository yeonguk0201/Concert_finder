# 공연 운영 읽기 전용 감시 — 2026-10-25 07:31:41 KST

최신 GitHub 정기 수집 run40131151065는 **2026-10-25 05:44:36~05:48:57 KST 실패**다. 수집·업로드 단계가 실패하고 보고 보존 단계는 성공했다. 같은 시간대 KOPIS는 후보99/검수99/공개0/실패1의 partial이며 `PF303833: KOPIS event fields missing`이 다시 관측됐다. 직전3회는 성공이므로 연속 실패라고 하지 않는다. 해당 ID 후보는 여전히 없다. ualive/mintpaper/radwimps 최신 성공, YES24 collection OFF의 과거 partial은 새 실패가 아니다. 현재 유효 source lease0이다.

KOPIS 연결 없음은802→801/817이지만, 현재/이전 payload 비교 목록26→21을 복구5건으로 해석하면 안 된다. 목록에서 빠진15건을 실제 재조회한 결과 모두 현재 artist_keys/band_ids0이며 previous_payload band_ids도0이다. 새로 관측한10건을 합쳐 **이력상 미복구 공백36건**을 보존했다. 발생 시각/원래 연결의 정당성/수집 생산자는 미확정이며 자동 복원하지 않았다. 새 관측 목록은 JSON에 있다.

- GitHub runtime9aa7f1a 유지. 선언 매시17분과 실제 최근 시작 간격9499초의 차이를 보존했다. 원인·운영 완료 임계값을 만들지 않았다. 다른 채팅 실행기 코드가 공유됐다고 가정하지 않는다.
- 기존 알림 cron active/매분, 최근5회 succeeded·HTTP200, claimed/sent/failed0이다. 대상 없음이며 실제 기기 수신이나 이번 새 발송 성공이 아니다. sent36은10월10일 과거 집계다.
- 요네즈 후보revision3, 연결 아티스트/정확 회차/발표·일반/선예매 절대시각 미완료, 등록 아티스트·공개 공연0 유지. Reissue HTTP200의 Seoul/INSPIRE와 NOL robots 허용·상품200·휠체어석/전화 언급/기간을 읽었다. 이번 제한된 텍스트 추출에서 개별 날짜를 재검증하지 못했으므로 이전 날짜 기록과 구분했다. 휠체어석 시각을 일반예매로 바꾸거나 기간을 매일 회차로 확장하지 않았다. NOL 서면 허가 없음.
- 출처별 최신 표본 필수값 fail, source permission·실제 전체 중복/취소/중요변경·동의/기기 조건 unverified. 수동 차단1건과 초기 무알림 보존. **NOT_READY**이며 수동 공개 승인만 남은 상태가 아니다. 동일 publication OFF/허가·예매 차단은 반복 통지하지 않는다.

환경 current/running·network enforced·binding ready, 실제 Supabase schema/집계 SELECT 성공. 필수 복구 조상 f267be1/fd45938 포함, HEAD682b32c와 영속 latest/fingerprint/마지막 통지 상태를 확인했다. Last.fm은 이 역할의 API/발굴 요청0이다. queue2245/cloud/active null/transfer null 및 SHA `d743a022f5928462fe68d37ffcd02b1358a36393b8b45ee286f195aa8d3f2716`는 직전 검증과 일치한다. queue 명령/DB 쓰기/수집 재실행/공개/발송/예약·Cron·DDL·배포·원격 Git 변경0이다.

검증: 바뀐 수집 연결 안전 코드가 이전 감시 기준과 달라 관련 **격리 fixture6파일 재실행 전부 통과**, 실패0. 운영 API는 mock이며 실제 수집이나 발송을 실행하지 않았다. 로컬 통과를 운영 배포/공개/실제 수신 완료로 세지 않는다. 새 앱 변경은 없어 lint/build는 반복하지 않았다. UTF-8 JSON·집계·diff·fingerprint/통지 상태·queue 보존을 확인했다. 상세 [JSON](20261025-073141-concert-operations.json).
