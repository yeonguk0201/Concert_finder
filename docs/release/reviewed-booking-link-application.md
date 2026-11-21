# 검수한 예매 링크의 운영 반영

사용자가 2026-11-21 이 채팅에서 후보 조사에 그치지 않고 운영 화면에 반영하도록 요청했다.
이는 이번에 확인한 링크 반영의 승인이다. 다른 공연의 미검증 링크 자동 승인이나
KOPIS 수집·공개 정책 변경으로 해석하지 않는다.

## 지원 경로

`20261121131934_reviewed_booking_link.sql`은 서버 전용
`service_apply_reviewed_booking_link(proposal, expected_snapshot)`을 추가한다.
공개 wrapper는 security invoker이며, private 구현의 execute는 service_role에만 허용한다.
private 구현은 서비스 JWT role을 다시 확인하고 기존 private catalog 감사 이력에 기록한다.
관리자 로그인·세션 토큰·새 관리자 계정은 필요하지 않다.

- 사용자의 명시적 확인 근거, 24시간 이내 공식 상품 확인, 공연 신원 일치가 필요하다.
- 티켓링크·YES24·멜론티켓의 허용된 HTTPS 개별 상품 경로만 받는다.
- published·미취소이며 앞으로 시작할 회차가 남은 공연만 허용한다.
- 공연과 예매 행을 잠그고 전체 원본 snapshot을 비교한다. 충돌은 재승인·재조회 대상으로 남긴다.
- 기존 비어 있지 않은 다른 링크를 덮어쓰지 않는다. 같은 링크의 재실행은 no-op이다.
- URL 외 예매 시각·가격·공연 사실·출처·회차·출연진 ID를 보존한다.
- 예매 오픈 시각을 바꾸지 않으므로 예매 알림 revision을 올리지 않는다.
- 공연 updated_at은 갱신해 기존 관리자 편집 화면의 오래된 저장을 충돌 처리한다.
- 새 공개·출연진 변경·알림 생성·발송·수집 호출을 하지 않는다.

서버 호출 도구는 `scripts/reviewed-booking-link.mjs`다. `--confirmed-input` 파일에는
`proposal`과 `expected_snapshot`만 넣고 키를 포함하지 않는다. 서버 바인딩은 환경에서만 읽는다.
mutation 응답이 불확실하면 재시도하지 말고 공개 읽기·감사 이력부터 대조한다.

비공개 적용 기록은 기존 `concert-scheduler-state/booking-link-reviews/v1/<concert>/<candidate key>/`
경로에서 gzip JSON을 append한다. 기존 후보의 key는 원본 URL의 hash와 다를 수 있으므로
이전 객체 경로를 명시해 같은 디렉터리를 유지한다. 신규 후보만 URL의 SHA256을 key로 사용한다.
기존 raw JSON의 SHA256을 previous_hash에 남기며,
원본·불확실성·이전 근거를 보존한다. 업로드는 upsert=false이고 저장 후 바이트를 대조한다.
경합 시 덮어쓰지 않는다. DB 저장과 Storage 기록은 별도 단계이므로 Storage 실패를 DB 실패로
간주해 mutation을 반복하지 않는다. DB의 history_id가 운영 반영 영수증이다.

## 이번 대상과 검증 범위

- 이창섭 울산: https://www.ticketlink.co.kr/product/65455
  상품 HTML의 신원·장소·2026-11-21~22 일치. 남은 DB 회차는 11월 22일 17:00 KST.
- 최재훈 서울: https://www.ticketlink.co.kr/product/65630
  상품 HTML의 신원·장소·2026-11-22 일치. 공식 공지 65893의 13시·17시가 DB와 일치.
- 김장훈 창원: 상품명과 공연일의 연도 표기 차이를 유지하며 이번 반영에서 제외.
- 신해경 부산: 공식 상품 사실은 일치하지만 마지막 회차가 이미 시작돼 이번 반영에서 제외.

티켓링크의 렌더링된 회차 선택기는 아직 미검증이다. 브라우저 인증서 오류와 정적 호스트
접근 제한을 상품 신원 검증과 구분한다. 환경 CA 신뢰 등록은 자동 승인 검토에서 거절돼
실행하지 않았다. HTTPS 상품 HTML·공식 공지의 사실 대조와 사용자의 이번 반영 요청을 근거로 한다.

격리 DB 검사: 권한 거부, 확인·근거 필수, 허용 URL, stale 근거, snapshot 충돌,
수동 링크 보호, 사실/가격/회차/ID/알림 상태 보존, 감사 및 no-op을 검증한다.
Storage fixture는 append-only·이전 기록 보존·충돌 거부·읽기 재확인을 검증한다.
lint·build도 확인한다. 실제 설치·반영·공개 읽기 결과는 작업 완료 보고의 영수증과 구분한다.
