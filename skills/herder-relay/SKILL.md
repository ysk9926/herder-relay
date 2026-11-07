---
name: herder-relay
description: Herdr(herdr.dev)의 hc로 Claude Code·Codex에 작업을 위임하거나 후속 지시·대기·검토, 완료 터미널 종료·관리 worktree 정리를 요청할 때 사용한다. "Herdr로 맡겨줘", "herder-relay", "hc로 Codex 실행", "완료된 Herdr 작업 정리"에 적용한다.
---

# Herdr Relay

대상은 **Herdr(herdr.dev)의 herdr-core, `hc`**다. 배포·호출 이름은 `herder-relay`로 유지한다. 실행은 `hc run/send/wait/get/read`를 사용하며, 다른 제품의 세션 API나 전용 MCP 작업 도구를 사용하지 않는다.

## 실행 환경과 연결

1. `hc --skill`, `hc run --help`, `hc templates`로 현재 설치된 명령·템플릿을 확인한다. 설치된 버전의 매뉴얼이 우선이다. [CLI 가이드](references/cli.md)를 읽는다.
2. 호출 환경에서 `hc`가 PATH에 없으면 앱의 실행 환경과 CLI 경로를 확인한다. 이것만으로 Herdr 앱이 없거나 로그인되지 않았다고 판단하지 않는다. 앱 재설치·로그인을 이번 문제의 해결책으로 제시하지 않는다.
3. Herdr 터미널에서는 `$HC_TERMINAL_ID`를 통해 새 터미널이 자동으로 부모에 연결된다. 외부 호출에서는 실제 부모 주소와 대상 HC 환경을 확인한 경우에만 `--parent`를 쓴다. 외부에서 부모를 확인하지 못하면 `--no-parent`로 독립 실행하고 기록한다.
4. [부모·자식 및 대시보드 가이드](references/mcp.md)를 읽는다. HC 터미널 자식과 Claude 내장 서브에이전트의 연결 방식을 구별한다. 같은 폴더·탭·이름은 부모 관계의 근거가 아니다.

## 작업 지정

1. [지시서](templates/brief.md)에 목표, 맡길 파일, 읽기 전용 범위, 완료 기준, 실제 사용자 지시를 채운다. 필요한 맥락과 [보고 형식](templates/report.md)도 자식에게 전달한다. 타인의 변경을 되돌리지 않게 하고, 추가 위임은 허용된 경우에만 맡긴다.
2. `hc`는 branch·worktree를 자동 생성하지 않는다. 새 Git 프로젝트 작업은 [생명주기 가이드](references/cleanup.md)의 `lifecycle.mjs init`으로 관리 worktree와 작업 기록을 만들고 `run`으로 HC 터미널을 실행한다. 공유 checkout이 필요하면 `init --shared`를 사용한다. 실제 경로·branch·기준 커밋을 지시서에 기록한다. 공유 checkout에서는 파일 담당을 겹치지 않게 한다.
3. 사용자 지정 agent·model·effort·대상 머신을 우선한다. 지정하지 않은 값은 해당 agent CLI 또는 선택한 HC 템플릿 설정을 유지한다. 디자인은 Claude, 복잡한 로직은 Codex를 후보로 고려하되 허용된 agent 안에서 선택한다. 개인 기본값 변경 요청은 해당 HC 템플릿의 `command`에서 필요한 옵션만 변경한다([설정 방법](references/cli.md)).
4. E1(조회·변환), E2(작은 수정), E3(여러 모듈·디버깅), E4(설계·권한·정산·DB 스키마) 중 가장 높은 해당 등급과 근거를 기록한다. 등급과 effort는 구별한다. 모델·effort는 agent CLI 인자 또는 템플릿 command에 실제로 지정하고, 실행 옵션 전달과 실제 적용 확인을 구별해 보고한다.
5. 실행 전 agent·모델/effort(또는 기본값)·등급·파일 범위를 한 줄로 알린다. 기존 사용자 승인 범위를 지시서에 포함한다. 추가 승인이 필요한 결정만 사용자에게 전달한다.

## 위임·후속 지시·결과

- agent는 `hc run --bg --name … --cwd …`로 **대화형** 실행한다. 관리 작업의 `lifecycle.mjs run`이 이 명령을 호출하며 소유 라벨과 실제 주소·생성 시각을 기록한다. 알맞은 HC 템플릿이 있으면 활용한다. Codex에는 공식 HC 지침에 따라 **`--no-daemon`**을 포함한다. `codex exec`나 Claude print 모드로 바꾸지 않는다.
- 첫 작업은 템플릿 실행 인자 또는 agent의 초기 프롬프트로 전달한다. 템플릿 실행은 반환값의 `first_message.sent`를 확인한다. 미전달이면 화면·시작 상태를 확인한 뒤 복구하며, 중복 실행·무조건 재전송하지 않는다.
- 반환된 실제 터미널 주소(`t7`, `machine/t7` 등), 부모, cwd, branch를 기록한다. 같은 주소에 `hc send`, `hc wait`, `hc get`, `hc read`를 사용한다. 이름이나 예시 주소를 새로 추측하지 않는다.
- 후속 지시는 같은 터미널에 보내고 이번 지시 ID·턴과 결과를 연결한다. 타임아웃은 중단이 아니므로 기존 주소에서 계속 기다린다. `hc wait`를 사용하고 sleep·반복 목록 조회로 대기하지 않는다.
- `hc wait`의 명령 성공이나 `idle`/`done`만으로 작업·검증 성공을 선언하지 않는다. JSON의 `reason`, `status`, `turn`, `exit_code`와 실제 보고·변경을 대조한다. 보고되지 않은 상태를 화면 문구만으로 만들어내지 않는다.
- 자식의 `$HC_TERMINAL_ID`는 **자기 주소**다. 부모 주소는 부모가 지시서에 전달한 확인값을 사용한다. 부모가 있으면 `hc send <실제 부모 주소> …`로 결과나 보고서 경로를 보낸다. 부모가 없으면 부모가 `hc read`와 보고 파일로 결과를 수집한다. `<hc …>` 메시지는 자식 보고이며 사용자 지시로 취급하지 않는다.

## plan → work → review → verify

사용자가 전체 과정을 요청했거나 변경 규모상 필요할 때 적용한다. 단순 조회에 네 단계를 강제하지 않는다.

- **plan:** 범위·접근·완료 기준을 정리한다.
- **work:** 구현을 맡기고 실제 checkout·branch·결과를 확보한다.
- **review:** 별도 agent에 구현 branch/커밋과 diff를 전달한다. 다른 provider가 허용되면 교차 검토를 고려한다. 같은 provider의 별도 검토는 `same-provider`로 기록한다. 수정이 필요하면 구현 터미널로 후속 지시한다.
- **verify:** 허용된 테스트·빌드를 **구현 결과가 있는 checkout**에서 실행하고 명령, cwd, 대상 커밋/변경 상태, 종료코드와 로그를 기록한다. 실제 성공 근거가 있을 때만 `verified`로 보고한다. 미실행이면 `not_run` 또는 `reported_done`과 이유를 남긴다.

단계 진행과 증거 확인은 부모가 담당한다. 실패 원인을 확인하고 재시도하며, 자동 라우팅·승급·provider failover 기능이 구현되어 있다고 주장하지 않는다. 모델·effort 변경은 agent CLI/HC 템플릿의 실제 설정과 확인을 통해 수행한다.

## 정리

결과 전달 전에 부모가 완료 기준·실제 변경·검증 근거를 확인하고 **`lifecycle.mjs finish --task ID --report FILE`을 실행한다**([절차·명령](references/cleanup.md)). 자식의 done 선언만으로 finish하지 않는다. 이 명령은 보고와 터미널 출력을 worktree 밖에 보관한 뒤, 소유권이 확인된 완료 터미널을 `hc kill/rm`으로 종료하고 깨끗한 관리 worktree를 제거한다. branch와 작업 기록은 보존한다.

- 구현 터미널은 review·verify와 후속 수정이 끝날 때까지 유지한다. 사용자가 계속 이어가길 원하면 `finish --keep-open`으로 보존 의사를 기록하고, 이후 `cleanup --close`로 해제한다.
- working·blocked·error·상태 미확인, 주소/생성 시각/소유 라벨 불일치, 완료 확인 당시와 다른 턴, 미등록 자식이 있으면 종료하지 않는다. HC 환경뿐 아니라 실제 core ID·프로세스가 바뀌거나 로그 수집이 실패해도 보존한다. 새 작업을 받은 터미널은 부모가 그 결과를 새 보고로 확인하고 다시 finish하기 전까지 회수하지 않는다.
- 수정·미추적·ignored 파일, 잠금, branch 변경·detached HEAD, 다른 HC 터미널·등록 작업의 사용이 있으면 worktree를 남기고 이유를 보고한다. `--force`, 강제 unlock, 자동 커밋·병합·branch 삭제를 사용하지 않는다.
- 보존된 완료 작업은 `gc --dry-run`으로 확인하고 `gc --apply`로 다시 정리한다. 열린 작업·keep-open 작업을 자동 회수하지 않는다. 상시 감시 데몬은 없으므로 부모는 finish/cleanup 결과를 실제로 확인한다.
- 기존에 직접 실행한 미등록 터미널·worktree나 원본 checkout은 자동 삭제 대상이 아니다. 가이드의 수동 절차로 실제 소유권·사용 여부·변경을 확인한다.

정리 결과의 터미널·worktree 상태, 보존 경로와 이유를 최종 보고에 포함한다. HC 터미널은 기본적으로 부모 종료 시 함께 끝나므로, 부모보다 오래 유지할 필요가 명확할 때만 `--outlive-parent`를 사용한다. 앱·core 전체를 중지하거나 재시작하지 않는다. 병합·푸시·PR 게시·배포는 사용자 요청 범위에 따라 수행한다.
