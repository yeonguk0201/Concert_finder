# 공개 실행기 보완 — 2026-10-30

후속 검증: [중복·취소·수동 차단과 무알림 초기 공개](publication-protection-verification.md). 익명 조회·워커 claim·활성화 경계·배치 오류 격리 검증을 확장했다. 운영 적용 여부는 여전히 미적용이다.

[역할·ID 계약 분리](artist-role-separation.md)와 [등록 차단·출처 범위](registration-source-scope.md)의 후속이다. 이번 요청의 1번 구현과 이에 필요한 2번 **로컬 격리 검증**을 수행했다. 운영 공개 ON 승인은 받지 않았으며 운영 DB·후보·예약·queue를 변경하지 않았다.

## 변경 내용

`supabase/manual/harden-publication-executor.sql`은 기존 `service_complete_collection`을 보완하는 **미적용 SQL 제안**이다. 과거 migration을 수정하거나 자동 migration 경로에 추가하지 않았다. 테이블·정책 행·Cron·알림 워커를 만들거나 변경하지 않는다. 적용은 별도 운영 변경 검토 후 migration으로 준비해야 한다. 현재 운영 스키마와의 차이·권한/advisor 확인도 그때 필요하다.

- 한국 공연의 도시·장소, 취소 여부의 명시적 false, 실제 달력 날짜, 발표 절대시각과 KST 날짜 일치, 시각을 확정한 회차, 일반예매 시각과 회차의 순서를 검사한다. 같은 회차를 다른 UTC offset으로 중복 제출해도 거절한다.
- 출처 확인시각과 API 일반예매 사실정보를 검사한다. 아티스트는 외부 신원 연결·공개 승인뿐 아니라 현재 `approved` 상태여야 한다. 역할 표시나 ID 할당을 승인으로 해석하지 않는다.
- NOL 자료 출처는 보류하되 API의 NOL 예매 목적지 링크만으로 보류하지 않는다. `reissue_nol`의 출시 제외는 유지한다.
- 기존 source 임대·정책/version 확인·출처별 ingestion·공연 테이블 잠금·중복 보류·결정 기록·완료 run 재호출 영수증을 유지한다. 배치 내 중복 source URL은 ingestion 전에 거절한다.
- 수동 차단을 우선 처리한다. 기존 취소 후보·취소/철회된 공연은 재수집으로 복구하지 않고 검토로 보낸다. 중요 변경도 기존 공연을 덮어쓰지 않는다. 실제 취소 상태를 자동 반영하는 기능은 추가하지 않았다.
- `live_after=null`, run 시작 전후 경계, 과거 발표의 무알림 처리를 유지한다. 제출 입력의 명시적 `initial_import=true` 또는 이미 지난 예매 오픈도 무알림으로 처리한다. ingestion이 모든 후보에 덧붙이는 `initial_import=true`를 live 판단에 쓰지 않고, 원래 제출 입력의 명시적 플래그를 사용한다.
- 회차 label이 없으면 확인한 공연 날짜를 표시한다. 새로운 시각·발표일·신원은 추정하지 않는다.

## API 일반예매 근거 계약

자문 `concert-publication-readiness.mjs`와 제안 SQL 모두 다음 정규화 계약을 요구한다. 가상의 구조 예시이며 실제 API에서 이 필드를 확보했다고 뜻하지 않는다.

```json
{
  "method": "api",
  "sale_type": "general",
  "event_matched": true,
  "source_url": "https://official.example/api/events/example",
  "opens_at": "2027-01-01T12:00:00+09:00",
  "verified_at": "2026-10-30T10:00:00+09:00"
}
```

`opens_at`은 `ticket.opens_at`과 같은 절대시각이어야 하고 `source_url`은 확인시각이 있는 `sources` 항목에도 존재해야 한다. `reason`은 없어야 하거나 비어 있어야 한다. 원문 `line/body/html/image`를 포함한 근거는 인정하지 않는다. 기존 HTML 예매 파서나 저장 자료는 삭제·덮어쓰기하지 않고, 이 단계의 공개 준비 판정에서 API 근거로 승격하지 않는다. 준비 작업 안내도 API 사실정보 확인으로 맞췄다.

이 필드는 신뢰된 서버 수집기의 입력 계약이다. 실제 권한·이용 허가·API 원문 의미·이벤트 일치의 진실성을 SQL만으로 인증하지 않는다. 자문의 기존 permission/API 범위·adapter 검증·runner 호환·fresh snapshot·수동 변경 검수는 계속 필요하다. KOPIS의 현재 parser는 발표일·일반예매 시각을 제공하지 않으므로 이번 코드로 실제 KOPIS 후보가 준비 완료되는 것은 아니다. `runnerCompatible`이나 실제 후보의 근거를 자동 변경하지 않았다.

## 검증 결과

- PGlite에서 기존 ingestion/아티스트 검수/KOPIS/Reissue migration과 제안 SQL을 실행했다. SQL 적용 전후 policy 전체 행이 동일함을 확인했다. 가상 아티스트·공연·기기만 사용했다.
- 관련 Node 격리·회귀 검사 **88개 통과**. 신규 실행기 검사 27개(상위 테스트 포함)는 OFF, 임대·재시도, 중복 URL/출처, 수동 차단, 취소·철회·중요 변경 보존, 현재 아티스트 승인, API 근거 거절, 무알림과 접근 권한을 포함한다.
- 알림 동의·찜·활성 기기를 가진 가상 구독자를 넣고 최초 공개/명시적 초기 가져오기/과거 예매 오픈의 announcement delivery 생성 0건을 확인했다. live 가상 사례에서는 기존 경로로 1건이 생성되는 양성 대조도 확인했다. 실제 push 전송·기기 수신 검증이 아니다. 이후 사용자가 직접 저장한 일정의 기존 reminder 동작은 변경하지 않았다.
- `npm run lint`, `npm run build` 통과. 기존 500kB 번들 경고는 남는다. UI는 변경하지 않았다.

## 남은 단계

1. 운영 적용 전 현재 함수/권한 차이와 출처별 adapter 계약·이용 범위를 검토하고 적용안을 확정한다. 기존 KOPIS 예약 실행기의 `publication_enabled/live_after` 변경 시 중단 보호는 유지했다.
2. 실제 후보 최종 상태는 fresh 읽기 전용 snapshot으로 ID/revision·수동 차단·신원 승인·중복/취소/변경·출처/일반예매 근거를 다시 확인한다. 이번에는 실제 후보 readback을 실행하지 않았고 과거 보고서를 현재 상태로 간주하지 않았다.
3. **공개 ON은 별도 명시적 승인 후 실행한다.** 이번 로컬 fixture의 정책 ON이나 알림 생성은 운영 ON·공개 성공·발송 성공의 근거가 아니다. 운영 DDL·배포·발송·push/PR/merge도 이번 작업에서 실행하지 않았다.
