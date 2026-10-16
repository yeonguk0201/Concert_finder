# 자동 검수 운영 전 검증

현재 상태: 직접 승인 후 운영 DB migration·Edge v1 배포 및 두 팀 활성화를 완료했다. 소량 검증은 서버 YouTube 키 누락으로 action_required이며 예약은 아직 없다. [운영 배포 결과](artist-review-deployment-20261016.md)를 먼저 읽는다. 아래 내용과 마지막 검증 목록은 운영 적용 전 시점의 기록이며, migration 검토에는 최신 브랜치의 파일을 사용한다.

## 예약 UI에서 사용자가 확인할 항목

주 사용 화면은 Codex 데스크톱 앱이다. 사이드바 Automations(자동화) → 새 자동화가 표시되는지 확인한다. 앱 버전/계정별 실제 메뉴는 이 작업에서 직접 볼 수 없어 존재를 확정하지 않는다. 초안에서 아래 선택 항목을 확인하고 아직 저장/활성화하지 않는다.

| 항목 | 확인할 값 | 확인되지 않은 경우 |
| --- | --- | --- |
| 실행 위치/환경 | 준비한 클라우드 환경 | 로컬 프로젝트만 선택되면 요청한 클라우드 실행이 확인된 것이 아님 |
| 모델 | 정확히 GPT-5.6 Terra | 일반 채팅 모델 선택이나 프롬프트의 모델 이름으로 대체하지 않음 |
| 추론 강도 | 해당 모델에서 Light 또는 Low | 다른 모델/강도로 자동 대체하지 않음 |
| 반복 | 매 5시간, 다음 실행 시각 사이에도 5시간 | 매일 0/5/10/15/20시는 자정 간격이 4시간이므로 대체 불가 |
| 실행·알림 조건 | 앱 종료 상태의 클라우드 실행, notify=false일 때 알림 생략 | 로컬 실행/모든 실행 알림이면 이 운영 계약과 다르므로 추가 확인 |

ChatGPT 웹/Codex 웹에 있는 일반 Tasks/예약 화면도 위 환경·모델·강도 선택이 없다면 같은 기능이라고 간주하지 않는다. 현재 연결된 도구에는 실제 예약 설정 조회 기능이 없으므로 정확한 지원 여부는 여전히 미확인이다.

## 스테이징 조사와 무료 로컬 검증

저장소/CI/환경변수 이름에서 별도 staging DB 바인딩은 확인되지 않았다. Vercel Preview 안내는 있지만 별도 DB가 연결됐다는 증거가 아니다. 현재 Supabase URL은 알려진 운영 프로젝트이며 스테이징으로 사용하지 않았다. 계정 전체의 프로젝트 목록을 조회할 관리 API 권한이 없어 기존 원격 스테이징의 존재/부재를 확정할 수는 없다.

Docker가 이미 사용 가능해 공식 postgres:17 이미지를 checksum 검증 후 받아 일회성 로컬 PostgreSQL 17.11을 실행했다. network=none, 외부 포트/운영 데이터/운영 자격증명/호스트 볼륨 없이 tmpfs 512MiB를 사용했다. 새 Supabase 프로젝트/브랜치·유료 리소스는 만들지 않았다. 로컬 검증 DB는 Supabase Auth·PostgREST·Edge 네트워크 통합 스테이징을 대신하지 않는다.

## 1. 예약 지연과 5시간 차단

기존 실제 시작 시각 기준 rolling 5시간 차단은 지연이 다음 실행에 영향을 준다. 5시간 간격 예약의 지연 분포를 15/0/20/0/15/0분으로 주면 6번 중 3번만 실행된다.

개정은 고정 anchor를 유지하고 `(서버 현재 시각 - anchor + 30분) / 5시간`의 정수 구간으로 중복을 차단한다. 운영에서는 실제 예약 UI에서 확인한 최초 예정 UTC 시각을 운영자가 anchor_at에 지정하는 것이 권장된다. 미지정 시 최초 실제 시작으로 초기화한다. anchor를 매 실행마다 이동하지 않으며 미래 anchor보다 30분 이상 이르면 실행하지 않는다. 같은 구간은 한 배치만 허용하고, 놓친 여러 구간은 한 번으로 합쳐 처리한다. 로컬/모델의 시계를 신뢰하지 않는다. 위 6구간을 실제 PostgreSQL에서 모의 시각 이동해 6번 모두 할당되고 같은 구간의 추가 호출은 차단됨을 확인했다.

이는 실제 시작 사이를 무조건 5시간 이상 띄우는 제한이 아니다. 지연된 실행과 다음 실행 사이가 5시간보다 짧아질 수 있다. 예정 시각 anchor가 올바르면 30분까지의 조기 도착과 4시간 30분 미만의 지연은 같은 예정 구간으로 묶인다. 그보다 큰 편차/장애에서는 다른 구간으로 합쳐지거나 건너뛰어질 수 있다. 지원이 확인된 실제 예약 플랫폼의 지연 분포와 함께 최종 점검해야 한다. 실패 재시도 backoff는 실패 기록 시각부터 계산하므로, 다음 예약 때 아직 간격이 지나지 않았으면 이후 예약에서 재시도한다.

## 2. 임대 전 체크포인트와 종료

begin 응답에 서버 현재 시각과 leaseUntil을 넣는다. CLI는 서버의 남은 시간을 기준으로 여유를 계산하고 활성 실행에만 독립 one-shot watchdog을 시작한다. watchdog은 시작 후 monotonic clock을 사용해 로컬 시계 변경의 영향을 받지 않고 39분에 close를 요청한다. 이는 5시간 반복을 만드는 로컬 예약이 아니다.

팀 조사 전 guard를 호출하고, 여유가 6분 이하이면 신규 조사/체크포인트 대신 close한다. watchdog은 별도 프로세스라 모델이 조사 중이어도 종료를 요청한다. close는 이미 커밋된 체크포인트를 보존하고 미처리 팀만 LEASE_BUDGET 실패·지연 재시도로 저장해 실행을 닫는다. 입력 초안은 .local에 남으며 미완성 조사를 성공 근거로 승격하지 않는다. 완료 체크포인트와 실패/진행 상태는 DB에 영구 보존된다. 로컬 미완성 원문이 다음 머신에도 자동 보존되는 것은 아니다.

watchdog의 close는 20초 timeout/최대 3회이며, 근접한 CLI 호출도 동일 종료 경로를 사용한다. late checkpoint는 finished/lease 검사로 거부된다. 머신 강제 종료·watchdog 프로세스 종료·DB/네트워크 장애에서는 사전 종료를 보장할 수 없으며 45분 임대 만료 후 다음 실행의 복구가 마지막 방어선이다.

## 3. 확인 목록과 명시적 재개

`node --use-env-proxy scripts/artist-review-runner.mjs queue`로 action_required 목록을 읽는다. band_id/name, 현재 상태/버전, 원문 checked_at, 근거/이유, 대상 활성화 여부/허용 호스트를 반환한다. 최대 100팀씩이며 다음 페이지는 `--after=마지막-band-UUID`다. CLI/서버 전용 키에는 재개 권한이 없다.

관리자는 기존 로그인 세션에서 해당 기록과 최신 상태를 다시 읽고 다음 RPC를 호출한다. 토큰을 추출·장기 저장하지 않는다. [관리자 재개 화면](artist-review-admin-20261017.md)을 구현했으며, 해당 프런트엔드 버전에서 아티스트를 선택하고 `자동 검수 상태·재개`를 열어 사용할 수 있다. 화면도 같은 관리자 API를 호출하며 실행기 키에는 재개 권한을 추가하지 않았다.

```js
await backend.rpc('admin_resume_artist_review', {
  target_band_id: reviewed.band_id,
  expected_version: reviewed.updated_at,
  expected_checked_at: reviewed.checked_at,
  reason: '새 공식 근거를 확인하여 이 아티스트의 재조사를 명시적으로 요청함',
})
```

held/excluded/approved는 이 RPC로 자동 복원하지 않는다. 재조사를 원하면 먼저 기존 관리자 검수 경로로 unreviewed 복원을 별도 판단하고, 목록을 다시 읽은 뒤 재개한다. 수동 복원 이유는 삭제하지 않는다. 재개는 그 정확한 버전에 대한 감사 경계를 남기며, 이후 새 수동 판단이 생기면 다시 자동 적용을 막는다. 채널 잠금/수동 채널 이력은 재개로 해제되지 않는다. 잘못된 버전/checked_at, 관리자 아닌 사용자, 비활성 대상은 거부한다. 다음 허용 구간에서 재할당될 수 있지만 즉시 재개가 10팀/구간/임대 제한을 우회하지는 않는다.

## 4. 500팀의 공식 출처 호스트 후보 준비

기존 bands의 id/name/musicbrainz_id를 읽기 전용으로 내보내 `.local/artist-review/existing-artists.json`에 저장한다. 신규 아티스트 수집/import는 실행하지 않는다. 이미 보유한 공식 링크 후보는 official_urls 배열로 제공할 수 있다. 이 파일에 키·토큰·API 이미지 캐시를 넣지 않는다.

```sh
# 보유 링크에서 후보만 준비: 외부 조회 없음
node --use-env-proxy scripts/prepare-review-hosts.mjs
# 없는 항목은 MusicBrainz MBID 관계 조회: 중단/재개 가능
node --use-env-proxy scripts/prepare-review-hosts.mjs --fetch-musicbrainz --previous=.local/artist-review/host-candidates.json
```

초회에는 previous가 아직 없으므로 --previous를 생략한다. 도구는 최대 500팀, 직렬 API 요청 사이 1.1초, 팀별 원자 체크포인트, MBID 일치 검사, 7일 발견 캐시/실패 5시간 cooldown을 사용한다. 연속 3회 제공처 실패 시 나머지는 deferred로 남긴다. 500팀의 첫 관계 조회에는 정상 상태여도 대략 10분 이상 걸릴 수 있다. 공유 MusicBrainz gate에 쓰는 운영 작업은 실행하지 않으며, 실전 일괄 준비는 다른 MusicBrainz 작업과 겹치지 않는 전용 준비 시간에 수행해야 한다.

모든 결과는 verified=false/needs_host_review다. 후보 발견과 공식성 확인은 다르다. 아티스트별 공식 페이지의 실제 신원을 확인한 다음 호스트/redirect 목적지를 검토해 운영자가 target source_hosts와 클라우드/Edge egress를 별도로 승인해야 한다. wildcard 전체 인터넷 허용, 500팀 후보의 자동 등록/활성화, API 이미지 조회는 하지 않는다. 입력의 쿼리/fragment/인증정보·내부/IP 호스트는 제거/거부한다. 500팀 모의 응답으로 순차 처리/500개 체크포인트/재개 시 요청 0/실패 중단을 검증했으며 실제 500팀 전체의 공식성 검수는 수행하지 않았다.

## 5. 실제 PostgreSQL 다중 연결 검증

실행: `CONCERT_TEST_PG_CONTAINER=concert-review-pg-check node --test tests/artist-review-runner.postgres.mjs`

이 suite는 명시적으로 격리된 이름의 Docker 컨테이너만 받고 DSN/운영 URL은 받지 않는다. 매 사례마다 임시 DB를 생성·제거한다. 독립 psql 프로세스/서버 연결을 열고 pg_stat_activity의 PgSleep을 트랜잭션 barrier로 사용한다. 타이밍 추측만으로 동시성을 주장하지 않는다. CI에도 같은 네트워크 없는 PostgreSQL 검사를 추가했다.

- 지연 시각 6구간의 신규 할당/구간 내 중복 차단.
- 열린 claim 트랜잭션에 두 번째 claim이 경합: 한 배치만 할당.
- 같은 팀의 서로 다른 checkpoint 동시 제출: 한 결과만 커밋, 다른 것은 CHECKPOINT_CONFLICT.
- 열린 claim 연결 강제 종료: 트랜잭션 rollback 후 새 연결 정상 할당.
- 수동 편집이 잠금을 가진 동안 오래된 체크포인트 제출: EDIT_CONFLICT, 수동 상태 유지.
- 커밋된 실행 임대 강제 만료: 늦은 쓰기 거부, 미완료만 지연 실패로 복구, 완료 체크포인트 보존.
- 39분 시점에 해당하는 서버 임대에서 close: 완료 1/미처리 9 보존, 만료 전에 finished, 늦은 checkpoint 거부.
- 보류/후보 목록 조회, 서비스 키의 재개 거부, 기존 관리자 재개/명시 복원/재개 이력과 이후 수동 판단 보호.

## 남은 운영 작업

원격 스테이징이 있다면 프로젝트/비용/허용 범위를 먼저 확인해야 한다. 없다면 새 유료 리소스는 사전 승인 없이 만들지 않는다. 로컬 검증 이후에도 실제 Supabase Auth·PostgREST ACL/schema cache·Edge timeout/백그라운드 프로세스·egress·scoped secret·기존 광범위 서비스 키 제거와 플랫폼 알림 전달 검증이 필요하다. CLI endpoint는 현재 승인된 운영 프로젝트로 제한돼 있어 별도 staging을 사용할 때는 그 승인된 endpoint를 추가하는 설정 작업도 필요하다.

500팀 host 후보의 실제 확인/승인, 소량 target 활성화 계획, 관리자 확인 목록의 처리 담당자도 정해야 한다. 최신 migration 검토 → 승인된 staging 통합 검증 → 별도 승인된 운영 적용/배포 → 소량 최종 검증 → 실제 UI의 정확한 모델/강도/5시간 지원 확인 순서로 진행한다. 아직 운영 적용·배포·예약·병합 단계로 넘어가지 않는다.

## 이번 검증 결과

- npm test: DB/서버 112개 + 프런트엔드 90개 통과(전체 202개).
- 마지막 보완 후 관련 테스트 22개 통과.
- 실제 PostgreSQL suite: 4개 다중 연결 시나리오/runner 집계 5개 통과. 연결 강제 종료·임대 복구·관리자 아닌 authenticated의 재개 거부도 포함한다.
- lint/build/Deno frozen check·diff·UTF-8/문서 링크·주입된 비밀키/실제 YouTube 이미지 URL 제외 검사 통과. 빌드에는 기존 번들 크기 경고만 있다.
- 현재 머신에서 부모 명령 종료 뒤 별도 one-shot watchdog 프로세스가 남아 모의 짧은 기한에 종료 marker를 쓰는 smoke도 확인했다. 운영 39분 전체 수명이나 실제 예약 플랫폼의 프로세스 보존을 증명한 것은 아니다.
- 테스트 컨테이너와 임시 DB를 제거했다. 원격 staging/운영 DB 적용·배포·예약·병합은 하지 않았다.
