# 공연 운영 읽기 전용 감시 — 2026-10-25 23:32:09 KST

**새 상태 변화2가지를 확인했다.** 기존 수집 경로가 다른 KOPIS 후보9건에 artist_keys/band_ids를 기록했고, 요네즈 후보의 국가 필드는 이전 감시 KR에서 현재 null로 달라졌다. 이 감시가 만든 연결/수정은0건이다.

KOPIS817건 중 artist_keys 없음808→799. 새 참조9건은 신해경 서울·부산2건, 여운 그리고 함께, Awesome Stage X FTISLAND, 코리아 반도네온 페스티벌, 로맨틱 펀치 서울, 최인경 공연, 주현미 공연2건이다. 신해경2건은 현재 approved 신원·MB publication 승인과 연결된다. 로맨틱 펀치 서울은 밴드 자체가 아닌 배인혁 개인 승인으로 연결되어 있어 행사·출연진의 정확한 연결 여부를 확정하지 않았다. 나머지6건의 연결 아티스트는 unreviewed/미승인이다. 새9건 모두 국가·발표·일반예매 시각이 없고 sessions0이라 공개 준비 완료가 아니다. 기존 추적 공백50건은 모두 현재 artist_keys/band_ids0이며 새9건은 그50건의 복구가 아니다. 원래 연결의 정당성·정확한 변경 시각·생산자는 미확정으로 남겼다.

요네즈 후보647835a8은 이전10:23Z 관측 revision3/KR에서 현재revision4/국가null이다. 현재 previous_payload.country도null이므로 단일 직전 payload만으로 국가가 지워진 정확한 순서나 원인을 확정하지 않는다. 아티스트 등록0·공개 공연0, 후보의 artist_keys/band_ids/sessions0·발표/일반/선예매 시각 미완성은 그대로다. 국가를 수동 복원하지 않았다.

| 출처 | 최신 실제 lifecycle | 후보/공개/검수 | 실패 |
| --- | --- | --- | --- |
| kopis | 2026-10-25T12:51:19.181649+00:00 success | 100/0/100 | 0 |
| ualive | 2026-10-25T11:21:33.430667+00:00 success | 1/0/1 | 0 |
| mintpaper | 2026-10-25T11:21:42.975119+00:00 success | 1/0/1 | 0 |
| radwimps | 2026-10-25T11:22:01.000945+00:00 success | 2/0/2 | 0 |
| yes24 | 2026-10-14T10:11:39.417905+00:00 partial | 0/0/0 | 45 |

시각은 UTC다. GitHub 정기 run40188491470는11:21:00~11:24:03Z success, 서버코드9aa7f1a다. 선언 cron17 * * * *와 실제 최근 시작 간격19006초를 구분한다. 최근4회는success이고 과거1회failure이며 새 연속 실패로 보고하지 않는다. KOPIS11:22~11:24Z success43건과 별도 후속12:47~12:51Z success100건을 현재 source lease0과 함께 대조했다. legacy started_at null행을 중복 성공으로 세지 않았다. 자체 임계값으로 누락 횟수·완료를 만들지 않았다.

모든 publication OFF/live_after null, YES24 collection OFF, 수동 차단1건을 유지했다. PF303833 후보0은 미해소다. 출처별 최신 표본의 필수값 fail, 출처 이용조건/실제 전수 중복·취소·중요변경/사용자 동의·기기 조건 unverified, 수동 보호 pass와 과거 격리 fixture 초기무알림 pass를 구분해 기록했다. NOT_READY이며 공개ON 승인만 남은 상태가 아니다.

[Reissue](https://reissuerecords.net/2026/10/22/kenshi-yonezu-2026-2027-world-tour-ghost/) 실제HTTP200 및 Seoul/INSPIRE 확인. 업데이트 날짜를 최초 발표로 삼거나 제한된 날짜 추출에서 회차를 확정하지 않았다. [NOL](https://nol.yanolja.com/ticket/products/26015024) robots 허용/상품HTTP200, 기간2027.01.14~01.17·휠체어석/전화 문구 확인. 상품 기간을 매일 회차로, 전화예매 시각을 일반예매로 해석하지 않는다. 일반/선예매 절대시각은 미검증이고 서면 이용허가는 미확보다. 기존 동일 차단은 반복 통지하지 않았다.

MCR approved/mcr승인, RADWIMPS unreviewed/미승인, 강진·진성 excluded/해당key미승인을 실제 재조회했다. 기존 알림 cron active/매분, 최근5회 succeeded·HTTP200 claimed/sent/failed0. 대상 없음이며 신규 발송/기기 수신을 뜻하지 않는다. 과거 sent36/invalidated7 유지. 사용자별 행·endpoint/키·Vault·cron command는 읽지 않았다.

현재 환경current/running·network enforced/restricted·필요 바인딩ready와 실제 Supabase metadata/SELECT·외부 읽기를 구분해 확인했다. HEAD8d4c928 및 f267be1/fd45938 포함. 복구 경로/.local 연속성 확인. queue2647/cloud/active null/transfer null SHA 37795afd58a2637a55bdee805690838bea6d7caa852acf9d024afaaf3c204c6b 전후 불변. Last.fm0요청, 아티스트 queue 명령0.

scripts/tests가323d5a5 이후 동일함을 이번에 확인해 기존 격리 fixture6파일 성공을 재사용했다. 새 테스트/lint/build0. 과거 fixture를 운영/출처허가/실제기기 수신 검증으로 확대하지 않았다. 이번 기록은 UTF-8/JSON·새9참조/기존50공백 readback·fingerprint·통지 상태·queue SHA·변경 범위/diff를 검증한다. DB/RPC 쓰기·수집/발송 재실행·공개ON·예약/Cron/스키마/권한·배포·push/PR/merge0, 원본 HTML/API이미지/토큰/개인정보 저장0.

새 fingerprint `b99a1824b1c8dbab577789693c113c208959a8cad477294a60e1ba1e769b75ba`와 마지막 통지 항목을 .local latest에 영속화했다. 상세 [JSON](20261025-233209-concert-operations.json).
