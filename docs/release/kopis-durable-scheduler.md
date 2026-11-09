# KOPIS 일반 스케줄러와 상태 소유권

PR #77의 API 공개 경로를 GitHub Actions의 일반 Node 작업으로 연결한다. ChatGPT·AI 검색·검수 계획 파일은 정상 실행에 없다. 이 설치의 기본 상태는 **중지**다. 기존 ChatGPT 수집·감시·아티스트 예약을 켜지 않는다.

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
