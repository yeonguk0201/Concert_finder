# 모델 호출 없는 대기 검사와 수동 검수

2026-10-18 KST, 사용자가 선택한 “API 추가 없이 스크립트 검사 + 필요 시 수동 검수”를 적용했다.

## 현재 동작

- 기존 Codex 5시간 모델 예약을 중지하고 재조회로 중지 상태를 확인했다. 별도 모델 API·GitHub 예약·로컬 cron은 추가하지 않았다.
- 운영 Supabase의 기존 pg_cron에 `artist-review-readiness`를 등록했다. `27 * * * *`로 SQL 함수를 호출하되 원래 검수 anchor 기준 5시간 구간별 한 번만 상태를 기록한다. 매일 0·5·10·15·20시로 반복 간격을 바꾸지 않는다.
- 내부 함수는 단일 검사 상태 행만 갱신한다. 검수 대상 선점·실행 임대·원래 slot·검수 결과·아티스트·알림 소비에는 쓰지 않고, 외부 사이트·YouTube·모델을 호출하지 않는다. 검사 기록은 누적되지 않는다.
- 전용 실행기의 `readiness`와 `scripts/check-artist-review-work.mjs`는 대기 여부·최대 10팀·최대 30건 알림 수만 읽는다. 전용 endpoint/runner secret이 없거나 다른 endpoint이면 요청하지 않는다.
- 관리자 아티스트 관리 화면에 `검수 대기 확인 · 모델 자동 호출 없음`을 추가했다. 펼칠 때 현재 상태와 마지막 서버 검사 시각을 읽는다. 대기 작업이 있으면 사용자가 이 대화에서 수동 검수를 요청한다. 이 변경에는 자동 모델 호출·외부 알림 전송이 없다.

상태 검사는 LLM 토큰을 사용하지 않는다. 수동으로 실제 근거 조사를 요청하면 해당 대화의 모델 사용량이 발생하며, 기존 Supabase 서버/DB 사용량까지 무료라는 뜻은 아니다.

## 운영 적용과 검증

- migration `20261017160310_artist_review_readiness.sql` 적용 성공, Edge 함수 `artist-review-runner` ACTIVE version 3 확인.
- 첫 서버 검사는 `idle / no_work / eligible=0 / notices=0`. 같은 구간 재호출은 `checked=false`이며 검사 시각도 유지됐다.
- 범용 DB 키·YouTube 키·Supabase URL 환경변수를 제거한 별도 프로세스에서 전용 CLI를 두 번 호출해 같은 idle 결과를 확인했다.
- 호출 후 기존 실행 2건·항목 4건, 원래 실행 잠금의 anchor·run ID·last_slot=1이 그대로였다. readiness 검사는 실제 검수 이력을 늘리지 않았다.
- 운영 ACL에서 anon 조회 불가, service_role 전용 조회 가능, service_role 내부 poll 실행 불가를 확인했다. 관리자 getter는 실제 관리자 검사를 수행한다. 새 테이블은 비공개/RLS이며 공개 역할과 service_role 직접 접근을 철회했다.
- 전체 테스트 218개(서버/DB 118 + 화면 100), lint/build, Deno check 통과. 실제 Chromium의 데스크톱/모바일 mock RPC 화면에서 표시·가로 넘침·중복 호출을 확인했다. ready/임대 만료·권한 거부·완료 재사용·실패 backoff·중복 poll은 테스트 DB에서 검증했다. 운영에서 이를 만들기 위해 아티스트 상태를 조작하지 않았다.
- 보안 advisor의 새 관리자 getter 경고는 authenticated 진입 뒤 실제 관리자 검사를 수행하는 의도된 경로다. 테스트에서 비관리자 거부를 확인했다. 기존 다른 함수 경고와 유출 암호 보호 비활성화는 이번 범위에서 변경하지 않았다. [함수 권한 경고 기준](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

서버 검사 예약은 이미 활성화됐다. 새 관리자 화면은 PR 병합·사이트 배포 후 나타난다. 실제 로그인한 운영 화면에서의 새 패널 확인은 배포 후 남아 있다.

## 대상 범위와 수동 검수

활성 검수 대상은 여전히 `=LOVE`, `10,000 Maniacs` 2팀이며 기존 유효 완료 근거를 재사용한다. 전체 미검수 585팀을 일괄 조사하거나 나머지 대상을 자동 활성화하지 않았다. 나머지는 정확한 신원·공식 출처 호스트 검토와 승인된 대상 등록이 필요하다.

수동 검수는 두 스킬과 [runner 절차](../skills/concert-artist-curation/references/runner.md)의 begin → guard → 팀별 checkpoint/defer → finish → notices를 사용한다. 서버가 배정한 최대 10팀만 처리한다. 범용 서비스 키 바인딩은 기존 환경에 남아 있으나 이 검사에는 사용하지 않았다. 환경 바인딩 제거가 완료됐다고 해석하지 않는다.

상태 검사만 중지하려면 운영자가 해당 pg_cron 작업을 중지한다. 기존 검수 근거·이력과 검사 테이블을 삭제하거나 과거 모델 예약을 자동 재활성화하지 않는다.
