# 공연 운영 읽기 전용 감시 — 2026-10-27 15:36:50 KST

## 새 관측

- GitHub 수집 workflow는 active·매시간17분이나 최신 예약 실행은 02:02 UTC(성공) 그대로이며 06:32 UTC 관측까지 새 실행이 없다. 선언된 02:17~06:17 UTC 5회 시각에 대응하는 실행이 보이지 않고 DB도 02:07 UTC 성공 이후 새 수집이 없다. 새 연속 실패로 단정하지 않고 실행 공백으로 보존했다.

신규 실패 기록이 아닌 실행 공백이다. 기준 없는 지연 임계값이나 수집 완료 증거를 만들지 않았고 재실행/스케줄 변경은 하지 않았다. 같은 최신 실행ID의 공백은 시각·경과 시간이 늘어도 같은 fingerprint로 보존한다.

## 현재 운영 상태

| 출처 | 최신 상태 | 후보 | 공개 | 검수 | 실패 |
| --- | --- | ---: | ---: | ---: | ---: |
| kopis | success | 100 | 0 | 100 | 0 |
| mintpaper | success | 1 | 0 | 1 | 0 |
| radwimps | success | 2 | 0 | 2 | 0 |
| ualive | success | 1 | 0 | 1 | 0 |
| yes24 | partial | 0 | 0 | 0 | 45 |

- 활성 source lease0. 모든 publicationOFF/live_after=null, YES24 collectionOFF 유지. 다른 채팅 실행기/서버 수집·알림 워커와 중지 예약 설정을 변경하지 않았다.
- 알림 cron active/매분. 최근5회 succeeded/HTTP200, claimed/sent/failed0. 과거 sent36/invalidated7 유지. 대상 없음·서버 발송·실제 기기 수신을 구분한다.
- KOPIS819건 중 키없음796, 현재 비어있지 않은 참조23, 추적64의 빈 연결60, rolling gap16. 후보ID별 연결/버전/필수필드와 기존 관측 아티스트 승인 상태가 동일하다. 김장훈 연결 소실 등 기존 경고는 반복 통지하지 않는다.
- 요네즈 아티스트0, 후보revision7/country_codeKR/키·밴드·회차0, 발표/일반·선예매 절대시각 미확정. 현재 Reissue와 NOL은 HTTP200, robots허용이지만 최초 발표·일반예매·정확 회차 완료 근거가 아니다. Reissue 업데이트 일자·휠체어석 전화예매·상품 기간을 일반예매/매일 공연으로 확장하지 않았다. NOL 서면 이용허가 없음.

## 출시 전 검증

출처별 필수 발표·일반예매 절대시각은 fail, 전체 신원/승인·출처 이용 조건·중복/취소/중요 변경·동의/기기 흐름은 unverified다. 기존 수동 OFF/차단 보존은 pass, 초기 채움 무알림은 기존 격리 fixture pass만 재사용한다. 공개 승인만 남은 출처가 없으므로 READY_FOR_PUBLICATION_APPROVAL이 아니다. NOL 서면 이용허가는 외부 승인 사항이며 나머지 신원·시각·회차·변경 처리 검증은 실제 데이터/코드 검증 항목이다.

## 보존·검증

- HEAD3220599, f267be1/fd45938 포함 확인. queue3469/cloud/active=null/transfer=null 및 SHA `cb6c4bbfe7131bd1b8de079643b564ab3335fd6aedde8a0af5ce896ed83efdc5` 전후 동일. 감시에서 queue 명령0/DB·RPC 쓰기0.
- 환경 current/running, network enforced/restricted, 바인딩ready 및 실제 Last.fm getInfo1회 HTTP200/API성공/동일 MBID 확인. 발굴·지표 갱신·공개·발송 성과로 세지 않는다. 프록시/TLS/CA 보존.
- scripts/tests는 f74ac31 이후 변경 없음, 기존 격리 fixture3파일 결과 재사용. 새 테스트0. 문서 UTF-8/JSON/링크·후보별 비교·queue SHA·변경 범위/diff 확인.
- 원본 HTML/API 이미지/비밀값/Vault/Cron command/개인 사용자 행을 읽거나 보존하지 않았다. 발송은 상태 집계 및 허용 필드만 조회했다.
- 상세 [JSON](./20261027-153650-concert-operations.json), 이전 [M25](./20261027-112713-concert-operations.json).
