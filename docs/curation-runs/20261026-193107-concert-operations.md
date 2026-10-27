# 공연 운영 감시 M21 — 2026-10-26 19:31:07 KST

## 새 관측

- `The entry to Jazz [서울 성수]` 후보 `addabd18-b8ac-4431-9810-715a296bc022`의 아티스트 참조 재소실을 확인했다. 이전 M20 revision9의 key1/band1이 현재 revision10에서 key0/band0이다.
- 현재 fetched_at은 2026-10-26 09:25:35.337512 UTC(18:25:35 KST). previous_payload에는 `mb:4e9bd85d-790c-4116-b8ab-e29f16168ac8`와 band `3a7b8fe0-5a44-43b8-b4a4-fb587763bbc9`가 남아 있다. 현재 카탈로그의 이연재는 unreviewed/공개승인 없음으로 별도 재조회했다.
- 과거 복원도 오래된2key 이력 대비1key의 부분 상태였으므로 완전 복구 뒤 재실패라고 과장하지 않는다. 참조의 현재1→0만 확인했다. 제거 원인·의도적 정책 처리 여부·다른 채팅 실행기 구현은 미확인이고 복원/수집 재전송/아티스트 변경은 하지 않았다.
- 기존 추적64개 중 empty60→61, 현재 nonempty KOPIS 참조18→17. rolling gaps15는 같으며 새 추적 ID0. 새 사건을 기존 추적 기록에 결합하고 기존 누락을 지우지 않았다.

## 현재 수집·공개·알림

- KOPIS 신규 실행1회(09:22:05~09:25:35 UTC)는100건 success/failure0/review100/publication0. 전체 후보819(이전817), keys empty802, sessions/발표/일반예매 필드 미완료819. 후보 건수 증가는 공개 완료가 아니다.
- GitHub API의 최근 완료 실행은 M20의40278117655 success 그대로이며 이후 정기 실행은 현재 반환 목록에 없다. 기존 시간당17분 선언과 실제 기록을 구분했다. 별도 KOPIS 실행을 GitHub 스케줄러 해소 증거로 세지 않는다.
- collection policy와 source lease를 현재 읽었다. 모든 publication OFF/live_after=null, YES24 collection OFF, source lease0 보존. 요네즈 후보 revision6·아티스트 미연결·예매/발표/회차 미완료 및 PF303833 후보0은 기존 차단으로 보존하고 반복 통지하지 않는다.
- Reissue/NOL 현재HTTP200, NOL robots 허용. Reissue 업데이트를 최초 발표로, 휠체어 전화 공지를 일반예매로, 상품 기간을 매일 회차로 확정하지 않았다. NOL 외부 서면 허가와 정확 일반/선예매 시각은 미확정이다.
- 현재 notification cron 매분/active, 최근5회 succeeded·HTTP200·claimed/sent/failed0. sent36/invalidated7 집계 불변. 현재 대상이 없다는 응답과 실제 기기 수신은 별개다.
- 출처별 pass/fail/unverified 요건은 JSON에 보존했다. 모두 NOT_READY이며 수동 publication OFF 승인만 남은 출처는 없다.

## 검증과 범위

- 필수 문서 UTF-8 읽기, 현재 checkout/head3e5a270 및 복구 커밋 f267be1/fd45938 포함, 최신 .local 연속성과 실제 table definitions/DB SELECT 성공 확인. 환경 current/ready와 실제 요청 성공을 구분했다.
- 새 참조 소실 관측에 맞춰 `node --test tests/collection-artist-links.test.mjs`를 격리 실행: 파일 수준 pass1/fail0, 11873ms. 운영 DB/수집/알림을 실행하지 않는다. 로컬 fixture 통과가 배포9aa7f1a나 별도 실행기의 운영 동작/실제 복구 증거는 아니다.
- 나머지 NOL/notification-worker2파일은 코드/테스트가 M18 이후 불변임을 확인하여 이전 통과 결과를 재사용했다. 새로3파일을 실행했다고 세지 않았다.
- queue revision3066/active=null/transfer=null, SHA `7012dd8c0b1a9ded2d7886bb59921254690f832ba776d922e9a64420bdcef581` 전후 일치. DB/RPC 쓰기·queue begin/checkpoint/finish·init/accept/handoff0.
- 운영 DDL/정책ON/배포/push/PR/merge·수집 재실행·발송·예약 변경0. 비밀·Vault·cron command·개인 사용자 행·푸시 endpoint/키·원본 HTML/API 이미지 저장0.

현재 상태·개별 후보 전후·집계·fingerprint: [20261026-193107-concert-operations.json](20261026-193107-concert-operations.json).
