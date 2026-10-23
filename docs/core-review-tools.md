# 통합 검수와 핵심 아티스트 후보 도구

기존 DB 검수는 `scripts/artist-review-queue.mjs`의 snapshot/begin/context/apply/checkpoint/finish를 사용한다. 장르·승인·채널은 같은 고정 최대40팀 안에서 처리하며 실패한 대상을 새 팀으로 충원하지 않는다. 실행 주기는 앱 예약에서, 동시 쓰기 보호는 서버의 5시간 lease와 원본 버전 검사에서 담당한다. 정상 finish 응답을 확인한 뒤 로컬 active를 해제한다.

`scripts/artist-core.mjs discover --pages=1 --output=.local/core-candidates.json`은 승인된 LASTFM_API_KEY로 글로벌·일본·한국 청취 지역 차트의 후보만 만든다. 한국 API 요청은 `Korea, Republic of`를 쓰고 결과의 청취 지역은 `South Korea`로 보존한다. 지역은 아티스트 국적이 아니며 후보에는 신원/장르 확인이나 등록·공개 승인이 붙지 않는다.

`plan --catalog=.local/artist-review-queue/catalog.json --output=.local/core-plan.json`은 일본 솔로·유닛80/일본 록밴드60/해외 록·메탈60 편성안의 필수 BMTH/Ado/UVERworld/요네즈 자리를 보존한다. 검증된 후보는 `--candidates`로 전달한다. 신원·국가·장르 근거와 정확한 MBID의 Last.fm listeners가 확인된 후보만 정렬하며, 검증된 전세계 인기200위로 표현하지 않는다. 새 batch에서만 `begin --priority-file=.local/core-plan.json`을 사용한다.

신규 등록/별칭 mutation CLI와 journal 연결은 아직 없다. identity 모듈은 순수 계약 검사 및 주입된 읽기 함수를 통한 receipt/관계/외부 신원/공개 검색 복구 확인만 제공한다. 기존 import/seed 경로로 우회하지 않는다. 유효한 기존 검수는 신규 클라이언트 미완성과 별개로 계속할 수 있다.

이미 대기열이 있으면 init이나 과거 handoff packet을 재수락하지 않는다. 최신 queueId/owner/revision·active·transfer와 서버 lease를 확인하고 수동 결정·cooldown·근거 미완료 초안을 보존한다. `.local` 상태·시크릿·예약 연결은 Git으로 전달되지 않는다.

이 PR의 두 migration 파일은 기존 승인/종료 계약의 이력을 보존한다. 운영에 이미 설치된 버전을 재적용하거나 더 최신 identity 확장을 덮어쓰지 않는다. 이 PR 생성은 운영 DDL·배포·예약 변경·실제 승인 또는 공개/알림 발송을 실행하지 않는다.
