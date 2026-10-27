# 공연 운영 읽기 전용 감시 — 2026-10-27 07:28:26 KST

## 새 관측

- GitHub 예약40385138899의 Collect and upload candidates가 성공. 대응 시각 KOPIS19:16 UTC 실행은 후보/검수100·오류0·공개0으로 성공해 최근 partial 연속 상태가 종료됐다. 중간18:48 실행은 후보0건·오류1건의 failed 상태(비밀 없는 분류로 원인 미확인)이었다. 이전 HTTP400/필드 누락 항목별 수정 완료까지 뜻하지 않는다.
- KOPIS 후보5건에 이전에 없던 아티스트 키/밴드 연결이 생겼다. 현재 고성진/김장훈은 approved·공개승인true, 권정열/김광진/홍성준은 unreviewed·공개승인false. 발표·일반/선예매 절대시각·회차는 미완료라 공개 준비 완료가 아니다.
- 새로 연결된 SEONGJUN’s REQUEST LIVE 후보는 기존 검수에서 GNRSOUND 엔지니어로 확인한 홍성준 MBID에 연결돼 있다. 공연 출연 신원과의 충돌 경고를 보존한다. 공식 KOPIS 페이지는 현재 도구에서 접근불가여서 의도/정확한 출연 개인은 미확정이다. 플라워 공연의 고성진 개인 연결도 그룹 전체 신원 검증 완료로 보지 않는다.

## 현재 상태

- 모든 source publicationOFF/live_after=null, YES24 collectionOFF 유지. source lease0. GitHub 선언은17 * * * *이나 실제 최신 생성은19:15 UTC(관측22:25 UTC)다. 지연/누락 관측과 임의 임계값·성공 기준을 혼동하지 않는다.
- KOPIS819건 중 키 없음804→799, 비어있지 않은 참조15→20. 추적64의 키 없음62는 그대로다. 기존 3건 연결 소실과 The entry to Jazz는 미해결이다.
- rolling gap17→16은 V.O.S 천안 후보revision11의 previous_payload가 빈 키로 갱신된 결과다. 현재 키/밴드도0이므로 복구로 세지 않고 앞선 근거를 보존했다.
- 알림 cron active/매분, 최근5회 succeeded·HTTP200·claimed/sent/failed0. 과거 sent36/invalidated7 그대로. 대상 없음과 실제 발송/기기 수신은 구분한다.
- 요네즈 후보revision7/국가KR·아티스트0·키/밴드/회차0 유지. Reissue/NOL HTTP200·robots허용은 연결 증거다. 최초 발표·일반/선예매 절대시각은 미확정이며 업데이트 일자·휠체어 전화예매·상품기간으로 확정하지 않는다. NOL 서면 이용허가 없음.

| 새 연결 후보 | 아티스트 연결 | 현 상태 |
| --- | --- | --- |
| 콘서트누리, 플라워 [김해] (`22806273-5d30-449e-99d5-b65b55e2a16d`) | 고성진 / `b5069703-fb0f-4625-8634-b4734dc77b34` | approved, 공개승인True |
| ASEAN-KOREA MUSIC FESTIVAL, ROUND IN KOREA [인천] (`39dfb001-a5d4-487f-8f51-ef4dc66f488e`) | 권정열 / `99969a6d-5493-4f8c-9645-6e8336ce3363` | unreviewed, 공개승인False |
| 김장훈 전국투어 콘서트: 원맨쇼 [고양] (`56871ec1-8499-4371-93b1-1e6cde60701a`) | 김장훈 / `a34502f8-dbf5-48ad-9799-fe0dc38dfb0b` | approved, 공개승인True |
| SEONGJUN’s REQUEST LIVE [서울] (`7e52674a-da6c-4471-909c-5c3a34392eaa`) | 홍성준 / `2dbe9c45-ed89-4fa0-b724-fac801749b12` | unreviewed, 공개승인False |
| 김광진 콘서트: FLY AWAY (`8fc4e8b0-849d-4105-a162-7e09733e131c`) | 김광진 / `e99893a1-ba5f-49ee-9e52-3de13f1018b8` | unreviewed, 공개승인False |

## 출시 전 검증

출처별 실제 필수 이벤트 필드 fail, 전체 후보 신원/장르·승인·이용조건·중복/취소/중요 변경·개인 동의/기기 조건은 unverified다. 수동OFF/차단 보존은 pass, 초기 채움 무알림은 기존 격리 fixture pass만 재사용한다. 공개 승인만 남은 출처는 없으며 READY_FOR_PUBLICATION_APPROVAL을 선언하지 않는다. 고성진 개인의 새 승인은 앞선 아티스트 실행 성과이고, 이 감시의 새 쓰기 성과가 아니다.

| 출처 | 최신 상태 | 후보 | 공개 | 검수 | 실패 |
| --- | --- | ---: | ---: | ---: | ---: |
| kopis | success | 100 | 0 | 100 | 0 |
| mintpaper | success | 1 | 0 | 1 | 0 |
| radwimps | success | 2 | 0 | 2 | 0 |
| ualive | success | 1 | 0 | 1 | 0 |
| yes24 | partial | 0 | 0 | 0 | 45 |

## 보존·검증

- checkout33111e7 및 f267be1/fd45938 조상 확인. queue revision3326/ownercloud/active=null/transfer=null, SHA-256 전후 `0ef5d4cda799fa645dfe5dc17a1478b4b3ef94e769f734c0a003af6a17ffa11c` 동일. queue 명령·DB/RPC 쓰기·수집 재실행·발송·Cron 변경 없음.
- 실제 테이블 정의→읽기 조회, 환경 current/running·network enforced/restricted·바인딩ready 확인. Last.fm artist.getInfo 연결1회 HTTP200/API성공·동일MBID, 차트/후보/지표 갱신0.
- scripts/tests는 f74ac31 이후 변경 없음(exit0). 이전 격리 fixture3파일 결과 재사용, 신규 테스트0. UTF-8/JSON/내용·링크·변경 범위/git diff --check 검증. 운영 DDL/공개ON/배포·push·PR·merge 없음.
- 원본 HTML/API 이미지/키·개인 사용자 행·push endpoint/기기키·Vault·cron command를 읽거나 기록하지 않았다. 중간 실패는 비밀 없는 상태/건수/해시만 보존하고 원인을 추정하지 않았다.
- 상세 [JSON](./20261027-072826-concert-operations.json), 이전 [M23](./20261027-032953-concert-operations.json), 재사용 신원 근거 [R36](./20261027-063519-artist-review-cddcf52f.json).
