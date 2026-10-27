# 공연 운영 감시 — 2026-10-24 03:35:13 KST

복구 경로·f267be1/fd45938 ancestry와 최신 코드 `42b9131`, 기존 감시 fingerprint/통지 이력 연속성을 확인했다. environment running/current·network enforced, 실제 테이블 정의31컬럼 및 지정 Supabase 프로젝트 읽기 접근 확인. 운영 DB는 읽기 전용이다.

- KOPIS 최신2026-10-24 03:18~03:19 KST가 직전 success100에서 partial로 재발. 후보3·검수대기3·공개0, HTTP400 3건과 후속 요청 중단 기록1건이다. 오류4개를 독립 공연4개의 실패로 세지 않는다.
- GitHub 최신03:17 KST 수집/업로드 단계 failure, 직전 success 이후 재실패다. 선언은 시간당 :17이나 직전과 약4시간55분 간격이며 원인/SLA는 미확정이다. 실행 SHA9aa7f1a 유지로 PR52 실행기 반영은 미확인이다.
- mintpaper1/radwimps2/ualive1은 최신 success·검수대기·공개0. YES24 collection OFF는 유지됐으며 오래된 이력을 활성 수집 지연으로 세지 않는다. 유효 collection lease0은 조회 시점 관측이다. 다른 채팅 수집 코드/체크포인트는 이 환경에 없으며 공통 이력만으로 실행 주체를 단정하지 않는다.
- 전 출처 publication OFF/live_after=null. 알림 Cron active/매분, 최신5회 succeeded·worker HTTP200·claimed/sent/failed0. 발송 대상 없음이며 발송 성공/기기 수신 완료와 다르다. 누적 sent36/invalidated7은 과거 기록이다.

후보858개와 host별 안정적 최신 표본의 누락 요건을 재조회했다. KOPIS artist_keys 없음780개, 미승인 신원 포함12개이며 각각 이전781/11과 다르지만 이번 감시의 아티스트 성과로 세지 않는다. 정확한 발표/예매시각·신원/회차·공식 이용허가 등 미완료가 있어 READY_FOR_PUBLICATION_APPROVAL이 아니다. source별 pass/fail/unverified와 남은 조건을 JSON에 보존했다. 실제 후보 전체의 중복/취소/중요 변경 증거와 운영 동의/기기 수신 검증은 미완료다.

요네즈 pending 후보는 artist_keys/band_ids/개별회차가 없고 발표·일반/선예매 절대시각 미확정, 현재 이름 검색에 연결 아티스트/공연 없음 유지. Reissue는 첫 요청 오류 후 프록시/TLS를 유지한 허용 경로 재시도에서 HTTP200 및 서울2027-01-14/16/17 INSPIRE를 재확인했다. 업데이트2026-10-22를 최초 발표로 쓰지 않는다. NOL은 robots 허용 후 HTTP200이며2026-10-22 12시는 휠체어석 전화예매용임을 다시 확인했다. NOL 이용허가는 아직 없고 자동 수집·재사용을 켜지 않았다.

이전 격리 테스트5개 파일 통과 결과를 재사용했다. 9b1db14 이후 관련 scripts/migration/fixture/test 변경 없음 검사를 통과했으며 이번 신규 테스트0이다. 운영 데이터는 변경하지 않았으며, 개별 찜/동의/구독·푸시 endpoint/키·Vault·cron command는 조회하지 않았다. queue1693·active/transfer null·SHA는 직전 아티스트 기록과 동일하며 queue 명령을 실행하지 않았다. 공연 수집 재실행·공개/발송·운영 DDL/권한/배포·push/PR/merge 없음.

새 통지는 KOPIS 부분 실패 재발과 GitHub 재실패만이며 기존 미변경 공개/신원/허가 차단은 반복 통지하지 않는다. UTF-8/JSON/비밀 패턴·로컬 링크·git diff --check를 검증해 로컬 커밋한다.

[상세 집계·표본·출시 요건표](20261024-033513-concert-operations.json)
