# 첫 공연 자동 공개 검증 사례

2026-10-29 KST 사용자 지정: **요네즈 켄시 KENSHI YONEZU 2026-2027 WORLD TOUR / GHOST 한국 공연**을 실제 사례로 공개 준비까지 검증한다. 지난 예매 알림은 소급 발송하지 않는다. 이번 요청은 기존 예약의 검증 책임 확장이며 공개ON·운영DDL·배포·실제 공개·발송 승인이 아니다.

## 역할과 지속 실행

- 기존 공연 수집 예약 `6ad9f566088c8191a029db4fd20b5613`: 기존 매시간 일정/정상 수집1회/같은 고정 최대14건을 유지한다. 진행 중 목록을 교체하지 않고 다음 정상 상세 검수 경계에서 요네즈 후보를 우선 포함한다. 조사와 전체 검증 완료를 구분하며 요건별 근거·ID/revision·확인 시각·다음 조치·재시도 시각을 기존 checkpoint/docs에 저장한다.
- 기존 감시 예약 `6adb6225f7288191899b0476085114e5`: 기존4시간 일정과 운영 읽기 전용을 유지한다. 수집 역할의 상세 검수 결과를 확인하고 출처/후보별 pass/fail/unverified 및 공개 경로를 판정한다. 운영 데이터가 충족되어 공개 OFF 승인만 남을 때 `READY_FOR_PUBLICATION_APPROVAL`로 한 번 보고한다. 자문 프로그램의 `READY_FOR_ACTIVATION`을 운영 공개 receipt로 세지 않는다.
- 아티스트 등록/신원/승인/별칭은 기존 아티스트 예약의 필수 목록 담당이다. 공연 역할에서 queue/아티스트를 쓰거나 임의 신원을 만들지 않는다. 현재 core-plan에도 요네즈 필수 항목은 등록false/MBID null로 남아 있다. 이름 검색으로 새 MBID를 추정해 채우지 않는다.
- 다른 채팅의 `/workspace/Concert_finder` 코드와 checkpoint는 이 복구 경로에 자동 전달되지 않는다. 상대 역할의 실제 결과가 없다면 전달·readback 미확인으로 남기고 완료를 추정하지 않는다.
- 첫 사례의 준비 완료 또는 구체적인 외부 차단 판정 후에는 매 실행 같은 아티스트를 의무 재조사하지 않는다. 새 근거/기록된 재확인 시점에 다시 조사하고 미변경 차단은 반복 통지하지 않는다. 파일은 `.local/concert-operations/publication-pilot-latest.json`에 보존한다.

## 현재 관측 — 2026-10-29 23:17 KST

후보 `647835a8-7bed-4ef8-94c8-d7123c558e63`, KOPIS `PF304185`, revision8/pending/수동차단false. 매 실행 최신 revision을 읽는다. DB 원본은 수정하지 않았다.

| 요건 | 현재 판정 | 근거 또는 다음 조치 |
| --- | --- | --- |
| 한국 공연/장소/날짜 범위 | 부분 확인 | KOPIS 인천 인스파이어, 2027-01-14~17. 공식 Reissue 본문은14·16·17일만 열거한다.15일 회차를 만들지 않는다. |
| 전 출연진 정확한 신원·공개 승인 | 미완료 | 이름/별칭 조회상 요네즈 bands 없음. 후보 band_ids/artist_keys도 비어 있다. 기존 아티스트 역할의 등록·승인과 후보 연결 readback 필요. |
| 회차별 절대 시작 시각 | 미확인 | 후보 sessions 빈 배열. 이번 공식 아티스트 본문에서 날짜만 확인했고 회차별 시각은 확정하지 않았다. |
| 최초 발표 근거/절대시각 | 미확인 | announced_at null/announcement_verified false. Reissue10/15 주소가10/22 업데이트 주소로 이동하므로 업데이트를 최초 발표로 삼지 않는다. |
| 일반/선예매 절대시각 | 미확인 | 공식 Live Nation 현재 본문은 일반예매·구매 링크를 표시하나 과거 오픈 시각 없음. 블로그·전재·검색 스니펫·휠체어 전화예매는 대체 완료 근거가 아니다. 선예매가 없다고 추정하지 않는다. |
| 중복·취소·수동 차단·중요 변경 | 부분 확인 | 현재 SQL 중복검사 통과/취소false/수동차단false. previous_payload 비교상 changeReviewed=false이며 공식 변경 검수 필요. |
| 독립 출처 이용 조건 | 미확인/제한 관측 | NOL 선택 제외 유지. Live Nation 이용약관은 개인 비상업 용도와 사전 서면 동의 없는 복사·배포 제한을 명시한다. 공개 웹페이지라는 이유로 자동 수집/재사용 허가를 true로 하지 않는다. 허용된 API/feed/다른 공식 출처의 재사용 근거를 검증한다. |
| 수집·공개 실행기 호환 | 미완료 | KOPIS 별도 실행기는 publication ON/live_after 변경시 중단하는 계약. 다른 채팅 워커의 해당 보호를 제거하지 않는다. 독립 출처 지원/호환 코드·검증·운영 반영 범위를 준비한다. |
| 무알림 초기 채움 | 자문 결과 SILENT_BACKFILL | initial_import=true/live_after=null, 과거 예매 알림 금지. 이는 실제 발송 경로의 운영 검증 완료나 공개 성공이 아니다. |

읽기 전용 실제 후보 snapshot을 기존 `concert-publication-readiness.mjs`에 전달한 결과는 **NO_VERIFIED_SOURCE_READY / KOPIS BLOCKED / eligible0**이다. permission/adapter 인증은 실제 검증이 없어서 기본unverified로 유지했다. DB 검사를 했다는 이유로 인증값을 만들지 않았다. 후보의 NOL/Interpark 구매 링크 의존도 남아 있어 독립 출처 출시 요건을 통과하지 못한다.

## 다음 단계와 재확인

1. 수집 역할은 다음 정상14건 경계에서 이 후보를 선정하고 독립 주최사/공연장 공식 근거와 이용 가능한 API/feed를 검증한다. Live Nation 일반 FAQ는 이 공연의 예매 시각 증거가 아니다. Reissue/NOL 기존 허가 전 자동 수집/재사용 OFF는 유지한다.
2. 아티스트 미등록은 기존 필수 목록에서 신원·국가·장르·정확MBID 및 기존 통합lease/40팀/receipt/공개검색 요건으로 처리해야 한다. 공연 역할은 등록·승인을 대신하지 않는다.
3. 실제 근거가 생기면 동일 후보의 최신revision/모든 회차·발표·일반/선예매·변경 이력을 대조한다. 부족한 연결 코드는 기존 역할의 허용된 호환 준비/격리 검증으로 다루고 운영DDL/배포는 별도 승인이다.
4. 모든 사실·이용조건·실행기 요건이 충족된 이후에만 출처 단위ON의 영향, 대상/revision, 무알림 초기채움 범위를 제시한다. 테스트성 공개항목을 임의로 삭제하거나 전체 후보를 일괄 공개하지 않는다.

변경 없는 외부 이용조건/공식 본문 재확인은 관측 후24시간인 **2026-10-30 23:17 KST** 이후로 둔다. 새로운 공식 근거나 DB/revision·아티스트 상태 변경은 그 전에 확인할 수 있다. 다음 정상 선정과 기존 조사·호환 준비를 이 재확인 시각까지 전부 중단하라는 뜻이 아니다.

## 조사한 직접 출처

- [아티스트 공식 투어 공지](https://reissuerecords.net/2026/10/22/kenshi-yonezu-2026-2027-world-tour-ghost/): 날짜3개 확인. 최초발표/회차시각/독립 재사용 허가 완료로 세지 않는다.
- [Live Nation 공식 공연](https://www.livenation.kr/event/kenshi-yonezu-2026-2027-world-tour-ghost-seoul-tickets-edp1705322): 공연/일반예매 표시 확인. 과거 오픈 시각 미관측.
- [Live Nation 이용약관](https://www.livenation.kr/terms): 이용 조건의 제한을 별도 기록. 이 문서는 법적 허용 판정이나 허가 증거가 아니다.
- 아티스트 공지가 연결한 INSPIRE 공식 공연 목록은 이번 도구에서 본문0줄이었다. 개인 블로그는 주최사 원문 링크를 찾는 용도로만 사용했고 사실 검증 근거로 채택하지 않았다. NOL 상품 페이지는 이번에 요청하지 않았다.

기존 `tests/concert-publication-readiness.test.mjs`, `tests/reissue-nol.test.mjs` **2개 격리 테스트 파일 통과**. 이것은 실제 공연 전체 검증·운영 연결·공개/발송 완료 증거가 아니다.

## 새 독립 공식 근거와 연결 준비 — 2026-10-29 23:38 KST

[Live Nation 본사 보도자료](https://news.livenationentertainment.com/news/kenshi-yonezu-announces-dates-in-north-america-asia-europe-and-the-uk-on-ghost-world-tour)는 게시일2026-10-15와 한국14·16·17일 공연, 전공연 일반예매10월22일 현지정오를 명시한다. 게시연도/예매의 미래시점 및 한국공연 지역을 근거로 **2026-10-22 12:00 KST**로 해석할 수 있다. 휠체어석 안내나 NOL 상품 본문을 이용한 추정이 아니다. 원문에는 연도/시간대 ISO가 한 줄에 적혀 있지 않으므로 원문과 해석 근거를 분리했다. 선예매 부재·회차별 시작시각·발표의 정확한 시각은 여전히 미확인이다.

기존 generalSale 파서에 실제 영문 형식의 최소 문장을 전달한 로컬 확인은 날짜 미확정으로 안전하게 거부했다. 숫자 전체날짜를 요구하는 현재 파서와 맥락을 가진 영문 원문의 간극을 확인했으며, 원문을 한국어 전체날짜로 변조해서 제출하지 않았다. 문맥형 예매 근거를 지원하는 adapter와 요건 검증이 마련되기 전 운영 ticket_evidence에 전송하지 않는다.

새 보도자료 호스트의 재사용 조건은 별도 미확인이다. 이전 livenation.kr 약관을 다른 호스트에 자동 적용해 허용/금지를 단정하지 않았다. 외부 권한이 필요한 경우 사용할 [사실정보 이용 범위 문의 초안](concert-source-use-request.md)을 준비했으며 발송하지 않았다.

요네즈 외부ID 후보의 실제 Last.fm 응답과 공식 신원 조사 단서를 [아티스트 인계](artist-review-handoff.md)의 새 절에 남겼다. 준비 입력은readyToApply=false이며 기존 아티스트 예약의 정상 경계에서 canonicalMB 검증과 등록/승인·공개검색receipt가 필요하다. MusicBrainz요청0/queue변경0이다.

## 영문 날짜 해석 코드 준비 — 2026-10-29 KST

`scripts/press-sale-evidence.mjs`의 `preparePressSaleEvidence`를 로컬 준비 경로에 추가했다. 조사한 원문 최소문장·게시일·투어연도·한국개별행을 분리 입력받고, 연도/요일/현지시간/공연별 장소·날짜를 대조해 일반예매 절대시각의 해석과 근거를 반환한다. 게시일을 최초발표의 정확한 timestamp로 바꾸거나 회차시각·선예매부재를 만들어내지 않는다.

모든 결과는 `readyToApply=false`, 이용허가·신원·회차시각 인증false다. 기존 generalSale/출처adapter/공개writer에 연결하지 않았다. 현재 읽은 보도자료에 대한 해석은 `.local/concert-operations/yonezu-press-sale-interpretation.json`에만 보존한다. 새코드가 다른채팅에 자동배포됐다고 가정하지 않는다. 실제HTML/출처조건 및 실행기호환/receipt 검증 후에만 운영입력을 논의한다.

가상공지의 정오/자정, 지역·요일·날짜·예외·선예매·중복·URL 오류를 확인하는 격리테스트와 기존공개준비테스트2파일/lint/build통과. 기존큰번들경고는남아있다. 운영DB/queue/정책/알림은변경하지않았다.

출처별 허용 범위 확인은 필요하지만 모든 출처의 개별 서면허가를 일괄 출시조건으로 추가하지 않는다. 이미 허용된 공식 API/공개 라이선스가 있으면 그 범위와 출처표시·운영 승인 조건을 검증하는 방식으로 진행한다. NOL 선택제외는 그대로다. KOPIS 공개 API소개는 이번 직접읽기HTTP200이지만 기대안내본문이 추출되지 않아 조건 검증완료로 세지 않았다.

## 자동 준비 실행 — 2026-10-30 KST

`scripts/prepare-publication-pilot.mjs`를 기존 감시 예약에 연결했다. 새 스케줄러/수집기/발송기를 만들지 않았다. 준비의 실행 자동화이며 공개 권한이나 운영 사실을 자동 인증하는 코드가 아니다.

1. 기존 읽기 전용 `concert-publication-snapshot.sql`의 후보를 위 고정 ID, 정책을 해당 출처로 제한해 실제 SELECT한다. 1시간 이내 관측과 최신revision이 필수다. 운영에 영향을 주는 RPC를 조회 대신 호출하지 않는다.
2. `.local/concert-operations/pilot-preparation-input.json`에 `{version:1,candidateId,snapshot,pressEvidence?}`를 저장한다. pressEvidence는 `sourceUrl,eventTitle,noticeDate,checkedAt,performanceYear,performanceRows,saleLine`의 실제 관측값이다. 원래checkedAt을 재사용 시각으로 연장하지 않는다. 근거 부재시 추정값을 넣지 않는다.
3. 아래 명령으로 기존pilot checkpoint를 보존하고 별도 준비 결과를 만든다. stale/future snapshot, 후보 불일치·revision 역행·기존checkpoint 부재·기한 지난press근거는 거부한다.

```sh
node scripts/prepare-publication-pilot.mjs \
  .local/concert-operations/pilot-preparation-input.json \
  .local/concert-operations/publication-pilot-latest.json \
  .local/concert-operations/pilot-preparation-current.json
```

4. 결과의 tasks를 기존 담당별로 처리한다. `artist`는 기존40팀/통합lease의 canonical신원·등록·승인·검색receipt, `collector`는 기존14건목록의공연·출처·회차/예매·adapter/runner검증을 담당한다. 감시는readback한다. 새code가다른환경에없으면실제전달여부/호환준비를구분하고완료로세지않는다.
5. 결과의 `preparationFingerprint`와 `preparationPlan`만 기존pilot최신기록에 병합하고 기존출처근거·재확인시각·마지막통지를 보존한다. 바뀌지 않은 미완료는중복통지하지않는다. `notify`는변화여부일뿐전송성공이아니며마지막통지를자동갱신하지않는다. 입력과기존checkpoint를출력파일로지정해덮어쓸수없다.

실제 최신DBrevision8에서 미완료11개를생성하고같은사실재실행notify=false를확인했다. 기존readiness의원본결과를유지하며press보완으로DB요건을통과시키지않는다. 실제요건완료후출처OFF승인만남는경우에만READY_FOR_PUBLICATION_APPROVAL로안내한다. 운영ON/권한/DDL/배포/발송승인은별도다.

아티스트예약에는기존필수요네즈의신원준비를다음정상40팀경계에서우선처리하도록연결했고, 수집예약에는동일준비코드의실제존재/검증과독립출처조건확인을연결했다. 감시는이CLI실행·지문보존을맡는다. 기존일정/활성상태/중지예약은유지했다.

### 운영 감시 M42 — 2026-10-30 11:28 KST

실제SELECT 2026-10-30T02:23:38.39065+00:00, 후보revision8로 준비CLI 실행: BLOCKED_NOT_READY/미완료11/동일지문/notify=false. 기존press확인시각·출처재확인시각·마지막통지 보존. artist1/collector10요건은 기존 역할에 남기며 등록·공개·발송0. 관측 결과 (운영 상세 기록은 별도 클라우드 인계 묶음에 보존).

### 운영 감시 M43 — 2026-10-30 15:31 KST

실제SELECT 2026-10-30T06:27:34.868658+00:00, revision8/미완료11/동일지문/notify=false. 기존근거·sourceRecheckAt·마지막통지보존, 다음출처재확인23:17KST. 운영쓰기/공개/발송0. 상세관측 (운영 상세 기록은 별도 클라우드 인계 묶음에 보존).

### 출처 범위 진전 — 2026-10-30 16:23 KST

KOPIS 공식 API 페이지가 직접 배포하는 구성 파일에서 이용 안내문을 확보했다. 공연목록/상세의 외부 웹서비스 활용, 출처표시·키 비공유·호출제한을 확인했다. 개인포트폴리오의 기본API사실정보 경로로 우선하되 제3자 이미지·다른주최사 예매근거의 재사용까지 인증하지 않는다. 기존pilot 미완료/마지막통지/원문시각은 유지한다. 진단과 작업순서 (운영 상세 기록은 별도 클라우드 인계 묶음에 보존).
