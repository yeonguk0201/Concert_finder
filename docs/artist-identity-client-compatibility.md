# 설치된 identity RPC 클라이언트 호환 준비

2026-10-22 KST 운영 함수 정의를 읽기 전용으로 확인했다. 운영 이력 버전은 사용자 보고상 `20261022121342`이며 이 checkout에는 해당 마이그레이션/identity CLI가 자동 전달되지 않았다. 마이그레이션을 다시 적용하지 않았다.

## 확인한 서버 계약

- `service_begin_integrated_review(run_id, targets, batch_started_at)`는 기존/신규를 합한 서로 다른 1~40개 target을 고정 등록한다. 신규는 mutation.operation=register이며 expectedUpdatedAt=null이다. 기존 항목은 현재 원본 버전이 필요하다. 기존 run의 대상을 바꾸면 거부한다.
- `service_mutate_integrated_artist(run_id, band_id)`는 임의 변경 본문을 받지 않고 등록된 target.mutation만 적용한다. 기존 5시간 lease·legacy readiness·수동 보호를 검사한다. 별칭은 추가 방식이며 중복 MBID/이름/별칭 충돌을 거부한다. 등록은 approved가 아닌 unreviewed 상태로 시작한다.
- mutation은 operation/register 또는 aliases, musicBrainzId, name, country, aliases, requirements(identityMatched/countryMatched/sameIdentityAliases), keep proof/summary/sources를 요구한다. 소스는 실제 확인한 HTTPS·최근 90일 근거여야 한다.
- `service_integrated_identity_receipt(run_id, band_id)`는 mutation/before/after/relations를 반환한다. 현재 bands, 외부 ID, 공개 검색 결과 및 관계 보존을 별도로 재조회해야 한다. receipt 존재만으로 공개 검색 완료를 주장하지 않는다.

## 이번에 준비한 코드

`scripts/lib/artist-identity-contract.mjs`는 순수 검증 모듈이다. 신원/별칭 요건을 자동 true로 만들지 않으며, 소스 날짜·주소·크기, 같은 고정 40팀, 원본 버전·중복 MBID·수동 상태·별칭 충돌, receipt/현재 버전·관계·기존 별칭 보존을 검사한다. 입력/queue를 변경하거나 네트워크 요청·RPC를 실행하지 않는다. 서버의 private 수동 관리 이력 등 추가 검사는 서버가 계속 담당해야 한다.

로컬 격리 fixture 테스트 4개와 기존 queue 테스트 20개가 통과했고 lint/diff 검사를 통과했다. 이 테스트는 운영 DB 쓰기나 실제 신규 등록 성공을 의미하지 않는다.

## 아직 연결할 부분

현재 queue의 선택 구조는 기존 bands identityVersion을 전제로 한다. `--identity-file`/identity CLI, 신규 target의 초기 journal·복구·handoff, 등록 후 실제 readback을 통한 queue 편입, 검증된 버전의 기존 approval/channel 전달은 아직 구현되지 않았다. 이 모듈의 존재를 운영 identity 클라이언트가 완성됐다는 신호로 쓰지 않는다. 기존 검수는 이 준비 코드와 독립적으로 기존 snapshot/begin/context/apply/checkpoint/finish를 계속 사용할 수 있다.

다음 구현에서는 fixed batch 등록 전에 검증한 mutation을 대상 전체 한도 안에서 고정하고, 등록 오류/응답 유실에도 같은 run/receipt를 재사용해야 한다. 별도 writer/두 번째 begin으로 제한을 우회하지 않는다. 운영에 시험 신원·추정 MBID·근거 미완성 별칭을 넣지 않는다. 운영 DDL/권한/배포는 이번 호환 준비에 포함되지 않는다.
