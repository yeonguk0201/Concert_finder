# Supabase 정기 알림 발송

알림 정기 실행을 GitHub Actions에서 Supabase Cron으로 전환한다. `pg_cron`이 매분 `pg_net`으로 `notification-delivery` Edge Function을 호출한다. 기존 DB의 발송 대상·동의·기기·예매 revision 검사, lease와 중복 방지·재시도 기록은 그대로 사용한다. GitHub workflow는 코드 반영 후 수동 복구용으로만 남는다.

## 실행 구조와 제한

- 함수는 `NOTIFICATION_CRON_SECRET` Bearer 토큰을 검사한다. 일반 로그인 JWT와 공개 키로는 호출할 수 없다. `verify_jwt=false`는 전용 토큰을 함수에서 검증하기 위한 설정이며 공개 발송 권한이 아니다.
- VAPID 키는 기존 값을 재사용한다. 함수는 Supabase가 제공하는 서버용 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`를 사용한다. 이 키를 프런트나 Cron SQL에 복사하지 않는다.
- 한 호출은 최대 10건을 2개씩 병렬 처리한다. DB 요청과 푸시 HTTP 요청에 각각 5초 제한을 적용하며, 기본 free runtime 150초와 DB lease 2분 안에 끝내도록 배치를 제한했다. CPU·서비스 상태에 따른 실행 중단까지 배제하는 보장은 아니다.
- DB 실패 시 이미 진행 중인 다른 전송이 끝날 때까지 기다린 뒤 실패를 반환한다. 응답이 불명확하거나 중단된 전송은 기존 정책대로 자동 재전송하지 않는다.
- 매분 최대 10건, 즉 기기별 발송 10건을 처리한다. 백로그가 있으면 다음 분에 이어 처리하므로 대량 발송 시 지연될 수 있다. 매분 실행 설정은 단말에 정확히 1분 이내 도착한다는 보장이 아니다.
- 응답과 함수 로그는 `claimed`·`sent`·`skipped`·`retry`·`failed`·`invalid_device` 개수만 남긴다. `sent`는 푸시 제공자 수락이며 실제 수신·읽음은 별도 검증한다.

## 준비와 배포

Node.js 24에서 프로젝트 폴더 기준으로 실행한다. 원격 대상 프로젝트가 현재 앱의 프로젝트인지 먼저 확인한다. Supabase 로그인은 서비스 역할 키가 아닌 관리 계정 인증이다.

```powershell
npx --yes supabase@2.120.0 login
node scripts/prepare-supabase-push.mjs
```

준비 스크립트는 `.env.push.local`을 UTF-8로 읽고 Git에서 제외된 `.supabase-push.local/`에 파일 두 개를 만든다. 기존 cron 토큰이 있으면 재사용한다. 토큰을 다시 만들면 함수와 Vault를 함께 갱신해야 한다. 이 폴더나 파일 내용을 채팅·PR·공개 로그에 붙이지 않는다.

- `secrets.env`: 기존 VAPID 설정 3개와 전용 cron 토큰. 서버 역할 키는 포함하지 않는다.
- `vault-setup.sql`: 프로젝트 URL과 전용 토큰을 Vault에 생성/갱신한다. 동일 이름의 비밀값이 중복이면 중단한다.

다음 명령의 `<project-ref>`를 준비 스크립트가 출력한 대상 프로젝트로 바꾼다.

```powershell
npx --yes supabase@2.120.0 secrets set --project-ref <project-ref> --env-file .supabase-push.local/secrets.env
npx --yes supabase@2.120.0 functions deploy notification-delivery --project-ref <project-ref> --use-api
```

CLI 배포는 Docker가 필요 없는 API 번들 방식을 사용한다. 함수 배포 후 인증 없는 POST가 401인지 확인한다. 원격 호출 성공 전에는 준비 완료를 실제 수신 성공으로 간주하지 않는다.

## Cron 연결

프로젝트의 SQL Editor에서 비공개 생성 파일 `.supabase-push.local/vault-setup.sql`을 실행한다. Vault 자체는 Supabase 프로젝트의 기본 확장을 사용한다. 이어서 저장소의 [schedule-notifications.sql](../supabase/manual/schedule-notifications.sql)을 실행한다. 같은 이름으로 다시 실행하면 잡을 갱신하므로 중복 잡을 만들지 않는다. 또는 인증된 CLI에서 해당 파일을 실행한다.

```powershell
npx --yes supabase@2.120.0 db query --linked --project-ref <project-ref> --file .supabase-push.local/vault-setup.sql
npx --yes supabase@2.120.0 db query --linked --project-ref <project-ref> --file supabase/manual/schedule-notifications.sql
```

생성된 SQL에는 비밀값이 있으므로 실행 오류를 공유할 때 SQL 본문을 포함하지 않는다. `cron.job.command`에는 Vault 이름만 들어가며 토큰과 서비스 역할 키의 리터럴은 넣지 않는다. `pg_net`의 내부 HTTP 요청 큐는 호출 헤더를 다루므로 관리자 전용으로 유지하고 공개 API에 노출하지 않는다.

연결 전후에는 GitHub의 자동 발송을 중지한다. 아직 main에 기존 schedule이 남았다면 해당 workflow를 비활성화한다. 수동 전용으로 바꾸는 PR이 main에 반영된 뒤 다시 활성화하면 수동 복구용으로 사용할 수 있다. 어느 실행기가 호출하더라도 같은 DB의 lease·최종 조건 검사와 발송 기록을 공유한다.

## 자동 실행 검증

수동 워커와 함수 수동 호출을 하지 않고 3회 이상의 자동 실행을 확인한다. Supabase Dashboard의 Integrations → Cron → `encore-notification-delivery` → History에서 SQL 실행 이력을 확인한다. 이어 Edge Functions → `notification-delivery`의 호출 상태와 집계 로그를 확인한다.

```sql
select jobid,jobname,schedule,active from cron.job where jobname='encore-notification-delivery';
select start_time,end_time,status,return_message
from cron.job_run_details
where jobid=(select jobid from cron.job where jobname='encore-notification-delivery')
order by start_time desc limit 10;

-- cron의 succeeded는 HTTP 요청 등록 성공이다. 함수의 HTTP 결과도 확인한다.
-- 내부 큐의 URL/헤더/토큰은 출력하지 않는다.
select id,status_code,timed_out,error_msg,created
from net._http_response order by created desc limit 10;

select status,last_error,count(*) from private.notification_deliveries group by status,last_error;
select outcome,error_code,count(*) from private.notification_attempts group by outcome,error_code;
```

HTTP 결과에는 다른 `pg_net` 작업도 포함될 수 있으므로 검증 시 해당 함수의 호출 로그와 시간을 함께 대조한다. Cron History의 succeeded만 보고 푸시 발송 성공으로 판단하지 않는다.

CLI에서는 [verify-notification-cron.sql](../supabase/manual/verify-notification-cron.sql)로 위 정보를 하나의 응답으로 집계할 수 있다. 상태와 처리 개수만 조회하며 Vault·요청 헤더를 출력하지 않는다.

```powershell
npx --yes supabase@2.120.0 db query --linked --project-ref <project-ref> --file supabase/manual/verify-notification-cron.sql --output json
```

전용 검증 환경에서 미래 예매 시각을 바꾼 새 revision을 저장 상태로 유지한다. 수신 동의와 활성 기기도 확인한다. 예매 1시간 전부터 다음 자동 처리에서 제공자 수락·실제 기기 수신을 각각 기록한다. 이미 수동 발송한 동일 revision은 다시 보내지 않는다. 지난 예매는 제외한다. 공식 근거 없는 테스트 공연은 공개 운영 카탈로그에 추가하지 않는다.

## 실제 자동 발송 검증 기록

2026-10-09(KST) 연결된 Concert_finder 프로젝트에 함수를 배포하고 매분 Cron을 활성화했다. GitHub 알림 워크플로는 중복 스케줄 방지를 위해 비활성화했다.

- 00:37: 수동 워커·함수 호출 없이 Cron 실행 성공, HTTP 200, 대상 2건·제공자 수락 2건·실패 0건.
- 00:38, 00:39, 00:40: 후속 Cron 실행과 HTTP 200 확인, 대상·발송 0건으로 동일 알림 재발송 없음.
- 사용자가 00:37경 등록 기기에서 실제 알림 도착을 확인했다.

원격 자동 실행과 실제 수신까지 검증했다. 이후 대량 처리량과 장기간 가용성은 별도 운영 관찰이 필요하다.

## 중단과 복구

알림 자동 실행만 중단할 때는 아래 명령을 사용한다. `pg_cron` 확장을 삭제하면 다른 작업도 영향을 받으므로 삭제하지 않는다.

```sql
select cron.unschedule('encore-notification-delivery');
```

복구는 `schedule-notifications.sql` 재실행으로 한다. 이미 전송 중인 알림은 중단 후에도 도착할 수 있다. 원인을 확인하지 않고 `sent`·불명확한 실패 기록을 초기화하거나 재전송하지 않는다.

## 로컬 검증

```powershell
npm test
npm run lint
npm run build
npx --yes deno@2.1.4 check --config supabase/functions/notification-delivery/deno.json supabase/functions/notification-delivery/index.ts
npx --yes deno@2.1.4 test --config supabase/functions/notification-delivery/deno.json supabase/functions/notification-delivery/runtime.test.ts
```

Deno 테스트는 실제 VAPID 서명·암호화와 서버 전용 인증을 확인하며 네트워크 전송은 모의 처리한다. SQL 테스트는 Vault 생성/갱신, 단일 잡 유지, 실행 시 비밀값 참조, 누락/중복 방지를 확인한다. pg_cron·pg_net 자체는 PGlite에 없어 좁은 SQL 대역을 사용하므로 원격 자동 실행을 대체하지 않는다.

공식 자료: [Supabase 함수 정기 호출](https://supabase.com/docs/guides/functions/schedule-functions), [Cron](https://supabase.com/docs/guides/cron), [Edge runtime 제한](https://supabase.com/docs/guides/functions/limits).
