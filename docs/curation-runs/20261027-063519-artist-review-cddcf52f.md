# 아티스트 통합 검수 R36 — 2026-10-27 06:35:19 KST

- 실행 `cddcf52f-2ad0-4186-b4cc-5a4e3c72992a`, 같은 고정40팀/76 tasks. 서버 finish `2026-10-26T21:32:55.457776+00:00`와 최신 readback 확인.
- 실제 승인23팀(국내록1/J-pop19/해외록3), research 완료1팀. receipt·현재 bands·외부 신원별 공개승인23 및 관계 보존 확인. 신규/별칭/채널·사진 저장0.
- DB663팀: approved394→417, unreviewed263→240, excluded6 유지. 기존 과거659/630을 상수로 사용하지 않았다.
- 단계: research complete1/deferred5/exception1, approval complete23/deferred6/exception1, channels deferred38/exception1. 76 tasks 모두 checkpoint 후 종료.
- 핵심 검증 후보 풀158→179, 실제 exact-MBID/신원/국가/장르 검증21행 추가. 편성안108→126/200, 미선정74. 세계 인기 상위200위가 아니다.

## 승인과 남은 검수

고성진은 실제 플라워 기타·작곡·록발라드 경력과 MB 개인/그룹 관계를 대조해 domestic_rock으로 승인했다. 한국 개인을 그룹으로 병합하지 않았다. 나머지는 실제 읽은 레이블/아티스트/정식 음반 및 음악 전문 자료로 신원·국가·원작·분류·현재 외부 키·공개 효과 6요건을 보완했다. 기존 approval-only23팀의 research proof는 바이트가 아닌 JSON 내용 대조에서 모두 동일하게 보존됐으며 확인일을 연장하지 않았다.

| 선택 | 아티스트 | 실제 결과 |
| ---: | --- | --- |
| 0 | Ado | 기존 승인 유지·채널 보완 |
| 1 | UVERworld | 기존 승인 유지·채널 보완 |
| 2 | Pulp | 기존 승인 유지·채널 보완 |
| 3 | Red Hot Chili Peppers | 기존 승인 유지·채널 보완 |
| 4 | Rise Against | 기존 승인 유지·채널 보완 |
| 5 | Siouxsie and the Banshees | 기존 승인 유지·채널 보완 |
| 6 | Sublime | 기존 승인 유지·채널 보완 |
| 7 | Talking Heads | 기존 승인 유지·채널 보완 |
| 8 | The Cardigans | 기존 승인 유지·채널 보완 |
| 9 | The Cranberries | 기존 승인 유지·채널 보완 |
| 10 | 이시문 | 요건 보완 대기·DB 상태 유지 |
| 11 | 하덕규 | 요건 보완 대기·DB 상태 유지 |
| 12 | 함춘호 | 요건 보완 대기·DB 상태 유지 |
| 13 | 고성진 | 승인/receipt/readback 확인 |
| 14 | 권정열 | 요건 보완 대기·DB 상태 유지 |
| 15 | 김광진 | 요건 보완 대기·DB 상태 유지 |
| 16 | 홍성준 | 신원 예외·DB 상태 유지 |
| 17 | 愛内里菜 | 승인/receipt/readback 확인 |
| 18 | 早見優 | 승인/receipt/readback 확인 |
| 19 | 春奈るな | 승인/receipt/readback 확인 |
| 20 | 東京女子流 | 승인/receipt/readback 확인 |
| 21 | 松田聖子 | 승인/receipt/readback 확인 |
| 22 | 林原めぐみ | 승인/receipt/readback 확인 |
| 23 | 水樹奈々 | 승인/receipt/readback 확인 |
| 24 | 浜崎あゆみ | 승인/receipt/readback 확인 |
| 25 | 私立恵比寿中学 | 승인/receipt/readback 확인 |
| 26 | 荻野目洋子 | 승인/receipt/readback 확인 |
| 27 | 超ときめき♡宣伝部 | 승인/receipt/readback 확인 |
| 28 | 酒井法子 | 승인/receipt/readback 확인 |
| 29 | 野口五郎 | 승인/receipt/readback 확인 |
| 30 | 雨宮天 | 승인/receipt/readback 확인 |
| 31 | 飯島真理 | 승인/receipt/readback 확인 |
| 32 | 黒木メイサ | 승인/receipt/readback 확인 |
| 33 | ℃‐ute | 승인/receipt/readback 확인 |
| 34 | Alien Sex Fiend | 승인/receipt/readback 확인 |
| 35 | angela | 승인/receipt/readback 확인 |
| 36 | Aqours | 승인/receipt/readback 확인 |
| 37 | Arena | 승인/receipt/readback 확인 |
| 38 | Babybird | 승인/receipt/readback 확인 |
| 39 | Barenaked Ladies | 요건 보완 대기·DB 상태 유지 |

홍성준 MBID `2dbe9c45-ed89-4fa0-b724-fac801749b12`는 engineer·GNRSOUND/mix/editor/recording 관계다. 정식 Bugs OST 크레딧과 대조했으며 동명 BDC/SEONGJUN 가수의 I’m을 같은 신원으로 쓰지 않았다. research/approval/channels는 구체 신원 예외로 보존하고 운영 held/excluded 변경은 하지 않았다.

미완료7팀(이시문·하덕규·함춘호·권정열·김광진·홍성준·Barenaked Ladies)의 개별 원인·다음 요건은 JSON에 보존했다. 공식 대체 근거 부족·본문 timeout/403·장르 경계와 신원 충돌을 구분하며 접근 실패로 제외하지 않았다.

## 채널·지표·호환 경로

- Tokyo Girls Style은 유효 verified profile이 있었으나 channels 미선정이므로 재갱신하지 않았다. 다른 선택 팀은 공식 전체 직접 채널 목적지/API ID 교차 미완료로 저장하지 않았다. MB 링크·팬/Topic·이름만으로 verified를 만들지 않았고 YouTube 페이지 스크래핑/API 이미지 다운로드 없음. YouTube요청0.
- Ado의 Last.fm 요청 MBID e134b52f…에 ca195d97…이 반환돼 새 인기 지표 거절. 이시문/angela는 API6으로 지표 미확인 보존. 장르/승인 자료와 인기 지표를 구분했으며 angela 승인 자체는 공식 가창·음반 근거로 완료했다.
- 실제 제공처HTTP102회=MusicBrainz47(40개인/그룹+추가관계5+내부재시도2)+Last.fm55(신규29팀, 캐시11팀)+YouTube0. 전체차트0. DB/RPC 및 웹 조사 요청과 분리했다. 복사된 helper의 new40/reused0 표시는 최신 accounting으로 정정했다.
- 현재 신규/별칭 CLI·불변 journal·receipt/익명검색 readback 구현은 이미 존재한다. 이번 고정 목록에는 identity task가 없어 mutation0이며 과거 “receipt recovery만 구현”을 현재 상태로 반복하지 않았다. 설치 계약상 mutation 후 승인은 다음 선정 가능한 정상 batch로 defer하는 경계를 유지한다. 필수 BMTH/요네즈 및 Ado/UVERworld 검색 목표는 미완료로 보존.

## 보존·검증

- HEAD ac27e18에서 시작, f267be1/fd45938 조상 포함. queue db6258b5-7ac7-47dd-88b3-dbe0f72d75ef/ownercloud/revision3248→3326/active=null/transfer=null. 서버 유효 통합·legacy lease 전후0. queue 자체 명령의 남은 팀409는 DB 미검수240 및 핵심 미선정74와 다른 집계다.
- provider-cooldowns 및 거절 초안 SHA 그대로. 실제 MusicBrainz 재시도시각은 경과했고 503 내부 재시도 후 성공을 최종 제공처 실패로 쓰지 않았다.
- 코드 변경 없음. 기존 격리 호환/queue 검증은 이전 결과로 재사용하고 이번 신규 테스트 실행0. UTF-8/JSON/40팀/76 tasks/receipt23/원본 proof23/HTTP102/해시/내용·링크/git diff --check 검증.
- 공연 운영 감시·수집·발송/공개ON/DDL/예약변경/배포·push·PR·merge 없음. 전체 카탈로그·사진·핵심200 완료로 보고하지 않는다.
- 상세: [JSON](./20261027-063519-artist-review-cddcf52f.json).
