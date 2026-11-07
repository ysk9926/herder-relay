---
name: herder-relay
description: Herder(herder.sh)로 Claude Code·Codex에 작업을 위임하거나 자식 세션의 후속 지시·대기·검토를 요청할 때 사용한다. "Herder로 맡겨줘", "herder-relay", "Herder에서 다른 모델로 검토해줘"에 적용한다. herdr.dev 터미널 제어 요청과 일반적인 코드 수정 요청에는 적용하지 않는다.
---

# Herder Relay

cmux-relay의 지시서·단계별 검토 방식을 **Herder(herder.sh)**의 공식 CLI 및 내장 MCP 작업 도구로 수행한다. 이 패키지는 지침과 템플릿이며 별도 `relay` 실행기를 제공하지 않는다. cmux-relay 설치나 cmux 실행은 필요 없다.

## 실행 경로

- Herder 세션 안에서 내장 작업 도구가 제공되면 `spawn`, `send`, `status`, `wait_for`, `answer`를 사용한다. 실제 도구 이름·인자는 현재 도구 목록의 스키마로 확인한다. [MCP 가이드](references/mcp.md)를 읽는다. 부모·자식 관계를 유지한다.
- 도구가 없거나 외부에서 세션을 관리하면 [CLI 가이드](references/cli.md)를 읽고 `herder session`을 사용한다. 먼저 `command -v herder`, `herder --version`, `herder session --help`로 지원 범위를 확인한다. 없으면 준비된 지시서와 부족한 실행 환경을 보고하고 멈춘다.
- 설치·서비스 시작·로그인·머신 연결은 별도 설정 작업이다. 위임을 이유로 실행하지 않는다. `HERDR_ENV`는 다른 제품인 Herdr의 변수이므로 검사하지 않는다.

## 작업 지정

1. [지시서](templates/brief.md)에 목표, 맡길 파일, 읽기 전용 범위, 완료 기준과 실제 사용자 지시를 채운다. 자식은 대화 전체를 받지 않으므로 필요한 맥락을 포함한다. 다른 작업자가 있을 수 있음을 알리고 타인의 변경을 되돌리지 않게 한다.
2. 사용자 지정 provider·model·account·machine을 우선한다. 없으면 현재 Herder 작업의 기본값을 유지한다. 디자인은 Claude, 복잡한 로직은 Codex를 후보로 고려하되 현재 허용 provider와 모델을 확인한다. 같은 provider의 별도 검토는 `same-provider`로 보고한다.
3. E1(조회·변환), E2(작은 수정), E3(여러 모듈·디버깅), E4(설계·권한·정산·DB 스키마) 중 가장 높은 해당 등급과 근거를 지시서에 기록한다. 등급은 작업 분류다. Herder CLI에 없는 `--tier`·`--effort`를 붙이지 않는다. effort를 실제 설정·확인하지 못하면 미확인으로 보고한다.
4. 실행 전 provider·모델(또는 기본값)·등급·파일 범위를 한 줄로 알린다. 자식의 권한은 현재 허용 범위 안에서 정한다. 기존 사용자 승인도 지시서에 전달한다. 자식이 권한 요청을 하면 승인된 범위와 대조하고, 추가 승인이 필요한 요청만 사용자에게 전달한다.

## 실행과 결과

- 새 자식/세션 식별자와 반환된 branch를 기록한다. 코드 변경은 Herder가 만든 작업 branch에서 수행한다. worktree가 없고 공유 폴더를 쓰면 파일 담당을 분리한다. 이 스킬에는 cmux-relay의 `--owns` 잠금 기능이 없다.
- 후속 지시에는 **같은 식별자**를 사용한다. Herder는 실행 중인 턴 뒤에 지시를 대기시킬 수 있다. 타임아웃이나 응답 유실 때 새 세션을 중복 생성하지 말고 기존 상태부터 확인한다.
- 대기는 `wait_for` 또는 `session wait`를 사용한다. 상태 목록을 반복 조회하지 않는다. 도구 호출 제한과 진행 알림 주기에 맞춰 timeout을 정한다.
- `idle`, `wait=0`, 보고서의 `done`은 검증 성공을 보증하지 않는다. 마지막 보고, 실제 branch의 변경과 검증 근거를 확인한다. 이전 턴의 보고를 현재 지시 결과로 사용하지 않는다.
- 자식에게 [보고 형식](templates/report.md)으로 최종 답변하게 한다. Herder는 최종 답변을 전달하므로 로컬 report JSON 파일이나 cmux dispatch ID는 필요 없다.

## plan → work → review → verify

사용자가 전체 과정을 요청했거나 변경 규모상 필요할 때 적용한다. 단순 조회에 네 단계를 강제하지 않는다.

- **plan:** 범위·접근·완료 기준을 정리한다.
- **work:** 구현을 맡기고 실제 branch와 결과를 확보한다.
- **review:** 별도 세션에 구현 branch/커밋과 diff를 제공한다. 새 세션이 구현 결과를 자동으로 공유한다고 가정하지 않는다. 수정이 필요하면 원래 구현 세션으로 보낸다.
- **verify:** 허용된 테스트·빌드를 **구현 결과가 있는 checkout**에서 실행하고 명령, cwd, 대상 커밋/변경 상태, 종료코드와 로그를 기록한다. 실제 성공 근거가 있을 때만 `verified`로 보고한다. 실행하지 못했으면 `not_run` 또는 `reported_done`과 이유를 남긴다.

Herder에 없는 `workflow start/approve/advance`, `escalate`, `gc` 명령을 만들지 않는다. 단계 진행과 증거 확인은 부모가 담당한다. 실패는 원인을 확인해 수정하며, provider 전환이나 재시도를 무조건 반복하지 않는다. Herder의 계정 failover와 provider 변경은 구별한다.

## 마무리

변경 branch와 검증 결과를 사용자에게 전달한다. branch 병합·푸시·PR 게시·배포는 요청 범위에 따라 별도로 수행한다. 후속 작업 중에는 세션을 유지한다. 정리가 필요하면 기록과 변경을 확인한 뒤 Herder의 archive를 사용하며 worktree를 직접 삭제하지 않는다.
