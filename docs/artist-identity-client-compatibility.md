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

현재 queue의 선택 구조는 기존 bands identityVersion을 전제로 한다. `--identity-file`/identity CLI, 신규 target의 초기 journal·handoff, 등록 후 실제 readback을 통한 queue 편입, 검증된 버전의 기존 approval/channel 전달은 아직 구현되지 않았다. 이 모듈의 존재를 운영 identity 클라이언트가 완성됐다는 신호로 쓰지 않는다. 기존 검수는 이 준비 코드와 독립적으로 기존 snapshot/begin/context/apply/checkpoint/finish를 계속 사용할 수 있다.

아래 2026-10-24 journal 준비로 **입력 보존 계층**은 추가됐다. 위 목록의 CLI·handoff·queue 편입·서버 등록/변경 연결은 계속 미완성이다.

다음 구현에서는 fixed batch 등록 전에 검증한 mutation을 대상 전체 한도 안에서 고정하고, 등록 오류/응답 유실에도 같은 run/receipt를 재사용해야 한다. 별도 writer/두 번째 begin으로 제한을 우회하지 않는다. 운영에 시험 신원·추정 MBID·근거 미완성 별칭을 넣지 않는다. 운영 DDL/권한/배포는 이번 호환 준비에 포함되지 않는다.

## 읽기 전용 영수증 복구 검증 — 2026-10-23 KST

`scripts/lib/artist-identity-work.mjs`에 `recoverIdentityWork`를 추가했다. 고정 선택·소유권·전환 여부·원본 버전·실제 요건 입력을 먼저 검사하고, 주입된 읽기 함수로 기존 identity receipt, 현재 band, 관계 수, 연결 mb key 및 이름/별칭별 공개 검색을 대조한다. 공개 검색이 누락되거나 여러 ID를 반환하면 receipt 성공과 구분해 `search_pending`으로 남긴다. 영수증이 없으면 `not_applied`이며 다른 쓰기 경로를 호출하지 않는다. 외부 오류 본문은 결과에 노출하지 않는다.

이 모듈에는 네트워크 클라이언트·비밀값 로딩·mutation/approval RPC·queue 파일 쓰기가 없다. CLI와 연결되지 않았으며 운영에 호출하지 않았다. 파일이 존재한다는 이유만으로 예약의 신규 등록/별칭 작업을 활성화하지 않는다. 기존 운영 승인을 차단한 자동 승인 검토를 우회하는 코드도 아니다.

신규 복구 테스트 6개와 기존 contract/queue 테스트를 합한 30개가 통과했다. 기존 queue의 최대40팀·수동 보호·버전·finish 테스트도 함께 통과했다. lint/build 결과는 실행 기록을 따른다. 이 검증은 격리 fixture이며 실제 신원 등록·별칭 저장·공개 검색 완료의 증거가 아니다.

## 고정 입력 journal 준비 — 2026-10-24 KST

운영 `service_mutate_integrated_artist(run_id, band_id)` 정의를 다시 읽어, 변경 본문은 해당 실행에 미리 등록한 `target.mutation`에서만 가져오고 기존 receipt를 재사용함을 확인했다. 현재 활성 batch의 대상을 바꾸어 mutation을 추가할 수 있다는 뜻은 아니다.

`scripts/lib/artist-identity-journal.mjs`는 실제 요청 전에 보존할 **전체 고정 선택 목록**을 만든다. 기존 contract 검증을 재사용해 원본 버전·공통40팀·신원/별칭 근거·전체 catalog 충돌을 검사한다. 신규 ID를 생성하거나 기존 queue를 수정하지 않는다. mutation 없는 기존 검수 대상도 같은 목록에 포함해 공통 한도를 보존한다.

입력은 UTF-8·0600 파일로 flush한 뒤 atomic no-replace link로 공개한다. 같은 run/전체 targets의 canonical SHA-256 fingerprint가 일치할 때만 기존 파일을 재사용한다. 서로 다른 요청·손상 파일·symlink는 거부하고 원본을 덮어쓰지 않는다. 이 fingerprint는 입력 일치 검사이며 신원 근거나 서버 승인 증거가 아니다. 디렉터리는 호출자가 허용된 로컬 경로로 제공해야 하고, 향후 CLI에서 기존 경로/잠금 검사를 함께 적용해야 한다.

journal은 실행·완료 상태, 비밀값 로딩, DB/RPC 호출을 제공하지 않는다. 현재 예약에 연결하지 않았고 운영 journal을 만들거나 mutation을 실행하지 않았다. 5시간 lease/readiness 및 서버에 등록된 target 대조, 응답 유실 시 receipt 복구, 실제 공개 검색/queue checkpoint 연결까지 갖추기 전 신규 등록·별칭을 활성화하지 않는다. 과거 승인 거절 입력을 새 writer로 제출하는 용도로 사용하지 않는다.

격리 테스트는 전체 목록/원본 불변성, 버전·요건·상한·선택 밖 대상 거절, 신규 충돌, 재시작·동시 동일 저장, 변경 요청·손상·symlink 보존과 근거 만료를 확인한다. 운영 성공 증거와 구분하며 실제 검사 결과는 해당 실행 기록에 남긴다.
