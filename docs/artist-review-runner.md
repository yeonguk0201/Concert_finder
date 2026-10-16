# 기존 아티스트 자동 검수 실행기

## 적용 상태와 비용

현재 운영 migration·Edge v1 배포와 두 팀 활성화는 완료됐다. 서버 키 설정 및 사용자 관리자 재개 후 2026-10-17 KST에 두 팀 모두 실제 YouTube 검증·체크포인트 저장·중복 제출·DB 재조회 검증을 통과했다. 최신 [성공 기록](curation-runs/20261017-0048-KST-runner-success.json)을 따른다. 반복 예약은 아직 생성하지 않았다. 이전 서버 키 누락과 재개 과정은 [운영 배포 결과](artist-review-deployment-20261016.md)에 있다. 아래는 설계와 운영 절차이며, 이전 지연·임대·확인 목록·500팀 준비·PostgreSQL 결과는 [운영 전 검증](artist-review-preflight.md)에 있다. 별도 OpenAI API/모델 호출·로컬 cron·GitHub 조사 예약을 추가하지 않는다. 공식 출처 조사·장르 판단은 사용자가 선택한 클라우드 예약 작업의 모델이 기존 두 스킬로 수행한다. 서버가 자체적으로 조사 모델을 실행하는 구조가 아니다. Supabase/YouTube의 기존 사용량·쿼터는 별도다.

현재 도구에 클라우드 예약 생성/모델 목록/추론 강도 조회가 없어 **GPT-5.6 Terra + Light/Low + 5시간 간격의 계정별 실제 지원은 확인되지 않았다**. 다른 모델이나 로컬 스케줄러로 대체하지 않는다. 운영 적용/최종 검증 이후 실제 예약 UI에서 환경·정확한 모델·지원되는 강도·5시간 간격·알림 억제를 확인해야 한다. 매일 0·5·10·15·20시 cron은 자정에 4시간 간격이 생기므로 5시간 반복의 대체가 아니다.

## 인증과 최소 범위

클라우드는 ARTIST_REVIEW_ENDPOINT와 ARTIST_REVIEW_RUNNER_SECRET만 사용한다. 비밀 값은 서버와 클라우드의 보안 설정에 각각 등록하며 채팅/Git에 넣지 않는다. 클라우드 endpoint는 기존 프로젝트의 /functions/v1/artist-review-runner로 고정한다. dedicated secret은 최소 32자, 무작위 256bit 이상을 권장한다. 개인 관리자 세션/갱신 토큰, 새 관리자 계정, 사용자 가장은 사용하지 않는다.

Edge 함수는 전용 키를 고정 길이 해시 비교로 검증하고 begin/checkpoint/defer/finish/notices만 허용한다. 서버 내부 서비스 키는 새 검수 RPC와 기존 채널 RPC를 호출한다. **서비스 키 자체는 넓은 권한**이므로 이 설계가 서비스 키의 DB 역할을 최소 권한으로 바꾸는 것은 아니다. 클라우드 호출자에게 공개되는 기능을 제한한 서버 경로다. 기존 환경의 SUPABASE_SERVICE_ROLE_KEY 바인딩은 운영 검토 뒤 예약 전용 환경에서 제거해야 한다. 기존 범용 서비스 키를 클라우드에 남기면 실행기 밖의 우회 권한도 남는다. 바인딩 제거는 아직 하지 않았다.

새 RPC는 anon/authenticated의 EXECUTE를 명시적으로 철회하고 서비스 역할에만 허용한다. 비공개 테이블은 RLS를 활성화하고 service_role에도 직접 테이블 권한을 주지 않는다. 승인된 운영자가 private.artist_review_targets에 기존 band_id, enabled, 정확한 공식 source_hosts를 명시해야 한다. migration은 **대상을 한 팀도 추가/활성화하지 않는다**. source_hosts 변경 경로를 클라우드에 노출하지 않는다.

## Migration 검토 내용

파일: supabase/migrations/202610160001_artist_review_runner.sql

- private.artist_review_targets: 대상 ID/공식 출처 호스트 허용 목록.
- private.artist_review_runs/lock/items: 전역 임대, 실행별 최대 10팀의 신원/버전 스냅샷, 원자 체크포인트.
- private.artist_review_state: 정책·신원·상태·버전·채널 프로필 버전에 결합된 완료 근거, 실패 횟수/재시도 시각.
- private.artist_review_notices: 완료/사용자 조치/3회 연속 실패만 기록하는 영구 outbox. 읽기로 소비하지 않으며 명시 ack한다.
- 기존 artist_management_history와 artist_channel_history에 review_run_id FK 추가. 채널 이력에는 관리자 계정 삭제 뒤에도 보존되는 manual_decision 출처 flag/insert trigger를 추가한다. 과거 채널 이력은 nullable actor만으로 자동 판단을 증명할 수 없어 보수적으로 모두 수동 보호 처리한다. 사용자 actor_id를 꾸미지 않고 서버 실행 provenance를 남긴다.
- 기존 private.curate_artist의 구현을 내부 apply_artist_curation으로 추출하고 관리자 검사 wrapper를 유지한다. 동일 검증·가역 상태 변경·승인 제거·기존 감사 trigger를 재사용한다. 내부 core에는 공개/서비스 직접 EXECUTE를 주지 않는다.
- 서버 검수는 unreviewed·수동 검수 이력이 없는 할당 대상에만 keep/exclude/hold를 적용할 수 있다. keep는 DB 승인 상태로 승격하지 않는다. 이름/국가/별칭/category를 변경하지 않는다. 공연/사용자 찜/알림에는 쓰지 않는다.
- 채널은 기존 service_save_artist_channel의 버전/신원/감사를 사용한다. 잠금, 수동 채널 이력, 이미 해석한 이전 ID 변경은 자동 덮어쓰지 않는다. API 이미지 캐시를 생성하거나 갱신하지 않는다. 기존 별도 채널 이미지 갱신 workflow는 이 실행기와 별개다.

## 재사용·재시도·충돌

복합 정책 jpop-or-rock-v1+official-channels-v1+runner-v1, ID/MBID/이름/별칭/국가/category/상태/updated_at/채널 프로필 버전/허용 출처 호스트가 같은 complete 결과는 90일 재사용한다. 다음 할당에서 제외되므로 재조사하지 않는다. channel candidate/genre hold는 action_required이며 자동 재시도를 멈춘다. queue에서 확인하고 기존 관리자의 admin_resume_artist_review로 최신 버전/checked_at과 이유를 확인해 명시적으로 재개해야 한다. held/excluded는 먼저 별도 관리자 복원 판단이 필요하다. failed만 5→10→20→40→80시간으로 지연하며 계속 실패해도 80시간을 넘기지 않는다. 실패/보류를 완료 근거로 재사용하지 않는다. 신원·버전·정책이 바뀌면 기존 결과는 유효하지 않다.

DB singleton row lock으로 동시에 한 run만 할당하고 최초 anchor 기준의 고정 5시간 구간당 한 batch만 허용한다. 30분 조기 도착 허용으로 실행 지연이 다음 기준 시각을 밀지 않는다. 이는 예약 생성 기능이 아니다. 서로 다른 request ID는 busy, 같은 ID는 미처리 항목만 반환한다. 39분의 one-shot watchdog/guard가 미처리 항목을 실패 체크포인트로 보존하고 종료하며, 머신 종료 등으로 이를 못 했을 때 임대 45분이 지나면 이전 run 쓰기를 차단하고 미완료 항목을 실패·지연 처리한다. 재전송은 같은 run ID와 동일 결과만 허용하며 다른 결과는 CHECKPOINT_CONFLICT다. 대상 비활성화, 수동 편집, 최신 버전 변화는 쓰기를 거부한다. 클라우드 CLI는 네트워크 전에 run ID를 ignored 파일에 기록하고 로컬 wx lock으로 동일 상태 파일 동시 쓰기를 막는다. 강제 종료 후 로컬 .lock이 남으면 프로세스 종료를 확인한 뒤 해당 lock 파일만 제거한다. DB 임대는 별도로 유지된다.

근거/진행 상태는 DB에 영구 저장하므로 다음 작업이 이전 Git 산출물을 받아올 필요가 없다. 본 migration 적용 전의 JSON은 자동으로 신뢰/가져오기하지 않는다. 요약과 짧은 공식 인용·URL만 허용하고 원본 HTML/API 응답·사진·API 제목/설명/캐시·키는 기록하지 않는다. 로컬 파일도 .local/artist-review 안에서만 쓴다. SQL은 임의 JSON 필드를 거부한다.

## 실제 내용 검증과 운영 전 점검

공식 출처는 운영자가 허용한 HTTPS 호스트만 서버에서 재확인한다. redirect를 따라가지 않고 크기·시간을 제한한다. 페이지의 신원 이름/별칭, 제출한 짧은 인용 내용, 채널의 실제 a href 링크를 확인한다. 200 응답/이름 검색/API 자기소개만으로 검증하지 않는다. 서버가 장르 의미를 독립적으로 판단하는 것은 아니므로 스킬의 공식 근거/상충 근거 판단 책임은 예약 작업에 있다. JS 렌더링/인코딩/접근 차단 때문에 서버가 재확인하지 못하면 적용하지 않고 실패·조치 필요로 남긴다. 네트워크를 뚫기 위해 TLS 검증을 끄거나 전체 인터넷 허용으로 바꾸지 않는다.

채널 verified는 서버 YOUTUBE_API_KEY로 고정 channels.list에 part=id와 fields=items/id만 요청해 존재를 재확인한다. 키는 X-Goog-Api-Key 헤더로 보내고 이미지 데이터를 요청하지 않는다. 작업당 검증 1회/팀(최대 10회), 중복 체크포인트는 재요청하지 않는다. Google API 실패는 해당 항목을 defer 처리한다. 출처 URL은 쿼리/fragment/인증정보 없이 canonical HTTPS여야 한다.

검토·승인 후에만 다음 순서로 운영한다.

1. staging에 migration을 적용하고 실제 PostgreSQL 권한·기존 관리자 경로·service RPC 회귀·동시 세션 경쟁·임대 복구를 재검증한다. PGlite 직렬 테스트는 다중 연결 네트워크 경쟁/배포 검증을 대신하지 않는다.
2. 별도 승인된 운영 적용 때 migration 실행, Edge 함수 배포, 서버 전용 서비스 키/YouTube 키/전용 runner secret 설정. 클라우드에는 endpoint와 scoped runner secret만 전달하고 범용 DB 서비스 키를 제거한다. 배포/secret 설정 명령의 실제 값은 로그에 남기지 않는다.
3. 운영자가 먼저 3팀 ID와 아티스트별 공식 출처 호스트를 검토해 활성화한다. CLI begin은 DB 실행 상태를 기록하므로 더 이상 읽기 전용 미리보기가 아니다. 실제 적용 승인 전 운영 begin/checkpoint를 실행하지 않는다.
4. 먼저 허용 대상 0일 때 idle·provider 호출 0 확인, 이후 승인한 소량 대상에서 근거·상태·이력·수동 잠금·실패 backoff·중복 실행을 최종 검증한다. 검증을 위해 실제 사용자 찜/푸시를 만들지 않는다.
5. 실제 클라우드 예약 UI의 정확한 모델/강도/5시간 반복 지원과 notify=false일 때 알림을 생략하는 기능을 확인하고 사용자와 운영 결과를 검토한 뒤 예약한다. 지원을 확인할 수 없으면 예약하지 않는다.

## 되돌리기

문제가 생기면 Edge secret 폐기 또는 대상 enabled=false로 신규 할당을 막고 실행 임대를 종료한 뒤 조사한다. 기존 근거/체크포인트/감사 이력은 지우지 않는다. migration은 기록 보존을 위해 파괴적 down SQL을 제공하지 않는다. 기존 관리자 wrapper/core 추출을 되돌릴 때는 원래 관리자 함수 정의를 복원한 뒤 사용 중인 worker 함수 의존성을 정리하는 별도 검토 migration을 작성한다. 제외/보류를 무조건 approved로 되돌리거나 원본 상태를 일괄 덮어쓰지 않는다.
