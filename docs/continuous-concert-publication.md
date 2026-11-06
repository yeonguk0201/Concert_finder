# 공연의 지속 자동 공개

사용자 목표는 후보 수집에 그치지 않고 검증을 통과한 공연이 사이트에 계속 올라오는 것이다. 요네즈 1건 고정 공개를 최종 운영으로 취급하지 않는다. 새 공연별 사용자 재승인 없이 검수된 초기 공개를 자동 실행하며, 알림은 계속 무알림이다.

## 실행 경로

기존 KOPIS 채팅 예약이 고정 최대14건의 미공개 후보를 공식 근거로 검수한다. 기존 checkpoint/진행 목록/통지 지문/HTTP400 cooldown을 보존한다. 검수에서 통과한 후보만 아래 파일로 전달하고, 기존 scheduler를 최대1회 실행한다. 빈 통과 목록도 유효하므로 공개 가능한 후보가 없다고 발견 수집을 중단하지 않는다. 이미 공개된 요네즈 한 건 때문에 전체 예약을 종료하지 않는다.

```json
{
  "version": 1,
  "source": "kopis",
  "checked_at": "실제 이번 검수 ISO 시각",
  "candidates": [
    {
      "id": "실제 후보 UUID",
      "revision": 1,
      "content_hash": "실제 저장 행의 SHA256",
      "checked_at": "실제 이 후보 검수 ISO 시각",
      "kopis_guidance": "실제 API 회차 안내 원문",
      "source_use": { "verified": true, "basis_url": "https://이용근거URL" },
      "payload": { "설명": "실제 검수로 완성한 전체 정규화 payload. 이 예제는 실행 입력이 아니다." }
    }
  ]
}
```

`.local/concert-collection/automatic-review-plan.json`을 UTF-8로 작성한다. 계획/후보 관측은1시간 이내, 최대14건, 중복ID 없음이 필수다. 후보 ID/revision/hash는 실제 읽기로 고정한다. 저장 원본의 회차·발표·예매·확인 출처·아티스트 연결을 제거하지 않는다. 조사한 최소 사실과 출처만 사용하고 본문/이미지를 저장하지 않는다. 검수하지 않은 값을 true로 만들거나 관측 시각을 갱신한 척하지 않는다. 실제 공연/회차/전 출연진·기존 신원승인·발표일·일반예매·출처 이용 범위를 모두 검증해야 payload를 제출할 수 있다. 세부 내용은 기존 collection-fact-guards/publication_facts_reason과 동일하다.

실행 환경은 `KOPIS_AUTOMATIC_PUBLICATION=1`, `KOPIS_AUTOMATIC_REVIEW_FILE=<위 파일의 절대경로>`, 검토한 최신 `KOPIS_PUBLICATION_EXECUTOR_MD5`를 명시한다. 과거 단일 KOPIS_REVIEWED_CANDIDATE/GUIDANCE는 지속 모드에서 사용하지 않는다. 기존 secret binding은 그대로다.

기존 scheduler는 policy ON/live_after=null/v3/reviewed_release/continuous_review/MD5를 확인한다. 정상 collect-catalog는 하나의 기존 source lease에서 발견 수집과 검수 통과 건의 현재 KOPIS 재대조를 수행한다. raw 회귀 후보는 기존대로 보류하고, 검수 행은 UUID/revision/hash CAS 표시를 붙여 같은 completion에 합친다. 서버가 수동상태/기존근거/현재 승인·중복·사실검사를 다시 확인한다. 검수 중 상태가 바뀌면 쓰기를 거절한다. 서버는 검증된 모든 출처 링크를 공개 데이터에 저장한다.

현재 자동 공개 출처는 이용·사실 검증 경로가 있는 KOPIS다. 다른 출처 정책은 OFF이며 미허가 NOL/Reissue 취득·YES24 OFF를 유지한다. 다른 출처를 검증 없이 자동 허용하지 않는다. 미등록 아티스트가 있으면 해당 후보만 보류한다. 기존 공개 공연의 중요 변경·취소는 기존 수동 검수 보호를 유지한다. 이 버전은 검증된 새 공연의 지속 자동 등록이다.

GitHub의 기존 매시간 수집은 KOPIS를 제외하고 나머지 출처 발견을 계속한다. KOPIS가 두 예약에서 실행돼 서로 최근1시간 조건을 막는 문제를 없앤다. 수동 workflow_dispatch는 기존 명시적 선택을 유지한다. GitHub 공연 수집에도 concerts-only를 명시해 새 아티스트 writer를 만들지 않는다.

## 검증과 적용 순서

격리 DB에서 임의2개후보 공개, 모든 출처 저장, 미완료 행의 CAS 보완·공개, 기존 회귀/수동보류/변경행 거절, initial_import 및 알림 생성/시도0을 검사한다. 클라이언트에서 오래된 계획/중복/공개완료/수정revision/HTTP400과 빈 통과 목록의 정상 수집 선택을 검사한다.

정규 PR/CI/릴리스 후 운영 migration을 적용하고 실제 capability MD5를 다시 읽는다. CLI는 실행 환경의 읽기 전용 홈에 설정 폴더를 만들려다 실패했으므로 검증 SQL을 manual에 두고, 운영 apply_migration이 발급한 실제 version을 migration 파일명으로 기록한다. 임의 version을 만들지 않는다. 자동 승인 검토가 최초 직접 적용을 거절했으므로 우회 SQL로 실행하지 않는다.

원래 예약 환경의 runtime은 별도다. 정규 커밋에서 신규 모듈과 기존3파일의 최소 delta만 전달하고 기존 cooldownVersion2/상태를 보존한 실제 설치 영수증을 받아야 runtime 반영 완료다. 코드/지시 저장만으로 자동 운영 완료를 보고하지 않는다. 첫 정상 지속 실행의 같은 run/신규 후보/공개/보류·실제 익명조회와 이벤트별 알림0을 읽어 대조한다.
