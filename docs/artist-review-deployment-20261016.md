# 아티스트 검수 실행기 운영 배포 결과

후속 상태: 2026-10-17 KST 사용자 관리자 재개 뒤 두 팀 모두 실제 검수 complete, 공식 채널 verified로 저장됐다. 중복 체크포인트 이후에도 채널 이력은 각 1건이며 원래 장르 상태·band 버전은 유지됐다. 최신 [성공 검증 기록](curation-runs/20261017-0048-KST-runner-success.json)을 따른다. 아래는 최초 배포 시점의 실패 기록이다.

2026-10-16 16:26~16:29 KST, 사용자가 현재 대화에서 운영 migration·Edge 배포·두 팀 소량 검증을 직접 승인한 뒤 수행했다. 이전 자동 승인 검토 거부 이후 승인 근거가 추가된 작업이다.

## 배포 및 인증

- 프로젝트: `Concert_finder` / `czjrzylvnewfjnfwjhwf`.
- 기존 `202610160001_artist_review_runner.sql`을 `artist_review_runner` migration으로 적용했다.
- `artist-review-runner` Edge 함수 v1이 ACTIVE다. 자체 전용 secret 인증을 사용하므로 gateway JWT 검증은 껐다.
- 클라우드 환경 상태 도구에서 최신 관측과 네트워크 `enforced`, runner secret·YouTube 키·환경변수 `ready`를 확인했다. **클라우드 관측은 Supabase 서버의 비밀키 설정을 뜻하지 않는다.**
- 인증 없는 POST는 401 `UNAUTHORIZED`. 클라우드 runner secret의 begin은 대상 0팀에서 `idle`, notices는 빈 배열이었다. 대상 0 경로는 공식 출처/YouTube provider를 호출하지 않는다.
- 운영 ACL 조회에서 새 서비스 RPC 8개는 anon/authenticated 실행 불가, service_role 실행 가능이었다. `admin_resume_artist_review`는 authenticated만 실행 가능하고 함수 내부의 기존 관리자 검사도 유지한다.

## 소량 검증 결과

사용자 승인 범위의 두 팀만 최신 신원·버전·수동 판단 보호 조건을 확인해 활성화했다. `=LOVE`는 `equal-love.jp`, `10,000 Maniacs`는 `maniacs.com`만 허용했다. ℃‐ute와 나머지 아티스트는 활성화하지 않았다.

실행 ID: `d62345d4-f212-407a-b312-bbf9c9ac5729`.

1. begin에서 정확히 두 팀을 할당받았고 guard는 조사 가능을 반환했다.
2. 공식 소개와 채널 직접 링크를 다시 확인했다. =LOVE는 공식 음반 목록도 대조했다.
3. =LOVE checkpoint는 서버 공식 근거 검증 다음 단계에서 `YOUTUBE_KEY_REQUIRED`로 거부됐다. Edge 서버의 `Deno.env.get('YOUTUBE_API_KEY')`가 비어 있어 YouTube 채널 존재 검증을 실행할 수 없었다. 실패한 checkpoint는 채널이나 완료 근거를 커밋하지 않았다.
4. 동일 서버 설정을 쓰는 다른 팀에 같은 실패 요청을 반복하지 않았다. 두 팀을 `YOUTUBE_ACTION_REQUIRED`로 defer했다. 각 checkpoint는 `action_required`, failures=0으로 영구 저장됐다.
5. finish는 complete=0, failed=0, actionRequired=2로 종료했다. 운영 DB의 finished_at은 `2026-10-16T07:28:20.231253Z`다.
6. DB 재조회에서 두 팀의 `unreviewed` 상태·원래 버전 보존, 채널 행 없음, 전체 미검수 564/기존 제외 6 보존을 확인했다.
7. queue에서 두 팀의 조치 목록을 읽었다. 동일 구간의 새 begin은 `idle`/`schedule_window`, notify=false로 차단됐다. notices 재조회는 ack 전의 같은 두 알림을 반환했다.
8. 서버 YouTube 키 설정이 필요하다는 사용자 전달문을 로컬에 준비한 뒤 두 알림을 ack했다. 반환된 notices는 빈 배열, notify=false였다. 외부 알림의 정확히 한 번 전달을 검증한 것은 아니다.

짧은 공식 근거와 실제 적용 여부는 [검증 기록](curation-runs/20261016-1628-KST-runner-validation.json)에 있다. 로컬 입력 초안·HTML·비밀 값·API 캐시는 커밋하지 않았다. 성공한 채널 검수는 **0팀**이며, 조사 판단을 DB 적용 성공으로 해석하지 않는다.

## 필요한 설정과 재개

1. [Supabase Edge Function Secrets](https://supabase.com/dashboard/project/czjrzylvnewfjnfwjhwf/functions/secrets)에 **`YOUTUBE_API_KEY`**를 보안 등록한다. 값은 채팅/Git에 넣지 않는다. 클라우드에 등록된 키와 별도 설정이다. 현재 도구에는 서버 secret 등록 기능이 없다. runner secret 인증은 이미 실제 성공했으므로 재설정할 필요가 없다.
2. 설정 뒤 기존 관리자 로그인 세션에서 queue의 최신 `updated_at`/`checked_at`과 원인을 다시 확인하고 `admin_resume_artist_review`를 호출한다. [재개 절차](artist-review-preflight.md)의 기존 관리자 경로를 사용한다. runner secret이나 서비스 역할에는 재개 권한이 없으며, 임의 SQL로 검수 상태를 우회하지 않는다.
3. 다음 허용 구간에서 서버 채널 검증·체크포인트 재전송·이력·완료 근거 재사용을 끝까지 검증한다. 현재 anchor는 최초 검증 실행인 `2026-10-16T07:27:00.806946Z`다. 실제 반복 예약을 연결할 때 예정 시각과 정렬한다. 검증을 위해 운영 임대를 강제 만료하거나 구간 차단을 우회하지 않는다.
4. 예약 전용 클라우드 환경의 범용 서비스 키 바인딩 제거와 실제 UI의 환경·모델·강도·5시간·알림 조건 확인도 남아 있다. 이번에 반복 예약은 생성하지 않았다.

## 보안 및 검사

배포 뒤 security advisor를 다시 조회했다. 새 서비스 RPC에 대한 공개 실행 경고는 없다. 비공개 검수 테이블 7개의 RLS 무정책 INFO는 직접 접근을 허용하지 않는 설계에 해당한다. 관리자 재개 함수의 authenticated SECURITY DEFINER 경고는 기존 관리자 검사와 ACL을 함께 검토했다. 기존 공개 함수/유출 비밀번호 보호 경고는 별도 범위로 남아 있다. [SECURITY DEFINER 점검 안내](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

이번 변경은 문서/검증 기록만 추가한다. 같은 구현에 대해 직전 재개에서 통과한 테스트 202개와 lint/build를 재사용했다. 운영 검증은 위 성공/실패 범위에 한정되며, 서버 YouTube 키·성공 checkpoint·500팀 전체·최종 자동화 알림 전달은 검증하지 못했다.
