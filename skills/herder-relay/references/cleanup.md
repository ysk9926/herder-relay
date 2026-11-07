# 완료 터미널과 worktree 생명주기

`scripts/lifecycle.mjs`는 HC 자원을 만든 시점부터 기록하고, 부모가 완료를 확인한 뒤 정리하는 Node.js 도구다. 별도 npm 의존성은 없다. `hc`가 branch를 만드는 것은 아니며, 이 도구가 명시적으로 `git worktree add`를 실행한다.

기본 상태 경로는 `~/.herder-relay/`다. `HERDER_RELAY_HOME` 또는 `--home DIR`로 바꿀 수 있다. HC 실행 경로는 `HERDER_RELAY_HC` 또는 `--hc /path/to/hc`로 지정한다. 원격 작업은 해당 머신의 저장소와 HC 환경에서 실행한다. 로컬 파일을 원격 파일로 간주하지 않는다.

## 1. 작업 생성과 실행

아래 lifecycle.mjs 경로는 실제 설치된 스킬 폴더에 맞춘다. 기본 개인 설치 예시다.

```bash
node ~/.agents/skills/herder-relay/scripts/lifecycle.mjs init --task parser-fix --repo /absolute/repo
node ~/.agents/skills/herder-relay/scripts/lifecycle.mjs run --task parser-fix --name parser-work -- codex --no-daemon '완성된 지시서와 보고 형식'
```

`init`은 다음을 반환한다.

- `cwd`: 생성된 관리 worktree. `--base REF`를 지정하지 않으면 현재 repo의 HEAD가 기준이다.
- `branch`: `herder-relay/<task-id>`. 기존 branch나 task ID가 있으면 덮어쓰지 않는다.
- `reportPath`: worktree 밖의 보고 경로. 자식에게 전달하고 쓰기 권한 범위를 확인한다.
- `terminals`: 이후 run으로 생성한 터미널 기록이 쌓인다.

원본 checkout에서 실행해야 하면 `init … --shared`를 사용한다. 이 경우 원본 checkout은 자동 제거하지 않는다. Git 저장소가 아닌 작업이나 기존에 직접 실행한 터미널은 아래 수동 정리 절차를 사용한다.

`run`은 `hc run --bg --json --name … --cwd …`를 호출한다. 소유 라벨 `relay.task`, `relay.owner`와 실제 주소·생성 시각을 기록한다. 추가 worker/reviewer도 **같은 task ID로 run**하면 함께 관리한다. agent 인자는 `--` 뒤에 그대로 전달한다. Claude·Codex 모델·effort 또는 HC 템플릿은 [CLI 가이드](cli.md)대로 지정한다. 템플릿의 Codex command에도 `--no-daemon`이 있어야 한다.

HC 터미널 안에서는 실제 `$HC_TERMINAL_ID`로 자동 parent 연결을 유지한다. 외부에서는 실제 주소를 확인한 경우에만 `run … --parent ADDRESS`를 사용한다. 외부에서 부모를 확인할 수 없으면 도구는 `--no-parent`를 사용한다.

후속 지시·대기는 run이 반환한 같은 주소에 `hc send/wait/get/read`를 사용한다. 생명주기 도구는 agent 모델 호출이나 결과 검증을 대신하지 않는다.

## 2. 완료 확인 후 finish

부모가 현재 지시 결과와 검증 근거를 확인한 뒤 실행한다. 구현 터미널은 검토·검증과 후속 수정이 끝날 때까지 유지한다.

```bash
node ~/.agents/skills/herder-relay/scripts/lifecycle.mjs finish --task parser-fix --report /absolute/final-report.md --artifact /absolute/test-output.log
```

`--artifact FILE`은 여러 번 사용할 수 있다. 보고·증거가 worktree 안에만 있으면 제거 전에 외부 보관이 필요하다. init의 reportPath를 사용하면 보고 파일 때문에 worktree가 미추적 상태가 되는 것도 피할 수 있다. 자식이 외부 경로에 쓸 권한이 없다면 부모가 보고를 수집·작성한다. 광범위한 권한 우회를 추가하지 않는다.

finish는 다음 순서로 동작한다.

1. 비어 있지 않은 최종 보고와 지정한 증거 파일을 task의 `artifacts/`에 복사하고 완료 확인을 기록한다.
2. 같은 HC 환경과 실제 core ID·프로세스인지, 주소·생성 시각·소유 라벨이 일치하는지, 현재 상태가 idle/done 또는 finished인지 확인한다. 이때의 턴과 완료 상태를 기록한다. HC가 보고하지 않은 상태는 추정하지 않는다.
3. 등록된 터미널의 상태 JSON과 현재 화면/최근 200줄을 **worktree 밖**에 보관한다. 읽기 실패면 종료하지 않는다. 더 긴 로그는 별도 artifact로 제공한다.
4. 완료 터미널을 다시 확인한 뒤 `hc kill` → 종료 상태 확인 → `hc rm` 순서로 정리한다. 이미 finished인 터미널은 kill을 생략한다. branch·보고·task 기록은 남긴다.
5. 다른 HC 터미널이나 등록 작업이 사용하지 않고 수정·미추적·ignored 파일이 없는 관리 worktree만 `git worktree remove`로 제거한다. Git의 보호 기능을 끄지 않는다.

finish는 **부모가 완료를 확인했다는 기록**이지 테스트 성공을 인증하는 명령이 아니다. 자식의 done 선언·idle 상태만 보고 호출하지 않는다. 단계를 기다리는 working/blocked/error 터미널은 정리하지 않는다.

## 3. 보존과 재시도

```bash
node ~/.agents/skills/herder-relay/scripts/lifecycle.mjs status --task parser-fix
node ~/.agents/skills/herder-relay/scripts/lifecycle.mjs finish --task parser-fix --report /absolute/final-report.md --keep-open
node ~/.agents/skills/herder-relay/scripts/lifecycle.mjs cleanup --task parser-fix --close --dry-run
node ~/.agents/skills/herder-relay/scripts/lifecycle.mjs cleanup --task parser-fix --close
node ~/.agents/skills/herder-relay/scripts/lifecycle.mjs gc --dry-run
node ~/.agents/skills/herder-relay/scripts/lifecycle.mjs gc --apply
```

`--keep-open`은 보고를 보관하고 터미널·worktree를 유지하며 GC도 건너뛴다. 부모가 보존 의사를 해제할 때 `cleanup --close`를 쓴다. `--close`는 working·dirty 등 보호 조건을 우회하지 않는다. 완료 확인 뒤 새 턴으로 재사용한 터미널은 GC/close로 종료하지 않는다. 새 작업 결과를 부모가 확인한 뒤 **새 보고로 finish를 다시 실행**해야 한다. working 상태에서 잘못 finish한 작업도 같은 방식으로 실제 완료를 다시 확인한다.

`finish --dry-run`과 `cleanup --dry-run`은 정리를 미리 보여 주며 완료 기록·보고 복사·자원 변경을 수행하지 않는다. `gc`는 기본 미리보기이며 `--apply`일 때만 정리를 재시도한다. GC 대상은 완료 기록과 보관 보고가 있고 keep-open이 아닌 작업이다. 기존 열린 작업을 idle이라는 이유만으로 자동 회수하지 않는다. 상시 감시나 타이머는 없으며, 부모가 최종 보고 전에 finish와 그 결과를 확인해야 한다.

| 조건 | 동작 |
| --- | --- |
| report 미보관·작업 미완료 | 보존 |
| working/blocked/error/상태 미확인 | 터미널·worktree 보존 |
| HC 환경·실제 core ID/프로세스 변경·식별 정보 불일치·로그 읽기 실패 | 보존, 실제 환경·자원 확인. core가 바뀐 경우 자동 재연결·채택하지 않음 |
| 완료 기록 당시와 다른 턴 또는 당시 미완료 상태 | 보존, 부모가 현재 결과를 새 보고로 확인해 finish를 다시 실행 |
| 소유 터미널에 미등록 live 자식이 있음 | 부모 종료가 자식까지 끝내지 않도록 보존 |
| 수정·미추적·ignored 파일 또는 detached HEAD/branch 변경 | worktree 보존, 자동 커밋·강제 제거 없음 |
| worktree 잠금·다른 live HC 터미널·열린 등록 작업 | worktree 보존, 강제 unlock 없음 |
| 원본/shared checkout·미등록 worktree | 자동 제거하지 않음 |
| 정리 일부 실패 | 기록과 branch 보존, 완료된 단계는 재사용하며 다음 cleanup/GC에서 재시도 |

Git 자체는 ignored 파일을 보호하지 않을 수 있으므로 도구는 ignored 파일도 검사해 worktree를 보존한다. 의존성·빌드 산출물이라도 임의로 삭제하지 않는다. 필요한 자료 보관과 폐기 가능한 생성 파일의 정리가 끝난 뒤 GC를 다시 실행한다. `--force`, 직접 재귀 삭제, 자동 branch 삭제를 사용하지 않는다. `.operation.lock`이 남았으면 기록 PID·실제 작업 상태를 확인한 뒤에만 잠금 복구를 판단한다. 정리 중 해당 터미널에 새 작업을 보내지 않는다. HC CLI 자체에 원자적 비교 후 종료 기능이 없으므로 실행 상태 변경이 관찰되면 보존한다.

반환 상태는 `closed`, `retained`, `kept-open`, 미리보기의 `eligible`다. 보존 사유는 JSON과 task.json의 cleanup에 남는다. 종료코드 2는 명령 오류 또는 정리 보류를 뜻하며, 작업 구현·검증 자체의 실패와 구별한다. 종료코드 0이어도 `kept-open`인지 `closed`인지 반환값을 읽는다.

## 기존 미등록 자원의 수동 정리

1. 실제 작업 소유권과 HC 주소·부모·cwd를 확인하고 보고·필요한 로그를 worktree 밖에 보관한다.
2. 후속 작업과 자식이 없는 완료 터미널만 `hc kill ADDRESS`, `hc get ADDRESS --json`, `hc rm ADDRESS`로 정리한다. 원본 앱/core는 중지하지 않는다.
3. `git worktree list --porcelain`에서 경로·branch·잠금을 확인한다. 원본 checkout, 사용자 기존 worktree, 소유권 미확인 경로를 자동 삭제 대상으로 삼지 않는다.
4. 해당 worktree의 `git status --porcelain --untracked-files=all --ignored=matching`, branch/HEAD 보존, 다른 작업·터미널 사용 여부를 확인한다. 조건이 충족된 이번 작업용 worktree만 `git -C REPO worktree remove WORKTREE`로 제거하며, 거부되면 보존 사유를 보고한다.

미등록 세션을 폴더명으로 추정해 관리 자원으로 채택하지 않는다. 새 관리 작업부터 helper의 init/run/finish 흐름을 사용한다.
