# 기여 가이드

## 브랜치

- `dev`: 개발 통합 브랜치.
- 작업은 최신 `dev`에서 분기한 `codex/feat-설명`, `codex/fix-설명`, `codex/chore-설명` 등의 브랜치에서 진행합니다.
- PR의 기본 대상은 `dev`입니다. 작업 브랜치에서 직접 `dev`로 병합하지 않고 PR로 검토합니다.

```sh
git switch dev
git pull --ff-only origin dev
git switch -c codex/feat-example
```

## 커밋

저장소 초기 설정에서 로컬 커밋 템플릿을 적용했습니다. 새로 클론한 경우 다음 명령을 한 번 실행하세요.

```sh
git config --local commit.template .github/COMMIT_TEMPLATE.txt
git config --local i18n.commitEncoding utf-8
git config --local i18n.logOutputEncoding utf-8
```

`git commit`은 템플릿을 열고, `git commit -m`은 직접 작성한 메시지를 사용합니다. 템플릿은 메시지 작성을 돕고 형식을 강제하지 않습니다.

제목 형식: `<type>: <변경 목적>`. 변경 설명은 한국어 또는 영어로 작성할 수 있습니다.

| 유형 | 용도 |
| --- | --- |
| feat | 기능 추가 |
| fix | 동작 오류 수정 |
| docs | 문서 변경 |
| style | 코드 서식만 변경 |
| refactor | 기능 변화 없는 코드 구조 개선 |
| test | 테스트 추가/수정 |
| chore | 의존성, 도구, 저장소 설정 변경 |

예시:

```text
feat: 밴드 공연 탐색과 예매 일정 저장 구현

밴드 찜 상태를 브라우저에 저장하고 페스티벌 출연 정보도 매칭한다.

검증: npm run build, npm run lint 통과
```

## PR

GitHub에서 PR을 만들 때 `.github/pull_request_template.md`가 사용됩니다. `dev`를 대상으로 선택하고 목적, 결과, 실제 검증 내용을 작성하세요. 작은 변경에는 해당 없는 절을 삭제합니다. 체크박스는 검증한 것만 선택합니다.

## 검증과 파일 관리

- 커밋 전에 `npm run build`, `npm run lint`를 실행합니다.
- UI 변경은 데스크톱과 모바일에서 확인합니다.
- 모든 텍스트 파일은 UTF-8로 읽고 저장합니다.
- 의존성은 `package-lock.json`과 함께 커밋합니다. `node_modules`, `dist`, `.env`와 비밀키는 커밋하지 않습니다.
- 현재 공연은 가상 샘플입니다. 공식 정보가 연결되기 전까지 샘플 안내를 유지합니다. 푸시 기능 구현 전에는 일정 저장을 알림 예약으로 표현하지 않습니다.

## 자동 검사와 브랜치 보호

GitHub Actions의 `Build and lint` 검사가 `dev`/`main` 대상 PR과 두 브랜치의 push에서 실행됩니다. Node.js 24에서 `npm ci`, `npm run lint`, `npm run build`를 수행합니다.

`dev`와 `main`에는 PR을 통한 병합, `Build and lint` 통과, 최신 대상 브랜치 반영, 리뷰 대화 해결을 요구하도록 설정합니다. 관리자도 규칙을 따르며 강제 푸시와 브랜치 삭제는 허용하지 않습니다. 개인 프로젝트이므로 타인의 승인 개수는 0으로 설정합니다. 리뷰 승인과 자동 검사 통과는 별개의 조건입니다.
