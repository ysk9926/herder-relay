# Herdr / hc CLI

대상: [Herdr](https://herdr.dev/)의 herdr-core CLI `hc`. 확인일: 2026-11-07.
공식 배포 바이너리 **hc 0.1.18**의 `--skill`, `run/send/wait --help`와 upstream commit `9ce385d9c8abb041dd4437476d770365b3fb5282`를 대조했다. 현재 설치된 버전의 매뉴얼을 우선한다.

## 기능 확인

```bash
hc --skill
hc run --help
hc templates
```

`hc templates`는 준비된 역할과 실제 실행 command를 보여 준다. 호출 환경에서 hc가 발견되지 않으면 PATH·앱이 제공하는 CLI 경로·호출 머신을 확인한다. 앱의 설치 여부나 로그인 상태를 PATH 하나로 판정하지 않는다. 앱 재설치·로그인은 이 스킬의 실행 경로를 고치는 방법이 아니다.

## 실행과 격리

다음 경로·이름·작업 내용을 실제 값으로 바꾼다. `hc`는 `--cwd`에 지정한 폴더에서 실행하며 Git branch나 worktree를 만들지 않는다. 필요한 격리를 먼저 구성하고 실제 경로·branch를 지시서에 적는다.

```bash
hc run --bg --json --name relay-codex --cwd /absolute/worktree -- codex --no-daemon '지시서 전체와 보고 형식'
hc run --bg --json --name relay-claude --cwd /absolute/worktree -- claude '지시서 전체와 보고 형식'
```

agent의 권한 옵션은 현재 허용 범위에 맞춰 지정한다. 명령이 막혔다는 이유로 권한을 넓히지 않는다. `--no-daemon`은 Codex 자체 인자이며 Codex가 HC 밖의 공유 서버에서 명령을 실행하지 않게 하기 위한 공식 HC 지침이다.

알맞은 템플릿이 있다면 그 이름으로 실행한다. `reviewer`는 예시이며 `hc templates`에서 확인된 실제 이름을 사용한다.

```bash
hc run --bg --json --name relay-review --cwd /absolute/worktree reviewer '이번 지시 ID, 검토 범위, 보고 형식과 실제 부모 주소'
```

최초 지시를 실행과 함께 전달한다. agent가 부팅 중일 때 곧바로 별도 send를 하면 유실될 수 있다. 템플릿 실행 JSON의 `address`, `first_message.sent`와 필요시 `reason`을 확인한다. `sent=false`면 `hc get`, `hc read`로 준비 상태부터 확인한다. 직접 agent 프롬프트로 전달한 경우에는 agent가 실제 작업을 받았는지 보고·턴으로 확인한다.

지시서 텍스트를 셸 명령문으로 이어 붙이지 않는다. 긴 지시서는 파일로 작성하고 프로세스 인자 배열로 읽어 전달한다. `hc run`은 프롬프트를 stdin에서 읽는 세션 생성 명령이 아니다.

## agent·모델·effort

모델·effort는 **hc 옵션이 아니라 agent CLI 옵션**이다. 다음 MODEL은 사용자가 지정한 실제 모델명으로 바꾼다. effort도 요청값과 설치된 CLI가 지원하는 값을 확인한다.

```bash
hc run --bg --json --name relay-codex --cwd /absolute/worktree -- codex --no-daemon --model MODEL -c 'model_reasoning_effort="high"' '이번 작업 지시'
hc run --bg --json --name relay-claude --cwd /absolute/worktree -- claude --model MODEL --effort high '이번 작업 지시'
```

지속되는 기본값은 `hc templates`에서 해당 템플릿의 command를 확인하고, `~/.config/herdr-core/templates/<name>.md`의 `command`에 필요한 agent·모델·effort 옵션만 변경한다. `XDG_CONFIG_HOME` 설정 시 해당 config home을 사용한다. 다른 템플릿이나 agent 전역 설정을 임의로 바꾸지 않는다. 기존 `ready`, `submit`, `stop`, `paste_gap_ms`, 역할 본문은 보존한다.

HC 템플릿 헤더는 일반 YAML이 아닌 줄 단위 형식이다. 예를 들어 다음은 헤더 **일부**이며, 기존 command에 적용할 옵션의 형태를 보여 준다. MODEL은 실제 값으로 바꾸고 전체 command를 YAML 따옴표로 감싸지 않는다.

```text
command: codex --no-daemon --model MODEL -c 'model_reasoning_effort="high"'
command: claude --model MODEL --effort high
```

위 두 command는 각각 별도 템플릿에 해당한다. 한 템플릿에 둘을 동시에 쓰지 않는다. 새 터미널부터 설정이 적용되며 실행 중인 agent 설정이 자동 변경되었다고 보고하지 않는다. 실제 적용은 agent의 시작 정보·상태 또는 확인 가능한 설정으로 대조한다. 전달한 인자만 확인했다면 `요청됨/실행 옵션 확인, 실제 적용 미확인`으로 기록한다.

E1~E4는 작업 분류다. 기존 등급별 effort 정책을 적용할 때는 E1=low, E2=medium, E3=high, E4=xhigh를 출발점으로 삼되 사용자 지정과 해당 모델의 지원 범위를 우선한다. max·ultra는 사용자가 명시한 경우에만 검토하고 CLI 지원 여부를 확인한다. 이 스킬에 개인 JSON 설정 저장소나 자동 라우팅 실행기가 있는 것은 아니다.

## 부모 주소·대상 머신

Herdr 터미널에서는 현재 `$HC_TERMINAL_ID`로 자식 관계가 자동 설정되므로 임의의 `--parent`를 추가하지 않는다. 자식의 같은 변수는 자식 자신의 주소이므로 부모의 값은 지시서에 따로 전달한다.

외부 호출에서는 대상 core와 실제 부모 터미널을 확인한 경우에만 다음 형식을 쓴다. PARENT_ADDRESS는 `hc get`으로 확인된 주소이며 추정값을 넣지 않는다.

```bash
hc get PARENT_ADDRESS --json
hc run --bg --json --parent PARENT_ADDRESS --name relay-codex --cwd /absolute/worktree -- codex --no-daemon '이번 작업과 보고할 부모 주소'
```

외부에서 부모를 확인하지 못하면 `--no-parent`로 독립 터미널을 실행하고 그 사실을 기록한다. 같은 디렉터리·탭·agent 브랜드가 부모 관계의 증거는 아니다. 외부 프로세스의 HC 환경을 근거 없이 다른 세션으로 덮어쓰지 않는다.

원격 작업은 `hc machine ls`로 이미 연결된 대상을 확인하고 `hc run --on MACHINE …`을 사용한다. 반환된 `machine/t7` 전체 주소를 후속 명령에서도 사용한다. cwd·템플릿·파일·agent 설치는 대상 머신 기준이다.

## 후속 지시·대기·수집

ADDRESS는 run이 반환한 실제 주소다.

```bash
hc get ADDRESS --json
hc send ADDRESS '이번 지시 ID와 후속 작업' --wait --timeout 45 --json
hc wait ADDRESS --timeout 45 --json
hc read ADDRESS --lines 100
```

부모 터미널에서는 `hc wait --children any` 또는 `hc wait --children all`로 자식을 기다릴 수도 있다. `--children all`도 메시지에 의해 먼저 반환될 수 있으므로 결과를 확인한다. 대기 JSON의 `reason`, `ended`, `status`, `turn`, `exit_code`, `signal`과 필요시 `children`을 읽는다.

| reason/상태 | 처리 |
| --- | --- |
| timeout | 아직 실행될 수 있음. 같은 주소에서 다시 대기하며 중복 실행하지 않음 |
| message | 메시지가 부모 입력으로 전달됨. 보고를 처리하고 남은 작업이 있으면 다시 대기 |
| status / idle·done | 턴이 멈춘 상태. 현재 지시 결과와 변경·검증 근거를 별도 확인 |
| status / blocked·error | 화면과 실제 요청·오류를 확인. 필요한 승인·답변 범위를 판단 |
| not_started | send한 작업이 시작되지 않았을 수 있음. 화면을 읽고 재전송 여부 판단 |
| exit | 실제 exit_code·signal과 보고 확인. 프로세스 종료는 작업 성공의 증거가 아님 |

`hc wait`는 상태 JSON을 반환하는 명령이므로 **CLI 종료코드 0만으로 테스트 성공을 판단하지 않는다**. 상태는 프로그램의 OSC 7501 보고에서 온다. 보고가 없는 일반 프로그램은 agent 상태가 없고 보통 종료까지 기다린다. 화면 문구나 조용한 출력만으로 idle·done을 만들어내지 않는다.

`hc read`는 working·blocked·error 상태에서 현재 화면만 반환하고 history가 불완전할 수 있다. 긴 결과는 보고 파일로 남기고 경로를 받는다. `hc send --force`는 권한 결정을 우회하는 용도로 사용하지 않는다. 추가 사용자 승인이 필요한 입력은 승인 후에만 전달한다. timeout으로 입력 도착 여부가 불명확하면 먼저 화면·턴을 확인한다.

## 정리

새 Git 프로젝트 작업은 [생명주기 도구](cleanup.md)로 자원을 생성·기록하고, 완료 확인 후 `finish`를 호출해 보고·로그 보존 → HC 종료 → 관리 worktree 제거를 수행한다. `hc` 자체가 Git 격리나 결과 검증을 대신하는 것은 아니다.

직접 실행한 기존 작업은 자동 등록·삭제하지 않는다. 실제 소유권과 후속 작업 종료를 확인하고 보고·로그를 외부에 보존한 뒤 **자신이 시작한 터미널만** `hc kill ADDRESS`, `hc rm ADDRESS`로 정리한다. `hc interrupt`는 현재 턴을 중단하고 `hc kill`은 프로그램을 끝내므로 구별한다. worktree는 가이드의 Git 확인 절차로 별도 관리하며 branch는 보존한다. core 전체의 stop/restart나 앱 재설치를 수행하지 않는다.

## 출처

- [공식 HC 매뉴얼](https://github.com/herdrdev/herdr-core/blob/9ce385d9c8abb041dd4437476d770365b3fb5282/crates/herdr-core/src/SKILL.md)
- [CLI 구현과 대기 결과 처리](https://github.com/herdrdev/herdr-core/blob/9ce385d9c8abb041dd4437476d770365b3fb5282/crates/herdr-core/src/cli.rs)
- [템플릿 형식](https://github.com/herdrdev/herdr-core/blob/9ce385d9c8abb041dd4437476d770365b3fb5282/docs/templates.md)
