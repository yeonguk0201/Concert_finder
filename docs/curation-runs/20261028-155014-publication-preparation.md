# 공연 공개 준비 작업 — 2026-10-28 15:50:14 KST

사용자의 작업 진행 요청에 따라 KOPIS 실패 원인, 요네즈 신원과 공연 자료, 공개·알림 안전 조건을 조사하고 로컬 수정과 격리 검증을 완료했다. 운영 공개 준비 상태는 **NOT_READY**이며 운영 배포·수집·등록·공개·발송을 완료했다는 의미가 아니다.

## 환경 및 보존

- 기존 복구 checkout, AGENTS.md·CONTRIBUTING.md·복구 기록을 UTF-8로 확인했다. f267be1/fd45938은 현재 HEAD의 조상이다. 시작 HEAD c52b1e6, 같은 작업 브랜치를 유지했다.
- 작업 중 실행 환경 연결이 잠시 끊겼다가 복구됐다. 새 checkout/초기화로 대체하지 않았다.
- queue db6258b5-7ac7-47dd-88b3-dbe0f72d75ef, owner cloud, revision3931, active=null, transfer=null을 보존했다. state SHA-256: 9dfef5f9fa4b0579258ff8a1d7438e87859f89517d311a5f34dd73afb064b797.
- 15:49:13 KST DB 읽기: 664팀, approved486/unreviewed171/excluded7, 유효 integrated/collection lease 각각0. 요네즈 MBID/이름 등록 없음. 기존 5개 출처 publication OFF/live_after=null, YES24 collection OFF. Reissue/NOL 정책 행은 이 조회에 없다.
- 예약, 서버 워커, 운영 DB/권한/스키마, artist queue를 변경하지 않았다. 과거 apply 재전송 없음.

## KOPIS 원인과 수정

[GitHub 실행 40638967366](https://github.com/yeonguk0201/Concert_finder/actions/runs/40638967366)의 비밀 없는 결과 필드만 추출해 현재 후보 키와 대조했다. 원본 로그/HTML/이미지/키는 결과에 저장하지 않았다. artifact 메타데이터는 확인했지만 로컬 다운로드는 실패했으며, 실제 원인 분석은 decoded job report로 수행했다.

후보99건 중8건의 incoming artist keys가 기존 키를 포함하지 않았다. 보호 검사가 해당 출처 전체를 중단했다. 출연진 조회 실패 또는 현재 카탈로그 검수 필요 상태를 확인했으며, API 키 실패나 실제 출연진 변경으로 단정하지 않는다.

| KOPIS ID | 기존→신규 키 수 | 대상 |
| --- | --- | --- |
| PF301399 | 1→0 | 김장훈 부산 |
| PF301404 | 4→3 | 어쩌다 페스티벌 |
| PF301456 | 1→0 | 소향·김기태 목포 |
| PF301492 | 1→0 | 왁스·정인 대전 |
| PF301553 | 1→0 | 이창섭 대구 |
| PF301800 | 1→0 | 소향·김기태 울산 |
| PF302225 | 1→0 | 소향·김기태 춘천 |
| PF302373 | 2→0 | 작가의 재즈 |

로컬 커밋 **4796b9b**: 충돌 후보 업데이트만 제외하고 source failures와 identity_link_review에 기록한다. 기존 payload/revision/연결을 유지하고 다른 후보는 처리할 수 있다. 검수 문맥 조회 실패는 계속 전체 중단한다. 업로드 직전 원래 보호 검사도 유지한다. 제외된 후보만의 discovered identity를 import하지 않는다. 기존 키를 복사해 새 라인업을 만들지 않는다.

91건 처리는 실제 서버 성과가 아니라 해당99건 보고서에서 계산한 비충돌 수다. 운영 재수집·서버 배포는 실행하지 않았다. 충돌8건 자체의 신원 문제 해결도 완료로 세지 않는다.

## 발표 시각 보호

로컬 커밋 **12f60b8**: Reissue parser가 dateModified/updated/modified 시각을 최초 발표로 사용하지 않도록 보강했다. 여러 발표 time 요소가 있으면 미확인으로 남긴다. 과거 URL의 날짜 또는 표시된 업데이트 날짜를 최초 발표 시각으로 승격하지 않는다.

## 요네즈 준비와 남은 기술 조건

[공식 프로필](https://reissuerecords.net/profile/), [MusicBrainz](https://musicbrainz.org/artist/09d4a85c-4916-4b4e-bc96-c4cfcf371046), [NOL 상품](https://nol.yanolja.com/ticket/products/26015024)을 실제 읽었다. 영문/일문 이름, 1991-03-10 생일, 도쿠시마 출신, diorama/YANKEE/Bremen/BOOTLEG 원작과 공식 홈페이지가 일치한다. NOL 한국어 제목과 영문 부제로 요네즈 켄시 별칭을 대조했다. 별도 MB 신원으로 표현된 Hachi/ハチ는 자동 병합하지 않는다. 장르 태그만으로 승인하지 않는다.

Last.fm 실제 artist.getInfo 1회, HTTP200/API 성공/동일 MBID를 15:47:54 KST 확인했다. 이 연결 확인은 지표 캐시 유효기간 갱신이나 공연 공개 성과가 아니다. 이번 MB API 호출0; 웹 MB 본문 확인과 구분한다.

공식 신원 조사 초안은 .local/artist-review-queue/yonezu-registration-preparation-20261028.json에 readyToApply=false/bandId=null로 보존했다. 현재 identity CLI/journal은 구현되어 있고 설치된 service_mutate_integrated_artist 계약도 읽었다. 다만 클라이언트와 RPC는 사전에 고정한 내부 band UUID를 요구한다. [현재 계약 문서](../artist-identity-client-compatibility.md)는 CLI가 이를 만들어 누락을 메우지 않도록 정한다. 검증한 외부 MBID를 내부 ID로 임의 전용하거나 import/seed writer를 쓰지 않았다. 내부 ID 배정 경로/정책 정리가 필요한 구체 기술 조건이며, NOL 이용허가와 별개다. 사용자에게 MBID 조사를 떠넘기는 조건이 아니다.

등록 성공 시에도 최초 target 버전과 identity 변경 후 버전이 달라 같은 batch 승인은 불가능하다. receipt/실제 band/외부 key/익명 검색 readback 후 다음 선정 가능 정규 batch에서 승인해야 한다. 이번 begin/identity/apply/finish 호출0, 등록0/승인0/검색 완료0.

NOL 본문에서 확인한 회차는 2027-01-14 19:30, 01-16 19:00, 01-17 19:00 KST이며 인천 인스파이어 아레나다. 1월14~17일을 매일 회차로 만들지 않는다. 현재 읽힌 2026-10-22 12:00 KST는 휠체어석 전화예매다. 일반예매/선예매 절대시각 및 최초 발표 시각의 공식 근거는 여전히 미확인이다. 다른 사이트 검색 결과를 공식 확정값으로 쓰지 않았다. World NOL과 LiveNation 추가 페이지는 현재 도구로 접근되지 않았다.

예매 오픈이 이미 지났다는 사용자 지시를 반영해 과거 오픈 알림을 보내지 않는 초기 채움으로 취급해야 한다. 예매 종료/매진을 관측 없이 주장하지 않는다. 실제 후보는 쓰지 않았으며 백필 실행도 하지 않았다. NOL 외부 서면 이용허가는 여전히 없다.

## 검증 결과와 출시 제안

격리 테스트 **36/36 통과**, lint/build 및 diff 검사 통과. 실제 검증 범위:

- SQL fixture에서 기존 후보 payload/revision 유지, 비충돌 후보 저장, partial 상태/실패1건 기록, source lease 해제, 같은 완료 요청 재사용.
- 일반/선예매 분리, 휠체어석 시각 배제, 실제 회차와 기간 구분, 최초 발표/수정 시각 분리.
- 중복·수동 차단·취소/변경 검수·초기 채움 무알림과 기존 동의/찜 철회·중복 발송 방지·worker 재인가. 모두 격리 fixture/가짜 발송기이며 실제 기기 수신 증거가 아니다.

출시 전 남은 작업은 (1) 검증된 로컬 코드의 별도 배포 승인과 정상 정규 수집에서8건 보존/다른 후보 처리 readback, (2) 내부 artist ID 배정 조건 정리 후 통합 lease 내 요네즈 등록/검색/다음 정규 승인, (3) 공식 일반·선예매/최초 발표 근거, (4) NOL 서면 허가 및 실제 adapter/운영 지원 검증이다. 이 조건을 마친 출처만 공개 ON 승인 대상으로 제시한다. 현재 READY_FOR_PUBLICATION_APPROVAL은 아니다.

새 worker·cron·예약은 필요하지 않다. push/PR/merge/배포/공개 ON·실제 발송은 이번 준비 작업에서 실행하지 않았다.
