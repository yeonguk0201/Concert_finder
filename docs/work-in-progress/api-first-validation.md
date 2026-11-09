# API 중심 공연 자동 공개: 정규화·검증 구현 체크포인트

2026-11-09 KST. [목표와 인계 계획](../api-first-concert-publication-plan.md)을 읽고 개발을 시작했다. 이 기록은 운영 자동 공개 완료나 예약 재개 영수증이 아니다.

## 실제 확인한 환경

- checkout: `/workspace/Concert_finder`, 시작 HEAD `6a7bd62`.
- Node `v24.19.0`, 기존 의존성 설치됨. 운영 대상 Supabase 프로젝트의 환경 바인딩은 준비 상태로 보고되었지만, 이번 작업은 운영 API/DB를 호출하지 않았다.
- 이 checkout에 `.local/concert-collection`이 없다. 계획의 원래 조상 `8096bd58fd734121c4e5d490f141f91022fae4b6`도 Git 객체에 없다. 다른 환경의 체크포인트를 전달받았다고 가정하지 않았고 초기화·재생성하지 않았다.
- 로컬 `collect-concerts-scheduled.mjs`와 `automatic-publication.mjs`는 여전히 v3 계약과 fresh review plan을 요구한다. 실제 운영 executor digest·설치 상태는 이번 작업에서 조회하지 않았다.
- 기존 GitHub 정기 수집 workflow는 KOPIS를 제외한다. 예약 소유권 이전·활성화나 workflow 변경은 수행하지 않았다.

## 구현한 범위

`scripts/kopis-api-facts.mjs`는 일반 코드만으로 공식 API 상세 응답을 정규화한다. 기존 XML/ID/장르/국가/날짜 검증을 재사용하고, 아래를 검사한다.

- `목요일(19:30), 토요일 ~ 일요일(19:00)` 같은 요일 안내와 `2028.02.29(14:00, 19:30)` 같은 명시 날짜를 회차로 정규화한다. 요일 범위는 월요일부터 일요일 순서다. 공휴일 예외·불명확한 안내·중복·기간만 있는 입력·시각 없는 입력은 보류한다. 날짜만 있는 공개 유형은 추가하지 않았다.
- 전체 출연진을 현재 카탈로그의 이름/검증 별칭 및 기존 승인 신원 스냅샷과 연결한다. 문장부호를 제거한 유사 검색이나 외부 아티스트 검색은 하지 않는다. 보류/제외 아티스트를 포함한 전체 카탈로그에서 충돌을 검사하며 한 명 승인으로 나머지 출연진을 대신하지 않는다.
- 발표일/발표 시각/예매 시작 시각은 실제 API에 없으므로 `null`, `announcement_verified=false`로 보존한다. API 등록/수정 시각을 발표 시각으로 사용하지 않는다.
- 관측 시각·API 식별자·회차 안내·현재 상태·KOPIS 출처 표시를 보존한다. 취소/상태 미확인·지난 공연은 보류한다. 상품 딥링크와 외부 본문/이미지는 새 경로의 공개 입력에서 제외한다.
- 이용 조건은 공연마다 작성하는 검수 계획이 아니라 배포 시 검토할 출처 설정으로 받는다. 설정이 없으면 `SOURCE_USE_UNVERIFIED`로 보류한다. 실제 이용 조건 근거는 이번에 재조회하지 않았다.
- 저장 후보를 `previous`로 전달하면 기존 사실 회귀·신원 연결 제거·수동 상태 변경을 보류 사유로 반환한다. 입력 후보를 수정하지 않는다. 이 검사는 서버의 잠금/CAS를 대체하지 않는다.

`collectKopis`에는 상세 정규화 함수를 주입할 수 있게 했고 기존 기본 파서는 유지했다. `collect-catalog.mjs --source=kopis --facts-only --api-first-preview`는 업로드 없이 이 정규화기를 사용한다. 실제 실행 시 API 호출 예산을 소비하므로 이번에는 fetch를 대체한 격리 테스트에서만 실행했다.

CLI 미리보기는 승인 카탈로그/이용 조건 설정을 운영에서 읽지 않는다. 따라서 회차와 필수 사실을 확인할 수 있지만 승인·이용 조건 미확인은 보류로 표시된다. 이 기본값을 임의 승인으로 바꾸지 않는다. 기존 자동 공개 환경 변수가 있어도 facts-only 미리보기는 검수 파일을 읽지 않는다.

출력의 `api_first_preview=true`, `proposed_contract_ready`는 **제안 계약에 대한 로컬 검증 결과**다. 기존 서버 공개의 승인 표식이 아니며 `reviewed_revision`/`automatic_enrichment`를 발급하지 않는다. 서버에 직접 업로드하지 않는다.

## 다음 구현과 운영 경계

1. 원래 운영 checkout의 체크포인트·cooldownVersion2·source lease·최근 실행 및 실제 서버 계약/digest를 읽어 확인한다. 파일 부재를 새 큐/체크포인트 생성으로 해결하지 않는다.
2. 현재 승인 identity/artist 스냅샷을 읽는 서버 계약과 배포 단위의 KOPIS 이용 조건 설정을 연결한다. 기존 검수 사실이 있는 후보의 선택 정보는 보존하거나 후보별로 보류한다.
3. 서버 필수 사실 검증과 저장 계약에서 발표일·예매 시각을 선택 항목으로 분리한다. 미리보기 결과를 기존 필수 검증을 통과한 것처럼 포장하지 않는다. 보호된 승인/중복/수동 차단/동시성 조건을 유지하고 실제 executor digest와 계약을 맞춘다.
4. UI의 미확인 표시 및 일반 스케줄러 하나의 실행 경로를 구현·검증한다. 기존 GitHub workflow와 KOPIS 소유권을 먼저 정리하고 cooldown을 공유한다.
5. 정규 릴리스 범위와 운영 상태가 확인된 뒤 설치·실행·익명 공개 읽기·해당 change/ticket 알림 delivery/attempt 0건·다음 정규 회차를 각각 관측한다. 사용자가 중지한 예약은 명시적인 재개 요청 전 유지한다.

## 검증

- 신규 격리 테스트 9개: 정상 null 공개 계약, 명시 날짜/윤일, 모호한 회차·오류 시각, 전체 출연진 승인/충돌, 실제 관측·이용 조건, 기존 사실/수동 차단, 후보별 보류, CLI 범위 거부, 외부 호출/파일 생성 없는 미리보기.
- 기존 KOPIS 회귀 검사와 lint/build, diff 검사의 최종 결과는 이 체크포인트 커밋 본문에 기록한다. 운영 수집·DB 쓰기·배포·예약 변경은 0회다.

## 2차: 서버 계약·저장 검증 (2026-11-09 KST)

사용자의 “다음 단계도 해봐” 요청으로 서버 계약 구현까지 진행했다. `supabase/manual/api-first-publication.sql`은 **격리 DB에서 검증하는 릴리스 준비 SQL**이며 운영에 적용하지 않았다. 앞 절의 서버 계약 변경은 이 SQL의 준비 상태로 진전했으며, UI·일반 스케줄러와 운영 반영은 여전히 남아 있다.

운영 읽기 전용 관측은 2026-11-09 16:09:37 KST 기준 KOPIS `collection_enabled=true`, `publication_enabled=true`, `live_after=null`, 활성 collection lease 0건이었다. 이 정책값은 채팅 예약의 활성/중지 상태와 별개다. 원래 `.local` 파일 부재도 그대로이며 예약 상태·소유권·cooldown이 전달됐다고 추정하지 않는다.

운영 함수 정의를 읽어 현재 executor MD5 `d95b0e3e9edda18b7adc9a626589074f`, 필수 사실 검증 MD5 `be7d1f198a6708e10600888604881be5`, CR 제거 후 최종 공개 트리거 MD5 `f07f94cb662e61a84fad78055d112205`를 확인했다. 준비 SQL은 이 정의들과 공개 OFF·유효 임대 없음 조건을 확인해야 설치된다. 현재 운영 KOPIS 정책은 ON이므로 이 SQL을 그대로 실행하면 거절된다. 이번 개발에서 정책을 OFF로 바꾸거나 설치를 실행하지 않았다.

### 새 서버 계약

- 기존 `service_complete_collection`의 임대·정책 잠금·중복 검사·수동 상태·이력·무알림 저장 경로에 `batch.publication_contract=kopis-api-facts-v1` 분기를 추가한다. 별도 SQL writer나 새 수집 임대를 만들지 않는다. 이 분기는 KOPIS·`live_after=null`·아티스트 쓰기 입력 `identities=[]`만 허용한다.
- 검수 공개의 기존 `publication_facts_reason`은 유지한다. API 전용 검증기는 발표일/발표 시각 `null`·`announcement_verified=false` 및 예매 시작 시각 `null`을 허용한다. 선택 정보가 실제로 들어오면 기존 검증 강도를 유지하며, 없는 값을 verified로 승격하지 않는다.
- 서버도 원래 API 회차 안내를 정규화해 제출 회차와 대조한다. `api_observation.cast` 전체와 제출 출연진을 양방향 대조하고, 현재 승인 신원·전체 카탈로그의 동명이인·별칭을 다시 확인한다. 승인 철회와 미연결 출연진은 해당 후보만 보류한다.
- 기존 후보는 잠금 아래 `api_expected_revision`/`api_expected_hash`를 대조한다. 기존 검수 사실·출처·회차·신원 연결의 회귀 및 수동 결정은 보류하며 다른 정상 후보는 계속 처리한다. 잘못된 후보 버전 자료도 배치 전체를 실패시키지 않는다.
- 최종 공연 행에 `publication_basis=kopis-api-v1`을 저장해 실제로 검증한 API 공연의 미확인 선택 정보를 허용한다. 기존 행의 기본값은 `reviewed`이고 기존 검수 공개 기준을 유지한다. 공개된 행의 출처 유형 변경과 회차·출처 삭제로 필수 사실을 비우는 변경은 거절한다. 기존 수동 취소 표시는 계속 지원한다.
- KOPIS 이용 조건 설정 `collection_policies.api_facts_source_use`는 설치 시 `null`이다. 실제 조건을 검토·설정하기 전 API 경로는 보류된다. 테스트의 `fictional-terms`는 가상 데이터이며 운영 허가 근거가 아니다. 새 API 경로는 상품 딥링크를 공개 입력으로 받지 않는다.
- `service_kopis_api_context`는 현재 전체 카탈로그·승인 연결·이용 조건 설정을 읽는 service 전용 RPC다. 새 아티스트 등록/승인 writer를 제공하지 않는다.
- capability는 `publication-facts-v4`와 API 계약명을 반환한다. executor MD5와 별도로 API 검증·회귀 검사·회차 파서·최종 트리거·기존 ingestion 등 의존 함수 정의의 `api_facts_md5`도 pin한다. 배치의 두 digest 중 하나라도 다르면 저장 전에 거절된다. 기존 v3 실행기는 새 계약을 자동 수용하지 않고 실패를 반환하도록 남겨 두었다. 따라서 이 SQL만 설치하고 현재 실행기를 운영 가능하다고 보고하면 안 된다.

### 검증·릴리스 제한

격리 Postgres에서 정상 공연의 null 저장 → 익명 조회 → 동일 후보 재수집의 중복 0 → 해당 change `initial_import=true`·알림 delivery/attempt 0을 확인한다. 추가로 정책 OFF, 수동 보류, 오래된 버전/잘못된 버전, 기존 검수 사실 회귀, 출연진/회차 위조, 승인 철회/동명이인, digest 불일치, live 정책 거부, 실제 anon/authenticated/service 역할의 권한을 검증한다. 최종 검사 건수는 커밋 본문에 기록한다.

Supabase 공식 Database Functions 문서에서 search_path와 함수별 권한 지침을 확인했다. changelog 직접 조회는 환경의 대상 호스트 제한으로 HTTP CONNECT 403이었다. CLI 2.101.0은 읽기 전용 `/home/agent/.supabase` 설정 폴더 생성에서 실패했다. 따라서 저장소의 기존 준비 SQL 방식으로 변경을 남겼고, 임의 migration version이나 운영 migration 이력을 만들지 않았다. 정규 릴리스 전 CLI를 사용할 수 있는 환경에서 migration을 생성·검토해야 한다.

후속 순서는 새 서버 capability/context를 사용하는 일반 실행기 연결 → UI의 미확인 표시 → 운영 상태·이용 조건·원본 체크포인트 확인 → 정규 릴리스다. 중지한 예약은 재개 요청 전 유지하며, 실제 두 정규 회차의 공개·중복·알림 0 관측 전까지 지속 운영 완료로 세지 않는다.
