# 2026-10-25 00:53 KST — 신규·별칭 클라이언트 경로 및 공연 연결 진단

기존 통합 검수의 `begin --identity-file`·`identity`를 구현했다. 같은 최대40팀 안에서 전체 대상·원본 버전·mutation을 불변 저널로 보존하고 설치된 단일 mutation RPC를 사용한다. 응답 유실은 영수증 우선 복구로 이어가며 DB/외부 mb key/공연·찜 집계 관계/기존 및 추가 이름·별칭의 익명 공개 검색을 모두 확인해야 완료다. JSONB 객체 키 순서 차이를 허용하되 실제 값·배열은 엄격히 대조한다.

운영 승인 함수 정의를 읽어 추가 경계를 확인했다. 승인 RPC가 최초 target.expectedUpdatedAt만 허용하므로 신원 변경 후 같은 batch의 승인은 불가능하다. 신규는 unreviewed/unclassified이며 승인 작업은 다음 선정 가능한 정규 batch로 defer한다. 기존 24시간 deferred 정책·5시간 lease·수동 결정·제공처 cooldown을 유지하고 새 begin/다른 writer로 우회하지 않는다.

공연 수집 경로는 현재 아티스트 DB보다 작은 고정 이름 목록 및 제한된 MusicBrainz 검색에 의존한다. 진단 시 KOPIS 후보817건 중 artist_keys 없는 후보802건, 출연진 기록 기준 검색 실패305/조회 한도250/신원·국적 미확인38/동명이인15를 관측했다. 이 이유별 수는 공연 수가 아니다. 실제 운영 admin_ingest_catalog 정의도 빈 incoming artist_keys에서 band_ids를 만들고 기존 payload를 새 payload로 치환함을 확인했다. 이 구조는 연결 공백을 만들 수 있지만 개별 후보의 원인과 기존 연결의 정확성은 따로 검증해야 한다.

현재 아티스트 카탈로그/검증된 외부 ID를 먼저 대조하고, 일시 조회 실패가 기존 검증 연결을 자동 소거하지 않도록 하는 수집 경로 보완이 남았다. 현재 별도 수집 실행기·운영 후보·스케줄러를 변경하거나 재실행하지 않았다. publication OFF와 NOL 이용허가는 별도 공개 조건이다. 신규/별칭 클라이언트 구현을 공연 연결·공개·발송 성공으로 세지 않는다.

검증: 전체 npm test(최종 두 회귀 테스트 추가 전) Node181개 및 Vitest101개 통과. 최종 변경 관련53개(신규 identity9개 포함) 통과, lint/build/diff 검사 통과. 기존 build bundle-size 경고는 남는다. 시험 UUID/가짜 후보는 격리 fixture에만 사용했다. 운영 신규·별칭·승인·공연 쓰기·발송·DDL·예약 변경·원격 Git 작업은 0건이다.

운영 queue는 owner=cloud/revision2167/active=null/transfer=null 및 SHA-256 `e08c98653b5fa0651738a4ff9f8580bb014050ebad1265945c6728133d6d3bdf`를 보존했다. false 승인 초안도 원본 해시가 같다. 복구 HEAD f267be1/fd45938 포함을 재확인했다. 실제 검증 입력을 사용한 첫 mutation/검색 성공은 아직 미검증이며 완료로 보고하지 않는다.
