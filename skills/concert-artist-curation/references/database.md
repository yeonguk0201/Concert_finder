# concert-finder DB 작업 참조

이 참조는 실제 DB를 읽거나 변경할 때 사용한다. 도구 이름과 스키마는 실행 시 확인하며, 스키마가 다르면 추측해서 쓰지 않는다.

## 연결과 권한

- 알려진 프로젝트는 `Concert_finder`, ref `czjrzylvnewfjnfwjhwf`다. 프로젝트 이름·ref를 연결 도구/현재 앱 환경과 대조한다. 다른 프로젝트에 적용하지 않는다. 환경 파일을 읽으면 UTF-8을 명시하고 키는 출력하지 않는다.
- Supabase 작업은 사용 가능한 Supabase 스킬과 도구 지침을 따른다. 읽기는 Supabase MCP/기존 서버 접근을 우선하고 수정은 기존 인증된 관리자 세션과 `admin_curate_artist` RPC를 우선한다. UI 조작이 필요하면 사용 중인 브라우저 스킬을 읽는다.
- 관리 SQL 경로만 가능한 경우에도 기존 권한 검사·감사 경로를 유지한다. 변경 actor는 현재 사용자의 확인된 관리자 신원이어야 한다. 임의의 관리자/첫 번째 관리자 UUID를 골라 가장하거나 관리자 권한을 만들지 않는다. 인증된 쓰기 경로가 없으면 조사 결과까지 완성하고 실제 적용에 필요한 로그인을 요청한다. 서비스 키를 브라우저에 넣거나 브라우저 저장소에서 토큰을 추출하지 않는다.

## 읽을 필드

`public.bands`: `id, name, aliases, country_code, musicbrainz_id, category, curation_status, curation_reason, curation_evidence_url, updated_at`.

기본 목록은 `curation_status='unreviewed'`, 순서는 이름/ID로 안정적으로 정렬하고 페이지가 있으면 모든 페이지를 읽는다. 필요한 경우 `private.artist_identities`의 `identity_key, band_id, genre, evidence_url`를 관리자 경로로 읽어 공식 프로필과 외부 신원을 연결한다. 이 테이블의 `genre`가 미검수이거나 공식 출처 URL이 있다는 사실만으로 장르 검수가 완료되지는 않는다.

관리자 공개 RPC `admin_catalog()`는 보류·제외를 포함한 bands를 반환한다. 일반 공개 bands 조회는 숨겨진 행을 필터링하므로 전체 검수 목록으로 쓰지 않는다.

## 변경 RPC

`admin_curate_artist` 입력은 다음과 같다. SQL을 사용하는 경우 문자열 결합 대신 바인딩/안전한 리터럴 인코딩을 사용한다.

```json
{
  "target_band_id": "검수한 기존 band UUID",
  "expected_updated_at": "직전 조회의 원본 timestamp 문자열",
  "artist_name": "기존 이름 그대로",
  "country": "기존 ISO 2자리 국가 코드",
  "artist_category": "기존 category 그대로",
  "artist_aliases": ["기존 별칭 그대로"],
  "review_status": "excluded 또는 held",
  "reason": "자동 검수 jpop-or-rock-v1: 신원 대조 결과와 구체적인 판정 근거",
  "evidence_url": "확인한 HTTPS 근거 URL 또는 근거 미확보 시 null"
}
```

- 상태: `unreviewed`, `approved`, `held`, `excluded`.
- 분류: `unclassified`, `domestic_rock`, `overseas_rock`, `jpop`. 대상 밖 분류 값을 새로 만들지 않는다.
- 이유: 공백이 아닌 2,000자 이하. timestamp는 JS Date로 변환하면 마이크로초가 손실될 수 있으므로 원문 문자열을 사용한다.
- 승인에는 분류·외부 신원·공식 근거가 필요하며 외부 신원별 자동 공개 승인이 연결된다. 따라서 제외 검수의 `keep` 결과를 편의상 승인 상태로 저장하지 않는다.
- `ARTIST_NOT_FOUND`: 목록 재조회. `ADMIN_REQUIRED`: 인증/권한을 복구하기 전 쓰기 중단. `EDIT_CONFLICT`: 현재 버전을 재조회해 실제 변경과 판정을 다시 검토한다.

## 검증과 복구

변경 후 bands 상태/이유/URL과 `admin_artist_history(target_band_id)`의 최신 변경 전후 값을 확인한다. 관련 `concert_bands`, `band_follows`와 전체 아티스트/공연/저장 일정의 수가 삭제되지 않았는지 적절한 관리자 조회로 확인한다. 전체 계정의 개별 저장 목록을 결과 파일에 포함하지 않는다.

보류·제외는 기존 외부 공개 승인을 제거하고 재수집/가져오기 우회를 차단한다. `artist-search`는 제외된 아티스트의 가져오기에 `409 ARTIST_NOT_AVAILABLE`을 반환한다. 검증을 위해 실계정으로 다시 가져오거나 찜하지 않아도 상태·기존 DB 검사와 이력으로 적용을 확인할 수 있다. 공개 외부 검색 결과 패널은 W31 전까지 이름을 표시할 수 있지만 가져오기는 차단된다.

사용자가 복구를 요청하면 현재 버전과 검수 근거를 재확인해 RPC로 복구한다. 제외 전 상태가 승인인 경우에도 자동으로 승인을 되살리지 말고 근거를 재검토한다. 이전 JSON 결과는 복구 참고이며 DB 백업이나 현재 상태를 대신하지 않는다.
