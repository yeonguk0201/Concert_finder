# 10/17~19 수집·자동 공개 운영 및 통합 검증

검증일: 2026-10-20 14:56~15:06 KST. 로드맵의 W21/W26/W27·W12/W17/W25를 점검했다. 과거 관측 구간은 **10/17 00:00 이상, 10/20 00:00 미만 KST**다. 운영 DB·GitHub Actions·배포 화면과 로컬 회귀 검사를 구분한다.

**판정: 수집→후보 저장은 동작하지만 매시간 운영·실제 신규 자동 공개·실기기 통합 완료 기준은 미달이다. W18 외부 테스트·W20 베타 준비 완료로 처리하지 않는다.**

## 실제 운영 관측

프로젝트 `czjrzylvnewfjnfwjhwf`, 실행 커밋 `38b05f8756078b33a1b96a4cb92b84afff7f0ab2`. main의 실제 workflow는 `17 * * * *`다. 기간 내 GitHub 예약 실행 19회(성공 15·실패 4)와 DB의 네 출처별 실행을 대조했다. ingestion이 같은 배치에 추가하는 `state='legacy'` 기록은 실행 횟수에서 제외했다.

| 출처 | 실행 | 성공 | 부분 실패 | 후보 관측 합계 | 자동 공개 |
| --- | ---: | ---: | ---: | ---: | ---: |
| UALIVE | 19 | 19 | 0 | 38 | 0 |
| Mint Paper | 19 | 19 | 0 | 32 | 0 |
| RADWIMPS | 19 | 19 | 0 | 38 | 0 |
| KOPIS | 19 | 15 | 4 | 1,559 | 0 |

후보 합계는 반복 수집을 포함한다. 네 출처 모두 측정한 18개 시작 간격이 전부 60분 초과이고 최대 415.09~415.15분이다. Cron 문자열과 실제 실행 간격이 달라 W26의 24시간 매시간 운영은 미달이다.

KOPIS 부분 실패는 상세 `HTTP 400`이며 정상 후보는 저장됐다. 10/19에는 연속 실패 후 나머지 요청을 중단했다. [10/19 부분 실패](https://github.com/yeonguk0201/Concert_finder/actions/runs/39208546020)·[10/18 부분 실패](https://github.com/yeonguk0201/Concert_finder/actions/runs/39133949797)·[최근 성공](https://github.com/yeonguk0201/Concert_finder/actions/runs/39371205190). 영구 오류를 무제한 재시도하거나 누락을 정상 완료로 숨기지 않았다.

14:56~15:01 KST DB 조회 결과:

- 후보 770개: KOPIS 709·UALIVE 12·Mint Paper 4·RADWIMPS 2·기존 YES24 43개. 원문 URL 중복 0개.
- 활성 네 출처는 수집 ON·공개 OFF, YES24는 수집/공개 OFF. 모든 `live_after=null`로 초기 무알림 채움 상태다.
- 발표 검증 완료 후보 0개. 아티스트 신원별 공개 승인 5개는 공연의 발표·원문·파싱 검증과 다르다. 정책 활성화만으로 실제 공개 사례를 만들 수 없다.
- 기간 내 공개 판단 1,667건은 모두 review: `PUBLICATION_DISABLED` 1,491·`ARTIST_CURATION_BLOCKED` 176건. 공개 차단·아티스트 검수 보호가 실제로 동작했다. `automation_blocked` 후보는 현재 0개이므로 관리자 예외 보호의 운영 사례는 미확인이다.
- 마지막 성공은 10/20 13:45~13:48 KST. 15:01 기준 이미 60분 초과지만 기존 CLI의 2시간 성공 기준에는 걸리지 않는다.
- Supabase Cron은 알림 전달(매분)·아티스트 검수 준비(매시간) 두 개다. 별도 수집 실행·독립 수집 감시는 없다.

## 배포 화면과 공식 원문

[운영 앱](https://concertfinder-blue.vercel.app/)의 기존 로그인 세션에서 읽기만 했다. 공연·계정 저장의 실시간 연결 표시, 공개 공연 8개, 상세의 저장 상태·공식 출처 링크·테스트 공연 안내를 확인했다. 찜/저장·공연 데이터 변경이나 실제 푸시 발송은 하지 않았다.

MCR 상세에는 My Chemical Romance와 Oasis가 함께 연결돼 있다. [주최사 출연진](https://ualive.com/concerts/397)은 My Chemical Romance이며 11/7 공연일·장소는 [연기 공지](https://www.ticketlink.co.kr/global/en/help/notice/63744)와 일치한다. Oasis 연결·테스트 예매 시각과 테스트 공개 공연의 정리·저장 항목 상태 확인이 남는다. 이번에는 이력을 변경하지 않았다.

실제 신규 자동 공개가 없으므로 수집→무인 공개→두 브라우저 갱신→저장→실기기 수신·정확한 지연은 미검증이다. 기존 연결 표시나 로컬 합성 데이터 검사를 완료 근거로 대체하지 않는다.

## 수정안과 권한 영향

`scripts/catalog-health.mjs`는 출처별 최신 두 실행과 마지막 성공을 각각 조회하도록 보완했다. 공통 200개 제한에 다른 출처 기록이 밀리는 문제를 제거하고 legacy를 제외한다. 60분 초과 시작 지연·연속 두 번 실패/부분 실패·2시간 초과 성공 지연·누락 시각·조회 오류를 감지하며 비활성 출처는 경고에서 제외한다. 독립 호스트에 연결하기 전까지 감시 운영 완료는 아니다.

적용 전 운영 DB의 `service_begin_collection`·`service_fail_collection`에는 anon/authenticated의 명시적 실행 grant가 남아 있었다. `service_complete_collection`은 이미 서비스 전용이었다. 세 함수 내부는 모두 `SERVICE_REQUIRED`로 서비스 역할을 검사하므로 일반 역할이 실제 수집을 수행할 수 있었다는 뜻은 아니다.

[`권한 수정안`](../supabase/migrations/20261020055804_collection_worker_permissions.sql)은 PUBLIC·anon·authenticated 실행 권한을 제거하고 service_role 권한을 유지한다. PUBLIC만 revoke하면 명시적 grant가 남는 현상을 재현했다. GitHub 수집은 서버용 service key를 사용한다. 관리자 정책/상태 조회·검수, 일반 공연 조회·찜·저장, 알림 RPC는 변경하지 않는다.

첫 운영 적용은 자동 승인 검토에서 명시적 승인 부족을 이유로 거절됐다. 영향 설명 후 사용자가 “그럼 적용해봐”라고 승인해 10/20 15:14 KST에 적용했다. 원격 이력은 `20261020061435_collection_worker_permissions`이며 로컬 파일과 SQL 내용은 같다. 적용 후 세 RPC 모두 anon/authenticated 실행 false·service_role 실행 true를 확인했다.

기존 main workflow를 UALIVE 한 출처로 수동 재실행한 [실행 39379311054](https://github.com/yeonguk0201/Concert_finder/actions/runs/39379311054)이 32초에 성공했다. DB 실행 `aef3f0ae-e821-460b-ab60-12aa2dddb5ba`는 15:15:21~15:15:43 KST, success·후보 2·검수 2·공개 0·실패 0이다. 기존 서버 키의 실제 시작→수집→후보 저장 경로가 권한 수정 후 정상임을 확인했다. 모든 공개 정책 OFF·초기 채움 상태와 공개 공연 8개를 유지했다. 이 한 번의 수동 검증은 매시간 자동 운영 기준을 충족한 관측이 아니다.

알림 Cron 명령은 변경한 세 수집 RPC를 참조하지 않는다. 적용 후 최근 3회(10/20 15:14·15:15·15:16 KST) DB Cron 실행은 `succeeded`이고 매분 활성 설정을 유지했다. 이는 HTTP 작업 제출 성공이며 Edge 응답·기기 수신과 구분한다. 예약의 동의·저장 해제·시간 변경·취소·중복 방지는 앞선 로컬 검사에서 통과했다. 실제 기기 수신 재검사는 하지 않았다.

## 검사 결과

- 신규 회귀 4개 통과: API 역할 호출 차단·서비스 호출 허용, 60분 경계·출처별 기록 보존·연속 부분 실패·오류 감지.
- Node 전체 122개 중 120개 통과·2개 실패. 수집·KOPIS·조건부 공개·검수 제외·초기 무알림·중복·예약 알림·계정 격리/삭제는 통과했다.
- 실패 2개는 `artist-review-runner.mjs`의 `root + '/'` 검사로 Windows에서 `IGNORED_PATH_REQUIRED` 발생. origin/dev의 동일 코드를 대조했고 권한을 높인 재실행에서도 같다. 샌드박스 문제로 처리하지 않으며 이번 수정 범위 밖의 기존 문제로 남긴다.
- UI 22개 파일·100개 검사 통과. 첫 샌드박스의 임시 변환 파일 ENOENT 후 `npx vitest run --maxWorkers=1`을 샌드박스 밖에서 실행했다.
- lint·build·`git diff --check` 통과. 기존 500kB 초과 청크 경고 유지. 전체 `npm test` 통과로 표기하지 않는다.
- 적용 후 원격 security advisors 재조회 완료. 변경한 세 RPC는 anon/authenticated 실행 경고에 포함되지 않았다. 기존 private RLS·다른 함수 권한·유출 암호 보호 경고는 별도다. [함수 권한 안내](https://supabase.com/docs/guides/database/functions#function-privileges).

## 다음 완료 조건

1. 수집 권한 수정 승인·운영 적용·실제 UALIVE 수집 검증 완료. 나머지 출처의 후속 정기 실행은 계속 별도 관측한다.
2. GitHub 예약 지연과 독립적인 Node 호스트/스케줄러·상태 검사·실패 통지를 연결하고 실제 시작 기준 24시간 재관측. Cron 문자열 변경으로 대체하지 않는다.
3. KOPIS HTTP 400의 실제 원문/API 응답과 누락 슬롯·상세 갱신 범위 재검증.
4. 필수 발표 근거를 자동 검증하는 실제 어댑터/공연 사례를 확보한 뒤 출처별 공개 활성화. 검수·제외·중복·중요 변경 보호·초기 무알림 유지.
5. 테스트 공연·임의 라인업을 이력을 남기며 정리하고 실제 공식 공연으로 두 브라우저·저장·알림·실기기 지연 검증 후 W18/W20 착수 재판정.
