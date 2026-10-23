# 공연 운영 감시 — 2026-10-23 11:38:51 KST

읽기 전용 점검. 출시 판정 **NOT_READY**. 운영 DB/공개/수집 실행/알림/아티스트 대기열을 변경하지 않았다.

- KOPIS 부분 실패 재발: 후보16·검수16·공개0. 상세 HTTP400 오류3개 후 연속 실패 중단1개 기록.
- GitHub 최신 수집 workflow의 Collect and upload candidates 단계 failure. 직전2회 success 뒤 재발.

최신 실패기록4는 HTTP400 상세 요청3개와 연속 실패로 나머지 요청을 중단한 marker1개다. 키/쿼터/요청 형식 중 어느 것이 원인인지는 확인하지 않았다. 수집 담당에서 실패 상세의 입력/응답을 비밀 없이 진단해야 하며 이 감시에서는 재실행하지 않았다. 직전 KOPIS100건 성공이 있어 연속 전체 실패로 분류하지 않는다.

| 출처 | 최신 상태 | 후보 | 공개 | 검수 | 실패기록 |
|---|---|---:|---:|---:|---:|
| kopis | partial | 16 | 0 | 16 | 4 |
| ualive | success | 1 | 0 | 1 | 0 |
| mintpaper | success | 1 | 0 | 1 | 0 |
| radwimps | success | 2 | 0 | 2 | 0 |
| yes24 | partial | 0 | 0 | 0 | 45 |

GitHub 최신 실행 2026-10-23 01:28 UTC failure, 직전 2026-10-22 22:17 UTC success. 시간당 선언과 관측 간격 불일치는 지속하며 임의 SLA를 추가하지 않았다. 현재 source lease0건이고 별도 KOPIS 실행기의 기여는 공통 이력만으로 단정하지 않는다. YES24는 수집 OFF이며 오래된 실패를 새 장애로 세지 않는다.

알림 cron은 매분/active, 최근5회 succeeded. 최근 HTTP5건은200·claimed/sent/failed 모두0이다. 누적 sent36/invalidated7로 변화 없다. 응답 형태로 선별했으므로 정확한 cron request-ID 연결은 미검증이다. 서버 응답·실제 발송·기기 수신을 구분하며 실제 기기 수신은 확인하지 않았다.

후보858건을 출처별로 집계했고 모두 announcement_verified가 true가 아니다. KOPIS797건 중 아티스트 key 없음785건·공개 승인 미완료 key 포함8건·회차 없음797건·일반예매 시각 없음797건·automation_blocked1건이다. 나머지 출처도 발표/신원/국가/예매 등 요건이 남는다. 단순 필드 집계는 전체 공식 근거·중복·취소·중요 변경 대조 완료가 아니다.

요네즈 후보는 revision1/pending으로 아티스트/회차 연결·발표 검증·예매 시각이 비어 있고 현재 일치 등록 아티스트/공개 공연을 찾지 못했다. 공식 Reissue/NOL에서 2027-01-14 19:30, 01-16 19:00, 01-17 19:00 KST 세 회차를 재확인했다. NOL의 2026-10-22 12:00 KST는 휠체어석 전화예매 안내이며 일반/선예매는 미확인이다. Reissue10/22는 갱신일이며 원래 발표 시각으로 소급하지 않았다.

현재 모든 publication OFF, Reissue/NOL 운영 정책과 외부 이용 허가 미확인 상태를 보존했다. 공개 OFF만 남은 상태가 아니므로 READY_FOR_PUBLICATION_APPROVAL이 아니다. NOL 외부 서면 허가를 공개 페이지/로컬 fixture로 대신하지 않았다.

기존 KOPIS 격리 retry/permanent error·연속 실패 테스트를 지정해 실행했고 통과했다(Node는 테스트 파일1개 단위로 보고). 다른 변경 없는 회귀 결과는 재사용했다. 실제 운영 데이터에 가짜 후보/동의/알림을 만들지 않았다. 운영 배포와 로컬 테스트의 완전 일치는 미확인이다.

기존 checkout과 최신 감시 체크포인트를 확인했다. environment_status는 starting/runtime 변수 unknown을 계속 보고하지만, 프로젝트 범위 Supabase connector의 실제 SELECT와 공개 GitHub proxy 조회는 성공했다. unknown을 키 부재나 ready로 가장하지 않았으며 대체 개인 토큰/키를 사용하지 않았다. 이 checkout 밖 자동 영속성/동기화를 가정하지 않는다.

상세: [20261023-113851-concert-operations.json](20261023-113851-concert-operations.json)
