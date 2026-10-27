# 공연 운영 감시 M18 — 2026-10-26 07:31:10 KST

운영 DB를 읽기 전용으로 점검했다. KOPIS의 기존 공백59건 중3건에 참조가 다시 생겼고, 새 공백5건을 발견했다. 추적64건 중 현재 빈 참조61건이며, 현재 previous_payload 기준 rolling 공백24건은 별도 집계다. 전체 신원 복구/공개 완료가 아니다.

- 참조 재관측: 이창섭 Unknown 대구, 김장훈 부산, The entry to Jazz 서울 성수. 앞2건은 승인 및 MB publication identity 연결을 확인했다. Jazz는 미검수이며 이전2개 키 중 현재1개만 보여 완전 복구로 세지 않는다. 모두 국가·발표·일반/선예매 절대시각·회차가 미완료다.
- 새 공백: 트롯 콘서트: 에녹 X 수찬 [군산], 재즈 콘서트: 윤어진 재즈 프로젝트 X 김서안 X 신인권 [서천], 허각 전국투어 콘서트, 공연각: 사이 [부산], 다이나믹 듀오 단독 콘서트: 가끔씩 오래 보자 [대전], 경기도 문화의 날, 이선정 밴드: 진짜 음악에 취하다! [안성]. 이전 payload 키와 현재 빈 참조를 확인했으며 원래 연결의 정확성·변경 시각·실행 주체는 미확인이다. 직접 연결/수집 재실행 없음.
- KOPIS 최근3회 success100/공개0/검수100/실패0. 기존 PF303833 후보는 여전히0이므로 개별 실패 해소로 확정하지 않는다. 나머지 활성 출처 최신 success, YES24 collection OFF 유지. source lease0.
- GitHub 최신 예약 실행21:45Z 성공, 직전19:01:18Z와의 간격9822초. 선언 cron `17 * * * *`보다 실제 실행 간격이 길지만 최근5회 성공이고 연속 실패로 분류하지 않았다. 다른 채팅 수집 코드/실행 주체를 자동 공유한다고 가정하지 않았다.
- 알림 cron 매분 active, 최근5회 succeeded/HTTP200/claimed0/sent0/failed0. 과거 sent36/invalidated7 그대로다. 빈 대상 응답이며 실제 신규 발송/기기 수신 증거가 아니다.
- 요네즈: 아티스트 검색0, 후보 revision5/pending/참조·회차 없음. Reissue와 NOL 현재 HTTP200/robots 허용을 확인했으나 일반/선예매 시각 미검증, NOL 서면 허가 미확보다. 업데이트 일자를 최초 발표로, 휠체어석 전화예매를 일반예매로 바꾸지 않았다. 동일 미변경 차단은 재통지하지 않는다.
- 모든 source publication OFF/live_after null, 수동 차단1 유지. 실제 후보 필수값 fail·출처 이용 조건/중복/취소/중요 변경/기기 조건 unverified. **NOT_READY**, 공개 승인만 남은 상태가 아니다.

격리 테스트 nol/collection-artist-links/notification-worker 3파일 통과(실패0). Mock/PGlite 검증으로 운영 가짜 후보·동의·발송0. 과거6파일 fixture 결과는 별도 보존하며 새 실행으로 세지 않았다. 원본HTML/API이미지/토큰/개인 사용자행 저장 없음.

HEAD fd7a2d2에서 f267be1/fd45938 포함 확인. queue revision2802 active=null/transfer=null 및 SHA 읽기 전용 보존. 최신 .local/fingerprint/마지막 통지 상태를 갱신했다. DB/RPC쓰기·아티스트queue명령·공연수집·공개ON·발송·Cron변경·배포·push/PR/merge0. UTF-8/JSON/내용/git diff 검증 후 이 문서만 로컬 커밋한다.

[현재 집계·개별 참조·출처별 조건](20261026-073110-concert-operations.json)
