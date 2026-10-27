# 공연 운영 읽기 전용 감시 — 2026-10-27 19:36:30 KST

- 기존 서버 예약 수집이 2026-10-27 16:47 KST에 새로 실행되어 16:52 KST 성공했다. KOPIS 후보100/검수100/공개0/실패0, 나머지 활성 출처도 성공했다. 이전 관측 실행 공백 뒤 재개됐으나 19:34 KST까지 이후 새 실행은 없어 정상 주기 회복으로 단정하지 않는다.
- KOPIS 아티스트 참조가 있는 후보23→28, 키 없는 후보796→791, 추적64건 중 빈 연결60→56, rolling gap16→14. 이은하·이은미·김창완 밴드·바티멘토 듀오·웅산 공연에 참조가 생겼다. 참조 추가는 동일 신원·전체 출연진·공개 검증 완료가 아니다.

| 출처 | 최신 상태 | 후보 | 공개 | 검수 | 실패 |
| --- | --- | ---: | ---: | ---: | ---: |
| kopis | success | 100 | 0 | 100 | 0 |
| mintpaper | success | 1 | 0 | 1 | 0 |
| radwimps | success | 2 | 0 | 2 | 0 |
| ualive | success | 1 | 0 | 1 | 0 |
| yes24 | partial | 0 | 0 | 0 | 45 |

기존 배포 cron은 매시간17분/active다. 최신 예약 실행40469269136 성공 이후 08:17/09:17/10:17 UTC 시각에 대응하는 새 실행은 아직 관측되지 않았다. 허용 지연 기준이나 새 실패 기록으로 바꾸지 않는다. source lease0, 모든 publicationOFF/live_after=null 및 YES24 collectionOFF 유지.

알림 cron은 매분 active, 최근5회 succeeded/HTTP200 claimed·sent·failed0이다. 과거 발송36/무효7은 동일하며 새 발송이나 실제 기기 수신 성과가 아니다.

새 참조의 이은하·이은미는 승인/공개 신원 승인 행이 있다. 김창완은 승인됐지만 함께 연결된 강윤기는 미검수이며 개인 참조를 밴드 전체로 확정하지 않는다. 바티멘토 듀오의 고상지는 미검수다. 웅산 후보의 김은영은 미검수, 이정식은 제외 상태다. 이름과 공연 관계 검증 없이 실명/예명 일치나 전체 출연진 연결을 완료로 세지 않는다. 기존 연결 아티스트의 승인 상태는 동일하다.

요네즈는 아티스트0, 후보revision7/국가KR/신원키·밴드·회차0이며 발표·일반/선예매 절대시각 미확정이다. Reissue/NOL 현재 읽기HTTP200/robots허용은 확인했다. 업데이트 일자를 최초 발표로, 휠체어석 전화예매를 일반예매로, 상품 기간을 매일 회차로 확정하지 않는다. NOL 서면 이용허가는 없다.

출시 전 검증: 출처별 발표·일반예매 필수 필드는 fail, 전체 신원·출처 이용 허가·중복/취소/중요 변경·기존 동의/기기 흐름은 unverified다. 수동OFF/차단 보존은 pass, 초기 채움 무알림은 기존 격리 fixture pass만 재사용한다. 중복hash 초과0/취소0 관측이 전체 처리 검증을 뜻하지 않는다. NOT_READY, 공개 승인만 남은 출처 없음. 외부 서면 허가와 데이터/코드로 검증할 항목을 구분한다.

HEAD8338049, 복구조상 f267be1/fd45938 확인. queue3548/cloud/active=null/transfer=null, SHA `2b7cbe24aa6f56916451711fa88b39b815082354d1c326db8450c7868433541d` 전후 동일. 감시에서 DB/RPC 쓰기·queue명령·수집 재실행·공개·발송·예약/권한/스키마 변경·배포/push/PR/merge0. 비밀값/Vault/cron command/구독 키·endpoint/개인 사용자 행 조회0. 원본 HTML/API 이미지 저장0.

환경 current/running 및 restricted/enforced, 승인 바인딩ready와 실제 Last.fm getInfo1회 HTTP200/API성공/정확MBID 확인. 연결 점검만이며 후보 발굴·지표 갱신 성과가 아니다. scripts/tests는 f74ac31 이후 변경 없음; 기존 fixture3파일 재사용, 새 테스트0. UTF-8/JSON/상대 링크/queue SHA/변경 범위/git diff --check 검증.

상세 [JSON](./20261027-193630-concert-operations.json), 이전 [M26](./20261027-153650-concert-operations.json).
