# herder-relay

`cmux-relay`의 작업 지시서·후속 지시·단계별 검토 방식을 [Herder](https://herder.sh/)에서 쓰기 위한 스킬이다. 대상은 `herder-sh/herder`이며 `herdr.dev` 터미널과는 다르다.

스킬 원본: [skills/herder-relay/SKILL.md](skills/herder-relay/SKILL.md).
Herder 내장 MCP 작업 도구를 우선하고, 외부에서는 `herder session` CLI를 쓴다. 별도 Node 실행기나 cmux 의존성은 없다. 기존 cmux-relay의 개인 설정·모델 라우터·파일 잠금을 복제하지 않으며, 현재 Herder 설정과 실제 지원 옵션을 사용한다.

## 설치

### npx skills (권장)

cmux-relay와 같은 방식으로 설치한다. Node.js가 설치된 환경에서 실행한다.

```bash
npx skills add ysk9926/herder-relay@herder-relay -g -y
```

특정 에이전트에만 설치하려면 `-a codex` 또는 `-a claude-code`를 추가한다. 현재 프로젝트에 설치하려면 `-g`를 생략한다.

```bash
npx skills add ysk9926/herder-relay@herder-relay -a codex claude-code -y
```

공개 Git 저장소의 `skills/herder-relay/`를 직접 가져오므로 ZIP 다운로드나 별도 npm 패키지 배포가 필요하지 않다. 새 에이전트 세션에서 `$herder-relay`를 사용한다.

### 수동 설치

필요하면 [최신 릴리스](https://github.com/ysk9926/herder-relay/releases/latest)의 `herder-relay.zip`을 내려받거나 저장소를 복제한다.

```bash
git clone https://github.com/ysk9926/herder-relay.git
```

스킬 폴더는 `skills/herder-relay/`이다. 릴리스 ZIP에는 같은 스킬이 최상위 `herder-relay/` 폴더에 들어 있다. ZIP은 수동 설치용 보조 배포본이다.

### Herder 공용 스킬 라이브러리

Herder의 스킬 가져오기에서 Git URL `https://github.com/ysk9926/herder-relay.git`, 하위 경로 `skills/herder-relay`를 지정하고 가져온 스킬을 활성화한다.

Herder의 Skills에서 사용하는 Git 스킬 라이브러리에 `skills/herder-relay/` **내용 전체**를 `<라이브러리 루트>/herder-relay/`로 추가하고 해당 스킬을 활성화한다. 이미 라이브러리가 있으면 그 저장소를 사용한다. 이 저장소 자체를 라이브러리로 지정하면 `skills/` 아래에 있어 루트 스킬로 인식되지 않으므로 스킬 폴더만 옮긴다.

Herder daemon은 공용 라이브러리를 provider별 계정에 전달한다. 계정마다 별도 설정 경로를 쓰므로 개인 `~/.codex/skills`에 링크한 것만으로 모든 Herder 계정에 설치되었다고 볼 수 없다. daemon의 관리 checkout에 직접 복사하면 다음 동기화에서 사라질 수 있으므로 라이브러리 원본에서 관리한다.

### 프로젝트 단위

대상 저장소의 `.agents/skills/herder-relay/`(Codex) 또는 `.claude/skills/herder-relay/`(Claude)에 스킬 폴더 전체를 복사한다. Herder가 새 worktree를 만들 때 포함되도록 해당 파일을 작업 branch의 기준 커밋에 포함한다. 여러 머신에 배포할 때는 로컬 절대경로 symlink를 커밋하지 않는다.

### 개인 에이전트

Codex는 `~/.agents/skills/herder-relay/`, Claude Code는 `~/.claude/skills/herder-relay/`에 스킬 폴더 전체를 복사한다. 새 에이전트 세션에서 `$herder-relay`를 사용할 수 있다. Herder의 격리된 계정 설정에 대한 설치는 위 라이브러리 또는 프로젝트 방식을 사용한다.

## 사용

```text
$herder-relay Herder에서 Codex에 파서 수정을 맡기고 별도 검토와 테스트까지 진행해줘.
```

Herder 세션 내 MCP 도구가 있으면 자식 세션으로 실행한다. CLI 경로를 쓸 때는 설치·머신 연결·계정 로그인 상태가 준비되어 있어야 한다. 현재 환경에 Herder CLI가 없으면 스킬은 부족한 실행 조건을 보고한다.

## 검증 범위

2026-11-07 공식 upstream commit `701a5b527d486863442b9a3de218e6c02af0e2a4`의 [CLI](https://github.com/herder-sh/herder/blob/701a5b527d486863442b9a3de218e6c02af0e2a4/crates/herder/src/session.rs), [MCP](https://github.com/herder-sh/herder/blob/701a5b527d486863442b9a3de218e6c02af0e2a4/crates/herder-tasktools/src/tools.rs), [스킬 전달](https://github.com/herder-sh/herder/blob/701a5b527d486863442b9a3de218e6c02af0e2a4/crates/herder-daemon/src/skills/mod.rs) 구현에 맞췄다. 실제 Herder daemon·로그인 계정으로 세션을 실행한 통합 검증은 수행하지 않았다.

## 라이선스

[MIT](LICENSE). cmux-relay에서 발전시킨 스킬 지침과 템플릿이며 Herder 자체와는 별도 프로젝트다.
