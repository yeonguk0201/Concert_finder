# KOPIS 공연 발견과 공식 예매 공지 보완

2026-10-14 구현·운영 검증. 이 문서가 기존 수집 문서의 YES24·KOPIS 지원 범위보다 우선한다. 실제 적용 결과는 아래 운영 검증 기록을 따른다.

## 수집 흐름

기본 `collect-catalog.mjs` 실행은 UALIVE → Mint Paper → RADWIMPS → KOPIS 순서다. 봇 차단을 확인한 YES24는 기본 목록에서 제외했고 새 SQL은 수집·자동 공개 정책도 비활성화한다. 기존 후보·이력은 보존한다. NOL은 이번 경로에 추가하지 않는다.

KOPIS 공식 API의 대중음악(`CCCD`) 목록에서 앞으로 180일의 공연을 발견한다. 31일 이하의 구간, 페이지당 100건으로 나누며 목록 요청은 최대 30회다. 범위나 응답이 한도를 넘으면 정상 완료로 숨기지 않고 실패를 기록한다. 중복 공연 ID를 제거한 뒤 한 실행에서 상세 최대 100건을 읽는다. 100건을 넘으면 UTC 시간별 슬롯을 순환하며 전체 갱신에 필요한 실행 횟수를 보고서의 경고에 남긴다. 따라서 모든 공연이 매시간 갱신된다고 보장하지 않는다. 일시적인 통신 오류·429·5xx는 요청당 최대 3회로 재시도하고 대기 간격을 늘린다. 영구적인 4xx·크기·인코딩 오류는 재시도하지 않으며, 반복 상세 실패 3회면 남은 요청을 중단한다.

공연 날짜·장소·지역·출연진·가격·예매 링크를 검수 후보로 저장한다. 출연진이 대상 장르라는 뜻은 아니며, 미등록 이름도 보존한다. KOPIS 등록일·수정일은 발표일로 사용하지 않고 공연 시각은 예매 시각으로 사용하지 않는다. 포스터 이미지는 자동 표시하지 않는다. KOPIS 후보에는 `(재)예술경영지원센터 공연예술통합전산망(KOPIS)` 출처를 유지하고 새 수집 정책은 자동 공개를 끈 상태로 시작한다.

한국 지역은 정확한 명칭·표준 약칭으로 확인한다. 실제 응답과 [공식 지자체 자료](https://www.jeonnam-gwangju.go.kr/)로 확인한 `전남광주통합특별시`도 지원한다. 목록에 없는 지역은 원문 지역명을 보존하고 `country_code=null` 및 검수 사유를 남기며 한국 공연으로 단정하지 않는다.

## 예매 시각 보완

- 주최사 페이지의 예매 섹션에 명시된 **일반 예매** 날짜·시각만 추출한다. 선예매·응모·날짜 없는 시각·변경 안내는 자동 확정하지 않는다.
- 티켓링크의 공개 공지 상세(`/help/notice/숫자`)를 읽는다. 후보에 티켓링크 상품 링크가 있으면 [등록 목록](../scripts/ticketlink-notices.json)의 공지를 확인하고, UALIVE·Mint Paper 페이지에 직접 연결된 공지 URL도 읽는다. 공지 URL은 최대 50개이며 robots 정책을 실행마다 다시 확인한다. 검색·예매·계정·내부 API 경로는 요청하지 않는다.
- **같은 티켓링크 상품 ID + 같은 공연 시작/종료일 + 같은 장소**일 때만 연결한다. 장소의 공백·대소문자 등만 정규화하며 제목 유사도나 임의 별칭으로 합치지 않는다. 이전 수집원에서 직접 확인한 일반 예매 근거도 같은 조건으로 KOPIS 후보에 보완한다.
- 시각 충돌은 자동 선택하지 않고 검수 사유와 비교 공지를 보존한다. 같은 상품의 과거 공지가 현재 공연과 날짜가 다르면 적용하지 않는다. `ticket_evidence`에는 원문 문장·시각·공연일·장소·매칭 여부를 남기며 관련 공식 출처도 후보에 포함한다.
- 후보 업로드 후 기존 관리자 검수·중복·충돌·공개 중단 보호를 따른다. 기존 공개 공연을 자동 수정하거나 출처가 다른 후보를 강제로 합치지 않는다.

등록 목록의 `62400`은 실제 읽기를 확인한 MCR의 **기존 4월 공연 공지**다. 11월로 연기된 공연에 이 날짜의 예매 시각을 자동 적용하지 않는다. 새 공지 URL은 확인 후 목록에 추가한다. 공개 목록 HTML에는 공지 항목이 포함되지 않아 **티켓링크 전체 신규 공지 자동 발견은 미구현**이다. 필요하면 `--notice-file=경로`로 다른 UTF-8 JSON URL 배열을 사용할 수 있다. robots 허용은 데이터 재사용 조건 전체를 대신하지 않으므로 운영 전 이용 조건·허용 범위를 확인한다.

## 인증키와 운영 적용 순서

KOPIS 안내상 인증키의 기본 유효기간은 발급일부터 1년이며 3개월 이상 사용하지 않으면 승인이 취소될 수 있다. 만료·승인 취소 안내 메일을 확인하고 필요하면 안내된 절차로 연장을 신청한다. 키가 변경되면 GitHub secret만 갱신한다.

개별 공연 출처 표시는 유지한다. 추후 예매량·관객 수 등 집계 통계를 제공한다면 안내에 따라 집계기간(최종집계일), 집계대상(모든 공연 데이터 전송기관), 전산 티켓 발권량 기준이므로 전체 관객 수와 다를 수 있다는 설명도 함께 표시한다. 현재 어댑터는 통계 API를 호출하거나 관객 통계를 제공하지 않는다.

1. [KOPIS Open API 안내](https://kopis.or.kr/por/cs/openapi/openApiInfo.do?menuId=MNU_00077)에서 인증키를 신청한다. 키를 채팅·소스·브라우저 코드·`VITE_*` 환경변수에 넣지 않는다.
2. GitHub 저장소 Settings → Environments → `catalog-ingestion` → Environment secrets에 `KOPIS_SERVICE_KEY`로 등록한다. 기존 Supabase 서버 secrets도 필요하다. 키는 인증 요청 외에 보고서·로그·출처 URL에 포함하지 않는다.
3. `20261014125200_kopis_discovery.sql`을 기존 마이그레이션 다음에 적용한다. KOPIS URL 검증·수집 정책을 추가하고 기존 역할별 RPC 권한을 유지한다. 운영 DB에는 2026-10-14 `kopis_discovery`(기록 버전 `20261014131913`)로 적용했다.
4. 작업 PR을 `dev` 대상으로 검토·통합한다. 예약 실행은 기본 브랜치의 workflow를 사용하므로 `main`도 PR로 통합한 뒤 수동 실행으로 결과를 검증한다.
5. Actions의 `collection-report`에서 `kopis` 후보·실패·범위·순환 경고를 확인하고 관리자에서 출연진·장르·발표·예매 근거를 검수한다. KOPIS 출처 표시를 삭제하지 않는다. 무관한 공연은 제외하고 최초 가져온 과거 발표를 신규 발표로 알리지 않는다.

```sh
# 서버 환경변수 KOPIS_SERVICE_KEY가 설정된 셸에서 실행 (원격 쓰기 없음)
node scripts/collect-catalog.mjs --source=kopis --skip-artist-lookup --output=collection-kopis.local

# 동일 상세 구간 재검증 (슬롯은 현재 전체 배치 수로 나눈 나머지)
node scripts/collect-catalog.mjs --source=kopis --kopis-slot=3 --output=collection-kopis.local

# 주최사 근거와 아티스트 보완을 포함한 전체 경로 (원격 쓰기 없음)
node scripts/collect-catalog.mjs --output=collection-report.local

# DB 마이그레이션·서버 secrets 준비 및 적용 승인 후 후보 업로드
node scripts/collect-catalog.mjs --upload --output=collection-report.local
```

키가 없는 전체 실행은 `configuration_missing`과 Actions warning을 기록하고 주최사 수집만 계속한다. `--source=kopis`를 명시했는데 키가 없으면 종료 코드 1이다. 키를 등록하기 전에는 KOPIS 발견 기능이 활성화되지 않는다.

## 검증과 한계

테스트는 API XML·페이지 분할·중복·조회 예산·오류 응답·비밀키 비노출·공지 시각 추출·선예매 제외·날짜/장소 충돌·CLI 보고서/해시·DB 권한·검수 전 공개 방지를 확인한다. 네트워크 검증에서는 티켓링크 MCR 공지에서 일반 예매 `2025-07-14 12:00 KST`와 기존 공연일 `2026-04-18`을 읽었다. KOPIS `www` API가 정규 HTTPS 호스트 `kopis.or.kr`로 리디렉션하는 점을 확인하고 정규 호스트를 직접 사용한다. 인증키 없는 오류 응답의 형식도 확인했다.

사용자가 인증키를 발급받아 GitHub `catalog-ingestion` 환경에 등록했고, 실제 인증 API 응답·원격 업로드를 확인했다. 첫 실행은 공연 641개를 발견하고 후보 95개를 저장했지만 새 지역명 미지원 5건으로 부분 실패했다. 다음 동일 구간 실행에서는 별도 요청 오류도 확인했다. 지역 지원과 제한된 일시 오류 재시도를 보강한 [실행 38572864951](https://github.com/yeonguk0201/Concert_finder/actions/runs/38572864951)은 3분 3초에 성공했다.

- 앞으로 180일의 대중음악 공연 641개 발견, 동일 슬롯(301–400번) 후보 100개 수집·업로드, 실패 0건.
- 새 지역명 5건 모두 `KR`로 확인. 운영 DB 실행 상태 `success`, 검수 100개, 공개 0개.
- KOPIS 후보 URL 중복 0개, 재실행 후 후보 100개로 합쳐짐. 기존 공연 8개 보존.
- 641개 전체의 상세 확보가 완료됐다는 뜻은 아니다. 100건 한도와 7개 슬롯을 순환한다. 남은 슬롯은 이후 실행으로 확보하고 검수한다.
- 작업 PR은 [#35](https://github.com/yeonguk0201/Concert_finder/pull/35). 코드 변경마다 GitHub CI(전체 테스트·lint·build·알림 런타임) 및 미리보기 검사를 통과했다.

원격 security advisors도 실행했다. 변경한 수집 RPC의 명시적 anon 실행 권한을 제거한 뒤 `has_function_privilege`가 false임을 확인했다. 기존 private RLS 정보성 항목, 다른 익명 실행 RPC·인증 RPC·유출 비밀번호 보호 관련 기존 경고는 별도이며 모든 보안 경고가 해소됐다는 의미는 아니다. [RPC 권한 진단 안내](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

공식 규격: [KOPIS Open API 개발 가이드](https://kopis.or.kr/upload/openApi/%EA%B3%B5%EC%97%B0%EC%88%A0%ED%86%B5%ED%95%A9%EC%A0%84%EC%82%B0%EB%A7%9DOpenAPI%EA%B0%9C%EB%B0%9C%EA%B0%80%EC%9D%B4%EB%93%9C.pdf).
