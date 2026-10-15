# 일괄 조회 입력

Node 22 이상. UTF-8 JSON을 읽고 쓴다. 도구는 Google 고정 API 호스트만 요청하고 입력의 공식 사이트 URL을 직접 fetch하지 않는다. 공식 페이지 교차 검수는 스킬의 웹/브라우저 도구로 수행한다.

```json
{
  "version": 1,
  "artists": [{
    "bandId": "00000000-0000-4000-8000-000000000001",
    "musicBrainzId": "00000000-0000-4000-8000-000000000002",
    "name": "Artist",
    "curationStatus": "unreviewed",
    "identityVersion": "원본 updated_at 문자열",
    "channelUrl": "https://www.youtube.com/@artist",
    "verification": "verified",
    "evidence": [{
      "kind": "official_artist_page",
      "url": "https://official.example.com/artist",
      "linkedChannelUrl": "https://www.youtube.com/@artist",
      "identityMatched": true,
      "checkedAt": "2026-10-15T01:00:00Z"
    }],
    "previousChannelId": null,
    "locked": false
  }]
}
```

이는 가상 예시다. verified와 identityMatched는 원문을 실제 확인한 경우에만 기록한다. 도구는 구조적으로 검사할 뿐 원문 진위를 독립 증명하지 않는다. MB 관계 단독은 verification=candidate, evidence kind=musicbrainz_relation으로 두며 API 조회 성공도 verified로 승격하지 않는다.

- 지원: /channel/UC…·/@handle(Unicode 포함)·/user/username. /c/는 이름 검색으로 대신 확정하지 않고 needs_review. youtu.be·watch·Music browse ID는 채널 ID가 아니다.
- previousChannelId가 있으면 다른 ID로 바뀐 handle을 자동 수용하지 않는다. locked=true는 직접 channel ID와 previousChannelId가 같은 지정만 갱신한다. 잠금은 held/excluded를 우회하지 않는다.
- `--previous=latest.json`: 같은 band ID·MBID·identityVersion·channelUrl·verification·evidence가 유지된 검수 완료 항목만 7일 캐시를 재사용한다. 30일 만료 캐시는 출력에서 삭제한다. output=previous는 atomic 교체를 지원하고 output=input은 거부한다.
- `--limit=N`: 이번 처리 수 제한. 나머지는 deferred이며 다음 실행에서 입력 범위를 좁혀 이어서 처리한다. 검수 근거 원본과 API cache는 분리하며 과거 cache를 별도 백업/커밋하지 않는다.
- YOUTUBE_API_KEY가 없으면 조회하지 않고 key_required로 보고한다. 400/401/403/429는 추가 요청을 중단한다. 네트워크/5xx는 최대 3회 재시도하고 연속 3요청 실패면 나머지 deferred.
- 결과에 키·전체 요청 URL·API 원본·HTML·사진 바이트를 넣지 않는다. DB applied=false가 기본이다.

현재 저장소에는 `.github/workflows/artist-channels.yml`의 일일 갱신과 `scripts/refresh-artist-channels.mjs --upload`가 구현되어 있다. 이는 Codex 예약과 별개이며 DB를 변경하므로 미리보기에서 호출하지 않는다. Codex 예약 연결은 별도 작업이다. 권장 7일 갱신·30일 전 경보/재시도·만료 비노출/삭제·쿼터 중단·마지막 성공/실패를 구현해야 하며 로컬 파일 생성만으로 완료했다고 설명하지 않는다.
