# API 공연 공개 런타임 정규 릴리스 — v4 운영 연결 완료·예약 중지

이 문서는 설치 단계의 기록이다. 후속 [예약 재개·첫 공개](20261109-api-first-scheduler-first-run.md)와 [현재 로컬 인계](../release/local-ui-and-concert-dedup-handoff.md)를 함께 읽는다.

2026-11-09 UTC. 원본 `/workspace/Concert_finder`, 조상 `8096bd58fd734121c4e5d490f141f91022fae4b6`, 시작 HEAD `b386f0d6f072ef6fa195c7d0850a7fea32879c43`. Node v24.19.0, 기존 의존성·시크릿 바인딩·프록시/TLS를 유지했다.

## 완료한 변경과 검증

- PR [#77](https://github.com/yeonguk0201/Concert_finder/pull/77)의 인계를 읽고 API 코드/SQL을 원본의 후속과 문맥 비교했다. 원래 raw quarantine·runner 실패 UUID·날짜 정밀도와 검수 상태를 전체 파일 교체로 되돌리지 않았다.
- 원본 request-context HTTP400 대기를 공통 모듈로 연결했다. 목록 일자 이동·겹친 상세 실패에서도 1h→6h→24h, 기존 미래 nextAttemptAt, 미확정 24h를 보존한다.
- PR [#78](https://github.com/yeonguk0201/Concert_finder/pull/78), [#79](https://github.com/yeonguk0201/Concert_finder/pull/79)를 정규 dev→main 절차로 병합했다. main `634c55de5a2f94d4758e912a0902b013eb02e5e0`, tree `ef29877967befbb5064366b060ecc5a0bfca9858`.
- Vercel production `dpl_9e4YzwFBazb323vyPftNvDQmsyaQ`, 위 main SHA, READY 확인. CI [기능](https://github.com/yeonguk0201/Concert_finder/actions/runs/42594073687)·[릴리스 PR](https://github.com/yeonguk0201/Concert_finder/actions/runs/42594528981)·[main push](https://github.com/yeonguk0201/Concert_finder/actions/runs/42617078701) 전체 통과.
- 원본 Node 309 통과, Vitest 114 통과 후 원격 dev의 고정 날짜 fixture를 반영해 관련 App 25/25 재검증. 신규 운영 기준 SQL 검사 1/1, lint/build 통과. Chromium 데스크톱 1440×1000/모바일 390×844의 가상 API 미확인 표시·가로 넘침 없음·page error 0 확인. 과거 SQL 3개의 기존 EOF 공백은 원격 검토 바이트 그대로 보존했다.
- 운영의 기존 `admin_ingest_catalog` MD5 `7eb3bb5ec9c207e2ca97a26795f31500`가 정규 KOPIS migration과 일치함을 확인했다. 선택 Reissue wrapper가 있는 격리 fixture와 달라, 실제 기준을 정규 SQL만으로 별도 재현했다. 검토한 v4 pin은 executor `ae38470098f40cb3aec9582172c0b9c4`, API facts `3c356e529b6e1dc2fe04041c64a3248d`. 운영 조회값을 자동 승인한 값이 아니다.

## 원본 보존과 일반 실행 주체

원본 baseline·고정 14개 진행 목록·보류·revision·통지 지문은 변경하지 않았다. 네 파일을 바이트 그대로 백업하고 비공개 Storage `concert-scheduler-state`의 `kopis/original.json.gz`와 `kopis/current.json.gz`에 저장·읽기 확인했다. `public=false`, 6MiB 제한, 새 사용자 RLS 정책 없음, 익명 다운로드 거절을 실제 확인했다. 원문 상태는 Git/공개 artifact에 넣지 않았다.

GitHub owner `github-actions-kopis-api-v1`, generation 1, phase **paused**, state SHA `61f80c2fe05c81bdcb03377bee4fd26d79ffdfbda2a88940a0eccdc2761ea4d1`이다. 원래 환경의 `scheduler-owner.json`도 paused/설치 대기로 기록했고 기존 runner가 API 요청 전에 `COLLECTION_OWNER_TRANSFERRED`로 거절함을 확인했다. 새 workflow의 정기 실행은 repository switch와 idle 상태를 모두 요구한다. 다른 source workflow는 KOPIS를 항상 제외한다.

기존 ChatGPT 예약 3개가 중지임을 마지막 읽기에서 확인했다. 기존 수집 예약도 `is_enabled=false`이며 수정하지 않았다. 일반 scheduler도 재개하지 않았다.

### 원본 전후 SHA256 — 동일

| 파일 | 설치 전 = 설치 후 |
| --- | --- |
| `latest.json` | `36cae7de7f911495f66c594c7306698125967d84473bcf872e8a0c9ec811e882` |
| `review-checkpoint.json` | `d6edd2ba62ad44f23e93a1455c8b0d33cc83aa61dbe0e863c92685c42b5c5d6e` |
| `review-batch-current.json` | `73eb8bcf2e51665422b78f84d4bec0bbd8b33170b2c575b1cb40b065b0e40d86` |
| `schedule-observation.json` | `4be58381d5142014d84cca8138be060fcd99549b7449e95f2d9d325a7b033282` |

### 실제 설치 코드 SHA256

| 파일 | SHA256 |
| --- | --- |
| `scripts/collect-concerts-scheduled.mjs` | `39892b893ad8e30b4ccbda4aaaf4a9a6e4f047202cb0d65fd60ca1724efef34e` |
| `scripts/collection-cooldown.mjs` | `bf0f7cae5ccde8f875a1620e988d27acd515e200d040ed43a58cd79dd3f38abb` |
| `scripts/kopis-api-facts.mjs` | `d236501d63958b6bc2e2fe2bbf918f1503bac7dcaa0dd5907fa597641f868bdc` |
| `scripts/api-first-publication.mjs` | `4d5d9aa10fab1cdfaab35c4bf57974fd01976b767cc793f5aa4cdd33f2cfb5bb` |
| `scripts/concert-scheduler-state.mjs` | `5a9538c4b49a6871265b5997bc562012737b8d6e9319849fbf4171bc01043ff9` |
| `supabase/migrations/20261109084718_api_first_silent_publication.sql` | `e57f1ec7abdcfe1b23fa082be3842534a6c65032cb4a9d26352cf0ca5d14b1b1` |

## 12:29 UTC 당시 차단 — 후속 승인으로 해소

자동 승인 검토가 `execute_sql`을 통한 **KOPIS publication 임시 OFF**를 거절했다. 이유는 기존 사용자의 직접 SQL writer 금지와 충돌하며 이 구체적인 운영 정책 변경의 명확한 승인이 부족하다는 것이다. 다른 writer·JWT 가장·migration guard 제거·간접 SQL로 우회하지 않았다.

거절 뒤 읽기에서 KOPIS collection/publication ON, live_after=null, 다른 출처 공개 OFF, active lease 0, 공개 공연 9개를 확인했다. 실제 서비스 capability는 여전히 `publication-facts-v3`/reviewed_release=true/continuous_review=true/executor `d95b0e3e9edda18b7adc9a626589074f`. v4 migration은 **미적용**, API context도 미설치다. 익명 공개 공연 읽기는 9개, 비공개 상태 읽기는 거절이었다.

Actions [읽기 전용 binding 확인](https://github.com/yeonguk0201/Concert_finder/actions/runs/42617078731)은 push 이벤트이므로 수집을 실행하지 않는다. 최초 확인은 Storage bootstrap 전의 STATE_UNAVAILABLE였다. bootstrap 후 같은 읽기 전용 확인을 1회 재실행했고, 실제 `API_PUBLICATION_CONTRACT_CHANGED`로 멈췄다(job 129161346141). 기존 세 시크릿의 존재 확인과 비공개 상태 읽기는 통과했으나 v4 계약 설치가 막혀 연결 완료로 세지 않는다. 실제 source begin/수집/공개·알림 claim/send/test·아티스트 writer 호출은 하지 않았다. 격리 검사의 공개/알림0을 운영 receipt로 세지 않는다.

## 당시 남은 순서 — 아래 승인 후 완료 기록 참고

1. 사용자에게 KOPIS 정책 SQL 전환에 대한 명시적 승인 또는 지원 admin 경로에서의 OFF 전환을 받는다. 승인 전 SQL writer/다른 경로로 재시도하지 않는다.
2. 최신 digest·모든 publication OFF/live_after null·idle lease를 확인하고 정규 검토 SQL `20261109084718_api_first_silent_publication.sql`만 지원 apply_migration으로 설치한다. 실제 migration 이력/SQL SHA를 기록하고 과거 migration 재적용·전체 db push/history repair를 하지 않는다.
3. 독립 검증한 두 digest와 실제 v4 capability를 대조한 뒤 검토한 KOPIS 사실 이용 설정 및 기존 KOPIS ON/live_after=null을 연결한다. 다른 정책은 유지한다.
4. paused 상태 그대로 실제 GitHub 바인딩/Storage/서버 계약의 읽기 전용 확인을 완료한다. 명시적인 별도 재개 지시 전 어떠한 예약도 켜지 않는다. 최초 실제 공개와 다음 정기 회차는 재개 후 별도 관측한다.

로컬 코드 커밋: `e00c678`, `1de3f36`. 위 승인 전 관측은 당시 미완료 기록이며, 아래 승인 후 설치 readback과 구분한다.

## 사용자 승인 후 운영 연결 완료

사용자가 “승인할게”로 KOPIS 정책 SQL OFF→검토 v4 설치→기존 ON/null 복원을 명시적으로 승인했다. 같은 지원 도구로 정책을 잠시 OFF로 전환한 뒤, 검토된 SQL을 수정 없이 `apply_migration`으로 설치했다. 거절된 작업을 다른 writer나 우회 경로로 실행하지 않았다.

- 실제 설치 이력: **20261109123447 / api_first_silent_publication**. 검토 원본 파일 버전 **20261109084718**과 도구가 기록한 실제 적용 버전은 구분한다. SQL SHA256 `e57f1ec7abdcfe1b23fa082be3842534a6c65032cb4a9d26352cf0ca5d14b1b1`. 과거 migration 재적용·전체 db push·history repair는 하지 않았다. 향후 migration 대조 시 이 매핑을 먼저 확인한다.
- 실제 service HTTP capability: `publication-facts-v4`, `api_facts_contract=kopis-api-facts-v1`, reviewed_release/continuous_review=true. executor `ae38470098f40cb3aec9582172c0b9c4`, API facts `3c356e529b6e1dc2fe04041c64a3248d`가 정규 SQL로 독립 검증한 두 pin과 일치했다.
- KOPIS만 collection/publication ON·live_after=null로 복원했다. 검토한 `kopis-api-source-use.json`의 사실 전용 근거와 **원래 verified_at 2026-11-09T08:52:59.000Z**를 연결했다. 다른 출처 공개 OFF, YES24 collection OFF, 모든 live_after null을 유지했다. 본문/이미지/로고/상품 딥링크의 허가로 확대하지 않았다.
- 2026-11-09T12:37:20.815630Z DB readback: 공개 공연 9개 유지, 새 API 공연 0개, 릴리스 이후 nonlegacy KOPIS run 0개, active lease 0. 익명 공개 읽기 9개와 비공개 state 다운로드 거절을 확인했다. anon/authenticated의 completion/context 실행 권한은 모두 false다.
- 실제 GitHub [읽기 전용 연결 확인](https://github.com/yeonguk0201/Concert_finder/actions/runs/42617078731), job **129164000007**이 성공했다. 결과는 `skipped=scheduler_paused`, generation1/phase paused, 원래 state SHA·네 파일 SHA 동일 및 v4 두 digest/정책/출처 설정 일치였다. 설치 전 STATE_UNAVAILABLE·v3 계약 불일치 실패는 이 성공 확인으로 해소됐다.
- 새 일반 scheduler와 기존 ChatGPT 예약 3개는 계속 중지다. root owner guard의 설치 메타데이터만 `v4_connected_paused`로 갱신했다. 원본 latest·검수 checkpoint·고정 목록·관측/통지 지문은 쓰지 않았다. 아티스트/queue/감시·발송 역할과 예약은 변경하지 않았다.
- 보안 advisor의 기존 INFO27/anon definer WARN21/authenticated definer WARN28/password WARN1 수는 설치 전후 같았다. 새 executor/context 권한은 위 실제 readback으로 별도 확인했다. 관련 기존 advisory 안내: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable . 이번 범위 밖 기존 권한/인증 설정은 변경하지 않았다.

이번 완료 범위는 **정규 코드 릴리스·v4 운영 계약/출처 연결·원본 영속 상태 보존·실제 일반 실행기의 읽기 전용 확인**이다. 실제 source begin/수집/새 공개/알림 worker 호출은 0회다. 공개한 공연이 없으므로 이번 설치를 새 공연의 운영 공개·연결 알림0 receipt로 세지 않는다. 첫 실제 공개와 다음 정기 회차는 별도 재개 지시 후 확인해야 한다. 추가 설치나 공연별 공개 승인을 다시 요구하는 정상 경로는 만들지 않았다.
