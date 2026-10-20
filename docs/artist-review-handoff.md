# 로컬·클라우드 교대 검수

한쪽 예약만 켜고, 실행 종료와 최신 인계 파일 전달을 확인한 뒤 다른 쪽을 켠다. 예약 일시정지는 이미 실행 중인 작업을 취소하지 않는다. 컴퓨터 종료만으로 클라우드가 로컬 파일을 읽거나 마지막 진행 위치를 알 수는 없다.

## 구현 범위

`scripts/artist-review-queue.mjs`와 `scripts/lib/artist-review-queue.mjs`는 기존 카탈로그의 신원·장르/분류·승인/채널·사진에 **하나의 최대 40팀 목록**을 사용한다. 오류·보류·권한 대기도 선택 수에 포함하고 실패한 팀 대신 새 팀을 넣지 않는다. 같은 상태 파일의 begin 재호출은 기존 batch를 반환한다. 첫 선정 이후 5시간 안에는 새 batch를 만들지 않으며 이 시각은 인계 시에도 보존한다.

우선순위는 신원·장르 → 완료 근거가 있는 분류·승인 → 채널·사진이다. 같은 우선순위는 대기 시작 시각, 이름·ID 순으로 처리한다. `--direction=reverse`는 대기 시각까지 같은 항목의 이름·ID 순서만 반대로 한다. 날짜가 된 재시도보다 역순 이름을 우선하지 않는다. 수동 보류/제외는 선택하지 않고 기존 승인 팀은 채널 단계만 선택한다.

예약의 Codex가 스킬로 근거를 조사하고 checkpoint한다. 모델 API는 추가하지 않았다. 서버 키가 설정되어 있고 새 RPC 설치가 읽기 전용 검사로 확인되면 `apply`는 `service_apply_integrated_review`를 사용하며 사람의 로그인 세션이 필요 없다. 서버 키는 기존 서버 전용 환경 파일에서 로드하고 출력하지 않는다. 새 RPC가 아직 없으면 기존 경로를 유지한다. 정식 관리자 토큰이 있으면 `admin_curate_artist`를 사용하고, 없으면 authority_wait로 보존한다. 새 관리자나 사용자 토큰을 만들거나 추출하지 않는다. 설치 후에는 새 service authority 식별값으로 이전 권한 대기 항목도 다음 정상 batch에서 다시 선택한다.

2026-10-20 사용자 승인 후 Concert_finder(czjrzylvnewfjnfwjhwf) 운영 DB에 integrated_artist_approval 마이그레이션을 설치했다. 원격 이력 버전은 20261020053150이며 로컬 파일명도 일치시켰다. 실제 서버 키로 설치 인식과 잘못된 선정/미등록 실행/미선정 context 거부를 확인했다. 새 RPC 4개 모두 anon/authenticated 실행 권한은 없고 service_role만 호출 가능하다. 보안 advisor에서 새 RPC에 관한 경고는 없으며, 두 private 테이블의 RLS 정책 없음 INFO는 직접 접근을 모두 회수하고 전용 RPC만 허용하는 설계에 해당한다. 설치 검증 시 등록 실행과 적용 receipt는 모두 0건이며 실제 아티스트 상태는 변경하지 않았다. 예약의 5시간 일정·활성 상태·대기열은 유지했다.

클라우드는 동일 코드를 동기화한 뒤 기존 보안 바인딩으로 설치 여부를 확인한다. 같은 운영 DB이므로 이 마이그레이션을 다시 적용하지 않는다. 로컬의 미푸시 커밋은 git fetch로 받을 수 없으므로 제공한 sync patch를 전달해 작업 브랜치에서 git am으로 적용할 수 있다. 이미 동등한 변경이 있거나 충돌하면 먼저 차이를 검토하고 기존 파일을 강제로 덮어쓰지 않는다. 코드 동기화만으로 검수 owner나 로컬 ignored 상태 파일이 전달되지는 않는다. owner=local인 동안 클라우드 예약은 실행하지 않고 최신 handoff를 accept한 뒤 전환한다.

`begin`은 로컬 고정 목록을 저장한 뒤 `service_begin_integrated_review`에 동일 최대 40팀과 원본 버전을 등록한다. 서버도 5시간 간격·대상 불변·대상별 버전·수동 결정 보호를 검사한다. 등록 실패 시 로컬 batch를 보존하므로 같은 begin으로 재시도한다. 등록한 실행의 쓰기 유효시간은 5시간이다. `LEASE_LOST`면 미완료 작업을 finish --defer-pending으로 보존하고 다음 정규 batch에서 새 스냅샷을 확인한다. 등록 후 채널 작업으로 bands 버전이 바뀌지 않도록 분류·승인을 먼저 수행한다.

서버는 승인 요건별 근거, 최근 90일 출처, 판정 일치, DB의 외부 신원 연결을 검사한다. 승인 시 category와 curation_status를 한 트랜잭션에서 저장하고 외부 신원별 공연 자동 공개 승인을 부여한다. 공연 자체는 이 RPC에서 공개하지 않으며 기존 수집기의 나머지 공개 요건도 유지된다. 사람 대신 실행 ID를 publication approval 및 private.integrated_review_receipts에 남긴다. 이 receipt는 기존 bands 변경 이력과 별도로 원본·결과·조사·요건별 근거·관계 수를 보존한다. CLI는 receipt, 최신 bands, 공개 승인 연결, 공연·찜 관계 수를 재조회한 경우만 applied=true로 기록한다. 같은 입력 재전송은 새 변경을 만들지 않는다.

기존 dedicated 서버 실행기의 10팀·사전 등록·출처 호스트 제한은 변경하지 않았다. 통합 대기열은 별도의 service RPC를 사용하며 기존 10팀 runner에 40팀을 주입하지 않는다. begin과 적용 RPC는 기존 서버 readiness를 확인해 진행 중/만료 미정리 실행이 있으면 중단한다. 기존 dedicated runner는 통합 실행 등록을 읽지 않으므로 두 예약을 병행 활성화하지 않는다. 통합 경로끼리는 서버 등록의 5시간 제한과 버전 검사도 적용되지만 파일 인계 운영을 대체하지 않는다.

## 첫 준비와 정상 실행

양쪽 checkout에 같은 코드가 있어야 한다. 기존 로컬의 임시 40팀 스크립트를 예약에서 호출하지 않는다. 새 코드는 Windows 경로 구분자를 처리하고 Node 24에서 실행한다. Windows에서는 프로젝트 루트에서 실행한다. 클라우드는 `/workspace/Concert_finder`를 사용한다.

클라우드는 기존 보안 바인딩을 사용한다. 로컬은 `.env.push.local`(없으면 실제 `env.push.local`)을 UTF-8로 읽고 YOUTUBE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY만 없는 변수에 로드한다. 기존 변수는 덮어쓰지 않고 다른 프로젝트 URL이면 중단한다. 관리자 세션이 정식으로 제공된 경우에만 ARTIST_REVIEW_ADMIN_ACCESS_TOKEN을 프로세스의 비밀 환경변수로 사용한다. 값은 명령 인자·Git·보고서에 넣지 않는다. `--authority-key`는 확인된 세션 변경을 구분하는 비밀이 아닌 식별값이며 토큰을 넣지 않는다.

다음은 `local` 기준이다. 클라우드에서는 `--owner=cloud`를 쓴다. `init`은 최초 한 번만 한다. 다른 컴퓨터의 대기열을 이어받을 때는 새로 init하지 않고 accept한다.

```sh
node --use-env-proxy scripts/artist-review-queue.mjs snapshot --owner=local
node scripts/artist-review-queue.mjs init --owner=local
node --use-env-proxy scripts/artist-review-queue.mjs begin --owner=local --input=.local/artist-review-queue/catalog.json
```

snapshot은 현재 DB를 페이지별로 읽는다. catalog.json의 건수는 그 시점 값이고 과거 585/616팀을 상수로 쓰지 않는다. 고정된 대상은 .local/artist-review-queue/batch.json에 있다. 각 팀의 tasks만 처리하며 실행 중 추가 대상을 선택하지 않는다. 스킬 조사 후 같은 폴더의 JSON으로 checkpoint한다. 예시의 ID/시각/근거는 실제 값으로 작성한다.

```json
{
  "runId": "batch의 runId",
  "bandId": "선택된 bandId",
  "stage": "research",
  "status": "complete",
  "reason": "정확한 신원과 실제 활동을 자료에서 확인함",
  "proof": {
    "decision": "keep",
    "summary": "실제로 확인한 장르·신원 근거",
    "sources": [{"url": "https://official.example/artist", "checkedAt": "실제 UTC ISO 시각", "excerpt": "직접 확인한 짧은 원문 인용"}]
  },
  "apiCalls": 0
}
```

```sh
node scripts/artist-review-queue.mjs checkpoint --owner=local --input=.local/artist-review-queue/item.json
```

stage는 research/approval/channels이며 complete/deferred/exception/authority_wait를 구분한다. deferred는 24시간 뒤 재시도하며 완료 근거를 만들지 않는다. 판단이 필요한 구체적 예외만 exception이다. 완료 research는 동일 신원·상태·버전·정책에서 90일, channels는 7일 재사용한다. 마지막 성공 시각을 실패로 앞으로 밀지 않고 보존한다. 90일은 실제 출처 확인 시각에서 계산하므로 오래된 근거를 불러온 날로 유효기간을 연장하지 않는다. verified 채널의 verification에는 실제 API 캐시 checkedAt도 넣어 7일 기준을 보존한다. 같은 체크포인트의 재전송은 API 건수를 중복 가산하지 않는다. 다른 결과로 덮어쓰려면 새 검수가 필요하다.

`apply` 입력은 runId, bandId, proposal(기존 admin_curate_artist와 같은 입력), requirements, approvalEvidence다. 승인 requirements는 identityMatched/countryMatched/genreMatched/classificationMatched/externalIdentityLinked/publicationEffectUnderstood의 실제 확인 결과다. approvalEvidence에는 같은 여섯 키마다 `{ "summary": "해당 요건을 확인한 구체적 설명", "sourceUrls": ["research proof에 포함된 실제 출처 URL"] }`을 기록한다. 공개 효과의 summary에는 분류 승인으로 외부 신원별 공연 자동 공개 승인이 생기며 기존 이벤트 공개 조건도 필요함을 명시한다. keep를 approved와 동일하게 취급하지 않고, readyToApply=false 또는 requirements=false를 인증 복구만으로 true로 바꾸지 않는다. 미확인 요건은 공식 자료를 보완한 뒤에만 제출한다. 조사 출처에는 승인 proposal의 evidence_url도 포함한다. 제외·보류는 기존 category를 보존한다.

외부 신원 연결은 선택된 팀의 서버 context로 확인한다. `{ "bandId": "선택된 UUID" }` 입력으로 다음 명령을 실행하면 현재 band와 연결된 외부 key/evidenceUrl이 context.json에 저장된다. 공식 프로필과 실제 신원을 별도로 대조한다. 서버는 승인 시 band.musicbrainz_id와 일치하는 기존 mb 신원 연결도 검사한다. 연결 누락을 임의의 새 ID 생성으로 해결하지 않는다.

기존 research가 재사용되어 approval만 선택된 팀에도 새 출처 보완이 가능하다. `apply` 입력의 선택 필드 `approvalProof`에 기존 proof와 같은 `{decision, summary, sources}` 형식으로 승인에 사용한 전체 근거를 제출한다. sourceUrls와 evidence_url은 이 proof에 있는 출처를 가리킨다. 원래 조사 결과는 보존하고 서버 receipt에 보완 근거를 함께 남긴다. 판정을 바꾸거나 실제 확인 시각을 꾸미는 용도로 쓰지 않는다. 기존 연구의 유효기간과 현재 신원 버전 검사도 유지한다.

```sh
node --use-env-proxy scripts/artist-review-queue.mjs context --owner=local --input=.local/artist-review-queue/context-input.json
```

```sh
node --use-env-proxy scripts/artist-review-queue.mjs apply --owner=local --input=.local/artist-review-queue/proposal.json
```

채널 manifest는 동일 batch의 ID와 identityVersion만 포함한다. 공식성·신원·API 검증은 기존 채널 스킬을 따른다. 다음 명령은 실제 저장이므로 조사 근거가 갖춰졌을 때만 사용한다. `--selection`을 생략하면 기존 전체 갱신 동작이므로 이 예약에서는 반드시 지정한다.

```sh
node --use-env-proxy scripts/refresh-artist-channels.mjs --upload --selection=.local/artist-review-queue/batch.json --manifest=.local/artist-review-queue/channels.json --output=.local/artist-review-queue/channel-summary.json
```

API 조회·결과 저장은 선택된 최대 40팀으로 제한한다. 기존 manifest RPC는 전체 만료 캐시 정리도 수행하며 공유 채널 충돌 처리도 기존 서버 규칙을 유지한다. 스키마/RPC를 바꾸지 않아 이 전역 정리 동작은 남아 있다. `applied`는 선택 모드에서 저장 후 상태·신원 버전·캐시 ID/시각이 재조회로 확인된 수다. 오류 상태 저장을 공식 채널 확인/사진 확보 성공으로 세지 않는다. API 제목·사진 URL을 보고서/Git에 누적하지 않는다.

채널 작업 후 같은 40팀의 channels 단계를 checkpoint하고 finish한다. 조회·저장 건수와 실제 요청 수를 누락하지 않는다. 완성 보고서를 검토해 API 캐시·키 없이 docs/curation-runs에 KST 실행 시각으로 저장하고 로컬 커밋한다. 이 보고서는 전체 카탈로그 완료를 뜻하지 않는다.

```sh
node scripts/artist-review-queue.mjs finish --owner=local
```

## 컴퓨터를 끄기 전 인계

1. 로컬 예약을 일시정지한다.
2. 실제 조사/저장 프로세스가 종료될 때까지 기다린다. 이미 종료된 중단 실행은 `finish --defer-pending`으로 남은 단계를 지연 보존한다. 다른 프로세스가 쓰는 동안 강제로 finish/lock 삭제하지 않는다.
3. 아래 handoff로 발신 상태를 정지하고 packet을 만든다. 발신 쪽은 인계 후 begin/checkpoint를 거부한다.
4. 최신 handoff.json을 클라우드의 같은 ignored 폴더로 전달하고 accept 성공을 확인한다. 전달 전 PC를 끄면 클라우드는 마지막 기록을 알 수 없다.
5. 클라우드 예약을 활성화한다. 켜는 것만으로 즉시 실행이 보장되지는 않으며 저장된 5시간 일정에 따른다.

```sh
node scripts/artist-review-queue.mjs status --owner=local
node scripts/artist-review-queue.mjs finish --owner=local --defer-pending
node scripts/artist-review-queue.mjs handoff --owner=local --to=cloud
```

finish는 active batch가 있을 때만 실행한다. 클라우드에서:

```sh
node scripts/artist-review-queue.mjs accept --owner=cloud --input=.local/artist-review-queue/handoff.json
```

PC를 켤 때는 반대로 클라우드 예약 중지 → 진행 작업 종료 → handoff --owner=cloud --to=local → 파일 전달 → accept --owner=local → 로컬 예약 활성화한다. 기준 시각과 체크포인트를 이어받으므로 컴퓨터를 바꿔 5시간 상한을 초기화하지 않는다. 이미 받은 낡은 packet은 revision 검사로 거부한다.

## 남은 운영 조건

로컬 전용 파일은 클라우드에서 접근할 수 없다. 양쪽에 동일 코드 배치와 최신 packet 전달이 필요하며, 자동 파일 동기화/공통 DB 대기열/예약 토글 연동은 구현하지 않았다. 오래된 상태 파일 복사본을 두 컴퓨터에서 동시에 쓰는 것을 파일 잠금으로 막을 수는 없다. 사용자가 한쪽만 활성화하고 종료·인계를 확인하는 운영 방식이 전제다. 클라우드 환경 재생성 시에도 최신 packet을 복구해야 하며, 상태가 없으면 자동 초기화하지 않고 중단한다.

기존 로컬 40팀 JSON 원본과 대기열은 이 checkout에 없다. 사용자가 전달한 Danzig/한로로 위치만으로 전체 완료를 추측하거나 40팀의 전체 단계를 완료 처리하지 않는다. 과거 기록은 정확한 신원·버전·실제 완료 근거가 확인된 것만 재사용한다. 예약 실행 중에는 DB 스키마/권한/배포와 push/PR/merge를 수행하지 않는다. 서버 적용 경로 설치는 20261020053150_integrated_artist_approval 마이그레이션으로 별도 관리한다.
