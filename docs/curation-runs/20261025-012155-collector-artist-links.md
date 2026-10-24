# 2026-10-25 01:21 KST — 공용 수집기 공연 신원 연결 보완

사용자의 수집기 수정 요청에 따라 현재 카탈로그의 승인 신원·별칭을 기존 아티스트 발견 경로에 연결했다. 승인된 별칭은 정식 이름으로 제공처 조회를 공유하며 MBID·국가·유일성 확인 후에만 연결한다. 한정된 기존 조회 예산에서 승인 출연진을 먼저 처리하되 원래 출연진 순서를 보존한다. 동명이인·보호 상태·미검수·신원 충돌은 이름만으로 연결하지 않는다.

각 업로드 시도 전에 현재 candidate의 artist_keys/band_ids 집계만 읽고 key 소실·교체를 차단한다. 빈 입력을 과거 값으로 채우지 않는다. 이 검사는 --skip-artist-lookup에도 적용되며 차단 source는 service_fail_collection으로 실패 종료한다. 새 후보 초안·대상 URL·기존/새 key 수를 identity_link_review에 남겨 실제 출연진 교체·취소와 일시 조회 실패를 구분할 검수를 요청한다. source 전체 완료가 막히는 보수적 동작이며 무관한 후보를 부분 성공으로 세지 않는다.

[동작 및 적용 범위](../collection-artist-link-safety.md)에 상세 조건을 기록했다. 이 수정은 현재 공용 클라이언트에 한정되며 운영 admin_ingest_catalog SQL 자체의 빈 값 upsert나 다른 writer/동시 관리자 쓰기를 원자적으로 변경하지 않았다. 다른 채팅 전용 실행기·GitHub 배포로 자동 전달되지 않는다. 과거 소실 연결의 정확성을 검증하거나 운영에서 복원한 것이 아니다.

검증: 최종 관련33개(신규10개) 통과, lint/build/diff 검사 통과. 최종 두 테스트 및 credit 우선순위 보완 전 전체 Node191개/Vitest101개(23파일) 통과, 보완은 최종 관련 검사로 재확인했다. 격리 PGlite에서 실제 ingest 함수와 함께 기존 candidate payload/revision 보존을 확인했고, 가짜 HTTP를 사용하는 실제 CLI에서 skip 모드의 완료 차단·lease 실패 종료·보고서 보존·비밀 비노출을 확인했다. 운영 읽기 전용 테스트에서 카탈로그640/승인208팀 조회와 동일 key 통과/빈 key 가상 입력 차단을 확인했다. 운영 저장·제공처 수집·발송은 0건이다. 기존 bundle-size 경고가 남는다.

queue revision2167/owner=cloud/active=null/transfer=null 및 SHA-256 `e08c98653b5fa0651738a4ff9f8580bb014050ebad1265945c6728133d6d3bdf`를 그대로 보존했다. init/accept/handoff/과거 apply/DDL/예약 수정/배포/원격 Git 작업은 수행하지 않았다.
