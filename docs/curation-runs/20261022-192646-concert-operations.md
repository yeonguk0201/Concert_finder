# 공연 운영 감시 — 2026-10-22 19:26 KST

운영 DB에는 읽기 전용 조회만 수행했다. 아티스트 queue·공연·정책·Cron·알림은 변경하지 않았다. 첫 전용 감시 체크포인트를 `.local/concert-operations/latest.json`에 보존했다. 이전 작업 기록이 있는 checkout을 확인했으며 다른 환경에 자동 전달된다고 가정하지 않는다.

## 새 상태 변화

- KOPIS 최신 실행(16:37 KST)은 `COLLECTION_OR_UPLOAD_FAILED`, 후보/공개/검수 0이다. 직전 실행은 partial이었다. 일반 오류 코드만으로 키·쿼터·제공처 중 어느 원인인지 확정할 수 없다.
- RADWIMPS는 직전 네 차례 실패 후 16:36 KST 실행이 성공했고 후보 2/검수 2/공개 0이다. UALIVE·Mintpaper도 최신 성공, 각각 후보 1/검수 1/공개 0이다.
- GitHub 수집 workflow는 활성이나 최근 4개 실행은 모두 failure다. 가장 최근 시작은 16:31 KST이며 19:26 KST 조회에서 이후 실행은 없었다. 코드의 시간당 :17 예약과 약 2시간 55분 관측 간격이 있으나 예약 해제나 정확한 지연 원인으로 단정하지 않는다. 이미 알려진 불규칙 지연과 구분해 기록했다.

## 알림과 기존 차단

매분 `encore-notification-delivery`가 active이며 최근 5회 Cron 실행 succeeded, 동일 시간대 워커 형태 HTTP 응답 5건은 200/timeout=false/claimed=sent=failed=0이다. 정확한 request ID 연결을 위해 secret이 포함될 수 있는 cron command/return_message를 읽지는 않았다. 발송 대상 없음과 기기 수신 성공은 다르다. 현재 신규 발송은 없으며 과거 provider sent 36건·invalidated 7건은 이번 공연 수신 증거가 아니다.

기존 출처 publication OFF와 live_after=null, 요네즈 켄시의 아티스트/공연 후보/공연 부재는 유지됐다. Yes24는 collection 자체가 OFF이므로 오래된 실행만으로 신규 수집 장애로 분류하지 않았다. 같은 차단을 사용자에게 다시 조치 요청하지 않는다.

## 공식 자료 재확인

[Reissue 공지](https://reissuerecords.net/2026/10/22/kenshi-yonezu-2026-2027-world-tour-ghost/)는 이전 10/15 주소에서 10/22 주소로 이동했으며 싱가포르 추가 공연을 알린다. 한국 공연 날짜는 2027-01-14/16/17로 유지됐다.

[NOL 상품](https://nol.yanolja.com/ticket/products/26015024)의 절대 날짜 문구로 일반 예매 2026-10-22 12:00 KST를 재확인했다. 운영 시간 본문에 2027-01-14 19:30, 01-16 19:00, 01-17 19:00이 명시돼 이번에는 회차 시각까지 읽기 전용 근거로 기록했다. 상품 기간을 매일 공연으로 확장하지 않았다. 선예매는 미확인이다. 실행기 허용 호스트를 변경하지 않고 웹 읽기 도구로 확인했다. 원문/이미지는 저장하지 않았다.

## 검증

실제 테이블 정의를 먼저 확인하고 read-only transaction을 사용했다. 보고서의 상태·시간·집계와 비밀/개인정보 미포함을 확인했다. JSON 유효성 및 `git diff --check`를 확인했으며 문서/감시 기록만 변경해 앱 테스트는 반복하지 않았다. 복구 ZIP 이후 새 감시 기록 커밋이며 기존 아티스트 체크포인트 revision 1061은 변경하지 않았다.
