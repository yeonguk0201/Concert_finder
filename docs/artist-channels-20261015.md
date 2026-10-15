# 공식 채널·사진 연결 · 2026-10-15

## 현재 상태

공식 사이트·YouTube 채널의 검수 저장, 관리자 예외 확인, 목록·공연 상세의 공식 링크, 채널 사진 표시, GitHub Actions 정기 갱신을 로컬 구현했다. 사용자가 제공한 화면에서 Repository secret `YOUTUBE_API_KEY` 등록을 확인했다. 키의 값이나 유효성은 조회하지 않았다.

**원격 SQL 적용·프런트엔드 배포·워크플로 공개/첫 실행·실제 공식 채널 일괄 입력·실제 YouTube API 요청은 아직 수행하지 않았다.** 설치된 검수 스킬이나 이번 코드 커밋만으로 운영 갱신이 시작되지 않는다. 기존 W29/W30 전체 완료나 사진 확보 완료로 집계하지 않는다.

## 저장과 공개

- [마이그레이션](../supabase/migrations/20261015122525_artist_official_channels.sql)은 `private.artist_channels`에 MBID·공식 링크·공식 페이지 근거·검수 상태·채널 ID 고정·버전을 보관한다. 공식 근거와 API 응답을 분리한다.
- `private.artist_channel_cache`에는 YouTube API의 제한된 채널 제목·사진 URL·조회 시각만 저장한다. 원본 응답·사진 바이트·영구 Storage 복제는 저장하지 않는다. 메타데이터를 변경 이력·Git·Actions artifact에 복사하지 않는다.
- API 메타데이터는 7일 이내 재사용하고 이후 다시 조회한다. DB 캐시는 29일에 만료시켜 일일 삭제 작업이 30일 제한 전에 처리할 여유를 둔다. 키 누락·제공자 오류에도 먼저 만료 행을 삭제하며, 공개 조회와 열린 화면에서도 기한을 검사한다. 서버 갱신 실패로 성공 시각을 연장하지 않는다.
- 공식 근거는 확인 후 90일 이내에만 유효하다. 이 기간은 앱의 검수 운영 기준이며 Google이 정한 주기는 아니다. MusicBrainz 링크 단독이나 채널 조회 성공은 공식 확인으로 승격하지 않는다.
- 일반 클라이언트는 검수된 공개 필드만 받는다. 관리자 RPC는 권한과 밴드·프로필의 최신 버전을 확인한다. 일괄 입력도 버전을 확인하며 관리자 고정을 덮어쓰지 않는다. 아티스트 신원 변경·보류·제외는 공개 연결을 차단한다.
- 채널 ID 변경·여러 아티스트의 공유 채널은 재검수 대상으로 남는다. 오래된 실행 결과가 최신 실행이나 이 예외 결정을 덮어쓸 수 없다. 관리자 재검수로 명시적으로 수정해야 다시 조회한다.

## 화면

관리자 아티스트 편집의 **공식 사이트·YouTube 채널 검수**를 펼치면 링크·검수 상태·공식 페이지 근거·채널 ID 고정·최근 조회 상태·변경 이력을 관리할 수 있다. 공식 확인 저장에는 신원과 직접 연결을 확인했다는 체크가 필요하다. 후보/재검수 항목은 일반 목록에 공식 링크나 사진을 공개하지 않는다.

목록은 관리자 지정 사진 → 유효한 YouTube 채널 사진 → 기존 Wikimedia 자동 사진/이니셜 순으로 표시한다. 이미지 숨김은 모든 자동 사진보다 우선한다. 공식 링크는 목록과 공연 상세의 해당 아티스트에 표시한다. 현재 앱에 별도의 아티스트 상세 페이지는 없으므로 신규 상세 페이지나 임의 소개 문구를 추가하지 않았다.

채널 사진 아래에는 공식 원본 YouTube 아이콘과 해당 채널 링크를 항상 표시한다. 사진은 URL을 변경하지 않고 비율을 유지해 표시한다. [공식 브랜드 페이지](https://brand.youtube/youtube-icon/)에서 확인한 디지털 최소 아이콘 높이는 100px다. 배포 자료의 원본 PNG(1255×1075)에는 여백이 포함되며 실제 아이콘 영역은 827×579다. PNG를 높이 186px로 표시하여 실제 아이콘 높이 100px 이상과 포함된 여백을 유지했다. 작은 20~24px 아이콘을 사용했다고 가정하지 않는다.

공식 원본 파일: [아이콘](../src/assets/youtube-icon-white.png). 출처: [공식 다운로드 ZIP](https://www.gstatic.com/marketing-cms/78/29/3e68a1414bb28d0b7e47b44c3c91/youtube-icon.zip). 색상·비율·여백을 편집하지 않았다. 이용 안내에 YouTube 이용약관·Google 개인정보처리방침, 이미지 서버 요청, 공연·장르 정보의 별도 출처를 표시했다.

## 운영 적용 순서

1. PR은 `dev`를 대상으로 검토한다. 원격 적용 전 현재 마이그레이션 이력과 대기 SQL을 확인한다. 이번 SQL은 기존 아티스트 관리/검수 및 `catalog_signal` 구조 이후에 적용한다. 이전 W30 파일 저장 SQL의 적용 여부는 별도로 확인한다.
2. 공식 채널 SQL을 적용하고 관리자/일반/서비스 역할의 접근과 공개 조회를 원격에서 재확인한다. 기존 밴드·사진·찜 상태는 자동 승인하거나 변경하지 않는다.
3. 검수 스킬로 현재 DB의 ID·MBID·`updated_at`과 공식 원문을 대조해 일괄 manifest를 만든다. 공식 확인은 원문을 실제 확인한 항목에만 부여한다. 기존 가져오기 결과의 `profile_links`는 후보 발견에 재사용할 수 있다. 관리자가 수백 개를 직접 입력하는 것이 전제는 아니다.
4. 아래 일괄 명령 또는 관리자 폼으로 검수 결과를 저장한다. 실조회 키는 GitHub Secret에 있으므로 로컬에서 읽거나 복구할 수 없다. 로컬 일괄 입력 시 DB 서버 비밀값은 안전한 실행 환경에서 제공한다. 키가 없으면 DB 저장·만료 정리 후 `key_required`를 보고하며, 이후 Actions에서 조회할 수 있다.
5. 프런트엔드와 [워크플로](../.github/workflows/artist-channels.yml)를 배포한다. GitHub의 정기 실행은 기본 브랜치에 반영된 워크플로를 사용하므로 `dev` 검증 후 `main` 릴리스 PR까지 필요하다. 실제 기본 브랜치 설정도 확인한다.
6. Actions의 **Refresh official artist channels**를 수동 실행하여 등록된 실제 채널의 API 조회→DB 저장→일반 목록 사진·출처·공식 링크를 확인한다. `artists: 0`인 성공은 키 검증이나 사진 확보 성공이 아니다. 수동 사진·숨김·잠금·검수 예외도 원격에서 확인한다.

워크플로는 `catalog-ingestion` 환경의 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`와 Repository secret `YOUTUBE_API_KEY`를 읽는다. 사용자 화면에 키를 전달하지 않는다. 별도의 프런트엔드 `VITE_` 키가 필요하지 않다.

일일 실행 목표는 **04:43 KST**다. 유효한 7일 캐시는 API를 호출하지 않고 유지하며, 실패 항목은 다음 날 재시도한다. 실행 중복은 Actions concurrency로 제한한다. 키/권한/쿼터 오류는 추가 요청을 중단하고 실패 처리하며, 미처리 항목은 다음 실행으로 남긴다. GitHub 스케줄은 지연/누락될 수 있으므로 반복 실패·실행 누락은 Actions에서 확인하고 만료 정리를 수동 재실행한다. 정확한 시각의 실행을 보장하지 않는다.

```powershell
# 서버 DB 접속 환경변수가 설정된 환경에서 실행. 키를 명령줄에 넣지 않는다.
# 신규 프로필은 profileVersion=null, 수정은 현재 프로필 updated_at을 사용한다.
node scripts/refresh-artist-channels.mjs --upload --manifest=.local/artist-channels/input.json --output=artist-channel-report.local

# 기존 저장 채널만 갱신. Actions도 이 경로를 사용한다.
node scripts/refresh-artist-channels.mjs --upload --output=artist-channel-report.local
```

manifest는 설치 스킬의 version 1 입력을 사용하며 `websiteUrl`과 `profileVersion`을 추가할 수 있다. 각 항목에는 `bandId`, `musicBrainzId`, `name`, `curationStatus`, `identityVersion`(현재 밴드 updated_at), `channelUrl`, `verification`, `evidence`, `previousChannelId`, `locked`가 들어간다. 수정 시 `profileVersion`은 `admin_artist_channel`의 `profile.updated_at`이다. ID가 바뀐 채널을 재검수해 교체할 때는 `previousChannelId`도 명시적으로 재검토한다.

API resolver는 설치된 `concert-artist-channels`의 구현을 [저장소 코드](../scripts/youtube-channels.mjs)로 가져와 Actions에서 실행 가능하게 했다. 스킬 설치 경로에 의존하지 않는다. 입력은 UTF-8로 읽고, 실행 보고에는 건수와 정해진 오류 코드만 저장한다.

## 검증 결과와 한계

- 전체 Node 회귀 검사 90개 통과. 보강 후 SQL/갱신 runner 5개를 재실행해 통과했다. 실제 PostgreSQL 역할을 사용하는 PGlite에서 관리자/서비스/일반 접근, 신원·편집 버전, 고정, 오래된 실행 차단, 공유 채널 예외 보존, 만료 삭제, 수동 사진 보존을 확인했다.
- UI 회귀 검사는 Windows 임시 디렉터리 ENOENT가 발생했다. 임시 경로를 `.local/test-temp`로 지정한 후 기존 87개가 통과했고, 열린 화면 만료 테스트를 React `act`로 수정한 후 해당 테스트를 포함한 10개가 통과했다. 이후 카탈로그 연결 2개를 추가하여 관련 12개가 통과했다. 최종 UI 테스트 집합은 90개이며 변경 없는 기존 통과 결과를 재사용했다.
- lint·build·diff 검사를 통과했다. 기존 500kB 초과 번들 경고는 남아 있다.
- 브라우저 pane의 127.0.0.1/localhost 연결이 모두 `ERR_CONNECTION_TIMED_OUT`으로 실패했다. 데스크톱·모바일의 실제 렌더링/가로 넘침/아이콘 시각 검증은 미수행이며 UI 동작 테스트를 시각 검증으로 계산하지 않는다.
- 원격 migration/advisor·운영 관리자 폼·실제 API 키/쿼터·전체 공식 채널 검수·사진 확보율·Actions 첫 실행·운영 사진 표시는 미검증이다. Git push·PR 게시·병합·배포는 수행하지 않았다.

근거: [API 채널 조회](https://developers.google.com/youtube/v3/docs/channels/list), [API 데이터 보관 정책](https://developers.google.com/youtube/terms/developer-policies), [출처 브랜드 표시](https://developers.google.com/youtube/terms/branding-guidelines), [GitHub Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets), [GitHub 정기 실행](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
