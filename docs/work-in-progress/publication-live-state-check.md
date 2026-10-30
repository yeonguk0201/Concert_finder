# 실제 후보 최종 상태 확인과 클라우드 자동 공개 재개

## 목적과 사용자 승인 범위

2026-10-30 KST 사용자 요청: 클라우드 예약이 실제 공연을 수집하고 조건 충족 시 자동 승인·공개하도록 연결한다. 이번에는 **1번 최신 운영 상태의 읽기 전용 점검과 인계 문서 작성**을 실행한다. **공개 ON은 별도 명시적 승인 사항**으로 유지한다. 이 문서는 다음 채팅에서도 작업을 재개할 수 있는 현재 인계 기준이다.

아티스트 DB 승인, 공연 후보 검수, 공연 자동 공개 정책, Codex 도구 실행의 자동 승인 심사는 서로 다른 단계다. 후보 수집 성공이나 아티스트 승인만으로 공연 공개 조건을 충족한 것으로 세지 않는다. 도구 실행의 자동 승인 심사를 공개 정책 변경으로 대신하지 않는다.

운영 DB/후보/아티스트/queue/정책/예약/배포/발송은 변경하지 않았다. 테스트 공연 삭제도 이번 범위가 아니다. 변경한 것은 로컬 결과 파일과 이 문서뿐이다.

## 현재 진행 단계

- [x] 실제 운영 프로젝트 식별 및 최신 SELECT snapshot 확보.
- [x] 공개 공연·테스트성 공연·실제 후보·출처 정책·최근 수집 결과 확인.
- [x] 기존 readiness CLI로 실제 후보 973건의 ID/revision별 판정 보존.
- [x] 운영 공개 실행기 정의와 로컬 제안의 핵심 계약 차이 확인.
- [x] 클라우드 3개 예약의 지시문·활성·반복 설정 확인. 사용자가 제공한 원문과 설정 사진을 근거로 하며 도구의 서버 readback과 구분한다.
- [ ] 클라우드 실제 checkout/queue/lease·실행 로그 최신 readback. 지시문에 적힌 값만으로 현재 실행 상태를 인증하지 않는다.
- [x] 사용자 제공 cloud-state-check ZIP의 현재 접근 환경 코드·서버 관측을 로컬과 대조. 아래 후속 비교 참조. 예약별 과거 복구 환경·queue 연속성은 여전히 미확인이다.
- [ ] 출처 이용 범위·adapter 인증과 후보 근거 보완, 실행기 운영 적용 검토.
- [ ] 공개 ON 별도 승인 및 활성화 직전 최신 재조회.
- [ ] 활성화 후 실제 공개 행·기존 예약의 다음 실행·무알림 초기 채움 결과 확인.

판정: **읽기 전용 DB 점검 완료, 공개 준비 미완료(NO_VERIFIED_SOURCE_READY)**. 클라우드 예약 전체의 현재 실행 가능성까지 확인 완료한 것은 아니다.

## 최신 운영 조회 결과

프로젝트 `Concert_finder` / `czjrzylvnewfjnfwjhwf`, ACTIVE_HEALTHY. 후보 snapshot은 **2026-10-30 18:04:02 KST**, 공개 공연/상태 집계는 **18:04:51 KST** 관측이다. 조회들은 별도 SELECT이므로 전체 결과가 하나의 동시점 transaction이라는 뜻은 아니다.

### 공개된 공연: 8건

8건 모두 DB status=published, cancelled=false다. 앱의 현재 필터·익명 RLS를 통한 화면 표시까지 이번에 확인하지는 않았다.

| 구분 | 제목 | 날짜 | 저장된 출처 |
| --- | --- | --- | --- |
| 테스트성 | 테스트 공연 | 2026-10-28~29 | test.com |
| 테스트성 | 해제 테스트 | 2026-12-31 | test.com |
| 테스트성 | 알람용 | 2026-12-31 | test.com |
| 테스트성 | 오아시스 등록2 | 2026-12-31 | test.com |
| 테스트성 | 오아시스 등록 | 2026-12-31 | test.com |
| 테스트성 | 오아시스 | 2026-12-31 | test.com |
| 일반 공연 행 | 마이 케미컬 로맨스 내한공연 | 2026-11-07 | UALIVE·티켓링크·전자신문 |
| 일반 공연 행 | 세쿠 내한공연 | 2026-12-18 | UALIVE |

6건은 test.com과 테스트 명칭을 근거로 구분했다. 나머지 2건은 실제 공연 출처가 연결된 기존 행이라는 뜻이며 이번에 공식 사이트 재검증·예매 근거의 최신성·정확성을 인증한 것은 아니다. 기존 MCR 연기/예매 공지 관계도 이번 조회만으로 해결 처리하지 않는다. 데이터는 모두 보존했다.

### 수집 후보: 973건

| 출처 | 후보 | 수집 정책 | 공개 정책 | 현재 활성 source lease | 개별 공개 조건 충족 |
| --- | ---: | --- | --- | --- | ---: |
| KOPIS | 912 | ON | OFF | 없음 | 0 |
| UALIVE | 12 | ON | OFF | 없음 | 0 |
| Mint Paper | 4 | ON | OFF | 없음 | 0 |
| RADWIMPS | 2 | ON | OFF | 없음 | 0 |
| YES24 | 43 | OFF | OFF | 없음 | 0 |

5개 정책 모두 live_after=null, adapter_version=catalog-v1. 관측한 모든 후보의 원출처 host가 위 5개에 포함된다. NOL 선택 제외를 다른 출처의 허가/준비 완료로 바꾸지 않았다. 예약 활성 여부와 여기의 collection_enabled는 별개다.

후보 상태는 pending 970건(수동 자동화 차단 1건 포함), dismissed 2건, reviewed 1건이다. 아티스트는 전체 672팀: approved 508 / unreviewed 157 / excluded 7이다. 아티스트 전체 승인 건수를 개별 공연의 출연진 신원 승인 충족 수로 쓰지 않는다.

### 후보별 미완료 조건

아래는 기존 자문 판정의 중복 집계다. 한 후보에 여러 이유가 붙으며 총합을 후보 수로 해석하지 않는다.

| 미완료 조건 | 후보 수 |
| --- | ---: |
| 발표 근거·발표 절대시각 미검증 | 973 |
| 일반예매 API 근거·절대시각 미검증 | 973 |
| 원출처 사실정보 확인시각 미검증 | 973 |
| 파서 검토 사유 남음 | 973 |
| 개별 회차 미검증 | 961 |
| 출연진 신원/현재 승인 연결 미충족 | 936 |
| 이전 payload와 차이가 있어 중요 변경 검수 필요 | 637 |
| 날짜가 과거이거나 미검증 | 260 |
| 한국 도시·장소 요건 미충족 | 66 |
| 기존 공연/중복 충돌 | 2 |
| 수동 자동화 차단 | 1 |

취소 여부는 snapshot의 973건 모두 명시적 false다. 이것은 현재 원출처의 실제 취소 공지를 재조사했다는 의미가 아니다. 기존 공연 8건도 cancelled=false였다.

후보별 원본 ID/revision/출처 URL/판정 사유는 [기계 판독 결과](publication-live-state-20261030.json)에 보존했다. 원문 API/HTML/이미지, 비밀값, 개인행, 기기 키는 넣지 않았다. 원본 투영 snapshot과 CLI 상세 출력은 Git 제외 경로인 `.local/concert-operations/live-state-20261030-input.json`, `live-state-20261030-readiness.json`에 있다. 로컬 파일이 클라우드에 자동 공유되는 것은 아니다.

기존 snapshot SQL은 candidate.status 자체를 readiness 입력에 포함하지 않는다. 따라서 reviewed/dismissed의 보호 여부는 별도 집계로 확인했다. 이번 eligible=0을 뒤집는 근거가 아니며, 향후 활성화 전 상태·수동 결정을 서버에서 다시 대조해야 한다.

보존할 기존 수동/해결 상태:

- reviewed: `fc95c1ae-da6e-447a-b44d-2302638864b2`, revision 1, 더 워닝 내한공연. automation_blocked=false.
- dismissed: `b086d59f-5934-48a4-8404-0f5825d1ae2d`, revision 1, THE FLOOD 2026. automation_blocked=false.
- dismissed: `73514125-e1f4-473d-b748-24ec0e1e8ac8`, revision 1, Beautiful Mint Life 2026. automation_blocked=false.
- pending/automation_blocked=true: `2d3ea1a5-b7ec-4813-a139-a61bb5fc4176`, revision 5, 월드뮤직그룹 디에보: 다르고 아름다운 [서산].

## 클라우드 예약과 실행기 상태

### 운영 DB에서 확인한 실제 수집 기록

최근 scheduled 실행은 state=legacy인 ingestion 보조 기록과 구분해 조회했다. 아래는 state<>legacy 중 출처별 최신 기록이다.

| 출처 | 최신 종료 KST | 상태 | 후보/검토/공개 | run ID |
| --- | --- | --- | --- | --- |
| KOPIS | 10-30 17:39:18 | partial | 80 / 80 / 0 | cb8422c7-66a1-4424-b0e4-d48874adb4cf |
| UALIVE | 10-30 17:36:01 | success | 1 / 1 / 0 | 71f0ec47-0287-4bd5-9933-d259af41245f |
| Mint Paper | 10-30 17:36:10 | success | 1 / 1 / 0 | 3a5b07a3-b415-4b5a-965d-53a87bb51df7 |
| RADWIMPS | 10-30 17:36:25 | success | 2 / 2 / 0 | cbf5e642-d0f2-4366-824c-c233fc204e5a |
| YES24 | 10-14 19:11:39 | partial | 0 / 0 / 0 | 33205b43-cc43-4157-a10a-6c4154c8a2aa |

KOPIS 최신 partial의 실패 내역은 상세 HTTP400 18건, COLLECTION_IDENTITY_REGRESSION 2건이다. YES24의 과거 partial은 fetch failed 45건이다. 오류 문자열은 이전 형식이며 고정 code/stage는 null이었다. 별도 해결 과제로 남기고 이번에는 수집 재실행이나 수정하지 않았다.

전체 누적 collection_decisions는 review만 관측됐다: PUBLICATION_DISABLED 11,699 / ARTIST_CURATION_BLOCKED 652 / ADMIN_OVERRIDE 3. 이는 누적 이력이며 고유 후보 수가 아니다. 수집 success는 공개 성공이 아니다.

운영 cron은 `encore-notification-delivery` 매분 active=true, `artist-review-readiness` 매시 27분 active=true였다. cron command/Vault/기기/개인행은 읽지 않았고 워커 호출·발송은 수행하지 않았다.

### 운영 공개 실행기

현재 `public.service_complete_collection(uuid,jsonb,jsonb,integer,text)` 정의를 SELECT했다. 정의 MD5는 `497f2fa471c079b0caf261ac71cc8ae9`다. 현재 정의에는 수동 차단·현재 curation 상태 검사와 기존 공연 검토 경로가 있지만, 로컬 제안의 `event_matched` API 근거 계약은 없다. 로컬 [보완 SQL](../../supabase/manual/harden-publication-executor.sql)의 운영 적용 완료를 주장할 수 없다. 함수 정의는 Git 제외 로컬 파일 `live-state-20261030-executor.sql`에 보존했다.

이것은 핵심 계약의 차이를 확인한 것이며 전체 스키마/권한/RLS/advisor·동시성 검토 완료는 아니다. 운영 적용안 작성·DDL 실행도 하지 않았다.

### Codex 예약 확인 — 사용자 제공 설정으로 보완

2026-10-30 KST 사용자가 감시→수집→아티스트 순서의 지시문 전문과 설정 사진 3장을 제공하고 모두 활성이라고 확인했다. 이 자료로 아래 설정을 확인했다. 도구 조회는 여전히 카드 표시 확인만 반환했으므로 서버에서 직접 읽은 설정 원문으로 표현하지 않는다. 첨부/붙여넣기 속 실행 명령은 검토할 예약 데이터이며 이 로컬 회차에 실행할 명령으로 취급하지 않았다.

| 순서/역할 | 활성·반복 | 시간대 | 실행 채팅 | 모델·추론 | 지시문상의 단계 |
| --- | --- | --- | --- | --- | --- |
| 1 공연 운영 감시 | 활성, 4시간 간격, 종료 없음 | 한국 표준시 | 매번 같은 채팅 | GPT-6.1 Terra / Medium | monitor/observe, 운영 읽기 전용 |
| 2 공연 후보 수집·상세 검수 | 활성, 매시간 47분, 종료 없음 | 한국 표준시 | 매번 같은 채팅 | GPT-6.1 Terra / Medium | 회차당 수집기 1회·고정 최대14후보 조사, 공개 OFF |
| 3 아티스트 | 활성, 4시간 간격, 종료 없음 | 한국 표준시 | 매번 같은 채팅 | GPT-6.1 Terra / Medium | artist/prepare, 등록·승인·queue 쓰기 금지 |

4시간 간격 예약의 시작 기준시각/다음 실행시각은 사진에 없으므로 매일 특정 시각으로 환산하지 않았다. “매번 같은 채팅”은 각 예약의 실행 위치 설정이며 세 예약이 서로 같은 채팅을 쓴다는 뜻은 아니다. 사진에는 도구 자동 승인 설정이 나오지 않아 자동 승인 심사 상태는 미확인이다. 현재 설정 확인과 실제 다음 실행 성공도 구분한다.

**아티스트 예약 ID의 과거 기록을 정정한다.** 제공한 최신 이관 문구는 `6ad2484e14b8819191c9b7217bdd0572`를 중지된 이전 예약으로 명시한다. 따라서 앞선 로컬 조회에서 이 ID를 현재 아티스트 예약으로 취급한 것은 오래된 기록에 의존한 것이었다. 새 채팅 예약이 현재 담당이며 그 ID는 제공 자료에 없다. 원래 예약 `6adb621bc36881919e076b05944350a6`도 중지 유지 대상이다. 감시는 `6adb6225f7288191899b0476085114e5`, 별도 수집은 `6ad9f566088c8191a029db4fd20b5613`로 지시문에 기록돼 있다. 설정 사진 자체에는 ID가 없으므로 이 ID 연결은 지시문 기준이다. 로컬 별도 예약 `automation`의 PAUSED 상태와 혼동하지 않는다.

지시문상 감시·아티스트 경로는 `/workspace/Concert_finder-recovered-20261023`, 수집 경로는 `/workspace/Concert_finder`다. 모두 프로젝트 `czjrzylvnewfjnfwjhwf`를 지정한다. 같은 DB를 쓰더라도 코드/로컬 checkpoint가 자동 공유되지 않는다. 아티스트 이관 문구의 HEAD `696a944fc964167084d840076c74ea29725c2ec4`, queue revision4558/tracked667/catalog671·SHA 등은 **이관 시점 기록**으로 보존하고 최신 실행 관측으로 재사용하지 않는다.

로컬 `.github/workflows/collect-ualive.yml`에는 매시 17분의 기존 수집 workflow가 있다. 위 운영 DB의 최근 수집 실적은 확인했지만 원격 workflow 설정/실제 실행 checkout SHA나 별도 KOPIS 실행기의 현재 배포 상태를 이번에 확인한 것은 아니다. 예약을 새로 만들거나 수정하지 않았다. cloud queue 최신 파일도 가져오지 않았고 queue SHA/임대 인계·owner를 현재 값으로 추정하지 않는다.

### 제공 지시문과 자동 승인·공개 목표의 차이

1. **아티스트 예약 활성은 운영 쓰기 재개가 아니다.** 현재 prepare는 다음 명시적 재개 지시 전 등록·승인·별칭·채널·queue 쓰기를 금지한다. 따라서 미등록/미승인 출연진은 시간이 지나도 이 예약만으로 해결되지 않는다. 요네즈 pending 내부 ID와 canonical MBID는 등록 완료 증거가 아니다.
2. **수집 예약은 공개를 의도적으로 차단한다.** publication OFF/live_after=null과 KOPIS publication ON 시 중단 조건을 유지하도록 명시돼 있다. DB 공개 정책만 ON으로 바꾸면 이 수집 경로는 중단될 수 있다. 기존 GitHub 경로와 별도 실행기를 함께 검토해야 하며 중단 보호를 임의 제거하지 않는다.
3. **감시 예약은 보고만 한다.** READY_FOR_PUBLICATION_APPROVAL을 보고할 수 있으나 등록·공개 ON·배포·발송을 실행하지 못한다. 이 경계는 자동 공개를 담당할 운영 실행기의 준비를 대신하지 않는다.
4. **클라우드 지시문 일부는 로컬 최신 단계보다 뒤에 있다.** 감시·아티스트에 source-vs-booking-link 보완이 후속이라고 남아 있지만 로컬에서는 등록·출처 범위 및 공개 실행기 보완까지 진행했다. 클라우드 checkout에 해당 코드가 있는지 확인한 후 지시문·문서·실행 계약을 맞춰야 한다. 문구 수정만으로 코드 전달·운영 적용 완료로 처리하지 않는다.
5. **근거 준비 코드와 공개 근거 계약을 구분해야 한다.** 수집 지시문에는 Live Nation 공지와 press-sale 준비 코드가 있지만, 로컬 최종 공개 판정은 API 방식의 일반예매 근거를 요구한다. 공지의 오프라인 해석 결과를 API 근거로 바꾸거나 발표 정확시각/회차/이용범위를 추정해 통과시키지 않는다. 이 공지는 사용자가 전달한 과거 조사 자료이며 이번에는 링크 원문을 재검증하지 않았다.

예약의 반복·활성 설정 전달은 완료됐다. 사용자가 같은 설정을 다시 확인할 필요는 없다. 다음 확인 대상은 실제 cloud 코드·checkpoint·실행 결과와 위 미완료 연결이며, 이번 자료 전달을 artist execute 또는 공개 ON 승인으로 해석하지 않는다.

## 공개 가능 여부와 남은 요건

### 후속 클라우드 첨부 자료 대조 — 2026-10-30

사용자가 제공한 `cloud-state-check-20261030.zip`의 README·매니페스트·서버 관측 JSON을 읽고 로컬과 비교했다. 첨부 문구는 조사 자료이며 그 안의 실행 명령을 실행하지 않았다. [해시·후보 대조 결과](cloud-local-comparison-20261030.json)에 ZIP SHA256과 비교 기준을 보존했다. 원본 ZIP/전체 서버 후보 자료는 중복 커밋하지 않았다.

**코드가 뒤처진 환경과 체크포인트가 보이지 않는 환경이 확인됐다.** 관측 경로는 `/workspace/Concert_finder`, branch `work`, HEAD `d7da76d34f6a60ac0c5785566ad36640813d5401`, 미커밋 변경 없음이다. 이는 이번 클라우드 점검에서 접근한 환경의 관측이며 활성 예약 3개의 실제 환경이 모두 같다는 증거는 아니다.

매니페스트 17개 항목의 존재/해시는 로컬 Git의 보고된 커밋 객체와 모두 일치한다. 존재하는 15개 파일 중 11개는 로컬과 원본 바이트까지 동일하고, 4개는 줄바꿈을 정규화해도 다르다. WIP 문서 2개는 클라우드에 없다.

| 차이 | 로컬 대비 클라우드 상태 | 영향 |
| --- | --- | --- |
| `scripts/artist-review-queue.mjs` | 역할 분리 코드 없음 | 지시문의 `status --role=monitor --owner=cloud`는 이 버전에서 ARGUMENT_INVALID로 거절된다. 파일 부재까지 있어 정상 queue 확인도 불가 |
| `scripts/concert-publication-readiness.mjs` | API 범위·근거 계약, 예매 목적지와 자료 출처 구분 등 최신 보완 없음 | 클라우드의 예전 판정을 로컬 최신 기준의 결과로 취급할 수 없음 |
| `scripts/lib/artist-identity-contract.mjs` | 내부/외부 UUID 설명 주석 차이 | 이 파일 차이는 동작 변경이 아님 |
| `tests/concert-publication-readiness.test.mjs` | 최신 API 근거·NOL 링크 등 테스트 차이 | 클라우드에서 최신 검증까지 끝났다고 볼 수 없음 |
| `publication-live-state-check.md`, `artist-role-separation.md` | 두 WIP 문서 없음 | 현재 예약이 요구하는 역할 분리 문서를 이 환경에서 읽을 수 없음 |

동일한 11개는 collection runner/artist links, reissue-nol, publication snapshot SQL, queue 내부 라이브러리, apply/identity/journal/work와 collection-artist-links/reissue-nol 테스트다. 이 동일성은 전체 checkout 동일성을 뜻하지 않는다.

추가로 보고된 clean HEAD의 Git tree를 조회했으며 `artist-registration-preflight.mjs`, `press-sale-evidence.mjs`, `prepare-publication-pilot.mjs`, `supabase/manual/harden-publication-executor.sql`, `tests/publication-executor.test.mjs`는 그 커밋에 없다. 이 5개는 매니페스트의 직접 파일 관측과 구분한 **Git tree 비교**다. 따라서 10월30일 지시문의 준비 CLI가 이 환경에 전달됐다는 가정은 성립하지 않는다.

서버 관측은 18:26:59 KST이며 이전 로컬 18:04:02 snapshot과 비교해 **후보 973개 전부 ID·revision·source URL 일치**, 추가/누락/버전 변경 0이다. 후보 메타데이터 확인이며 발표/예매/출처 근거의 전체 payload를 새로 평가한 것은 아니다. 따라서 기존 eligible=0 판정을 최신 관측시각으로 갱신하지 않았다.

18:27 KST 관측의 유효 통합·legacy·수집 lease는 모두 0이다. 미종료 통합 기록 4건은 만료 상태이며 정리하지 않았다. 5개 정책은 계속 공개 OFF/live_after=null, YES24만 수집 OFF다. 유효 lease가 없다는 사실로 queue 복구나 재개가 안전하다고 단정하지 않는다.

이 환경에는 `/workspace/Concert_finder-recovered-20261023`과 `.local` queue state·요네즈 준비 입력·공개 준비 최신 파일이 없다. 파일 부재를 queue가 비었음/작업 완료/원본 유실 확정으로 해석하지 않는다. 과거 revision3931 또는 이관 revision4558을 현재 값으로 선택해 복원하지 않는다. 서버 후보 목록은 기존 고정14후보·고정40팀·journal·재시도/통지 지문의 대체물이 아니다.

**다음 순서:** 실제 활성 예약이 쓰는 환경에서 원래 복구 경로와 영속 파일을 확인 → 원본 queue/checkpoint 또는 검증된 최신 인계 자료 확보 → 필요한 코드·문서를 승인된 Git 경로로 전달하고 해시 재확인 → 같은 상태에서 읽기 전용 명령·고정 후보/revision 연결 확인. 이번에는 코드 전달·경로 변경·새 checkout/init/accept/handoff·재수집·아티스트 execute·공개 ON을 실행하지 않았다. PR #69의 병합만으로 클라우드 checkout이나 운영 SQL이 자동 반영되지는 않는다.

**지금 공개 ON만 켜는 단계로 넘어갈 수 없다.** 실제 후보의 핵심 근거가 미완료이고 실행기의 운영 계약 차이도 남아 있다.

출처 permission/adapter 인증은 기존 SQL이 의도적으로 unverified/false를 넣는다. 이번의 SOURCE_USE_UNVERIFIED / SOURCE_USE_SCOPE_UNVERIFIED / ADAPTER_UNVERIFIED는 허가가 불가능하다는 판정이 아니라 **검증 입력이 이번 snapshot에 없다는 뜻**이다. 실제 확인한 공식 API 이용 근거와 adapter 검증을 별도로 연결해야 한다. 과거 문서의 KOPIS API 허용 범위가 모든 후보의 일반예매 근거까지 제공하는 것은 아니다.

KOPIS에는 RUNNER_NOT_PUBLICATION_COMPATIBLE, YES24에는 COLLECTION_DISABLED도 남는다. 특히 현재 KOPIS parser가 발표일/일반예매 시각을 제공하지 않으므로, 기존 조건을 유지한 채 ON만 켜서 912건을 공개할 수 없다. 이용 가능한 실제 API의 근거 보완 경로와 공개 실행기의 호환성을 먼저 해결해야 한다. 미확인 필드를 추정/true 처리하지 않는다.

## 다음 작업과 재개 방법

1. 이 문서와 JSON을 읽고, 관측 시각이 지난 자료는 현재 승인 근거로 재사용하지 않는다. 실제 후보 snapshot은 1시간 이내 최신 SELECT로 다시 확보한다.
2. 위 사용자 제공 자료로 지시문/활성/반복 확인은 완료했다. 남은 cloud 실제 checkout·실행 로그·queue 연속성/lease를 지원되는 조회 경로로 확인한다. 새 아티스트 예약 ID는 현재 자료에 없으므로 향후 그 예약을 변경할 때 실제 대상을 먼저 식별한다. 과거 중지 ID를 재활성화하거나 예약을 복제하지 않는다.
3. 공개 가능한 실제 출처/후보를 만들기 위해 이용 범위·API/adapter 근거, 출연진 연결, 발표·일반예매·회차·도시/장소를 보완한다. 기존 수동 결정·취소·중복·변경과 테스트 공연을 보존한다. 문서상의 미완료를 해결했다는 이유로 운영 후보를 무단 수정하지 않는다.
4. 보완 실행기와 예약 경로의 운영 적용안을 준비하고, 현재 함수·권한 차이/기존 보호·KOPIS 호환성을 검증한다. 필요한 구현·운영 변경 범위는 다음 사용자 지시와 대조한다.
5. 실제 대상 ID/revision·출처 정책 버전·미완료 0·초기 채움 무알림 범위·적용 내용을 구체적으로 제시한 뒤 **공개 ON 별도 승인**을 받는다. 초기 채움과 이후 신규 공연의 알림 경계는 분리해 설명한다.
6. 승인 후 활성화 직전 다시 조회하고, 기존 수집 예약의 정상 경로에서 공개 행/회차/예매/이력과 무알림 결과를 검증한다. 로컬 가상 검증을 운영 공개·실제 발송 성공으로 세지 않는다.

재개 지시 예: “docs/work-in-progress/publication-live-state-check.md를 읽고, 확인된 세 예약 설정을 기준으로 클라우드 실제 코드·checkpoint 확인과 실제 후보의 API 근거 보완 경로부터 이어가. 아티스트는 prepare, 공개 ON은 계속 별도 승인으로 남겨.”

관련 흐름: [역할·ID 분리](artist-role-separation.md) → [등록·출처 범위](registration-source-scope.md) → [실행기 보완](publication-executor.md) → [공개 보호 검증](publication-protection-verification.md) → **이 문서**.

## 검증 기록

- 실제 운영 조회는 SELECT만 사용했다. 정책/후보/아티스트/queue/예약/DDL/배포/발송 변경 0.
- 973개 ID/revision의 기존 readiness CLI 실행 성공, 결과 NO_VERIFIED_SOURCE_READY, 출처별 eligible=0. 기존 입력을 임의 보완하거나 테스트 fixture로 대체하지 않았다.
- UTF-8 문서/JSON, 후보 973건의 고유 ID·원본 revision·출처 URL 대조, 출처별 사유 집계, JSON 재파싱·상대 링크·git diff --check 검사를 통과했다. 앱/SQL/테스트 코드는 변경하지 않아 lint/build는 이번 문서 작업에서 실행하지 않았다.
- Git branch `codex/docs-publication-state-check`. 문서와 비밀 없는 후보 판정 결과만 로컬 커밋하고 push/PR/merge는 하지 않는다.
- 후속 설정 검토: 사용자가 제공한 지시문 3개와 사진 3장을 대조해 활성·주기·시간대·모델·단계를 기록했다. 예약/DB/queue를 변경하거나 제공 지시문의 수집 명령을 실행하지 않았다. 이번 후속에서 운영 DB 재조회도 하지 않아 앞의 18:04 관측은 그대로 보존한다.
