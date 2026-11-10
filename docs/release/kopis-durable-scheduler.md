# KOPIS 일반 스케줄러와 상태 소유권

PR #77의 API 공개 경로를 GitHub Actions의 일반 Node 작업으로 연결한다. ChatGPT·AI 검색·검수 계획 파일은 정상 실행에 없다. 이 설치의 기본 상태는 **중지**다. 기존 ChatGPT 수집·감시·아티스트 예약을 켜지 않는다.

## Cloudflare 정기 트리거

- Worker `concert-finder-kopis-dispatch`는 매시 23분에 GitHub의 `main` workflow를 호출한다. 실제 수집은 Worker 설정의 `KOPIS_EXECUTE_CRON`과 일치하는 예약에서만 요청한다. GitHub 자체 cron은 제거하며, 릴리스 push와 기본 수동 dispatch는 연결만 검증한다.
- Worker Secret `GITHUB_DISPATCH_TOKEN`은 이 저장소에 한정된 GitHub Actions 쓰기 권한을 사용한다. Worker 로그에 남긴 GitHub run ID로 결과를 확인한다. 토큰 교체 후에는 `execute=false` 검증으로 연결을 확인한다.
- 기존 GitHub workflow가 단일 수집 실행 주체로 남으며, 비공개 상태·lease·최근 1시간·오류 대기를 계속 적용한다. 복구로 GitHub cron을 다시 넣기 전 Cloudflare cron을 먼저 해제한다. 아래 최초 설치 및 사용자 재개 기록은 전환 전 이력이다.

## 실행과 비공개 영속 상태

- workflow: `.github/workflows/collect-kopis-api.yml`, protected environment `catalog-ingestion`. 기존 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KOPIS_SERVICE_KEY` 바인딩을 사용한다. 시크릿을 Git/로그/artifact에 복사하지 않는다.
- 프로젝트 `czjrzylvnewfjnfwjhwf`의 비공개 Storage bucket `concert-scheduler-state`. 일반 사용자용 RLS 정책·공개 URL·signed URL을 만들지 않는다. 서버 service binding으로만 접근한다.
- 원본 네 파일 `latest.json`, `review-checkpoint.json`, `review-batch-current.json`, `schedule-observation.json`을 원래 UTF-8 바이트와 개별 SHA256 그대로 gzip 묶음에 보존한다. `kopis/original.json.gz`는 덮어쓸 수 없는 최초 백업, `kopis/current.json.gz`는 현재 상태다. 원문 상태는 GitHub artifact나 공개 저장소에 올리지 않는다.
- 빈 환경에서 새 checkpoint를 만들지 않는다. 기존 원본에서 명시적으로 `--bootstrap-original`한 최초 상태만 허용한다. 이후 임시 runner는 최신 묶음을 검증하고 빈 디렉터리에 원래 바이트를 복원한다. 기존 로컬 파일이 있으면 덮어쓰지 않는다.
- 실행 전에 generation을 올려 `executing`을 저장하고 읽기 확인한 뒤 기존 `node --use-env-proxy scripts/collect-concerts-scheduled.mjs`를 한 번 호출한다. 정상 반환 후 변경된 latest와 그대로인 검수 파일 3개를 새 generation으로 저장·재확인한다. 저장 실패·프로세스 실패·미확정 반환은 `executing`을 유지해 다음 실행을 막는다. 임의 초기화 대신 같은 DB run/lease부터 조사한다.
- GitHub concurrency `kopis-api-durable-owner`가 단일 writer를 직렬화한다. Storage의 읽기 비교를 서버 CAS나 다른 writer까지 보장하는 분산 잠금으로 주장하지 않는다. 원본 로컬은 별도 `scheduler-owner.json`으로 이관을 표시하고 기존 수집 호출을 거절한다. 다른 출처 workflow는 KOPIS를 항상 제외한다.

## 중지·재개 경계

정기 실행에는 저장 상태 `phase=idle`과 repository variable `KOPIS_API_SCHEDULER_ENABLED=true`가 **모두** 필요하다. 최초 설치 상태는 `phase=paused`이며 variable이 없거나 false면 정기 job 자체도 건너뛴다. `workflow_dispatch` 기본값과 main 릴리스의 push 확인은 읽기 전용이다. 정책 ON이나 수동 execute 체크만으로 paused 상태를 해제할 수 없다.

사용자의 별도 재개 지시를 받은 운영자가 현재 DB lease·최근 실행·cooldown·원본 SHA·실제 v4 두 digest를 확인한 뒤 지원 Storage client의 `stateStore.write(previous, next)`로 `paused→idle`, generation+1을 기록·재확인하고 repository variable을 켠다. 이 재개는 이번 설치에서 하지 않는다. 기존 ChatGPT 예약은 재개 이후에도 정상 실행 주체로 쓰지 않는다. 중지하려면 variable을 먼저 false로 바꾸고 진행 중 실행 종료/저장 확인 후 상태를 paused로 기록한다. `executing`은 자동 해제하지 않는다.

## 배포 및 계약

`docs/release/kopis-api-runtime.json`은 검토한 SQL을 격리 DB에 설치해 얻은 digest다. 운영 조회값을 자동으로 pin으로 승격하지 않는다. 실제 서버 capability가 이 두 값 및 v4/API facts 계약과 일치하고 KOPIS collection/publication ON, live_after=null, 실제 출처 설정이 확인되어야 한다. HTTP400은 원본 request context별 1h→6h→24h이며 부분 실패·일자 이동도 누적한다. 기존 미래 nextAttemptAt과 미확정 24h 보호를 보존한다.

운영 schema 설치는 공개 OFF·idle lease에서 정규 릴리스 migration만 적용한다. 기존 역사 migration 재실행·전체 db push·history repair·직접 후보/공연 writer를 사용하지 않는다. 출처 설정은 검토한 KOPIS 사실/출처 링크 범위이며 포스터·외부 공지·상품 링크 허가로 확대하지 않는다. 다른 출처 공개·알림 live·아티스트 writer는 그대로다.

설치·CI·비공개 상태 roundtrip·읽기 전용 연결 확인과 실제 첫 공개·다음 정기 회차는 별도 성과다. 중지를 유지한 설치에서는 새 수집/공개 또는 알림0 운영 receipt를 만들어냈다고 보고하지 않는다.

## 운영 기준 함수 대조

2026-11-09 읽기에서 기존 `admin_ingest_catalog`는 정규 `20261014125200_kopis_discovery`의 정의와 MD5 `7eb3bb5ec9c207e2ca97a26795f31500`가 같았다. 선택 Reissue wrapper를 포함하는 전체 격리 fixture와 이 기존 함수가 달랐다. 운영 함수를 바꾸거나 역사 migration을 재실행하지 않는다. 실제 기준을 정규 SQL로 재현한 별도 격리 검사에서 executor `ae38470098f40cb3aec9582172c0b9c4`, API facts `3c356e529b6e1dc2fe04041c64a3248d` 및 무알림 공개를 검증한다. 이 독립 검증값을 release pin으로 사용하며 조회값을 그대로 승인하지 않는다.

## 2026-11-09 사용자 재개 지시

사용자가 “예약 재개하고 바로 실행해서 확인해봐”로 일반 GitHub 스케줄러의 재개와 즉시 1회 실행을 승인했다. GitHub 연결 도구에는 repository variable 변경과 workflow dispatch가 없어 기존 workflow의 실행 설정을 정규 PR로 반영한다. 새로운 실행 주체나 ChatGPT 예약을 만들지 않는다.

이 재개 릴리스 이후 비어 있는 repository switch는 true를 기본값으로 사용하고, 명시적인 false는 계속 존중한다. 저장 상태가 paused 또는 executing이면 실행되지 않는다. 운영자는 재개 전에 최신 DB lease/최근 실행/cooldown과 원본 SHA/v4 pin을 읽고 지원 Storage client로 paused→idle, generation+1만 기록·재확인한다. 원본 네 파일을 재생성하거나 수정하지 않는다.

이 workflow 또는 pin 파일이 변경된 main 릴리스 push는 기존 runner를 즉시 1회 호출한다. 정기 실행도 같은 entry·단일 concurrency·서버 lease·최근1시간·cooldown을 따른다. skip이면 추가 호출로 우회하지 않는다. 수동 dispatch의 execute 기본값 false는 계속 읽기 전용이다. 중지는 repository switch false 또는 durable phase paused로 적용할 수 있고 executing 상태는 자동 해제하지 않는다. 원래 ChatGPT·아티스트·감시 예약은 재개하지 않는다.
