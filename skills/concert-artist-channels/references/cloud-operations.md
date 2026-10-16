# 클라우드 운영과 읽기 전용 검증

후속 구현: [서버 실행기 운영 검토서](../../../docs/artist-review-runner.md)를 우선한다. 아래 개인 관리자 갱신 토큰 방식은 이전 검토 기록이며 채택하지 않았다. 현재 새 실행기는 scoped secret과 서버 내부 전용 RPC로 구현됐으나 migration·운영 배포는 아직 적용하지 않았다. 두 문서에서 과거 관측과 현재 구현/운영 상태를 구분한다.

## 범위와 현재 구현

기존 등록 아티스트만 장르 검수(concert-artist-curation)·채널 검수(concert-artist-channels)한다. 신규 추가·concert-artist-import는 제외하며 LASTFM_API_KEY는 필요하지 않다. 설치나 설정은 DB 변경·반복 예약 권한이 아니다. 기존 격리 checkout을 사용하고 명시 요청 없이 worktree를 만들지 않는다.

첨부본의 scripts/channel-refresh.mjs는 설치 시 저장소 scripts/youtube-channels.mjs와 바이트 내용이 동일했다(LF 정규화 후 비교). 첨부의 DB 경로 부재 설명은 오래된 내용이었다. 이후에는 두 사본의 차이를 다시 확인한다. 파일 도구는 DB에 쓰지 않지만 입력·이전 캐시를 검증하고 출력 파일을 교체한다. 운영 scripts/refresh-artist-channels.mjs는 RPC로 DB에 쓴다.

## 인증: 읽기와 쓰기를 구분

- public.bands REST 읽기는 주입된 SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY로 확인됐다. 이 키를 브라우저나 VITE_ 변수에 넣지 않는다.
- 장르 admin_catalog·admin_curate_artist·admin_artist_history는 기존 관리자 사용자 인증 경로다. private.is_admin은 auth.uid()가 private.admins에 존재하는지 검사한다. 서비스 키의 관리자 대체를 가정하지 않는다. 실제 서비스 키로 admin_catalog는 ADMIN_REQUIRED였다.
- 채널 admin_artist_channel·admin_save_artist_channel은 authenticated 관리자 경로다. 서비스 키로 admin_artist_channel은 함수 접근 거부였다.
- 채널 service_save_artist_channel·service_apply_artist_channel은 명시적인 service_role 경로다. 신원·버전·잠금·근거 검사를 보존한다. 운영 REST에서 RPC 인터페이스는 확인했으나 미리보기에서는 쓰기 성공을 시험하지 않는다. 저장소 SQL 확인을 운영 함수 본문·전체 GRANT 조회와 혼동하지 않는다.
- service_artist_channel_manifest는 SELECT 전 만료 캐시를 DELETE한다. 이름과 HTTP GET 여부에 관계없이 미리보기에서 호출하지 않는다. private 채널 이력/잠금 읽기를 공개 프로필 응답만으로 대신했다고 보고하지 않는다.

현재 앱 src/backend.ts는 persistSession=true·autoRefreshToken=true, implicit 이메일 링크 로그인을 사용한다. src/useAuth.ts는 로그인/세션 변화를 처리한다. 이는 실행 중인 브라우저의 저장소·갱신 토큰을 이용하는 동작이다. 새 Codex 작업에 관리자 세션이 자동 전달되는 구조는 확인되지 않았다. 서버 갱신 실행기는 현재 없다. 서비스용 채널 클라이언트는 persistSession=false·autoRefreshToken=false다.

관리자 쓰기가 별도 승인되면 기존 관리자 계정의 정상 로그인으로 세션을 얻고 관리자 여부를 검증해야 한다. 장기 무인 검수를 하려면 갱신 토큰의 안전한 저장·회전 후 원자적 저장·동시 갱신 방지·만료/철회 시 재로그인 경로가 필요하지만 현재 구현되지 않았다. 이 문서는 해당 경로를 구현하거나 새 권한을 부여하지 않는다. 사용자 UUID/JWT를 만들어 가장하거나 브라우저 저장소에서 토큰을 추출하지 않는다. 토큰을 채팅·Git·일반 JSON에 저장하지 않는다.

## 인터넷과 키

YOUTUBE_API_KEY는 환경변수로 받는다. 설정의 바인딩, 실제 프로세스 존재 여부, main에서 env.YOUTUBE_API_KEY를 읽는지 각각 확인한다. 존재 여부는 유효성·쿼터·새 작업 전달 성공의 증명이 아니다. 전체 환경·값·키가 포함된 URL은 출력하지 않는다.

MusicBrainz는 후보 신원·URL 관계용이다. 공식 아티스트/소속사 페이지의 실제 링크를 확인해야 verified다. 공식 사이트별 hostname, 리디렉션 목적지, 필요한 조사 출처를 확인한다. 기존 네 도메인만으로 전체 조사가 가능하지 않다. 프록시 403과 원본 서버 403·404를 구분하고 근거 접근 실패는 failed로 남긴다. 기존 네트워크 규칙을 보존하며 필요한 도메인을 추가한다. 전체 허용으로 임의 확장하지 않는다. YouTube 페이지 스크래핑은 하지 않는다.

## 기록의 보존과 재사용

장르 근거는 curation 스킬의 docs/curation-runs/ UTF-8 JSON 계약을 따른다. 정책·ID·신원·상태·원본 updated_at·확인 시각·근거 URL·판정·실제 적용 여부를 기록한다. 같은 정책/신원/상태의 최근 90일 완료 검수만 재사용한다. failed/held는 완료 캐시가 아니다. 이력 파일만 보고 DB 적용 성공을 가정하지 않는다.

채널 공식성 근거와 API 캐시는 분리한다. 근거는 버전 관리할 수 있지만 API 제목·이미지 URL·원본 응답·키는 Git 기록에 누적하지 않는다. 파일 캐시는 .local/artist-channels/latest.json처럼 기존 ignored 경로에서 --previous로 읽고 원자 교체하며 7일 재사용·30일 만료 정책을 따른다. 과거 실행 산출물도 만료 캐시를 보존하지 않아야 한다.

클라우드 Publish 스냅샷은 게시 시점 파일을 보존한다. 이후 작업에서 새로 만든 파일이 다른 작업에 자동 동기화된다고 가정하지 않는다. 장르 JSON을 실행 간 영구 재사용하려면 저장소 커밋·승인된 push/PR로 다음 작업의 기준 ref에 반영하거나 별도의 승인된 영구 저장소가 필요하다. 로컬 커밋만으로 원격 보존을 주장하지 않는다. 설치 당시에는 push/PR 권한이 없었으며, 후속 요청에서 작업 브랜치 push와 dev 대상 PR 생성이 승인됐다. 별도 저장소 구축·DB 쓰기·병합은 승인되지 않았다. 기존 GitHub 채널 workflow artifact는 7일 보존 집계라 장르 근거의 영구 저장소가 아니다. 운영 DB의 채널 근거/이력/캐시는 기존 승인된 쓰기 작업에서만 갱신한다.

## Republish 뒤 새 작업에서 수행할 검증

환경 설정을 저장하고 Publish한 뒤 이 환경을 선택한 새 작업을 열어 두 스킬 파일·커밋·환경변수 존재 여부·네트워크를 다시 확인한다. 현재 작업의 성공을 새 작업 검증으로 보고하지 않는다.

기존 미검수 3팀(℃‐ute, =LOVE, 10,000 Maniacs)을 public.bands에서 다시 읽고 현재 신원/버전을 기록한다. 공식 장르 근거와 아티스트별 채널 교차 링크를 확인한다. API가 필요하면 DB 비연결 파일 도구만 사용하고 applied=false를 유지한다. 관리자 인증이 없으면 잠금/비공개 이력의 확인 한계를 보고한다. DB 변경, 업로드 스크립트, 캐시 삭제 manifest RPC, 반복 예약 생성은 실행하지 않는다.

장르와 채널 각각 설치·출처 접근·읽기·인증·미리보기 판정·쓰기 준비 상태를 따로 보고한다. Publish·새 작업 생성 도구가 없으면 사용자에게 그 단계만 요청하며 현재 작업을 새 작업으로 가장하지 않는다.

## 이번 설치 세션의 관측 결과

2026-10-16 KST: 키는 현재 프로세스에 존재하며 빈 manifest로 main의 환경변수 읽기를 확인했다(API 호출 0·DB 쓰기 0). 첨부 테스트 9개 통과. equal-love.jp/feature/profile과 maniacs.com은 HTTP 200으로 접근됐다. www.up-front-works.jp/artist/c-ute/와 www.helloproject.com/c-ute/는 프록시 차단 대신 원본 HTTP 404였다. ℃‐ute는 유효한 공식 아카이브/레이블 페이지를 추가로 찾아야 한다. 이 결과는 현재 작업 관측이며 Republish 뒤 새 작업 결과가 아니다.

Node 24의 native fetch는 이 환경에서 직접 DNS 접근이 실패할 수 있다. `node --use-env-proxy <script>`로 기존 주입 프록시를 사용한다. 이 옵션으로 equal-love.jp 공식 페이지 HTTP 200을 확인했다. TLS 인증서 검증은 유지한다. 파일 도구 실행 예: `node --use-env-proxy skills/concert-artist-channels/scripts/channel-refresh.mjs --input=.local/artist-channels/input.json --output=.local/artist-channels/latest.json`.

## 자동 운영의 두 미해결 과제와 구현 경계

### 기존 관리자 인증의 예약 유지·갱신

현재 지원: 기존 관리자 이메일 OTP/링크 로그인, 브라우저 SDK의 세션 저장·자동 갱신, auth.uid 기반 기존 관리자 RPC. 서비스 역할의 채널 작업은 별도 지원하지만 장르 관리자 인증을 대체하지 않는다.

추가 구현: 기존 관리자가 직접 로그인해 위임한 갱신 토큰을 암호화된 영구 비밀 저장소에 보관하고, 단일 실행 잠금 아래 Supabase Auth refresh로 액세스/회전된 갱신 토큰을 얻어 새 갱신 토큰을 원자적으로 저장하는 서버 실행기. 매 실행에서 getUser와 관리자 확인 RPC로 사용자/권한을 검증하고 이후 기존 admin_curate_artist를 사용자 JWT로 호출한다. 회전 저장 실패·철회·만료·ADMIN_REQUIRED에는 쓰기를 중단하고 기존 계정의 재로그인을 요청한다. 정적인 클라우드 secret 한 개에 초기 토큰만 넣는 것으로 회전·동시실행·복구가 해결되지 않는다. 현재 클라우드 secret을 작업에서 갱신해 영구 저장하는 지원 API도 확인되지 않았다. 토큰을 결과 파일·Git에 기록하거나 새 관리자를 부여하지 않는다. 이 서버 실행기/비밀 저장소는 아직 구현·승인되지 않았다.

### 완료 근거의 실행 간 영구 보존·재사용

현재 지원: docs/curation-runs JSON 버전 관리, 장르 스킬의 90일 재사용 규칙, 채널 파일 도구의 fingerprint/7일 캐시 재사용·만료 제거, 승인된 운영 DB 채널 근거/이력. 이번 읽기 전용 결과에는 API 제목·설명·이미지 URL·응답 원문을 저장하지 않는다. keep 판정은 DB 승인/변경을 뜻하지 않는다.

즉시 사용 가능한 경로: 승인된 작업 브랜치에 근거 JSON을 커밋/push하고 다음 작업에서 그 브랜치의 최신 커밋을 fetch하여 읽는다. dev로 PR을 만들기만 하고 병합하지 않으면 dev 기준 새 작업에는 해당 파일이 없다. 예약의 저장소 ref/시작 절차가 근거 브랜치를 명시해야 한다. 이번 요청 범위는 현재 변경의 push/PR이며 미래 모든 실행의 push·자동 병합을 승인한 것이 아니다.

추가 구현: 실행 시작 시 원격 근거를 로드하고 정책·band ID·MBID·이름/별칭/국가·현재 상태·원본 버전·90일 유효기간을 대조하는 재사용 인덱스/실행기. 완료 keep/exclude만 재사용하고 held/failed는 재시도한다. 중복 실행 잠금, 동시 push 충돌 처리, 원자적 기록, 실패 체크포인트, 조회/적용 여부 분리가 필요하다. 매번 고정 Publish 스냅샷만 읽거나 로컬 커밋만 남기면 이후 실행의 근거가 동기화되지 않는다. 대안인 별도 객체 저장소/서버 기록 API는 현재 미구현이며 별도 승인·접근 설정이 필요하다. 장기 장르 근거와 YouTube 만료 캐시는 분리한다.
