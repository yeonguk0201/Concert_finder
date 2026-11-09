# 원본 환경에서 이어갈 API 공연 공개 릴리스

2026-11-09 KST. 사용자는 운영 연결을 **원본이 있는 기존 채팅**에서 이어가기로 선택했다. 이 문서는 현재 개발 채팅의 준비 결과와 운영 연결에 필요한 확인을 전달한다. 파일 경로가 같다는 이유로 두 환경의 ignored 파일·상태·설치를 공유한다고 가정하지 않는다.

## 전달할 코드와 검증

작업 브랜치: `codex/feat-api-first-kopis-validation`, PR 대상: `dev`. `dev`에서 `main`으로 반영할 때도 저장소의 정규 PR 절차를 따른다. 원본 작업 브랜치를 reset하거나 이 브랜치로 통째로 교체하지 않는다. 원래 런타임의 정상 후속과 비교해 최소 변경을 전달한다.

구현에는 API 정규화기·v4 공개 계약·일반 Node 실행기·상태 보존/cooldown·미확인 UI가 있다. 검수 계획 파일·AI 검색·외부 공지 조회·아티스트 writer가 정상 경로에 없다. 기본 환경에서는 API 경로가 활성화되지 않는다.

현재 개발 checkout에서 전체 `npm test`의 Node 363개와 Vitest 117개가 통과했다. 정식 migration 파일로 전환한 뒤 API 공개 계약 27개도 재검증했다. 릴리스 점검에서 SDK 요청의 20초 timeout·redirect 거부를 추가했으며 관련 검사 결과와 원격 CI는 PR에서 확인한다. 같은 코드/SQL SHA의 이미 완료한 검사를 반복하지 않는다.

## 확인된 운영 경계

- 원래 수집 채팅: `01a1634b-debf-70f1-8be7-0c5ed087e0b9` (제목: “복구하고 KOPIS 지연 진단”). 현재 개발 채팅과 다른 클라우드 인스턴스다.
- 수집 예약 `6ad9f566088c8191a029db4fd20b5613`은 읽기 전용 관측에서 `is_enabled=false`였다. 감시·아티스트 예약도 중지 상태이며 이번 작업에서 변경하지 않았다. 이 기록을 현재값 대신 사용하지 말고 실제 연결 시 다시 읽는다.
- 2026-11-09 17:46:01 KST 운영 SELECT: KOPIS collection/publication ON, `live_after=null`, 유효 collection lease 0. 실제 executor MD5는 `d95b0e3e9edda18b7adc9a626589074f`였다. 최근 KOPIS run `447e1ad5-a947-4e4f-b171-9357d0006c5a`는 2026-11-09 01:28:22~01:31:20 KST, 후보 88·공개 0·검수 대기 88의 partial 실행이었다. 예약 중지와 DB 정책 ON은 별개다.
- 현재 개발 환경에는 원래 `.local/concert-collection`이 없다. 원본 상태를 재생성하거나 과거 기록으로 복원하지 않았다. 운영 수집·정책 쓰기·DDL·배포·예약 활성화는 이 개발 채팅에서 수행하지 않았다.

## 정식 migration 준비

운영 이력에서 `20261106172058 / continuous_reviewed_publication`의 실제 SQL을 읽어 저장소에 누락돼 있던 [기존 migration](../../supabase/migrations/20261106172058_continuous_reviewed_publication.sql)을 복원했다. 준비 SQL과 일치함을 확인했다. 운영에는 이미 적용됐으므로 다시 적용하거나 history repair로 재등록하지 않는다.

새 [API 공개 migration](../../supabase/migrations/20261109084718_api_first_silent_publication.sql)은 Supabase CLI가 발급한 버전이다. CLI 2.101.0의 패키지에 포함된 공식 Go 실행 파일로 `migration new`를 실행했다. Bun 진입점의 읽기 전용 홈 설정 문제를 우회하기 위해 홈 경로나 시크릿을 바꾸지 않았다. 로컬 DB가 없으므로 `migration list --local`은 접속 실패였으며, 실제 SQL 검증은 격리 Postgres/PGlite에서 수행했다.

새 migration은 기존 executor·사실 검증·최종 트리거의 digest, 모든 공개 정책 OFF와 idle lease를 요구한다. 현재 운영 KOPIS 정책 ON 상태에 그대로 적용하면 거절된다. SQL의 guard를 제거하거나 대체 writer로 적용하지 않는다. 정규 릴리스에서 해당 정책 전환·설치를 조율한다. 원격에는 다른 아티스트 migration의 로컬 누락 이력도 있으므로 전체 `db push`·migration repair를 추측으로 실행하지 않는다. 이번 대상 버전과 실제 설치 이력을 먼저 대조한다.

## KOPIS 기본 사실의 이용 근거

[KOPIS 공식 OPEN API 안내](https://kopis.or.kr/por/cs/openapi/openApiInfo.do)의 현재 페이지와 그 페이지가 배포하는 구성 파일 `/_next/static/chunks/0ptu60kkx7hxd.js`를 읽었다. 안내는 KOPIS 항목 정보를 외부 기관/사용자가 활용하는 개방형 API로 설명하며 다음 조건을 명시한다.

- 발급받은 인증키를 타인에게 양도·공유하지 않는다.
- KOPIS 기반 서비스임을 표시하고, `(재)예술경영지원센터 공연예술통합전산망(www.kopis.or.kr)` 출처를 명시한다.
- 인증키별 쿼리 제한을 지키며, 초과하면 서비스가 중지될 수 있다.

공식 [개발 가이드](https://kopis.or.kr/upload/openApi/공연예술통합전산망OpenAPI개발가이드.pdf)의 공연목록·공연상세 REST/XML, 안정적인 공연 ID를 대조했다. 문서 버전은 5.0, 배포일 2026-04-23이다. 공개 안내에서 실제 발급 키의 남은 quota나 발급 계정별 조건을 확인한 것은 아니다. 원본 환경에서 이미 확인한 키별 제한·provider cooldown을 보존한다.

관측 시각: 2026-11-09 17:52:59 KST. 안내 구성 파일 SHA256: `d35685d6357a3c1bc34e1cda169a7eaede14b0cab613c7d3723d6b8b20af4bc4`. 개발 가이드 SHA256: `5ad22cecaa64567b6149bbff7339a546b34ef26f528ebbf464c87db7bf2a9385`.

[검토한 출처 설정](kopis-api-source-use.json)은 위 실제 안내와 관측 시각을 담은 비밀 없는 준비 값이다. DB에 적용하지 않았다. 원래 환경의 기존 이용 근거를 먼저 읽고 이번 검토와 대조한다. 값이 동등하거나 더 구체적인 검토가 있으면 기존 근거와 원래 시각을 유지한다. 이 범위는 기본 공연 사실·출처 링크이며, 본문/사진/포스터/로고·다른 주최사 공지·NOL/YES24 상품 정보의 취득/재사용/딥링크를 허용하는 설정이 아니다.

## 원본 채팅에서 이어갈 순서

1. `AGENTS.md`, [원래 계획](../api-first-concert-publication-plan.md), [구현/검증 기록](../work-in-progress/api-first-validation.md), 이 문서와 PR의 최종 SHA/CI를 읽는다. 현재 사용자 요청은 이 구현의 운영 연결을 원본 채팅에서 이어가는 것이다. 중지한 예약은 명시적인 재개 지시 전 유지한다.
2. 실제 원래 checkout·조상·Node24·프로젝트 바인딩을 확인한다. latest/review-checkpoint/review-batch-current/schedule-observation·고정 목록·baseline·통지 지문 및 상태 파일 SHA를 보존한다. 최신 owner·active·source lease·최근 실행·cooldownVersion2·nextAttemptAt을 읽는다. 다른 아티스트 queue나 승인에는 쓰지 않는다.
3. 현재 런타임과 PR의 최소 delta를 비교하고 호환성을 확인한다. 특히 원본 cooldownVersion2의 실제 필드와 새 helper의 해석을 대조한다. 형식이 다르면 현재 값과 다음 허용 시각을 보존하는 호환 수정을 검증한다. 상태를 기본값으로 재설정하지 않는다.
4. 정규 PR/릴리스 절차로 코드·스키마·출처 설정을 함께 조율한다. 새 migration은 공개 OFF·idle에서만 적용하며 설치 이력을 확인한다. 읽기 전용 capability에서 v4와 실제 `executor_md5`/`api_facts_md5`를 확인하고 검토한 값만 환경에 pin한다. `initial_import=true`, `live_after=null`과 다른 출처 정책을 유지한다.
5. AI 없이 코드를 실행할 **영속 상태를 보유한 일반 스케줄러 하나**를 실제로 선택·구성한다. 중지된 ChatGPT 예약을 켜서 정상 실행 주체로 삼지 않는다. GitHub를 선택하면 원본 상태의 안전한 영속 저장·최신 복원·원래 owner 전환부터 구현·검증하고, 상태 없는 임시 checkout으로 시작하지 않는다. 이 단계는 아직 구현/설치 영수증이 없다.
6. 기존 진입점 `node --use-env-proxy scripts/collect-concerts-scheduled.mjs`를 사용한다. 설정은 기존 보안 바인딩과 `KOPIS_API_FIRST_PUBLICATION=1`, 실제 검토한 두 digest이며 AI review file은 필요 없다. 현재 사용자 실행 범위·기존 대기를 지키며 수행한다. 수집/공개를 위해 helper CLI·직접 SQL writer로 guard를 생략하지 않는다.
7. 같은 source/run/공연 ID를 따라 저장·익명 공개 읽기·initial_import·연결된 알림 delivery/attempt 각각 0·기존 사실 보존·중복 0을 확인한다. 후보/공개 0인 실행이나 CI·설치 성공만으로 완료라고 하지 않는다. 다음 정규 회차 관측은 일반 스케줄러의 실제 활성화와 사용자 재개 지시 범위를 확인한 뒤 기록한다.

최종 완료 보고는 설치/CI, 최초 실제 공개, 다음 정규 회차를 구분한다. 이 개발 채팅에서 원래 상태 이관이나 실제 운영 공개가 완료됐다는 기록은 없다.
