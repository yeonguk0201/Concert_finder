# 공연 운영 읽기 전용 감시 — 2026-10-27 11:27:13 KST

## 의미 있는 새 변화

- 김장훈 전국투어 원맨쇼 [고양] 후보 PF302474에서 아티스트 연결이 revision10→11에 사라졌다. 현재 artist_keys/band_ids는0이며 previous_payload에는 기존 김장훈 MBID가 남아 있다. 김장훈 자체의 approved/공개 승인true는 유지돼 후보 연결 소실과 구분한다.
- The entry to Jazz 후보는 revision10→11에서 이연재 MBID 연결이 다시 생기고 최규민 연결이 추가됐다. 디에이드 대전·전남광주·서울 후보3건에는 안다은 개인 MBID 연결이 생겼다. 모두 미검수/공개 승인false이며 공연 출연 신원·그룹 전체 연결·필수 이벤트 필드 검증 완료로 세지 않는다.

## 현재 운영 관측

- 최신 KOPIS02:03~02:07 UTC, 직전23:09~23:12 UTC 모두 success100/검수100/공개0/오류0. GitHub 예약40436128016·40417658773 성공, 최신 Collect and upload candidates step 성공. 이전 정상 복구 상태가 이어졌으며 개별 과거 오류 수정 완료를 뜻하지 않는다.
- KOPIS819건, 키 없음799→796, 비어있지 않은 참조20→23. 추적64의 빈 연결62→60. rolling gap16은 동일하지만 The entry to Jazz 복원과 김장훈 새 연결 소실이 서로 상쇄했다. 건수만으로 변화 없음이라 하지 않는다.
- 모든 source publicationOFF/live_after=null, YES24 collectionOFF. 유효 source lease0. 선언 시간당17분과 실제23:08/02:02 UTC 예약 간격 차이는 보존하고 운영 기준 없는 임계값을 만들지 않았다.
- 알림 cron active/매분, 최근5회 succeeded·HTTP200·claimed/sent/failed0. 과거 sent36/invalidated7 그대로. 대상 없음과 실제 발송/기기 수신을 구분한다.
- 요네즈 아티스트0·후보revision7/KR·키/밴드/회차0, 발표·일반/선예매 절대시각 미확정으로 변화 없음. Reissue/NOL HTTP200·robots허용은 근거 접근 관측이다. 업데이트 일자·휠체어 전화예매·상품 기간으로 최초 발표/일반예매/매일 회차를 확정하지 않는다. NOL 서면 이용허가 없음.

| 새 연결·복원 후보 | 현재 연결 아티스트 | 승인 |
| --- | --- | --- |
| 디에이드 전국 카페 투어: 모해? 나와! #2 [대전] (`3b9a2071-39ba-48f3-a72a-0191e85cf68c`) | 안다은 / c0b8df30-30f7-4b04-8a55-88c9f421d588 | 모두 unreviewed / 공개승인false |
| 디에이드 전국 카페 투어: 모해? 나와! #2 [전남광주] (`9413729a-facc-48be-a3b9-f42f33d31c4a`) | 안다은 / c0b8df30-30f7-4b04-8a55-88c9f421d588 | 모두 unreviewed / 공개승인false |
| The entry to Jazz [서울 성수] (`addabd18-b8ac-4431-9810-715a296bc022`) | 이연재 / 4e9bd85d-790c-4116-b8ab-e29f16168ac8, 최규민 / bafff12b-40a0-4149-8711-1a62a824f9e8 | 모두 unreviewed / 공개승인false |
| 디에이드 전국 카페 투어: 모해? 나와! #2 [서울] (`f52dc431-3a8f-4a27-b862-6f7e24423643`) | 안다은 / c0b8df30-30f7-4b04-8a55-88c9f421d588 | 모두 unreviewed / 공개승인false |

## 출시 전 검증

출처별 필수 이벤트 필드 fail, 전체 후보 신원·승인·이용 조건·중복/취소/중요 변경·동의/기기 조건은 unverified다. 수동OFF/차단 보존은 pass, 초기 채움 무알림은 기존 격리 fixture pass만 재사용한다. 공개 승인만 남은 출처가 없어 READY_FOR_PUBLICATION_APPROVAL이 아니다. NOL 서면 이용허가는 외부 승인 항목이며, 신원 연결·정확 시각/회차·변경 처리 검증은 코드/실제 데이터로 추가 확인할 항목이다.

| 출처 | 최신 상태 | 후보 | 공개 | 검수 | 실패 |
| --- | --- | ---: | ---: | ---: | ---: |
| kopis | success | 100 | 0 | 100 | 0 |
| mintpaper | success | 1 | 0 | 1 | 0 |
| radwimps | success | 2 | 0 | 2 | 0 |
| ualive | success | 1 | 0 | 1 | 0 |
| yes24 | partial | 0 | 0 | 0 | 45 |

## 보존·검증

- HEAD9649312 및 f267be1/fd45938 포함 확인. queue revision3394/ownercloud/active=null/transfer=null, SHA-256 전후 `6e767a82a8f5cce5e41a7264a56a61d6228d6b73be3427172d13ea24b97d0969` 동일. 감시 실행에서 queue 명령·DB/RPC 쓰기0.
- 현재 환경 current/running, network enforced/restricted, 보안 바인딩ready와 실제 Last.fm getInfo1회 HTTP200/API성공·같은MBID 확인. 차트/후보 발굴·지표 갱신0. 상속 프록시/TLS/CA 보존.
- scripts/tests는 f74ac31 이후 변경 없음(exit0), 기존 격리 fixture3파일 결과 재사용. 새 테스트0, 운영 가짜 데이터/동의/알림0. UTF-8/JSON/링크·내용·diff 검사.
- 기존 SEONGJUN→GNRSOUND 엔지니어 및 Flower→고성진 개인 연결 경고, M23세 후보 미해결은 그대로 보존하며 반복 통지하지 않는다. 수집/발송 워커와 중지 예약은 수정하지 않았다.
- 상세 [JSON](./20261027-112713-concert-operations.json), 이전 [M24](./20261027-072826-concert-operations.json).
