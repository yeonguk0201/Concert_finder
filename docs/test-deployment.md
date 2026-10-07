# 10/7 테스트 배포와 실제 기기 검증

2026-10-06에 10/7 계획을 선행 진행했다. 사용자가 Vercel 저장소 Import와 환경변수 설정, Supabase Redirect URLs 등록을 진행하고 배포된 앱의 이메일 로그인·새로고침 세션·밴드 찜·예매 일정 저장이 정상 동작한다고 확인했다. W05 기본 배포 흐름은 사용자 확인으로 검증했으며 W06 실제 알림 수신과 W07 전체 통합 검증은 남아 있다.

## Vercel 준비

[Vite 공식 배포 문서](https://vercel.com/docs/frameworks/frontend/vite)를 기준으로 설정을 준비했다.

1. Vercel에서 GitHub 저장소 `yeonguk0201/Concert_finder`를 새 프로젝트로 연결한다. Root Directory는 저장소 루트, Framework는 Vite, Node.js는 24.x를 선택한다. `vercel.json`에 설치·빌드·출력 설정을 기록했다.
2. 처음에는 검증한 작업 브랜치의 **Preview**를 테스트한다. 공개용 main 배포와 구분하고 Production Branch는 `main`으로 설정한다. Git 연결은 브랜치 push/PR의 배포를 생성할 수 있으므로 연결할 브랜치와 시점을 확인한다.
3. Preview용 환경변수로 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`를 넣는다. Production은 별도로 설정한다. 가능하면 별도 Supabase 테스트 프로젝트를 사용한다. 같은 DB를 연결한다면 preview에서 한 저장·관리자 수정도 그 DB에 적용됨을 인지한다.
4. `.env`·service role·secret key·DB 비밀번호를 업로드하거나 `VITE_` 변수에 넣지 않는다. 공개용 키는 브라우저 번들에 포함되는 값이며 RLS/RPC가 접근을 보호한다. 빌드 후 변수 변경은 재배포가 필요하다.
5. 첫 Preview URL을 받은 뒤 Supabase Auth Redirect URLs에 정확한 HTTPS origin과 쿼리 경로를 허용한다. 이 앱은 `?page=...&event=...`를 로그인 복귀 URL에 유지하므로 `https://정확한-preview-host/**`처럼 **해당 호스트만** 허용한다. 로컬 허용 주소는 유지하고 테스트 배포를 승인된 로그인 복귀 주소로 추가한다. 고정된 테스트 도메인을 우선 사용한다. [Supabase 공식 안내](https://supabase.com/docs/guides/auth/redirect-urls)를 참고한다.
6. 테스트 URL에서 로그인 링크를 요청하고 링크를 연 브라우저의 상세 복귀·새로고침 세션·계정 저장을 확인한다. 테스트 URL을 최종 Production Site URL로 설정할지는 출시 시 별도로 결정한다.

현재 앱은 쿼리로 화면을 선택하므로 모든 경로를 `/index.html`로 보내는 rewrite가 필요하지 않다. 관리자 경로를 포함한 기능은 URL을 숨기는 대신 서버 권한으로 보호한다.

## W05/W07 배포 후 확인

- [ ] 휴대폰의 외부 HTTPS 접속과 모바일 화면을 확인한다.
- [ ] 로그인 요청·이메일 복귀·로그아웃·새로고침 세션을 확인한다.
- [ ] 실제 공식 카탈로그·상세·예매 관계를 조회한다.
- [ ] A/B 계정의 찜·저장 격리 및 다른 기기 조회를 확인한다.
- [ ] 저장 실패·재시도와 공개 중단 이후 저장 해제를 확인한다.
- [ ] 관리자 초안 비노출·등록·공개·수정·이력을 확인한다.
- [ ] 배포 URL·커밋·시각·확인한 브라우저와 결과를 기록한다. 비밀값·이메일·토큰은 기록하지 않는다.

## W06 휴대폰 알림 실험

HTTPS 테스트 URL은 확보했으나 휴대폰 OS·버전·브라우저가 아직 확인되지 않아 실제 수신 실험을 하지 않았다. 웹 푸시 전달 경로도 아직 확정하지 않았다. 앱에는 Service Worker·Push 구독·서버 발송기가 없으며 이 문서는 발송 구현이나 성공 기록이 아니다.

실험은 HTTPS 배포 이후 별도 테스트 메시지로 진행한다. 사용자가 버튼을 눌러 권한을 요청하고, Service Worker·Push 구독 endpoint와 VAPID를 연결한 서버에서 전송한다. VAPID private key와 구독의 비밀값은 서버에만 보관한다. 다른 사용자의 구독을 조회할 수 없도록 계정 소유권을 확인한다. 현재 앱의 일정 저장을 알림 예약으로 표시하지 않는다.

실험 기록에는 기기 OS/버전·브라우저 버전·설치 여부·권한·구독 성공·서버 응답·실제 기기 수신·앱을 닫은 상태의 수신·상세 진입·거부/해제 후 동작을 구분한다. 서버가 전송을 수락했다는 응답만으로 수신 완료를 표시하지 않는다. 아이폰은 홈 화면 웹앱 등 해당 환경의 조건을 [Apple 공식 안내](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)에서 확인한 뒤 지원 범위를 정한다. 실제 푸시가 불가능한 환경이면 이메일 대안을 별도 검증한다.

| 항목 | 결과 |
| --- | --- |
| HTTPS 테스트 URL | https://concertfinder-blue.vercel.app/ · 사용자 기본 로그인/저장 확인 |
| 휴대폰·브라우저 | 사용자 정보 대기 |
| 권한·구독·VAPID 발송기 | 미구현 |
| 서버 전송·실제 수신·상세 진입 | 미검증 |
| 전달 경로·지원 환경 선택 | 실제 실험 후 결정 |

## 실제 배포 확인 · 2026-10-06

- 사용자 확인: 배포된 앱에서 이메일 로그인, 새로고침 후 세션 유지, 밴드 찜과 예매 일정 저장이 정상 동작한다.
- 사용자가 Supabase Redirect URLs에 배포 호스트를 등록한 화면을 공유했다. 상세 쿼리 복귀 허용을 위해 해당 호스트 뒤에 /**를 추가하도록 안내했다. 최종 설정값을 직접 조회한 것은 아니다.
- PR #6은 dev 대상 OPEN 상태이며 GitHub Build and lint, Vercel 배포, Preview Comments 검사가 모두 통과했다. 병합하지 않았다.
- 배포된 도메인이 사용하는 정확한 커밋·배포 환경과 테스트 브라우저/휴대폰은 아직 확인하지 않았다. 기본 저장 성공으로 관리자 기능의 배포/원격 적용 성공을 추정하지 않는다.
- 로그아웃, 상세 URL로 인증 복귀, 배포 환경의 A/B 격리·다기기·실패 복구와 관리자 초안/공개/이력 및 실제 알림 수신은 별도 확인한다.
