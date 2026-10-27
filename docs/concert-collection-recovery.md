# 공연 후보 수집 복구와 공식 출처 준비

KOPIS 영구 HTTP 4xx는 내부 요청 및 바깥 source 실행기에서 즉시 반복하지 않는다. 오류에는 키·요청 URL·원문 응답 없이 날짜 범위/페이지 또는 공연 ID만 남긴다. HTTP 400의 근본 원인 해결을 의미하지 않는다.

## 예약 실행

Node 24에서 `node --use-env-proxy scripts/collect-concerts-scheduled.mjs`를 한 번 실행한다. 이 실행기는 대상 Supabase 프로젝트, KOPIS 정책, 최근 서버 시도와 로컬 cooldown을 확인하고 기존 source lease/complete RPC로 후보를 업로드한다. 최근 1시간 시도·source OFF·cooldown은 건너뛴다. 공개 OFF/live_after=null을 요구한다.

공연 전용 `--concerts-only`는 외부 아티스트 조회를 생략하고 업로드 identities=[]를 유지한다. 빈 notice 파일로 추가 provider 요청을 제한한다. 결과는 ignored `.local/concert-collection/latest.json`과 해당 run ID의 DB 결과로 대조한다. 영구 목록 4xx는 24시간 cooldown이며 다른 실패는 기본 1시간이다. 로컬 상태가 공유됐다고 가정하거나 cooldown을 지우지 않는다.

아티스트 등록·검수, 읽기 전용 운영 감시, 실제 수집은 세 역할로 분리한다. 발송은 기존 encore-notification-delivery가 맡는다. 이 PR은 예약 생성이나 서버 배포를 수행하지 않는다.

## Reissue/NOL 준비 상태

파서와 기존 수집 runner 연결 및 격리 DB 테스트를 포함한다. `scripts/reissue-nol-links.json`은 빈 배열이며 기본 all 실행에서도 네트워크 요청 없이 건너뛴다. 실제 허가와 신원이 확인된 링크만 이후 설정할 수 있다.

`20261022101423_reissue_nol_collection.sql`은 미적용 제안이다. 새 source 기본값은 수집 OFF·공개 OFF·live_after=null이다. 기존 source는 원래 ingest 함수에 위임한다. 새 출처는 아티스트 writer를 허용하지 않고 기존 identity만 읽는다. 운영 migration 적용은 별도 승인과 최신 함수/제약·잠금 영향 검토가 필요하다.

자동 추출·저장·표시의 사전 서면 허가 또는 허용된 공식 연동 근거, 대상 아티스트 신원 연결, 정확한 발표·예매 시각 검증이 아직 필요하다. LIVE_LAYOUT_AND_TERMS_UNVERIFIED 및 ANNOUNCEMENT_TIME_UNCONFIRMED 차단을 유지한다. 문의 초안은 발송 권한이 아니며 robots 제한을 우회하지 않는다. 공개 활성화와 알림 테스트/발송은 이 PR 범위에 없다.
