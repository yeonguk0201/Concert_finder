# 핵심 아티스트 및 공연 자동화 확대

2026-10-22 KST 사용자 승인에 따른 준비 코드다. 운영 DB 변경은 기존 통합 검수 경로로 Ado/UVERworld 승인 2건을 완료했다. 핵심 200팀 전체 등록·검색 및 공연 자동화 연결은 미완료다.

## 현재 지원하는 작업

- `supabase/manual/core-artists.json`은 사용자 지명 4팀과 검색 목표를 보존한다. BMTH/요네즈 켄시의 MBID는 미확인으로 두며 이름으로 임의 연결하지 않는다.
- `scripts/artist-core.mjs discover`는 Last.fm global/Japan/South Korea 차트의 후보만 보존한다. `enrichCoreMetrics`는 기존 getInfo의 신원 일치 listeners를 사용한다. 차트 국가를 국적으로 삼거나 태그 수로 인기 순위를 만들지 않는다. 현재 클라우드에 LASTFM_API_KEY 바인딩이 없어 실제 후보 API 조회는 하지 않았다.
- `plan --catalog=... --output=.local/artist-review-queue/core-plan.json`은 80/60/60 편성안에 사용자 지명 자리를 예약하고 검증된 후보를 정렬한다. 현재 후보 풀은 4개 지명이며 나머지 196자리는 미선정이다. 검색 목표 별칭은 쓰기 허가나 검증 완료 증거가 아니다.
- queue `begin --priority-file=.local/artist-review-queue/core-plan.json`은 새 batch 경계에서만 신원 ID 우선순위를 반영한다. 기존 frozen batch/queueId/완료 근거/cooldown/수동 결정을 보존하며 기본 상한은 40이다. `--limit`은 1~40의 더 작은 고정 batch용이며 실패를 추가 팀으로 채우지 않는다.
- 검색 함수는 저장된 이름/별칭의 NFKC·대소문자·공백을 정규화한다. 이름 사이를 합쳐 가짜 일치를 만들거나 번역/약칭을 추론하지 않는다. 코드 변경은 아직 사이트에 배포하지 않았다.
- `scripts/nol.mjs`는 허용된 NOL 상품 URL의 읽기 전용 후보 파서다. robots 실패 시 중단하고 일반/선예매를 구분하며 기간을 매일 공연으로 확장하지 않는다. 실제 NOL 호스트는 현재 실행 네트워크 허용 목록 밖이다. 테스트는 합성 fixture이며 실제 HTML 통합/운영 수집 연결 완료가 아니다.

## 운영에 연결하기 전에 필요한 구현과 검증

1. 신규 아티스트는 통합 batch/서버 lease/같은 40팀 상한 안에서 원자적으로 등록해야 한다. 기존 service import/seed 경로는 통합 batch와 버전 영수증을 함께 보장하지 않는다. 현재 승인 RPC는 별칭 변경을 허용하지 않는다. 따라서 별도 writer로 우회하지 않았다. 신규/별칭 경로에는 MBID 중복 방지, 수동 결정/잠금, 이름/관계 보존, 별칭 충돌, 재전송 receipt, 최신 버전 및 공개 검색 재조회 검증이 필요하다.
2. 공식 Reissue 공지와 NOL 상품의 연결·동일 신원·예매 종류·절대 시각·회차 근거를 검증하는 서버 수집 연결이 필요하다. 현재 NOL source 정책/운영 어댑터는 없으며 원래 collection policy의 수동 publication OFF를 보존한다. robots/이용 조건·실제 HTML fixture·중복/취소/중요 변경·무알림 backfill을 검증한 변경안을 준비해야 한다.
3. 기존 GitHub 수집 workflow는 시간당 예약이나 실제 실행 지연/실패가 관측됐다. 기존 운영 배포와 로컬 브랜치 코드가 다르므로 이 checkout 변경만으로 서버가 바뀌지 않는다. 기존 매분 Supabase 알림 워커를 재사용하고 추가 발송 Cron을 만들지 않는다. publication 활성화에는 기존 수동 OFF 의도와 live_after/초기 무알림 정책을 검토해야 한다.
4. 운영 마이그레이션/권한 변경·배포·push/PR/merge는 이번 요청에 포함되지 않았다. 위 경로의 코드와 테스트가 완성된 뒤 구체적인 변경안 및 영향을 제시해 필요한 승인을 받는다. 기존 integrated 마이그레이션은 재적용하지 않는다.

## 요네즈 켄시 첫 진단

- 공식 공지: https://reissuerecords.net/2026/10/15/kenshi-yonezu-2026-2027-world-tour-ghost/
- 공식 예매: https://nol.yanolja.com/ticket/products/26015024
- 확인한 일반 예매: 2026-10-22 12:00 KST. 공식 공연 날짜는 2027-01-14/16/17, INSPIRE ARENA. 상품 기간 전체를 연속 4회 공연으로 추정하지 않는다. 선예매 존재 여부는 미확인이다.
- DB에서 아티스트/해당 공연 후보가 없고 공식 출처 어댑터가 없다. 모든 기존 수집 source publication은 OFF였다. 이 단계들이 발송 전 차단이다.
- 기존 매분 알림 작업은 최근 HTTP 200, claimed/sent/failed 모두 0으로 정상 응답했다. 과거 발송 성공은 이번 공연이나 실제 기기 도착 증거가 아니다. 지난 예매 시각 알림을 소급 성공 처리하거나 테스트 발송하지 않았다.
