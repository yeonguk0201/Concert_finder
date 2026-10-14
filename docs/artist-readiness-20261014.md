# W29 목록·근거 준비 점검 · 2026-10-14

운영 DB 550팀의 현재 신원·별칭·관리 상태·버전을 10/13 검수 보고서와 대조했다. 이번 결과는 전 항목의 공식 자료를 새로 조사하거나 DB 상태를 변경한 검수가 아니다. 이전 보고서의 ‘유지 533’만으로 범주별 승인과 사진 준비가 끝났다고 판단하지 않는다.

## 결과

| 준비 점검 결과 | 팀 수 | 의미 |
| --- | ---: | --- |
| 기존 유지 근거 재사용 가능 | 514 | 동일 정책·신원·별칭·상태·버전, 90일 이내, placeholder 근거 제외. 자동 승인하지 않음 |
| 재검수 필요 | 30 | 신규 5, 이전 보류 6, placeholder/잘못된 쿼리 근거 18, 버전 변경 1 |
| 기존 상태 보존 | 6 | 기존 제외를 덮어쓰거나 복구하지 않음 |

실제 DB는 미검수 544·제외 6·승인/보류 0이다. 기존 강진 제외 상태를 확인했다. 김수희·윤종신의 이전 근거는 `https://music.apple.com/us/artist/` 공통 주소뿐이어서 재사용을 중단했다. 해당 이름만으로 트로트/발라드라 단정해 제외하지 않았으며 공식 신원·실제 록/J-pop 활동 및 상충 근거 검토가 필요하다. 이전 ‘판단 보류 6’도 실제 DB held로 처리된 상태가 아니다.

항목별 ID·신원·별칭·근거·원본 마이크로초 버전·재검수 이유·사진 상태는 [준비 점검 JSON](curation-runs/20261014-readiness-report.json)에 보관했다. `appliedChanges=[]`이며 모든 항목의 `applied=false`다.

## 초기 우선 목록과 누락

[우선 목록 manifest](../supabase/manual/priority-artists.json)에 국내 록 5·J-pop 9·해외 록 6, 총 20팀을 확정했다. 10/12의 외부 ID 확인 manifest를 사용하며 초기 기능 검증용 목록이다. 인기순 또는 범주 전체를 대표하는 목록으로 표현하지 않는다.

- 국내 록: DAY6, Silica Gel, SURL, THORNAPPLE, TOUCHED.
- J-pop: Mrs. GREEN APPLE, ONE OK ROCK, RADWIMPS, King Gnu, SEKAI NO OWARI, ヨルシカ, KANA-BOON, ELLEGARDEN, Ado.
- 해외 록: Radiohead, Coldplay, Foo Fighters, Arctic Monkeys, Linkin Park, My Chemical Romance.

20팀의 외부 ID는 모두 DB에 있고 seed의 기대 별칭 누락은 없다. DB의 실제 장르 분류는 여전히 미분류이며 manifest의 계획 분류를 DB 적용으로 보지 않는다. DAY6의 이전 근거 URL에는 `undefined` 쿼리가 있어 새 근거 확인 대상으로 표시했다.

추가 누락 점검 후보 10팀 중 NELL·YB·국카스텐·혁오·잔나비·YOASOBI·Vaundy·요네즈 켄시는 현재 이름/별칭에서 찾지 못했다. Nirvana·Metallica는 기존 ID가 있다. 이 8팀은 **이름으로 확인되지 않은 후보**이며 외부 ID 대조 전 신규로 단정하거나 임의 MBID로 추가하지 않는다. 국카스텐 멤버 하현우·전규호·이정길의 개인 ID가 있다는 사실이 밴드 ID의 존재를 대신하지 않는다.

## 동명·별칭 충돌

정규화된 `Stones`가 SixTONES와 The Rolling Stones 양쪽에 연결돼 있다. 보고서에 두 band ID·MBID를 기록했다. 자동 병합·별칭 삭제를 하지 않았으며 W31에서 이름만으로 연결되지 않는지 검증할 사례로 사용한다.

## 도구와 검증

`scripts/artist-readiness.mjs`는 UTF-8 스냅샷·이전 보고서를 읽어 결과만 생성한다. DB 자격 증명·쓰기 기능은 없다. 단순 이름 일치는 누락 힌트에만 쓰고 우선 목록 포함 여부는 MBID로 판정한다. `reusable_keep`는 조사 완료/승인 상태를 새로 만드는 명칭이 아니다.

```sh
node scripts/artist-readiness.mjs snapshot.json docs/curation-runs/20261013-curation-report.json output.json
node --test tests/artist-readiness.test.mjs
```

테스트 2개로 신원/별칭/버전 변경, 오래되거나 잘못된 날짜, 보류, placeholder URL, 기존 제외 보존, 동명 충돌, MBID 누락과 사진 확보 집계 분리를 검증했다. 실제 550행에 실행해 514/30/6과 충돌 1개를 확인했다.

## 다음 검수

30팀의 구체적인 공식 근거 확보·장르 경계/신원 검수, 누락 후보 외부 ID 대조와 등록, 범주별 승인 및 실제 상태 변경 이력 재확인이 남아 있다. 이미 남아 있는 514팀도 승인 시 기존 근거를 해당 아티스트 신원과 대조하고 승인 요건을 별도로 확인한다. W29 전체 완료로 표시하지 않는다. 사진 확보/업로드는 [로드맵](development-roadmap.md)의 W30에서 이어간다.
