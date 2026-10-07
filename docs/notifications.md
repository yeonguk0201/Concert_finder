# 10/9 알림 구현과 실제 기기 검증

실제 구현일: 2026-10-07 (KST). W13~W16 코드를 구현하고 로컬에서 검증했다. 원격 마이그레이션·VAPID·발송 실행·실제 수신은 아직 확인하지 않았다. 웹 푸시는 검증 중인 전달 경로이며, 이메일 대안은 구현하지 않았다. 사용자는 안드로이드/Chrome을 우선 사용하며 아이폰/Safari도 테스트할 수 있다고 확인했다.

## 구현한 동작

- 계정별 신규 공연/예매 알림 동의는 기본 해제다. 찜·일정 저장만으로 동의하지 않는다.
- 브라우저 권한 요청은 등록 버튼을 눌렀을 때만 한다. 구독 암호화 키·endpoint는 private 스키마에 보관하며 설정 RPC는 기기 이름·활성 상태만 반환한다.
- 계정의 모든 활성 기기에 전달한다. 다른 계정으로 전환한 브라우저는 새 구독을 만들며 등록 중 계정 변경도 서버에서 차단한다. 로그아웃만으로 기존 기기 수신을 해제하지 않는다. 중단은 계정 동의 해제 또는 기기 해제로 한다.
- 최초 공개와 공개된 공연의 새 라인업 추가가 공개 시점의 찜·동의·활성 기기에 매칭된다. 한 번에 여러 찜 밴드를 추가해도 기기당 한 번이다. 나중에 찜/동의/기기를 추가해도 과거 소식을 소급 발송하지 않는다. 수정·재공개는 최초 공개 알림을 반복하지 않는다.
- 기존 데이터는 마이그레이션 시 소급 발송하지 않는다. 기존 정보를 새로 등록할 때 관리자의 **기존 정보 보완 등록 · 이번 공개/라인업 추가 알림 보내지 않기**를 선택한다. SQL 수동 입력은 같은 트랜잭션에서 `select set_config('encore.initial_import','true',true);`를 먼저 실행한다. 공식 정보가 없는 테스트 공연을 공개 DB에 등록하지 않는다.
- 저장한 미래 예매는 1시간 전 대상으로 잡는다. 1시간 이내 저장·동의·기기 등록이면 다음 발송 처리에서 전달한다. 지난 예매·미정 시각은 제외한다. 시간 변경은 revision으로 기존 예약을 무효화한다.
- 발송 직전에 찜/라인업·저장·동의·기기·공개·취소·현재 revision·예매 시각을 다시 조회한다. 해제된 기기와 철회한 동의의 대기 건은 즉시 무효화한다. 저장 해제·시간 변경·취소는 다음 처리 또는 직전 조회에서 차단한다.
- 404/410은 기기 무효화, 429/5xx는 최대 3회(1분/5분 이후) 재시도한다. 인증 오류 등 다른 오류와 응답 없는 타임아웃은 자동 재시도하지 않는다. lease가 만료된 발송은 `UNKNOWN_OUTCOME`으로 격리한다.
- 발송 시도마다 시각·결과·오류 코드가 남는다. `sent`는 푸시 제공자 수락이며 실제 단말 수신/읽음이 아니다. 동일 예약은 기기·변경 ID 또는 예매 revision의 유일 키로 중복 생성하지 않는다. 태그와 topic도 동일 발송 ID를 사용한다.
- 외부 HTTP 전송은 DB 트랜잭션과 원자적으로 묶이지 않는다. 최종 조회 직후 해제하거나 제공자가 애매한 오류를 반환하면 이미 전달 중인 알림을 회수하거나 완벽한 exactly-once를 보장할 수 없다. 성공 여부가 불명확한 건을 임의로 재전송하지 않는다.
- 알림 클릭은 동일 사이트의 공연 상세로 이동한다. 삭제/공개 중단한 공연은 상태 안내를 보여준다.

## 연결 순서

1. 검증된 코드 브랜치를 dev 대상 PR로 반영하고 해당 버전을 HTTPS 테스트 환경에 배포한다. 이번 작업에서는 로컬 커밋만 남겼으며 push·PR·배포·병합하지 않았다.
2. Supabase SQL Editor에서 기존 10/6~10/8 마이그레이션 다음에 [202610090001_notifications.sql](../supabase/migrations/202610090001_notifications.sql)을 실행한다. private 스키마를 Data API에 노출하지 않는다. 일반 사용자는 워커 RPC와 구독 키를 읽을 수 없어야 한다.
3. 로컬 저장소에서 `node scripts/generate-vapid.mjs`를 실행한다. 기존 파일을 덮어쓰지 않고 Git에서 제외된 `.env.push.local`에 UTF-8로 키를 저장한다. 비밀키를 채팅·커밋·로그에 복사하지 않는다. 키는 매 배포마다 새로 만들지 않는다.
4. `.env.push.local`의 `VAPID_PUBLIC_KEY`와 같은 값을 Vercel 테스트 환경의 `VITE_VAPID_PUBLIC_KEY`에 설정하고 다시 빌드/배포한다. 프런트에는 이 공개 키만 추가한다.
5. 서버 파일의 `VAPID_SUBJECT`를 운영자 `mailto:` 주소 또는 HTTPS 연락 주소로 바꾸고 기존 프로젝트의 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 설정한다. 이 세 값과 `VAPID_PRIVATE_KEY`를 `VITE_` 변수에 넣지 않는다.
6. 초기 기기 테스트는 `node --env-file=.env.push.local scripts/notification-worker.mjs`로 수동 실행한다. 테스트 버튼 요청 후 실행하면 된다. 연결된 프로젝트의 모든 유효 대기 건을 처리하므로 전용 테스트 환경을 우선 사용한다. 비밀값/endpoint/페이로드는 출력하지 않고 개수만 출력한다.
7. 정기 실행에는 GitHub environment `notification-delivery`를 만들고 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`를 environment secrets로 등록한다. 기존 수집 environment의 secrets는 자동 공유되지 않는다. 허용 브랜치·접근자를 제한한다.
8. [notifications.yml](../.github/workflows/notifications.yml)은 5분 간격 목표다. Actions schedule은 기본 브랜치의 workflow에서만 실행되며 지연/누락될 수 있다. dev 병합만으로 정기 발송이 시작됐다고 판단하지 않는다. 기본 브랜치 반영과 실제 반복 실행을 확인한다. 5분 내 전달은 아직 측정/보장하지 않는다. [GitHub 공식 schedule 안내](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

워커는 한 번에 10건을 lease로 잡고 최대 10배치 및 8분 이내 새 배치 시작으로 제한한다. 동시 워커는 `SKIP LOCKED`와 토큰으로 같은 건을 발송하지 않는다. 일회성 오류로 실행이 중단되면 다음 실행에서 기록을 확인하며 처리량·비용·정확한 실행 간격은 운영 검증 후 조정한다.

## 휴대폰 수신 확인

안드로이드 Chrome은 HTTPS 테스트 앱에서 로그인 → 알림 동의 → 기기 이름 입력 → **이 기기 알림 허용·등록** → OS 권한 허용 → **테스트 알림 요청** 순서로 확인한다. 발송기를 실행한 뒤 실제 시스템 알림을 확인한다. 브라우저가 열린 상태·닫힌 상태, 알림 클릭 후 앱 진입을 각각 기록한다.

아이폰은 iOS 16.4 이상에서 Safari로 테스트 앱을 연 뒤 공유 → **홈 화면에 추가**하고 홈 화면 아이콘에서 웹앱을 실행한다. 그 웹앱에서 다시 로그인·동의·기기 등록·테스트 요청을 진행한다. 일반 Safari 탭 성공을 홈 화면 웹앱 수신 성공으로 간주하지 않는다. 이 조건은 [WebKit 공식 안내](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)에 근거하며 실제 지원 여부는 해당 기기로 확인한다.

| 검증 | 기대 결과 | 현재 결과 |
| --- | --- | --- |
| Android Chrome / iPhone 홈 화면 웹앱 테스트 | 권한·구독·서버 수락·실제 수신·클릭을 각각 확인 | 미검증 |
| N01 최초 공개 | 당시 찜+동의한 사용자 기기로만 전달 | 로컬 DB 대상 계산 검증, 실제 수신 대기 |
| N02/N03 혼합 페스티벌/라인업 | 추가 밴드의 찜 사용자 매칭, 여러 팀도 기기당 한 번 | 로컬 DB 검증, 실제 수신 대기 |
| N04 1시간 전/1시간 이내/지난 예매 | 미래만 처리, 시간 변경 시 기존 revision 폐기 | 로컬 DB 검증, 실제 시간·수신 대기 |
| N05 해제/취소/공개 중단/계정 전환 | 발송 직전 현재 상태 확인, 이전 계정의 키 비노출 | 해제·취소·계정 격리 로컬 검증, 실제 기기 대기 |
| 두 기기 동시 등록/하나 해제 | 둘 다 수신 후 해제한 기기만 중단 | DB 기기별 대상/해제 검증, 실제 다기기 대기 |
| 실패·재시도·중복·워커 중단 | 최대 3회, 무효 기기 해제, 불명확한 성공은 격리 | 모의 제공자/DB 검증, 실제 제공자 실패 대기 |

실제 기록에는 OS·브라우저 버전·배포 커밋·권한/구독 성공·요청/발송/수신 KST 시각·상세 진입·닫힌 앱 수신·해제 후 결과를 남긴다. 이메일·endpoint·암호화 키·토큰은 기록하지 않는다. 테스트 알림은 계정당 1분에 한 번 요청하며 10분 이상 대기하면 폐기한다.

## 운영 조회와 중단

SQL Editor에서 필요한 집계만 확인한다. 구독의 endpoint·키는 출력하지 않는다.

```sql
select status, last_error, count(*) from private.notification_deliveries group by status,last_error;
select outcome,error_code,count(*) from private.notification_attempts group by outcome,error_code;
select count(*) as active_devices from private.push_devices where active;
```

발송 중단은 Actions의 해당 workflow를 비활성화하고 실행 중인 워커를 종료한다. 그 뒤 사용자 동의를 해제하거나 SQL Editor에서 기기를 비활성화한다. 잘못 보낸 알림을 철회할 수는 없다. 무리한 다운 마이그레이션 대신 워커 중단 후 원인을 수정한다. 신규 트리거/RPC와 테이블을 삭제해야 한다면 백업하고 기존 `admin_save_concert` 정의를 10/7 버전으로 복원하는 별도 마이그레이션을 검토한다.

## 로컬 검증 기록

전체 PostgreSQL 마이그레이션을 PGlite로 적용한 접근 권한·초기 입력 무알림·여러 밴드/기기 대상·예매 revision·해제/취소·최종 조회·최대 재시도·lease·계정 삭제 cascade를 검증했다. 제공자 모의 전송·Service Worker의 알림 표시/동일 origin 클릭·UI 동의 실패 복구/기기 관리/계정 전환도 검증했다. 데스크톱/390px 모바일 모의 UI에서 가로 넘침과 콘솔 경고/오류가 없었다. 모의 UI는 실제 Push 권한이나 단말 수신을 검증한 것이 아니다.

참고 구현 문서: [MDN Push 구독](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe) · [web-push 공식 라이브러리](https://github.com/web-push-libs/web-push).
