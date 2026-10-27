# 공연 운영 감시 M19 — 2026-10-26 11:28:33 KST

운영DB를 읽기 전용으로 점검했다. GitHub 최신 예약 실행40248775961이 `Collect and upload candidates` 단계에서 실패했다(00:19:14–00:23:22Z). 보고서 보존 단계는 성공했으며 직전4회는 성공이므로 연속 실패가 아니다.

같은 시각 KOPIS lifecycle은 partial99/공개0/검수99/실패1이고, SQL whitelist로 **PF303833 KOPIS_EVENT_FIELDS_MISSING**을 확인했다. 전체 오류문자열·키포함URL·로그는 읽지 않았다. 이후01:50:15–01:51:01Z의 별도 KOPIS success6/공개0/검수6/실패0이 있으나 대상 범위가 다르고 PF303833 후보는0이므로 개별 실패 해소로 세지 않는다. 정확한 다른 채팅 실행기 코드/주체는 공유됐다고 가정하지 않았다.

## 참조와 출시 전 조건

- Redoor 후보는 revision5에 참조1개가 다시 나타났다. 연결 대상은 미검수 개인 **최승현**, 공개 신원 승인없음이다. 밴드 전체 신원 복구/정확 매칭/승인 완료로 세지 않는다.
- 알려진64건 중 빈참조61→60, 현재 previous_payload rolling 공백24→15. rolling 감소를 과거9건 해소로 바꾸지 않고 알려진64건을 계속 보존했다. 새 rolling 공백 ID0. 전체KOPIS 빈참조805→802이나 개별 변화 원인/시각은 미확인이다.
- RADWIMPS의 현재 approved와 `radwimps`/MB key 공개 승인 연결을 실제 읽었다. 아티스트 단계 변화이며 공연 후보 revision3에는 발표검증/정확 일반·선예매시각/국가/회차 공백이 여전히 있다. 이 감시는 아티스트 쓰기를 실행하지 않았다.
- source별 최신: ualive success1, mintpaper success1, radwimps success2, kopis success6. 모두공개0. YES24 collectionOFF/기존 partial45는 과거 기록이다. 유효 source lease0.
- GitHub 선언 cron `17 * * * *`, 최근 시작간격9254초. 실제지연과 실패를 구분하고 임의 임계값으로 완료/장애 해소를 정하지 않았다.
- 요네즈 아티스트0/후보revision6 pending, 신원·발표·예매·회차 공백 유지. Reissue/NOL 현재HTTP200 및 robots 허용을 확인했다. 휠체어석 전화예매를 일반예매로, 업데이트일을 최초 발표로, 상품기간을 매일 회차로 확정하지 않았다. NOL 서면허가/정확일반·선예매시각 미확정은 재통지하지 않는다.
- 모든 source publicationOFF/live_after null, 수동차단1 유지. 실제후보 필수값 fail, 소스이용조건/중복/취소/중요변경/개인동의·기기조건 unverified. **NOT_READY**, 공개 승인만 남은 상태가 아니다.

## 알림·기록 검증

기존 매분 cron active, 최근5회 succeeded 및 HTTP200/claimed0/sent0/failed0. 과거 sent36/invalidated7 유지. 빈 대상 응답은 새 발송/실제기기 수신 증거가 아니다. 테스트발송/동의·찜 생성0.

이전M18 격리3파일 통과 결과를 scripts/tests 변경없음(diff f74ac31 exit0) 확인 후 재사용했다. 새테스트0이며 운영 검증 완료로 확대하지 않았다. queue revision2886 active=null/transfer=null 및 SHA 보존, f267be1/fd45938 포함·최신 .local 연속성 확인. UTF-8/JSON/내용/git diff 검증 후 문서만 로컬커밋한다. DB/RPC쓰기·아티스트queue명령·공연수집·공개ON·발송·예약변경·DDL·배포·push/PR/merge0.

[현재 출처별 집계·참조·남은 요건](20261026-112833-concert-operations.json)
