# 운영 공연 목록의 MCR·테스트 데이터 정리

2026-11-09 UTC. 사용자가 “기존에 mcr관련이랑 테스트 하느라 만든 가짜 정보들 지우고 실제 공연 정보만 남겨줘”로 운영 공개 목록 정리를 요청했다.

## 관측과 범위

운영 공개14건을 ID·제목·날짜·출처·출연진·publication basis로 대조했다. `test.com`을 출처로 하는 명확한 테스트6건, 사용자 지정 MCR1건을 확인했다. 별도 ‘세쿠 내한공연’은 공식 공연 제목과 연결된 SURL 아티스트가 불일치했다. 이 행은 가짜 공연이라고 단정하지 않고 검수 대기로 분리했다. 새 API 공연5건과 요네즈1건은 검증된 실제 공연으로 보존했다.

삭제의 공개 효과는 기존 withdrawn/review 상태로 구현했다. 연결된 기존 저장 일정·알림/발송 기록·공개 이력이 있어 물리적 cascade 삭제 대신 사이트와 익명 API에서 제거하고 감사 이력을 보존했다. 아티스트/별칭/승인/아티스트 queue는 변경하지 않았다. 개발용 격리 테스트 fixture나 원본 checkpoint를 운영 공연으로 취급해 삭제하지 않았다.

## 실제 변경

변경 전 public catalog snapshot을 비공개 로컬 `.local/concert-collection/catalog-cleanup-20261109/before.json`에 보존했다. 고정8개 ID의 현재 published 상태와 전체 snapshot MD5가 관측 당시와 같을 때만 한 transaction에서 상태를 변경했다. 기존 publication guard·catalog signal·변경 이력 trigger는 그대로 실행했고 공개 snapshot 전후를 catalog_history에도 기록했다. 모든 실제 공연6개의 snapshot MD5가 그대로인지 같은 transaction 안에서 확인했다.

| 대상 | ID | 결과 |
| --- | --- | --- |
| 세쿠 내한공연 (Sekou Live in Seoul) | `44323afa-a927-4485-8a1b-6d09baad3485` | `review` — EVENT_ARTIST_MISMATCH |
| 오아시스 등록 | `68a9f9e4-7982-480e-ba99-539422a6466c` | `withdrawn` — TEST_SOURCE_REMOVAL |
| 알람용 | `7f18441d-76f1-4d1b-8836-52d88c78b603` | `withdrawn` — TEST_SOURCE_REMOVAL |
| 마이 케미컬 로맨스 내한공연 (My Chemical Romance Live in Korea) | `8f0b57b1-a196-44ae-92a3-5ab463fc6902` | `withdrawn` — USER_REQUESTED_MCR_REMOVAL |
| 오아시스 | `ae081f55-c1c9-41e4-95eb-d1b51702352d` | `withdrawn` — TEST_SOURCE_REMOVAL |
| 오아시스 등록2 | `cab9b2ef-7bc2-4c93-8f96-f13e552c2613` | `withdrawn` — TEST_SOURCE_REMOVAL |
| 해제 테스트 | `eb3e2365-4181-4692-96dd-16eede6928bc` | `withdrawn` — TEST_SOURCE_REMOVAL |
| 테스트 공연 | `f11e3c01-22de-4982-934e-c2057c18e187` | `withdrawn` — TEST_SOURCE_REMOVAL |

## 적용 후 검증

- 실제 published 수 **14→6**, published 중 테스트 출처0, MCR0. 테스트6건+MCR1건은 withdrawn, 출연진 불일치 세쿠1건은 review다.
- 실제 공연6건의 전체 snapshot MD5가 전후 동일하다. 요네즈 켄시, V.O.S 부산·성남, 신해경 서울·부산, 소란스런 가을밤 인천을 그대로 유지했다.
- 실제 익명 API에서 같은 실제6개 ID만 읽혔다. 제거 대상8개 ID는 직접 필터 조회해도0건이었다. 해당8개 공연의 source/band/session/ticket 하위 정보도 익명 조회 각각0건이다.
- 새 알림 delivery0. 알림 worker claim/send/test를 호출하지 않았고 기존 저장 일정·발송 이력/기기·사용자 개인행은 삭제/출력하지 않았다. 과거 테스트 알림 이력을 이번 신규 생성/발송으로 세지 않는다.
- 운영 executor `ae38470098f40cb3aec9582172c0b9c4`, API facts `3c356e529b6e1dc2fe04041c64a3248d`가 그대로다. 스키마·권한·배포·공개 정책·정기 예약은 변경하지 않았다. 정상 API 수집/공개는 기존 활성 스케줄러에 남겼고 추가 수집 호출은 하지 않았다.
- 원본 로컬 latest/review-checkpoint/review-batch-current/schedule-observation SHA4개가 그대로다. baseline·고정 진행 목록·통지 지문을 초기화하지 않았다.

이는 운영 공개 목록 정리이며 데이터의 물리적 영구 삭제가 아니다. 원래 감사 이력과 비공개 변경 전 snapshot은 복구·대조를 위해 보존한다. 세쿠는 실제 출연진/신원 연결을 공식 근거로 다시 검증하는 기존 검수 경계 전까지 공개하지 않는다. 현재 조회된 공식/API 근거를 가진 실제6개만 공개로 남았다.

검증: transaction 내 현재값/보호 snapshot guard, 운영 DB readback, 실제 익명 본문·하위 정보 조회 완료. 애플리케이션 코드가 바뀌지 않아 기존 CI/lint/build를 반복하지 않았다.
