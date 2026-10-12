# 주요 아티스트 DB·별칭·대표 이미지 관리

2026-10-12 KST 로컬 구현·검증. 이후 로그인한 localhost와 실제 연결 DB에서 20팀 사전 등록·관리자 사진 저장/교체·검색을 검증했다. 프런트 배포는 수행하지 않았다. 이전 검사 기록은 아래에 날짜별로 보존한다.

## 사전 등록

[`starter-artists.json`](../supabase/manual/starter-artists.json)에 실제 MusicBrainz 공개 API에서 이름/별칭·국적·Person/Group·단일 ID를 확인한 20팀을 보관한다. 국내 5팀, 일본 9팀, 해외 6팀이다. Ado는 `Japanese vocalist`인 JP 단일 검색 결과로 확인했다. 이름 조회가 잘린 경우 국적 제한 쿼리로 다시 확인했다. 한국어·영문·일본어 제공처 별칭과 주요 한국어 검색 별칭을 함께 보관한다.

JANNABI·HYUKOH·YdBB는 신원/국적 확인 조건을 충족하지 못했고, Oasis는 동명 영국 그룹이 여럿이라 자동 선택하지 않았다. Muse는 조회 실패로 최종 manifest에 포함하지 않았다. 사전 조회 중 503·네트워크 실패를 관측했다. MusicBrainz 신원 확인은 대상 장르 승인이나 한국 공연 발표를 뜻하지 않는다. 모든 새 등록은 `장르 미검수`다.

```powershell
# 기본은 목록 확인만 수행하며 DB에 쓰지 않는다.
node scripts/seed-artists.mjs
# 운영 서버 전용 환경변수가 있는 경우 명시적으로 등록한다.
node scripts/seed-artists.mjs --upload
```

같은 MBID는 기존 ID를 재사용하며 별칭을 합친다. 찜 관계·공연을 만들거나 변경하지 않는다. 기존에 이름만 등록한 아티스트와 신원 연결 근거가 부족하면 `identity_conflict_review`로 보류하며 새 중복 행을 만들지 않는다. 이 경우 확인한 외부 ID를 기존 아티스트에 연결하는 별도 검수가 필요하다. 실제 운영 신규 등록 수는 아직 미확인이다.

검증 manifest를 갱신하려면 `node scripts/verify-starter-artists.mjs --output=supabase/manual/starter-artists.json`을 실행한다. 이미 확보한 ID는 유지하고 미확정 이름을 재조회한다. 기존 ID 자체의 재검증은 제공처 상세 조회로 별도 수행해야 한다.

## 일반 검색·대표 이미지

- DB 이름·별칭 결과를 즉시 먼저 표시하고 외부 검색은 기존 400ms 입력 대기 이후 보완한다. 등록된 MBID와 같은 외부 결과만 제거하며, 동명의 다른 ID는 유지한다. DB 카드의 사진을 별도 제공처 대기 없이 표시한다.
- Ado·아도 별칭과 미등록/동명 결과 보완은 로컬 검증했다. 실제 운영의 검색 응답 시간 분포·외부 API 대기 시간은 이번 작업에서 측정하지 않았다.
- 관리자 **아티스트 DB·대표 이미지**에서 별칭, 관리자 지정 이미지, 외부 자동 연결, 이미지 삭제를 관리한다. 수정 시 서버 버전을 검사해 다른 관리자의 변경을 덮어쓰지 않는다.
- 이미지 URL, 원본 출처, 저작자, 라이선스/허락 명칭, 이용 조건 근거 URL, 구체적 사용 근거·추가 크레딧·확인 시각을 보관한다. HTTPS 외부 URL과 필수 권리 정보를 서버에서 검증한다. 이미지 서버 다운로드나 재호스팅은 하지 않는다. 관리자 지정 자체가 실제 권한 취득을 대신하지 않는다.
- 관리자 지정 이미지는 DB 카드를 우선한다. 삭제는 `hidden`으로 저장해 외부 사진이 자동으로 다시 나타나지 않게 한다. 자동 연결 복귀는 별도로 선택할 수 있다. 실패 시 이니셜을 표시하며 교체 URL은 다시 표시한다. 사진 출처·라이선스는 펼쳐 확인한다.
- Ado의 실제 대표 이미지 사용 허락을 확보하거나 운영 이미지를 지정한 기록은 아니다. 브라우저 검증은 명시적인 로컬 테스트 이미지로 수행했다.

## 적용 순서

1. 기존 신원·사진 마이그레이션 이후 [`20261012135134_artist_management.sql`](../supabase/migrations/20261012135134_artist_management.sql)을 적용한다. 자동 운영 UI도 배포한다면 먼저 [자동 수집 마이그레이션](automated-catalog-20261012.md)을 적용한다.
2. 신규 필드를 조회하는 `artist-search` 함수와 프런트엔드를 배포한다. 가져오기 응답에도 MBID·대표 이미지·삭제 모드를 포함해 등록 직후 카탈로그 재조회와 겹쳐도 사진 설정을 잃지 않게 한다. `artist-photo` 함수 변경은 없다. Deno 런타임 검사는 아직 수행하지 않았다.
3. 사전 등록을 실행하고 충돌/보류 목록을 확인한다. 관리자에서 실제 이용 근거를 갖춘 이미지와 별칭을 지정한다. 공식 장르 근거가 확인된 아티스트만 별도 **대상 장르 승인**을 사용한다.
4. 운영 DB 권한·다른 계정 차단·실제 이미지 표시와 자동 수집 연결을 확인한다. 원격 advisors는 적용 후 실행한다.

## 확인 결과

- PGlite PostgreSQL에서 20팀 등록을 두 번 실행해 중복 없음, MBID/아도 별칭, 공연 미생성, 찜 보존, 신원 충돌 보류를 확인했다.
- 이미지 필수 권리 누락·비HTTPS/로컬 주소 거부, 지정·교체·삭제 이력, 낙관적 충돌과 일반 사용자 수정 제한을 확인했다.
- React 테스트에서 이미지 우선순위·실패·교체·삭제·외부 중복 제거·관리자 저장 실패/재시도·선택 변경 중 오래된 응답 격리를 확인했다.
- 실제 컴포넌트→로컬 HTTP RPC→PGlite 저장→일반 사용자 카드 반영을 headless Edge에서 확인했다. 1280·390·320px 가로 넘침 없음, 페이지 오류 0건. 테스트용 이미지로 지정·삭제를 확인했으며 운영 통합 검증과 구분한다.
- 전체 회귀 검증은 Node 55개·UI 72개(127개) 통과. 마지막 변경의 관련 DB/UI 검사를 재실행했고 lint·build·diff 검사도 통과했다. 기존 500kB 초과 번들 경고는 남아 있다.

관련: [사진 자동 연결](artist-photos.md) · [로드맵](development-roadmap.md).

## 로그인 후 실제 연결 DB 검증

2026-10-12 사용자 로그인 후 인앱 브라우저 localhost에서 확인했다.

- 관리자 Oasis의 기존 별칭 `오아시스`에 임시 별칭을 추가해 저장 성공, 일반 검색에서 Oasis 1팀과 연결 공연 조회, 페이지 재진입 후 값 유지를 확인했다. 검증 후 별칭을 `오아시스`, 사진 모드를 기존 `auto`로 복구해 성공 응답과 재조회 값을 확인했다. 수정 이력은 남는다.
- 관리자 지정 이미지 모드에서 필수 출처·권리 정보 입력란과 확인 체크박스를 확인했고, 미확인 상태에서 저장 버튼 비활성화를 확인했다. 실제 사진 지정·교체·삭제는 이번 원격 검증에서 수행하지 않았다. 이용 근거를 갖춘 실제 이미지가 필요하다.
- Ado는 DB 검색 0팀, 외부 검색에서 JP Japanese vocalist와 동명 GB techno가 구분되어 표시된다. 일본 Ado의 MusicBrainz ID는 manifest의 ID와 일치한다. 신규 등록·찜 변경은 하지 않았다. 따라서 20팀 사전 등록과 한국어 아도 검색의 운영 반영은 남아 있다.
- 실제 관리자 화면 390px·320px, 검색 화면 390px에서 문서 가로 넘침이 없었다. 관측된 브라우저 오류·경고 0건. 임시 화면 크기는 복구했다.
- 계정 찜·저장 일정, 자동 공개·수집 정책과 알림 설정은 변경하지 않았다. 다른 일반 계정의 수정 차단, 실제 이미지 저장과 배포된 Edge Function의 신규 응답 필드는 이번 검사 범위 밖이다.

## 실제 사전 등록·사진 교체 완료

2026-10-12 KST 사용자 요청으로 현재 프런트엔드와 서버 전용 환경의 프로젝트가 같은지 확인한 뒤 실행했다. 키 값은 출력하거나 커밋하지 않았다.

- 최종 manifest 20팀 모두 운영 DB에 단일 MusicBrainz ID로 연결했다. 전체 아티스트는 기존 42팀에서 54팀으로 증가했다(신규 12팀, 기존 8팀 재사용).
- 첫 실행의 6팀 보류는 아래 공식 근거와 MusicBrainz 상세의 공식 사이트 관계·별칭·작품을 수동 대조해 해소했다. 기존 band ID와 기존 신원 키·공연/찜 관계를 유지하고 MB 신원만 추가했다. 연결 전 이름·국적·MBID 충돌을 트랜잭션 안에서 검사했고 변경 전후를 관리 이력에 기록했다. 이 검수는 장르/자동 공개 승인이 아니다.

| 기존 아티스트 | MusicBrainz ID | 대조 근거 |
| --- | --- | --- |
| SURL | `4bb621f5-0cf1-44a5-84b6-2cbafb8f17ad` | [MPMG 공식 소개](https://www.mpmgmusic.com/surl)의 of us·Aren't You?·XYRUP과 상세 작품 목록 일치 |
| THORNAPPLE | `6b5f4f28-6359-48ae-9eee-4cf020ea3062` | [MPMG 공식 소개](https://www.mpmgmusic.com/thornapple)의 계몽·서울병·동물과 상세 작품 목록 일치 |
| TOUCHED | `969c0579-d5fb-4576-8eb3-dea777d396c2` | [MPMG 공식 소개](https://www.mpmgmusic.com/touched)의 Purple·Yellow Supernova Remnant·Red Signal과 상세 작품 목록 일치 |
| ONE OK ROCK | `6ef00829-fa94-4fee-a5a6-b28e1208e96a` | 상세의 공식 홈페이지 `oneokrock.com`이 기존 [공식 소개 근거](https://www.oneokrock.com/en/about/)와 일치 |
| RADWIMPS | `6f500293-7396-4903-b4fd-118127d06f9e` | 상세의 공식 홈페이지 `radwimps.jp`가 기존 [공식 소개 근거](https://radwimps.jp/biography/)와 일치 |
| My Chemical Romance | `c07f0676-9143-4217-8a9f-4c26bd636f13` | 상세의 [공식 홈페이지](https://www.mychemicalromance.com/)·US/MCR 신원과 기존 [공식 주최 공연](https://ualive.com/concerts/397) 아티스트 대조 |

### 실제 DB 재실행·권한 확인

등록을 다시 실행해 20팀 각각 정확히 1개 MBID 행임을 확인했다. 전후 모두 아티스트 54팀·공연 8개·찜 1개·저장 일정 5개이며, 아티스트 ID·별칭·사진 데이터가 보존됐다. seed RPC의 버전 시각 갱신은 내용 비교에서 제외했다. 실제 인앱 브라우저에서 `ado`와 `아도`가 DB의 일본 Ado 1팀을 찾고, 같은 JP MBID 외부 결과가 중복 표시되지 않는 것을 확인했다.

비로그인 REST 요청은 사진 수정 `ADMIN_REQUIRED`, 사전 등록 `SERVICE_REQUIRED`로 거부됐다. 관리자 등록이 없는 일반 `authenticated` 역할을 트랜잭션으로 모사한 검사도 두 요청이 같은 오류로 거부됐으며 롤백했다. 실제 다른 사용자 계정으로 로그인한 검증은 아니다.

### 실제 사진 지정 → 교체 → 새로고침

Radiohead에 [Radiohead2018.jpg](https://commons.wikimedia.org/wiki/File:Radiohead2018.jpg)를 관리자 UI로 저장하고 일반 검색 카드의 실제 로딩(원본 폭 1788px)을 확인했다. 이어 [Radiohead 2018 composite.jpg](https://commons.wikimedia.org/wiki/File:Radiohead_2018_composite.jpg)의 960px Commons 썸네일로 교체했다. 두 파일 모두 Commons에 명시된 [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/)과 저작자 Raph_PH를 확인했다. 각각 콜라주 제작자 100cellsman, montage/adjustments Miklogfeather를 추가 크레딧으로 보관했다.

최종 DB는 manual 모드, 교체 URL·원본 출처·저작자·라이선스 URL·사용 근거·서버 확인 시각을 저장한다. 사진 URL 변경 이력 2건을 확인했다. 일반 검색과 페이지 새로고침 이후에도 교체된 960px 이미지가 정상 로딩되며, 사진 출처 패널에 저작자·추가 크레딧·원본/라이선스 링크·정사각형 자르기 안내가 표시된다. 실제 삭제 모드 전환은 수행하지 않았다.

실제 이미지가 있는 카드에서 데스크톱과 390·320px을 확인했다. 모바일 가로 넘침 없음, 관측된 콘솔 오류·경고 0건. 임시 뷰포트는 복구했다. Ado에는 별도 사용 근거를 확보한 사진을 지정하지 않았으며 자동 사진 없음 상태를 유지한다. 모든 20팀에 사진을 지정한 작업은 아니다.

### 남은 운영 점검

프런트엔드/Edge Function 배포, 자동 수집·24시간 관측은 이번 실행에 포함하지 않았다. `security` advisor는 private 스키마의 정책 없는 RLS INFO와 SECURITY DEFINER 실행권한·유출 비밀번호 보호 비활성화 WARN을 반환했다. 특히 새 관리자/서버 RPC도 anon/authenticated EXECUTE 권한이 있으나 이번 역할 검사에서는 함수 내부 관리자/서비스 검사로 수정이 거부됐다. 실행권한 축소는 별도 하드닝 항목이며 전체 보안 검증 완료를 뜻하지 않는다.

관련 점검 안내: [공개 SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [로그인 역할 SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [비밀번호 보호](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
