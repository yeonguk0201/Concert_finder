# 2026-11-06 공개 준비의 실제 반영

오늘 사용자 요청은 기존 공개 준비의 완료다. 비영리 공연 정보 서비스라는 추가 답변을 반영했다. 공개 ON은 기존 결정대로 별도 승인이다. 아래 운영 변경과 아직 적용하지 못한 변경을 구분한다. [기계 판독 기록](20261106-publication-preparation.json).

## 운영 후보: revision 11 → 12 → 13

대상은 `647835a8-7bed-4ef8-94c8-d7123c558e63` / KOPIS `PF304185`다. 기존 source lease와 `service_begin_collection` / `service_complete_collection`으로 두 번의 제한된 사실 보완을 반영했다. 신규 아티스트 등록·승인·queue writer는 호출하지 않았다. 두 실행 모두 공개 0 / 검토 1이고 lease 종료를 확인했다.

| 실행 | 변경 | 결과 |
| --- | --- | --- |
| `65ec3ff0-93b4-40ae-888c-7b99842de80d` | 기존 승인 신원과 KOPIS 회차·출처 확인 연결 | revision 11 → 12 |
| `dd3cca9a-c43b-43dc-b87a-2315357a67ef` | 발표일·일반예매·편집 목적 공지 근거 연결 | revision 12 → 13 |

아티스트 `0d2368ee-72d7-4ec8-aa52-5a708452963f`는 이미 approved였다. 외부 신원 `mb:09d4a85c-4916-4b4e-bc96-c4cfcf371046`의 공개 승인 1건도 확인했다. 후보에는 이 한 명만 연결했다. 원래 아티스트 승인·별칭·queue는 수정하지 않았다.

- KOPIS 실제 API 재조회: 2027-01-14 19:30, 01-16·17 19:00 KST, 인천 인스파이어 아레나, 단독 출연진과 공연예정 상태. 01-15 회차를 만들지 않았다.
- [Live Nation 본사 공식 공지](https://news.livenationentertainment.com/news/kenshi-yonezu-announces-dates-in-north-america-asia-europe-and-the-uk-on-ghost-world-tour): 공식 게시일 2026-10-15, 전체 공연의 10월 22일 현지 정오 일반예매와 한국의 01-14·16·17일 공연을 확인했다. 한국 일반예매를 `2026-10-22T12:00:00+09:00`로 해석했다. 공지의 Seoul 표기와 실제 인천 장소를 구분한다.
- 발표는 `announcement_precision=day`, `announced_at=null`, `initial_import=true`다. 수집/수정 시각이나 자정을 발표 시각으로 만들지 않았다.
- 일반예매 근거는 `method=official_notice`, `publisher_role=promoter`와 실제 출처 URL로 저장했다. API로 가장하지 않는다. 검수한 공지에 확인된 선예매가 없다는 기록은 전체 선예매 부재 인증이 아니다.

## 이용 범위

사용자는 사이트가 **공연 소식을 전달하는 비영리 정보 서비스**라고 명시했다. [본사 뉴스룸 Media 조건](https://news.livenationentertainment.com/media)의 editorial 목적 조건과 대조해, 직접 정리한 공연 사실과 출처 표시만 이번 범위로 판단했다. 이는 별도 서면 라이선스 취득이 아니다. 개인 포트폴리오·상업 서비스, 공지 원문·이미지·로고 재사용, 한국 marketplace 약관의 제한 해제까지 허용하는 것으로 확대하지 않는다. 목적 변경 시 다시 검토한다. [정규화 근거](20261106-yonezu-editorial-facts.json).

KOPIS 사실정보와 출처 표시 범위는 기존 [공식 API 이용 범위 검토](../work-in-progress/registration-source-scope.md)를 따른다. 과거 API 등록/수정일을 발표 근거로 사용하지 않는다. 현재의 예전 API 안내 URL은 클라이언트 렌더링 shell을 반환해 새 본문 재확인을 완료했다고 세지 않는다. 실제 인증 상세 API 읽기 성공과 이용 범위 기록을 구분한다.

NOL/Reissue 자동 취득은 활성화하지 않았다. 후보의 NOL/Interpark 상품 딥링크는 공개될 payload에서 제거하고 공식 예매 목적지는 Live Nation 홈페이지로 제한했다. NOL 미허가를 다른 독립 출처 전체의 차단으로 되돌리지 않는다.

## 운영 실행기에서 새로 확인한 차단

운영 v2의 출연진 검사에서 `jsonb_array_elements_text(...) id ... on b.id=id::uuid`의 `id`가 `bands.id`로 결합된다. 공연의 실제 출연진과 무관한 held/excluded 아티스트까지 매칭해, 승인된 요네즈도 `ARTIST_CURATION_BLOCKED`로 기록됐다. 운영 읽기 전용 재현은 기존 조인 7건 / `linked_band(value)`로 지정한 조인 0건이었다. 기존 아티스트 상태를 바꿔 해결하지 않는다.

미적용 날짜 정밀도 migration에 이 조인 수정을 함께 반영했다. 관련 없는 제외 아티스트가 있어도 승인된 공연은 통과하고, 실제 출연진이 보류/제외되면 계속 막는 SQL 회귀 검사를 통과했다. 기존 v2 MD5 `4068c76feb409183c3073f71b584eca7`가 바뀌면 적용을 거절하는 보호도 넣었다.

## SQL 적용은 아직 대기

[적용할 SQL](../../supabase/migrations/20261031134453_allow_date_only_silent_publication.sql)은 정책 OFF·live_after=null·수집 lease 없음·현재 v2 digest 일치를 확인한다. source/후보/아티스트/알림 행을 변경하지 않는다. v3는 날짜 정밀도와 실제 출연진 조인을 지원하며 실행 권한은 기존 service_role에만 둔다.

이번 세션의 Supabase `apply_migration` 확인 요청 두 번은 모두 `status=expired`로 종료됐다. 이를 자동 승인 심사 거절이나 DB 오류로 표현하지 않는다. 직접 SQL이나 다른 writer로 확인 절차를 우회하지 않았다. 18:44:56 KST SELECT는 운영 digest가 여전히 v2이고, 모든 공개 정책 OFF / 기존 공개 8건 / 후보 revision 13임을 확인했다.

SQL 파일 SHA-256: `d3ea01f34d1c0d49c174f9496a0160f68638357e4592187f3a466ab9ce5910d6`.

## 기존 예약

공연 수집 예약 `6ad9f566088c8191a029db4fd20b5613`은 11월 2일부터 비활성이었다. 오늘 완료 요청 범위에서 공개 OFF로 재개했고, 원래 시간표·실행 채팅·환경 선택을 보존했다. 원래 checkout의 cooldownVersion2 / HTTP400 1h→6h→24h / 고정14건 / checkpoint·통지 지문을 유지하면서 날짜 호환 delta를 확인하도록 현재 결과를 전달했다. `next_run_time=null`이므로 다음 실행의 시각·성공을 도구에서 확인했다고 주장하지 않는다.

이 작업 환경은 원래 예약 환경이 아니다. 여기의 코드/테스트 통과와 프롬프트 전달은 원래 환경의 패치 적용 영수증이 아니다. 원래 queue/checkpoint를 복제하거나 초기화하지 않았다. 기존 아티스트·감시 예약과 서버 발송 워커는 변경하지 않았다. 새 예약은 만들지 않았다.

## 검증과 다음 경계

- 복구한 공개 계약·근거 보존·예약 호환 등 Node 검사 90개, UI/매핑 29개 통과. 조인 수정과 digest 보호 후 최종 공개 실행기 SQL 검사 54개 통과.
- 실제 revision 13 payload를 격리 v3 사실 검사에 넣어 결과 null을 확인했다. 실제 공개나 발송 결과가 아니다. 운영 v2의 순수 사실 검사는 아직 `ANNOUNCEMENT_UNVERIFIED`다.
- 실제 후보/출처/승인/중복 SELECT 확인: 수동 차단 false, 승인 1, 공개 공연 중복 0, 이 출처의 공개 행 0.
- 검수 적용 전 실제 관측 packet에서 revision/수동 결정/다른 출연진/회차시각/추가 검수 사유/출처·용도·유효기간 변경을 거절하는 15개 guard 검사를 수행했다.
- lint/build/diff 검사 통과. 기존 500kB 번들 경고 유지. 가상 데스크톱·모바일 Chromium에서 날짜 정밀도 안내, 샘플 공개, 가로 넘침 없음, 런타임 예외 0을 확인했다.

다음은 SQL 적용 확인 → 실제 v3/digest와 원래 예약의 패치 적용 readback → 최신 revision/승인/중복·수동 결정 재조회 → **KOPIS 대상·출처·무알림 범위를 제시한 별도 ON 승인**이다. 승인 후에도 기존 예약의 실제 공개 행·회차·예매·이력·익명 조회와 해당 초기 공개의 delivery/attempt 0건 확인이 남는다. 초기 채움 무알림을 향후 live 알림 승인으로 확대하지 않는다. 아직 READY_FOR_PUBLICATION_APPROVAL은 아니다.

`review-yonezu-kopis.mjs`는 오늘 두 차례의 한정된 사실 보완을 위한 도구다. 원래 예약을 대체하지 않는다. 클라이언트에서 revision을 재조회하고 기존 lease/RPC를 사용하지만, 새로운 서버 CAS 계약을 제공한다고 주장하지 않는다. 이미 적용한 revision 11/12 명령을 재실행하지 않는다.
