# 공연 운영 감시 M20 — 2026-10-26 15:27:23 KST

## 의미 있는 변화

- 이전 실패 뒤 GitHub 정기 수집 `40278117655` 성공 확인: 2026-10-26 06:08:47~06:13:40 UTC (15:08:47~15:13:40 KST). 배포 head `9aa7f1a` 불변. 새 실패가 연속된 상태는 아니다.
- KOPIS의 이후 신규 실행3회는 각각100건 success/failure0/publication0. 최신06:09:49~06:13:37 UTC. 기존 PF303833 후보는 여전히0이며, 다른 범위의 성공만으로 필수 필드 오류 해소를 주장하지 않는다.
- 현재 비어 있지 않은 KOPIS 아티스트 참조가15→18개 후보로 늘었다. 윤종신 경주 공연(승인된 윤종신), TONE STUDIO LIVE 이설아(미검수), 히어로 락 페스티벌 인천(승인된 채제민/전규호/하현우와 미검수 박완규의 개인 참조)다. 그룹 전체 연결·공개 승인 완료를 의미하지 않는다.
- 새 참조3건 모두 country/announced_at/일반예매 절대시각 null, sessions0. 실제 회차·일반/선예매·발표와 공식 출연진 전체 대조가 남아 있다.

## 기존 차단과 운영 상태

- 기존 추적64건 중 현재 참조 empty60, rolling previous_payload empty15로 M19와 같다. 새 rolling 누락0. 과거 누락 목록은 보존하고 현재 rolling 감소를 복구로 세지 않는다.
- KOPIS 전체817 중 artist_keys empty799(이전802), sessions/발표/일반예매 필드 미완료817. 다른 출처 후보 집계는 전 관측과 같다. 전체 공개 준비는 NOT_READY이며 publication OFF 승인만 남은 출처가 없다.
- 모든 publication OFF/live_after=null, YES24 collection OFF 보존. 현재 source lease0. 기존 GitHub와 다른 KOPIS 생명주기를 읽었으며 어느 수집기도 실행하거나 수정하지 않았다.
- GitHub 최근 두 정기 시작 간격 20973초(5.826시간), 선언은 매시17분. 시작 지연/공백은 관측하되 원인·누락 예약 횟수를 추정하지 않는다. 다른 채팅 실행기의 코드가 전달됐다고 가정하지 않는다.
- 매분 notification cron active, 최근5회 succeeded/HTTP200, claimed/sent/failed0. 기존 sent36·invalidated7 집계 불변. 현재 대상이 없다는 응답이며 기기 수신 완료가 아니다.
- 요네즈 후보 revision6·아티스트 조회0·키/연결/회차 없음 유지. Reissue와 NOL 현재HTTP200, robots 허용. 업데이트 일자·휠체어석 전화 공지·상품 기간을 최초 발표/일반예매/매일 회차로 바꾸지 않았다. NOL 외부 서면 허가 및 정확 일반/선예매 시각은 미확정이다.

## 검증과 보존

- 복구 문서·AGENTS/CONTRIBUTING·역할 문서 UTF-8 읽기, 복구 커밋 두 개 포함/현재 checkout/최신 .local 연속성 확인. 현재 환경 readiness ready와 실제 DB SELECT 성공을 구분해 기록했다.
- 실제 메타데이터와 payload keys를 확인했다. 최초 잘못된 artist_identity_keys 경로 집계는 artist_keys로 다시 조회하여 폐기했고 장애로 보고하지 않았다.
- 코드/테스트가 M18 검증 이후 바뀌지 않아 격리3파일 통과 결과 재사용. 이번 새 테스트0. 운영 후보·동의·알림을 만들어 시험하지 않았다.
- 아티스트 queue revision2964/active=null/transfer=null 및 SHA-256 `a1ed66756e262a9fa5b70b5aacccef190d5bbf2cf746f28e252168453b756615` 전후 일치. queue 명령·DB/RPC 쓰기0.
- 문서·JSON·fingerprint·마지막 통지 상태 갱신만 수행. 운영 DDL·공개ON·수집/발송·배포·push/PR/merge·예약 변경 없음. 비밀·원본 HTML/API 이미지·개인 사용자 정보 저장 없음.

세부 최신 관측: [20261026-152723-concert-operations.json](20261026-152723-concert-operations.json).
