# 공식 예매 링크 첫 후보 재검증

검증: 2026-11-19 01:29 KST (2026-11-18 16:29 UTC). 이번 환경에서 직접 실행한 결과다.

## 저장소와 범위

- 원격 main: `702a89d05819386ccb716553ce7b9b0e4428ae72`.
- 원격 dev: `ea6ab3d15bb573d2ccfadd0320170e3a7f2d256f`.
- 두 ref를 다시 조회하고 fetch했다. 최신 dev에서 `codex/feat-booking-link-review`를 만들었다.
- 이전 로컬 커밋 `67cae48`과 이 인계 문서는 새 환경에 없었다. 이전 코드를 복구했다고 주장하지 않는다.
- AGENTS.md, CONTRIBUTING.md, artist-photos.md, api-first-concert-publication-plan.md,
  local-ui-and-concert-dedup-handoff.md, kopis-durable-scheduler.md를 읽었다.
- 환경 검증과 기존 첫 후보의 남은 검증만 수행했다. 푸시·PR·배포는 하지 않았다.

## 키 권한 검증

키 값은 출력하거나 파일·로그에 저장하지 않았다. 존재 여부와 실제 요청 결과만 확인했다.

| 검사 | 이번 환경 결과 |
| --- | --- |
| `VITE_SUPABASE_URL` | 존재 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 존재 |
| `SUPABASE_URL` | 존재 |
| 서버 전용 `SUPABASE_SERVICE_ROLE_KEY` | 존재 |
| VITE 공개 바인딩으로 대상 published 공연 조회 | HTTP 200, 대상 1건 |
| 같은 공개 바인딩으로 비공개 후보 객체 authenticated 경로 읽기 | HTTP 400, 응답 내부 404 / not_found / NoSuchKey |
| 같은 공개 바인딩으로 동일 객체 public 경로 읽기 | HTTP 400, Bucket not found / NoSuchBucket |
| 서버 바인딩으로 동일 객체 읽기 | HTTP 200, gzip JSON revision 2 확인 |

서버 요청으로 실제 존재를 확인한 동일 객체를 공개 바인딩으로 읽지 못했다.
요청한 공개 조회 성공·비공개 접근 거부 조건은 충족했다. 이는 해당 요청의 권한 검증이며
프로젝트 전체 RLS 감사나 키 원문 동일성 판정은 아니다. 이전 환경의 ready 결과는 사용하지 않았다.

## 현재 운영 값

- band: `dcb90080-9164-478b-a728-b0f0172e2db0` (이창섭).
- concert: `28bc6d4b-2330-4c2e-ba02-b4c6a1f665c7`.
- 제목: 이창섭 단독 콘서트: Unknown [울산]. `published`, `cancelled=false`.
- 장소: KBS홀 [울산] (KBS홀 [울산]).
- 회차: 2026-11-21 18:00, 2026-11-22 17:00 KST. 공개 DB에서 두 행을 다시 읽었다.
- 출처: [KOPIS PF301190](https://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20Id=PF301190).
- ticket ID: `3fae8634-1d67-46e0-8915-d3059e0da84b`, revision 1.
- `booking_url=null`, `opens_at=null`; 발표일·발표 시각 null, `announcement_verified=false`.
- 원격 revision 2의 original과 위 조회 값이 일치했다. 수동 확인 값을 수정하지 않았다.

## 후보 근거와 실제 브라우저 검증

[티켓링크 65455](https://www.ticketlink.co.kr/product/65455)의 이번 HTTPS GET은 HTTP 200이었다.
HTML title과 Event JSON-LD에서 이창섭, Unknown, 울산, KBS 울산홀,
2026-11-21~22를 다시 확인했다. 주소는 울산광역시 남구 번영로 212 한국방송공사다.
이번 HTML SHA256: `71fae20a00f584a98fa0f7559a124b7ade3774541b5f308bf02ebe583623c323`.
HTML에는 `18:00`·`17:00` 문자열이 없었다. 기간을 개별 회차로 추정하지 않았다.

이전 원격 기록에는 KOPIS PF301190의 관련 상품이 티켓링크 65455이며
토요일 18:00·일요일 17:00이라는 단일 상세 API 확인 근거가 있다. 이번에는 이 근거를
원격 기록에서 읽었으며 KOPIS 수집이나 상세 API를 추가 실행하지 않았다.
YES24 60259는 이전 기록에서 대구·11월 28~29일 상품으로 제외돼 있다. 새 후보로 만들지 않았다.

Headless Chromium에서 상품 문서 HTTP 200을 확인했다. 첫 시도는 인증서 신뢰 오류였고,
프록시 인증서 오류를 무시한 진단에서도 필수 JS·CSS 요청이
`net::ERR_TUNNEL_CONNECTION_FAILED`로 실패했다. 사이트가 비정상 활동 경고
`ErrorCode:200`을 표시했고 본문·회차 선택기 확인에 실패했다. 로그인을 시도하거나 경고를 우회하지 않았다.

셸 HTTPS 클라이언트에서도 아래 호스트의 CONNECT가 각각 403 Forbidden이었다.

- `tketlink.dn.toastoven.net` (브라우저의 실제 상품 JS·CSS 실패도 확인)
- `image.toast.com`
- `tkfile.yes24.com`

렌더링된 두 회차와 외부 예매 흐름은 **미검증**이다. 검색 결과 문구를 근거로 확정하지 않았으며
발표일·예매 오픈 시각을 추정하지 않았다. 장소 표기 차이도 관리자 검토 항목으로 남긴다.

## 비공개 원격 기록과 운영 적용

- bucket: `concert-scheduler-state`.
- 객체: `booking-link-reviews/v1/28bc6d4b-2330-4c2e-ba02-b4c6a1f665c7/6389f4a3237bb224b0ddaee566b892132e6d6c4b9ce553bd6e250b06139462b0/00000002.json.gz`.
- 서버로 해당 후보 디렉터리를 목록 조회해 revision 1·2만 있음을 확인했다.
- 최신 revision 2: `needs_review`, `applied=false`, `automatic_apply=false`.
- 원격 기록은 읽기만 했다. revision 2에 남은 이전 환경 권한 실패 내용은 과거 결과이며,
  이번 환경의 통과 결과는 위 표와 구분한다. 새 후보·새 revision은 만들지 않았다.
- 운영 `booking_url`을 반영하지 않았다. DB·Storage 쓰기, 수집 실행, 예약 생성·주기·자동 등록
  범위 결정, KOPIS 경로·lease·cooldown·pin·알림 설정 변경은 없었다.

## 남은 준비

1. 정상 접근 가능한 브라우저에서 티켓링크의 11월 21일 18:00·22일 17:00 선택기를 실제 대조한다.
2. 장소 표기와 후보 링크에 대한 관리자 확인을 받는다. 현재 `needs_review`를 유지한다.
3. 운영 적용 작업을 별도로 승인받은 경우에만 최신 수동 값과 revision을 재조회하고 지원 경로로 반영한다.
   이번 검증 통과는 자동 반영이나 정기 실행의 승인이 아니다.

## 후속 사용자 승인: Codex 정기 확인

위 내용은 환경·상품 검증 당시의 결과다. 이후 사용자가 별도 AI API 대신 Codex 예약 생성을 승인했다.
`공식 예매 링크 보완` 예약을 생성했으며 첫 예정은 2026-11-19 10:00 KST, 이후 이틀 간격이다.
예약 생성 당시 enabled=true였고 실행 결과는 아직 확인하지 않았다.

- 각 실행에서 환경 권한과 현재 published 공연의 예매 URL 누락을 확인하고,
  대상이 있을 때만 같은 실행 안에서 공식 개별 상품 페이지 후보를 조사한다.
- 기존 비공개 기록과 수동 값을 보호하고, 변화 없는 보류는 반복 조사·통지하지 않는다.
- 관리자 확인 전 운영 booking_url 반영 금지를 유지한다. 예약 생성은 운영 자동 반영 승인이 아니다.
- 아티스트 상세 콘텐츠 보완은 다른 채팅의 담당이다. 다른 예약 호출·생성·수정과 기존 중지 예약 재개는 하지 않는다.
- 한 예약의 결과로 다른 예약을 자동 호출하는 연결은 현재 제공된 도구에 없어 구성하지 않았다.
- 현재 코드에 검증된 후보 저장 경로가 없으면 임의 writer를 만들지 않고 미저장 결과를 보고한다.

이후 사용자가 이 작업의 푸시·PR·main 병합을 승인했다. 위의 ‘푸시·PR·배포 없음’은
최초 검증 시점의 기록이며, 최종 병합 여부는 해당 PR 상태로 확인한다.
예매 URL 데이터만 기존 등록 경로로 수정하면 Git 병합은 필요 없다.
코드·설정 변경은 별도 PR과 필요한 배포를 거쳐야 한다. 이 문서 병합으로 운영 예매 URL을 바꾸지 않는다.
