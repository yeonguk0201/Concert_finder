# W30 대표 사진 파일 보관 · 2026-10-14

관리자가 대표 사진을 URL 또는 파일로 지정하는 경로를 로컬 구현했다. 운영 저장소·함수·프런트 적용과 실제 사진 저장은 아직 수행하지 않았다.

## 저장과 표시

- 입력: JPEG·PNG·WebP, 원본 최대 2MiB·2,400만 화소. 브라우저에서 실제 디코딩하고 긴 변 최대 1024px의 PNG로 변환한다. EXIF·위치 등 원본 메타데이터는 전달하지 않는다. 확대하지 않으며 원본 종횡비를 유지한다.
- 서버: 인증 토큰을 Auth `getUser`로 확인하고 호출자의 `is_catalog_admin`을 검사한다. 본문을 읽으면서 2MiB+32KiB로 제한한다. PNG 시그니처·IHDR·1024px 크기를 먼저 검사하고 `pngjs@7.0.0`으로 CRC·압축 데이터를 디코딩한 뒤 다시 인코딩한다. 손상·SVG·위장 파일은 저장하지 않는다.
- 저장소: `artist-photos` 공개 버킷, PNG만·최대 2MiB. 브라우저에는 INSERT/UPDATE/DELETE 정책을 주지 않는다. 목록 조회는 기존 관리자 검사로 제한하며 Edge Function의 서버 키만 파일을 쓴다. 공개 사진 URL은 로그인 없이 읽을 수 있다.
- 교체: `band UUID/random UUID.png`의 새 경로를 매번 만들고 덮어쓰지 않는다. `cacheControl=31536000`이며 URL 변경으로 교체 캐시를 분리한다. 기존 DB 사진 우선 표시·80px 카드·출처/저작자/라이선스 표시·오류 시 이니셜을 사용한다.
- 저장: 기존 `admin_update_artist`를 호출자의 JWT로 실행한다. 마이크로초 버전·관리자 권한·별칭·이용 근거를 재검사하고 기존 변경 이력을 남긴다. 저작자·원본 출처·이용 조건 URL·라이선스/허락 명칭·사용 범위와 확인 체크가 필요하다.
- 실패: 확정된 DB 거부(예: 버전 충돌)는 방금 업로드한 파일만 Storage API로 제거한다. 응답 유실/전송 실패는 이미 DB에 반영됐을 가능성이 있어 파일을 보존하고 목록 재조회를 안내한다. 정리 실패는 `PHOTO_ORPHAN`과 경로를 서버 로그에 남긴다.

## 보관 정책

이미지 삭제는 표시 중단이며 DB의 현재 사진을 null로 바꾼다. 교체 전 파일은 이력 대조를 위해 유지한다. 이전 파일 URL은 계속 접근 가능할 수 있고 CDN에도 남을 수 있으므로 비공개 원본이나 회수 가능한 접근이 필요한 이미지를 넣지 않는다. 자동 삭제 기간·자동 orphan 청소는 아직 없다. 운영자가 변경 이력·현재 참조·불확실 저장을 대조한 뒤 Storage API/대시보드로 정리한다. Storage 메타데이터 테이블을 SQL DELETE하지 않는다.

## 우선 사진의 확보 상태

[20팀 항목별 상태](curation-runs/20261014-readiness-report.json)의 `priorities[].photo`에 지정/미확보를 기록했다. 현재 Radiohead만 기존 수동 URL 사진이 있고 나머지 19팀은 재보관·축소·표시 권리까지 확인한 파일이 없다. 자동 연결 캐시는 확보 파일로 집계하지 않는다. 이번 작업에서 실제 사진을 다운로드하거나 업로드하지 않았다.

Ado의 [공식 레이블 소개](https://www.universal-music.co.jp/ado/biography/)와 연결된 [웹사이트 이용 안내](https://www.universal-music.co.jp/website-disclaimer/)를 10/14 확인했다. 이미지가 공개돼 있다는 사실만으로 이 서비스의 재보관·변환·공개 표시 허락이 확인되지는 않는다. 현재 확보한 일반 안내로 필요한 범위의 이용 허락을 확정하지 못해 지정하지 않았다. 개별 허락 또는 적합한 라이선스 파일 확보 후 연결한다.

## 검증

- Node: 업로드 핸들러 4개, 실제 역할을 사용하는 PGlite 저장소 정책 1개. 일반 계정/무인증·관리자 직접 업로드 차단, 관리자 목록 조회, 손상 CRC·크기·치수·권리·충돌·응답 유실·새 주소 교체를 확인했다.
- UI: 파일 선택/이용 근거/확인·실패 입력 보존/재시도, 브라우저 변환의 1024×512 PNG·URL 해제, API로 버전/근거 전달과 충돌 오류를 확인했다.
- Deno: entrypoint 타입 검사와 실제 PNG 디코더를 사용하는 multipart 런타임 테스트 1개 통과.
- 로그인된 localhost 관리자 화면: Ado의 파일 등록 폼·필수 항목·저장 비활성, 1280·390·320px 가로 넘침 없음, 콘솔 오류 없음. 화면 확인은 DB에 사진을 저장한 검증과 구분한다.
- lint·build 통과. 기존 500kB 초과 청크 경고 유지. Windows sandbox의 Vitest 임시 파일 ENOENT는 권한 확장 실행으로 통과했다.
- 원격 security advisors는 기존 실행권한/비밀번호 경고를 반환했다. 새 마이그레이션은 원격 미적용이므로 이를 새 저장소 정책의 원격 검증으로 간주하지 않는다. [실행권한 경고 기준](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

## 적용 후 남은 검사

1. `20261014135754_artist_photo_storage.sql` 적용. 기존 Storage의 다른 버킷에 대한 광범위 정책이 이 버킷에도 쓰기 권한을 주지 않는지 실제 역할로 확인한다.
2. `artist-photo-upload` 배포. entrypoint·shared 모듈·deno.json·deno.lock을 함께 사용한다. `verify_jwt=false`는 함수 본문의 Auth+관리자 검사와 함께 유지한다.
3. 프런트 배포. 허락이 확인된 사진으로 저장→일반 카드→새로고침→파일 교체→URL 교체→표시 중단을 검증한다. 실제 Storage 응답 Content-Type/길이/Cache-Control, 일반 계정·만료 토큰·충돌·기존 관계 보존을 기록한다.
4. 운영 DB/Storage에 fixture나 권리 미확인 사진을 넣어 검증하지 않는다. 사진 확보와 원격 검증이 끝나기 전 W30 전체를 완료로 바꾸지 않는다.

설계 참고: [Supabase Storage 권한](https://supabase.com/docs/guides/storage/security/access-control), [표준 업로드와 새 경로 교체](https://supabase.com/docs/guides/storage/uploads/standard-uploads), [PNG 디코더](https://github.com/pngjs/pngjs).
