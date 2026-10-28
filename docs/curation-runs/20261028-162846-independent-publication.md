# NOL과 독립적인 공식 출처 공개 준비 — 2026-10-28 16:28:46 KST

사용자는 NOL 허가를 출시 전제에서 제외하고 허용된 공식 출처에서 검증되는 공연부터 자동 공개하도록 지시했다. 조건부 승인과 출처별 판단을 현재 rollout 문서에 반영했다. NOL 자료의 무허가 수집·재전재, 근거 없는 공개, 새 워커/예약, 운영 DDL/권한 변경이나 테스트 발송으로 확장하지 않는다.

## 구현 및 실제 평가

- 읽기 전용 `scripts/concert-publication-snapshot.sql`을 현재 운영 스키마에서 실행했다. 공개 후보/정책·출처 lease·아티스트 승인 연결 및 기존 공연 중복 여부를 집계하며 개인정보·push 기기 키·Vault·cron command는 읽지 않는다. 원본 API/HTML/이미지는 Git에 넣지 않았다.
- `scripts/concert-publication-readiness.mjs`와 CLI를 추가했다. NOL 선택 제외가 다른 공식 출처에 전파되지 않으며, 한 출처가 준비되면 다른 출처의 미완료와 관계없이 PARTIAL_LAUNCH_AVAILABLE로 판단한다. 입력은1시간 이내 실제 관측을 요구하고, 이용 조건·adapter 검증·실행기 호환과 후보별 원본 ID/revision·근거·수동 차단·중복·변경 검수는 유지한다.
- 이 도구는 자문/검증 보고서다. DB/RPC 쓰기·등록·수집 재실행·공개 ON·알림을 하지 않는다. 이용 조건과 adapter 인증은 실제 근거가 있어야 보완할 수 있으며 관측된 DB 수만으로 true가 되지 않는다.
- 2026-10-28 16:26:18 KST 실제 snapshot: KOPIS819/UALIVE12/Mint Paper4/RADWIMPS2/YES2443, 합계880건. 검증된 발표·일반예매 시각은 모든 후보에서 미완료이며 eligible0이다. NOL은 EXCLUDED_OPTIONAL이고, 다른 출처는 각자 부족한 실제 요건 때문에 BLOCKED다. 아직 켤 수 있는 출처가 없어 정책을 변경하지 않았다.
- NOL 의존 자료/상품 직접 링크가 있는 후보는 이번 독립 출시에서 별도로 보류한다. 이 판단은 그 출처 전체의 중단을 뜻하지 않는다. KOPIS229건에 해당 항목이 관측됐지만, 모두 발표·회차·일반예매도 미완료여서 NOL 항목만 해결해 공개할 수 있는 상태는 아니다.

## 첫 보완 대상 조사

[UALIVE MCR 공연397](https://ualive.com/concerts/397) 본문에서2026-11-07 19:00을 읽었다. 기존 등록된 [티켓링크 공지62400](https://www.ticketlink.co.kr/help/notice/62400)는 같은 제목/장소지만 공연일이2026-04-18이며 일반예매2025-07-14 12:00이다. 날짜 불일치로 이 예매 시각을11월 공연에 제출하지 않는다. 원래 출처의 변경 시각이나 미표시 발표 시각을 생성하지 않았다.

Mint Paper172는2026-10-17~18로 이미 종료됐고 공식 페이지는 일반예매 절대시각을 확인하기에 부족하다. RADWIMPS15735는2025년 공연 자료다. 과거 후보와 현재 후보를 분리하고 새 행사로 공개하거나 소급 예매 알림을 만들지 않는다.

현재 별도 KOPIS 실행기의 publication ON/live_after 변경 시 중단 계약도 확인했다. 다른 채팅의 실행기를 수정하거나 정책 변경으로 충돌을 유발하지 않았다. 초기 채움 무알림·기존 동의/찜/기기 흐름은 유지한다.

## 검증 및 보존

관련 격리 테스트25개, lint/build 통과. 신규6개 시나리오에서 NOL 독립 출시, 미확인 출처/실행기·오래된 snapshot 거부, 후보별 수동 차단·잘못된 날짜/회차·신원·중복·변경, 휠체어/선예매/다른 시각의 일반예매 승격 금지, NOL 자료를 독립 근거로 위장하지 않음, 과거 오픈 무알림을 확인했다. 기존 SQL/알림 테스트도 통과했으나 실제 발송/기기 수신을 검증한 것은 아니다.

Last.fm 실제 연결 확인1회 HTTP200/API 성공/동일 MBID를16:27:15 KST 확인했다. 연결 검증을 공연 공개나 아티스트 등록 성과로 세지 않는다. Supabase changelog.md는 웹 도구에서 지원하지 않는 markdown content-type 오류로 읽지 못했으며, 설치 함수와 실제 테이블 정의를 읽어 현재 계약을 확인했다. 새로운 Supabase 기능/DDL을 추가하지 않았다.

queue3931/owner cloud/active=null/transfer=null, SHA-256 9dfef5f9fa4b0579258ff8a1d7438e87859f89517d311a5f34dd73afb064b797을 보존했다. init/accept/과거 apply 전송이나 아티스트 queue 쓰기는 없다. 기존 checkout에서 작업했고 f267be1/fd45938 조상 포함을 확인했다.

.local/concert-operations/publication-readiness-latest.json에 새 평가를 저장하고 기존 latest에 현재 출처별 방침/평가를 연결했다. 과거 monitor의 건강 관측 시각·fingerprint·마지막 통지 기록은 덮어쓰지 않았다. 과거 모든 출처에 붙었던 NOL 이용허가 문구는 현재 출처별 방침으로 대체했다.
