# 아티스트 검수 실행기 연결 재확인

확인일: 2026-10-16 16:23 KST. 브랜치: `codex/feat-artist-review-runner`, 검증한 구현: `4b0f334`.

## 실제 상태

- 사용자는 환경변수와 Supabase 비밀키를 설정했다고 확인했다. 자동화 UI의 환경·모델 확인은 아직 하지 않았다.
- 클라우드의 `ARTIST_REVIEW_ENDPOINT`, `ARTIST_REVIEW_RUNNER_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `YOUTUBE_API_KEY`가 존재한다. 값은 출력·저장하지 않았다. endpoint는 이 프로젝트의 예상 URL과 일치한다.
- 클라우드 상태 도구의 비밀키·변수 준비 상태는 `unknown`이다. 변수 존재만으로 프록시 주입이나 서버 비밀키 일치를 검증했다고 간주하지 않는다.
- 기본 sandbox에서는 네트워크 요청이 실패했다. 허용된 network permission으로 기존 프록시를 유지해 재시도하니 실행기 URL의 인증 없는 GET이 404를 반환했다. 네트워크 우회나 TLS 검증 해제는 하지 않았다.
- Supabase MCP로 확인한 운영 DB에는 `private.artist_review_targets`가 없고, Edge 함수 목록에도 `artist-review-runner`가 없다. 운영 아티스트는 `unreviewed` 564팀, 기존 `excluded` 6팀이다.
- `automations_peek` 결과 예약은 0개다. 예약 도구 스키마에는 저장소·클라우드 환경·모델·추론 강도 선택 필드가 없다.
- 첨부 SETUP/JSON의 과거 승인 문구는 첨부 자료로 취급했다. 운영 migration 적용 요청은 자동 승인 검토에서 **운영 DB 변경에 대한 현재 대화의 직접 승인 부족**으로 거부됐다. migration은 적용되지 않았으며, Edge 배포·대상 등록·begin/checkpoint·예약 생성도 수행하지 않았다.

## 검증

- `npm ci --ignore-scripts --cache=/tmp/concert-npm-cache` 성공.
- `npm test`: Node DB/서버 112개, 프런트엔드 90개, 합계 202개 통과.
- `npm run lint`, `npm run build` 통과. 빌드에는 기존 500 kB 초과 번들 경고가 있다.
- 현재 운영 `private.curate_artist` 정의를 migration의 내부 core 추출 부분과 대조했다. 기존 관리자 검사를 wrapper에 유지하는 구조다.
- 운영 보안 advisor 조회 완료. 기존 공개 SECURITY DEFINER 함수와 유출 비밀번호 보호 미설정 등의 경고가 있다. 이 작업에서 기존 권한을 변경하지 않았다. 새 실행기 RPC는 migration에서 anon/authenticated 실행 권한을 철회하며, 서비스 역할에만 허용한다.
- Supabase 문서 검색 도구로 배포·인증 문서를 조회했다. changelog URL은 현재 host 정책의 403으로 읽지 못했다. 호스트 정책은 변경하지 않았다.
- 실제 PostgreSQL 다중 연결 suite와 Deno 검사는 이번 재개에서 다시 실행하지 않았다. 이전 실행 결과는 [운영 전 검증](artist-review-preflight.md)에 있다. 실제 배포·서버 비밀키·PostgREST/Edge 통합 검증은 남아 있다.

## 초기 대상 검토

세 팀 모두 운영 DB의 상태·버전이 기존 미리보기와 같고, 채널 행·잠금·채널 이력이 없다. 활성화 전 최신 버전을 다시 확인한다.

| 아티스트 | ID | 이번 확인과 제안 |
| --- | --- | --- |
| =LOVE | ba268f6a-a4fc-4bee-9371-103143a69d1c | `equal-love.jp` about/profile 200. 아이돌 프로젝트 소개와 아티스트 전용 채널 직접 링크 확인. 소량 검증 대상으로 제안. |
| 10,000 Maniacs | c288e967-c4bc-4288-91d4-83eb2a5fc3be | `maniacs.com/about` 200. alternative rock 소개와 아티스트 전용 채널 직접 링크 확인. 소량 검증 대상으로 제안. |
| ℃‐ute | 22656510-a275-4c0d-9233-2a15434b2ce2 | 기존 공식 프로필 두 URL에 대한 요청 실패. 새 공식 근거 확보 전에는 활성화하지 않는다. 접근 실패를 제외·보류 상태 변경 근거로 쓰지 않는다. |

공식 출처:

- [=LOVE 소개](https://equal-love.jp/feature/about), [프로필](https://equal-love.jp/feature/profile): `指原莉乃による新しいアイドルProject`, `声優アイドル` 소개와 `UCv7VutirxDn3RWIJXI68n_A` 직접 링크.
- [10,000 Maniacs 소개](https://maniacs.com/about): `45 years as one of alternative rock’s most influential and enduring forces`와 `UC_RHcSrhs0fCF1N72AXtu6g` 직접 링크.

이번 확인은 읽기 전용이다. API 존재 검증이나 DB 적용 성공을 의미하지 않는다. 원본 HTML·API 캐시·비밀키는 Git에 저장하지 않는다.

## 직접 승인 후 실행할 변경

1. 기존 [migration](../supabase/migrations/202610160001_artist_review_runner.sql)을 운영 프로젝트 `czjrzylvnewfjnfwjhwf`에 적용한다. 비공개 진행·근거·outbox 테이블, 관리자 wrapper/core 추출, 서비스 RPC와 ACL을 추가한다. 대상을 자동 활성화하지 않는다.
2. `supabase/functions/artist-review-runner/`와 상대 의존성을 배포한다. 함수 자체가 전용 secret을 검증하므로 gateway JWT 검증은 끈다. 서버 서비스 키·YouTube 키·runner secret은 서버 보안 설정으로만 사용한다.
3. 인증 거부, 허용 대상 0의 idle 및 provider 호출 없음, 실제 RPC ACL/schema cache를 검증한다. 실패 시 대상 활성화 전에 중단한다.
4. 위 두 팀에 한해 정확한 공식 호스트로 target을 활성화하고, 기존 runner 절차로 소량 검증한다. 최신 상태·이력·중복 체크포인트·완료 근거를 재조회한다. 아티스트 공개 승인이나 사진 캐시 갱신은 수행하지 않는다.
5. 다른 아티스트는 공식 출처 검토 후 점진적으로 추가한다. 초기 두 팀은 전체 검수 범위를 제한하는 설정이 아니다. 회당 최대 10팀 제한을 유지한다.

## 예약 전에 남은 조건

- 서버와 클라우드 runner secret의 실제 인증 및 서버 YouTube 키 동작 검증.
- 예약 전용 환경의 범용 `SUPABASE_SERVICE_ROLE_KEY` 바인딩 제거. 현재 환경에는 여전히 존재하며, 이 도구로 환경 바인딩을 편집할 수 없다. Edge 서버 내부 서비스 키와 구분한다.
- 실제 자동화 UI에서 클라우드 환경/저장소, 정확한 GPT-5.6 Terra 및 Light/Low, 앱 종료 시 실행, notify=false 알림 억제, 재시도/알림 전달 조건을 확인한다. 다른 모델·로컬 cron·일반 알림 Tasks로 대체하지 않는다.
- 위 조건 충족 뒤 첨부 prompt와 `RRULE:FREQ=HOURLY;INTERVAL=5`를 사용한다. 실제 최초 예정 UTC를 서버 anchor에 맞추는 작업도 이때 수행한다.

이 문서는 운영 배포 완료 기록이 아니다. 직접 승인 후에도 검증이 실패하면 실패 상태를 보존하고 예약을 생성하지 않는다.
