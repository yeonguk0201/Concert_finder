# 공연 운영 읽기 전용 감시 — 2026-10-27 03:29:53 KST

## 새 관측

- KOPIS 추가 2회 partial: 14:52 UTC 후보/검수99·실패1(PF303833 필수 공연 필드 누락), 16:52 UTC 후보/검수98·실패2(PF295748/PF295807 HTTP400). 최신 3회 연속 partial이며 앞선12:50 실행은 success100. 공개0, 재실행 없음.
- 공연 후보3건의 기존 artist_keys/band_ids가 비어 있음: Awesome Stage Special Concert: Redoor, 우리들의 발라드 TOP6 팬콘서트: TIMELESS, 두시 음악 살롱, 유사랑 콰르텟 (12월). 각 revision6, previous_payload에는 이전 키가 남아 있음. 이전 연결 아티스트3명 모두 미검수/공개승인 없음. 제거 의도·원인은 미확인.

## 서버·공개 상태

- GitHub 최신 예약 실행40326222813은 이전과 동일한 실패다. 선언17 * * * * 대비 관측18:26 UTC까지 후속 실행은 보이지 않는다(마지막 생성12:55 UTC). 같은 실패는 재통지하지 않는다. 다른 채팅 실행기와 GitHub의 수집 결과를 같은 실행으로 단정하지 않는다.
- source lease0. 알림 cron active/매분, 최근5회 succeeded 및 HTTP200/claimed0/sent0/failed0. 과거 sent36/invalidated7 그대로. 실제 기기 수신은 미검증.
- 모든 source publicationOFF/live_after=null, YES24 collectionOFF 유지. KOPIS819건 중 키 없음804(이전801), announcement/일반예매/회차 없음819. 추적64 중 키 없음62(이전61), rolling gap17(이전14), 현재 비어있지 않은 참조15(이전18).
- 요네즈 후보revision7, 국가KR은 이전 원본 관측에도 존재했다. 국가 신규 보완이라고 한 초기 설명을 정정했다. 아티스트0·키/연결/회차0·발표/일반 및 선예매 절대시각 미확인 유지. Reissue/NOL HTTP200은 연결 증거이며 업데이트 일자·휠체어 전화예매·상품기간으로 최초 발표/일반예매/매일 회차를 확정하지 않는다. NOL 서면 이용허가 없음.

## 출시 전 검증

출처별 실제 필수 공연 필드는 fail, 전체 후보의 신원·장르/승인·중복/취소/중요 변경·이용조건·개인 동의/기기 조건은 unverified다. 수동OFF/차단 보존은 pass. 초기 채움 무알림은 기존 격리 fixture pass만 재사용하며 운영 검증으로 확대하지 않는다. READY_FOR_PUBLICATION_APPROVAL 출처는 없다.

| 출처 | 최신 상태 | 후보 | 공개 | 검수 | 실패 기록 |
| --- | --- | ---: | ---: | ---: | ---: |
| kopis | partial | 98 | 0 | 98 | 2 |
| mintpaper | success | 1 | 0 | 1 | 0 |
| radwimps | success | 2 | 0 | 2 | 0 |
| ualive | success | 1 | 0 | 1 | 0 |
| yes24 | partial | 0 | 0 | 0 | 45 |

## 연결 소실 readback

| 후보 | 이전→현재 revision | 이전 아티스트 키 | 현재 키/밴드 |
| --- | --- | --- | --- |
| Awesome Stage Special Concert: Redoor (`8d80e234-6194-4eb1-88e8-4b98a7cc6c25`) | 5→6 | mb:a42ff7dd-80ab-4076-bb11-9bea40da307c | 0/0 |
| 우리들의 발라드 TOP6 팬콘서트: TIMELESS (`9ba59609-3e63-43f8-84a4-28948c13fed3`) | 5→6 | mb:c402a5e2-d7e3-4211-a42b-7e7ee1f16a94 | 0/0 |
| 두시 음악 살롱, 유사랑 콰르텟 (12월) (`7cd8f6e6-60b5-4056-8fdb-c8f11ac96019`) | 5→6 | mb:9b06a92f-be30-42c7-83b5-e5df7b599bd5 | 0/0 |

이전 연결은 최승현/이예지/유사랑이며 모두 unreviewed, 해당 MBID 공개승인 false다. 이름만으로 Redoor 공연 신원 일치를 확정하지 않으며, 연결 제거를 승인 검수 완료로 세지 않는다. 원인·의도는 미확인이다.

## 보존·검증

- checkout037521d, f267be1/fd45938 조상 포함. queue revision3248, ownercloud, active/transfer=null. SHA-256 전후 `339875c1c3cc3e5e579e55c196102bf95b0a2f9702d319c77fac642eafeb07c8` 동일. queue 명령/DB·RPC 쓰기/수집·발송·스케줄 변경 없음.
- 환경 현재/running, 네트워크 enforced/restricted 및 바인딩ready. 실제 Last.fm getInfo1회 HTTP200/API성공/동일MBID 확인; 후보 발굴·지표 갱신 없음.
- scripts/tests는 f74ac31 이후 변경 없음(diff exit0). 기존 fixture3파일 검증 재사용, 신규 테스트 실행0. 문서 UTF-8/JSON/변경 범위/git diff --check 확인.
- 아티스트 승인 추가 조회의 잘못된 band_id 가정으로 읽기 쿼리1회 실패 후 실제 정의를 읽어 identity_key로 정상 재조회했다. 최초 단순 오류분류도 whitelist 재조회로 보완했다.
- 원본 HTML/API 이미지/토큰/개인정보·cron command·Vault를 읽거나 저장하지 않았다. 개인 행은 조회하지 않고 발송 집계만 사용했다.
- 상세 상태: [JSON](./20261027-032953-concert-operations.json). 이전 관측: [M22](./20261026-233615-concert-operations.json).
