# 등록 차단과 출처 범위 — 2026-10-30

[역할 분리](artist-role-separation.md) 후속 수정·격리 검증 단계다. 실제 등록/승인·queue 쓰기·운영 적용·예약 변경·공개·발송은 실행하지 않는다. **공개 ON은 별도 승인 사항이다.**

## 등록 사전점검

내부 bandId는 새 행의 번호이고 MusicBrainz ID는 실제 검증해야 하는 외부 신원이다. 기존 pending ID를 재사용한다. 역할 플래그나 서비스 키가 실행 승인 심사를 대신하지 않는다.

`node scripts/artist-registration-preflight.mjs --role=artist <snapshot.json>`은 UTF-8 입력을 기존 `prepareIdentityTargets` 계약으로 검증한다. 입력 필드는 `version: 1`, `observedAt`, `targets`, `work`, `catalog`다. targets/work/catalog 형식은 기존 계약과 같고, catalog는 전체 아티스트 관측을 제공한다. 관측 시각은 1시간 이내여야 한다. 입력 시각은 서버 조회나 전체성 증명이 아니므로 실제 등록 전 서버 버전/임대 검사를 계속 요구한다.

다른 역할은 파일 읽기 전에 거절한다. ID 생성·환경/키 로드·네트워크·queue lock·journal 저장을 하지 않는다. 외부 신원/별칭 중복·근거 미완료·버전 충돌·수동 보호·40팀 한도는 기존 검증을 재사용한다. 성공은 `CONTRACT_VALID_REQUIRES_EXECUTION_REVIEW`이며 자동 승인 심사 통과나 등록 영수증이 아니다. 실패 코드는 구분해서 출력하고 임의 예외 원문은 숨긴다.

현재 로컬 checkout에는 실제 cloud queue/pending snapshot이 없다. 실제 pending 사전점검 성공·queue SHA 불변·등록 승인 심사 성공은 이번 검증에 포함하지 않는다. 대체 운영 ID나 입력을 만들지 않는다. 고정 선택·5시간 임대·불변 journal·receipt/공개 검색 readback은 기존 실행 경로에서 계속 요구한다.

## 출처 이용 범위

[KOPIS 공식 OPEN API 안내](https://kopis.or.kr/por/cs/openapi/openApiInfo.do?menuId=MNU_00077)를 2026-10-30 KST 확인했다. 외부 웹페이지/애플리케이션에서 API 항목별 정보를 활용하도록 제공하며 인증키와 출처표시를 요구한다. 실제 계정의 신청 범위·키 유효성·호출 제한은 별도 확인 대상이다. API 사실정보 활용 근거를 외부 HTML 본문·포스터/이미지 다운로드·재전재 허가로 확장하지 않는다. API 등록/수정일을 발표일로 만들지 않는다.

`node scripts/collect-catalog.mjs --source=kopis --facts-only`는 API 사실정보·출처·예매 링크의 **미리보기 전용**이다. 혼합 수집·HTML adapter·`--upload` 조합은 파일/네트워크 접근 전에 거절한다. 외부 공지 HTML 보완·포스터 확인·외부 아티스트 조회·아티스트 cache 읽기/쓰기를 건너뛴다. KOPIS parser는 본문/포스터 필드를 보존하지 않는다. `--output`은 정규화한 후보만 기록하며 원본 API 응답을 저장하지 않는다. 기존 자료는 삭제/덮어쓰기하지 않는다. 기존 기본 수집과 예약은 종전 동작이며 이 모드를 운영에 적용했다고 주장하지 않는다.

공개 준비 자문의 `permission`은 기존 허용 상태/publication/근거 URL/90일 이내 확인에 더해 `method: api`, `scopes: [publication, concert_facts, source_links]`를 요구한다. 이 필드는 이번에 사용할 범위를 선언한다. 본문/이미지 범위를 섞은 입력은 `SOURCE_USE_SCOPE_UNVERIFIED`로 보류한다. 실제 권한 검증이나 네트워크 접근 통제의 대체물이 아니다. 기존 snapshot의 미확인 permission을 자동 허용으로 바꾸지 않는다.

NOL **예매 목적지 링크만** 있다는 이유로 다른 API에서 가져온 사실정보를 NOL 자료로 취급하지 않는다. 후보 원출처·`sources`·`ticket_evidence`에 NOL 근거가 있으면 계속 `OPTIONAL_NOL_DEPENDENCY`로 보류한다. 링크는 NOL 접근·수집·근거 제출 허가가 아니다. 예매 링크를 바꿔도 NOL 근거 차단은 유지한다. 자문 수정이 서버 공개 실행기의 호환 검증을 뜻하지 않는다.

## 검증과 다음 단계

등록 사전점검·신원 계약·출처 평가·공개 보호 SQL·KOPIS 관련 격리 검사 40개, lint/build, `git diff --check` 통과. 실제 CLI를 모의 API와 연결해 KOPIS API 외 요청 없음·본문/이미지/키 유출 없음·cache 생성 없음도 검증했다. build의 기존 500kB 초과 번들 경고는 남는다. 가상 fixture의 권한/API/아티스트는 실제 이용허가나 등록 실적이 아니다. 별도로 실행한 기존 journal/identity CLI 회귀에서는 4건이 Windows hard link/symlink EPERM으로 실패했다. 우회 저장으로 journal 계약을 약화하지 않았다.

다음 단계는 공개 실행기 보완 → 중복·취소·수동 차단과 무알림 초기 공개 검증 → 실제 후보 최종 상태 readback이다. 실제 등록 심사·운영 적용 성공은 별도 확인하며 공개 ON은 별도 승인 후 실행한다.

후속 구현·로컬 검증: [공개 실행기 보완](publication-executor.md). API 일반예매 근거 계약을 추가했으며 운영 실행기의 교체·공개 ON·실제 후보 상태 확인 완료를 뜻하지 않는다.
