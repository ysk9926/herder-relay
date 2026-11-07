# herder-relay

[Herdr(herdr.dev)](https://herdr.dev/)의 **herdr-core CLI `hc`**로 Claude Code·Codex에 작업을 위임하는 스킬이다. 저장소와 스킬 호출 이름은 `herder-relay`를 유지한다.

`hc run --bg`로 agent를 실행하고 같은 터미널 주소에 `hc send`, `hc wait`, `hc get`, `hc read`를 사용한다. Codex에는 `--no-daemon`을 포함한다. 실행 중인 Herdr 앱을 대상으로 하며 앱 재설치나 로그인을 해결책으로 삼지 않는다.

## 설치·업데이트

```bash
npx skills add ysk9926/herder-relay@herder-relay -g -y
```

특정 agent에 설치하려면 `-a codex` 또는 `-a claude-code`를 추가한다. 현재 프로젝트에만 설치하려면 `-g`를 생략한다.

```bash
npx skills add ysk9926/herder-relay@herder-relay -a codex claude-code -y
```

Git 저장소의 `skills/herder-relay/`를 직접 가져온다. ZIP 다운로드나 별도 npm 패키지는 필요하지 않다. 새 에이전트 세션에서 `$herder-relay`를 사용한다. 기존 설치도 위 명령으로 최신 내용을 다시 가져올 수 있다.

## 사용

```text
$herder-relay hc로 Codex에 파서 수정을 맡기고 별도 검토와 테스트까지 진행해줘.
```

실행 전에 `hc --skill`, `hc run --help`, `hc templates`를 확인한다. PATH에 hc가 없다는 사실만으로 앱이 없다고 판단하지 않는다. 호출 환경과 실제 CLI 경로를 확인한다.

- **모델·effort:** Claude·Codex의 CLI 인자 또는 HC 템플릿의 command에 지정한다. 지속되는 기본값은 해당 템플릿에서 요청한 옵션만 변경한다.
- **부모·자식:** Herdr 터미널은 `$HC_TERMINAL_ID`로 자동 연결한다. 외부에서는 실제 부모가 확인된 경우에만 `--parent`를 지정한다.
- **대시보드:** HC 자식은 실제 parent 관계로, Claude 내장 서브에이전트는 기존 관측 훅으로 연결한다. 같은 폴더·탭을 근거로 부모를 추정하지 않는다.
- **격리:** hc가 branch·worktree를 자동 생성한다고 가정하지 않는다. 필요한 격리는 별도로 구성하고 실제 경로·branch를 지시서에 기록한다.
- **검증:** 지시서·보고서, E1~E4 분류, 사용자 승인 범위, 구현·검토·검증 근거 확인을 유지한다. idle·done이나 hc wait의 성공만으로 검증 완료를 선언하지 않는다.
- **완료 후 정리:** 생명주기 도구로 직접 생성한 자원을 기록하고, 부모가 완료를 확인한 뒤 보고·로그 보존 → HC 터미널 종료·제거 → 깨끗한 관리 worktree 제거를 수행한다. branch와 작업 기록은 보존한다.

## 완료 후 터미널·worktree 정리

```bash
node ~/.agents/skills/herder-relay/scripts/lifecycle.mjs init --task parser-fix --repo /absolute/repo
node ~/.agents/skills/herder-relay/scripts/lifecycle.mjs run --task parser-fix --name parser-work -- codex --no-daemon '완성된 작업 지시'
# 부모가 검토·검증과 결과 수집을 마친 뒤 실행
node ~/.agents/skills/herder-relay/scripts/lifecycle.mjs finish --task parser-fix --report /absolute/final-report.md
```

후속 작업을 계속할 때는 `finish --keep-open`을 사용한다. 변경 파일·ignored 파일·잠금·다른 HC 작업 사용 등으로 남은 자원은 사유를 기록하며 `gc --dry-run`, `gc --apply`로 재검사한다. 완료 후 새 턴을 받은 터미널, 다른 core/프로세스, 원본 checkout이나 미등록 자원은 자동 삭제하지 않는다. 상시 감시 데몬은 없으며 스킬을 수행하는 부모가 finish를 호출한다. [명령·보존 규칙](skills/herder-relay/references/cleanup.md)을 참고한다.

## 구성

- [스킬 본문](skills/herder-relay/SKILL.md)
- [HC 명령·agent/모델/effort 가이드](skills/herder-relay/references/cli.md)
- [HC parent·대시보드 연결 가이드](skills/herder-relay/references/mcp.md)
- [완료 후 정리 도구와 GC](skills/herder-relay/references/cleanup.md)
- [지시서](skills/herder-relay/templates/brief.md) / [결과 보고](skills/herder-relay/templates/report.md)

이 패키지는 지침·템플릿과 자원 생명주기 실행기를 제공한다. cmux-relay의 개인 모델 설정 저장소·자동 모델 라우터·파일 담당 충돌 잠금·자동 승급·provider failover 실행기 전체를 포함하지 않는다. 모델·effort는 해당 agent CLI와 HC 템플릿의 실제 옵션으로 설정한다.

## 검증 범위

2026-11-07 공식 배포 hc **0.1.18**의 `--skill`, `run/send/wait --help`와 [herdr-core upstream](https://github.com/herdrdev/herdr-core/tree/9ce385d9c8abb041dd4437476d770365b3fb5282)을 확인했다. 스킬 형식·내부 링크·npx skills 설치를 검증했다. 사용자 환경과 분리한 임시 HC 세션에서 합성 테스트 프로그램으로 템플릿 실행 옵션 전달, 첫 작업 전달, HC_TERMINAL_ID 기반 실제 parent 관계, 같은 주소의 send/wait/get/read를 검증했다. 실제 로그인된 Claude·Codex의 모델 실행과 사용자 앱 대시보드 연결을 확인한 것은 아니다.

생명주기 도구는 임시 Git 저장소와 가짜 HC를 쓰는 16개 단위 테스트, 실제 HC를 쓰는 격리 통합 테스트로 검증한다.

```bash
node --test skills/herder-relay/tests/lifecycle.test.mjs
HC_BIN=/absolute/path/to/hc node --test skills/herder-relay/tests/lifecycle-hc.test.mjs
```

실제 HC 테스트도 전용 socket·HC_SESSION·XDG 경로에서 합성 프로그램만 실행하며 사용자 core나 로그인된 agent를 종료하지 않는다.

## 라이선스

[MIT](LICENSE). cmux-relay의 지침과 템플릿에서 발전시킨 별도 프로젝트다.
