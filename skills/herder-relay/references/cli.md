# Herder CLI

확인일: 2026-11-07. 조사 기준: upstream commit `701a5b527d486863442b9a3de218e6c02af0e2a4`.
설치된 버전의 `--help`가 우선이다. `herder`와 `herdr`는 다른 제품이다.

## 생성·후속 지시·대기

다음 예시의 repo, provider, branch, 파일 경로를 실제 값으로 바꾼다. 여러 머신이 연결되어 있으면 모든 명령에 같은 `--machine NAME`을 전달한다. 기본 머신이 모호하면 임의로 고르지 않는다.

```bash
herder session new --repo /absolute/repo --provider codex --mode auto-edit --branch relay/fix-parser --json < /tmp/herder-brief.md
```

반환 JSON의 `session_id`를 기록한다. `--provider`는 해당 provider의 계정을 고른다. 특정 계정이 요청되면 `--account ACCOUNT`로 대체한다. 두 옵션은 동시에 쓸 수 없다. 사용자가 모델을 지정하면 `--model MODEL`을 추가한다. `--project ID`는 `--repo`를 대체할 수 있다. repo 경로는 **대상 머신** 기준이다. stdin이 비어 있으면 지시 없는 idle 세션이 생기므로 지시서를 먼저 확인한다.

```bash
herder session wait SESSION_ID --timeout 45 --json
herder session status SESSION_ID --json
herder session send SESSION_ID --json < /tmp/herder-followup.md
```

프롬프트는 stdin으로 전달한다. 문서 내용을 셸 문자열로 조립하지 않는다. `send`가 성공하면 전달/대기열 등록이 된 것이므로 후속 턴 결과를 다시 기다린다. `status`의 `seq`, `last_message`, `last_error`, `branch`, `provider`, `model`, `approvals`, `questions`를 확인한다. 새 턴 확인에는 직전 seq와 지시 내용을 함께 참고하고, 이전 마지막 답변을 새 결과로 판정하지 않는다.

## 종료코드

| 명령 | 코드 | 의미와 처리 |
|---|---|---|
| wait | 0 | idle. 최종 답변·요구사항·변경·검증 결과를 확인 |
| wait | 2 | needs_you 또는 needs_login. questions/approvals/상태를 확인 |
| wait | 3 | 세션 오류. last_error 확인 후 복구 판단 |
| wait | 4 | timeout. 중단된 것이 아니므로 같은 세션에서 대기 계속 가능 |
| 공통 | 1 | 연결·명령 실패. 결과 상태부터 확인하고 중복 생성 방지 |
| 공통 | 64 | 인자 오류. 현재 help와 명령을 대조 |

cmux-relay의 `3/4/5/6/124` 판정표를 사용하지 않는다. `wait --dispatch`, `--keep-open`도 없다.

## 질문·승인

```bash
herder session send SESSION_ID --answer QUESTION_ID '확인된 답변' --json
herder session send SESSION_ID --approve APPROVAL_ID --json
herder session send SESSION_ID --deny APPROVAL_ID --json
```

질문 ID와 승인 ID는 status가 반환한 값을 쓴다. `--approve`는 실제 사용자 승인 및 현재 실행 권한이 충족된 요청에만 사용한다. 단순 프롬프트 전송으로 권한 요청에 응답하지 않는다. CLI의 질문 선택 번호는 **1부터**, MCP의 choice 인덱스는 **0부터**다.

권한 모드: `read-only`(읽기, 쓰기·명령 거부), `ask`(쓰기·명령마다 확인), `auto-edit`(파일 편집 허용, 명령 확인), `full-access`(확인 없음). 예시의 `auto-edit`도 작업 범위에 맞춰 선택하며, 막혔다고 자동으로 full-access로 바꾸지 않는다.

## 전환·정리

현재 버전에 `switch`가 있는지 help를 확인한다. provider/model 전환이 필요하고 요청 범위에 포함되면 다음을 사용할 수 있다.

```bash
herder session switch SESSION_ID --provider codex --model MODEL --json
herder session archive SESSION_ID --json
herder session unarchive SESSION_ID --json
```

계정 한도 시 Herder의 failover는 같은 provider 안의 계정 전환이다. `--pin`은 계정을 고정하고 `--no-pin`은 회전을 허용하며, 모델 고정과는 다르다. 정책을 임의로 바꾸지 않는다. archive는 세션을 멈추고 읽기 전용으로 만들며 worktree를 3일 뒤 제거하고 branch는 보존하는 동작이다(조사 버전 기준). `wait`는 자동 정리하지 않는다.

## 출처

- [CLI 구현과 JSON 형식](https://github.com/herder-sh/herder/blob/701a5b527d486863442b9a3de218e6c02af0e2a4/crates/herder/src/session.rs)
- [공식 소개·실행 예시](https://herder.sh/llms-full.txt)
