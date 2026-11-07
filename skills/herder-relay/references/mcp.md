# Herder 세션 안의 작업 도구

확인일: 2026-11-07. 다음은 논리적 도구 이름이다. MCP 서버 접두어와 정확한 스키마는 현재 연결 도구 목록에서 확인한다. Herder가 주입한 작업 도구가 있을 때 이 경로를 우선한다.

| 도구 | 주요 인자 | 결과·주의 |
|---|---|---|
| spawn | task, prompt, 선택적 provider/model/permission_mode | child와 선택적 branch. 대화는 자동 전달되지 않음 |
| send | child, text | queued=true면 실행 중인 턴 뒤에 대기 |
| status | 선택적 children 배열 | 자식별 status, last_report, open_questions, branch |
| wait_for | 선택적 child, timeout_secs | report / request / timeout / idle |
| answer | child와 질문 또는 승인 인자 | 질문에는 question_id와 text/choice/choices, 승인에는 approval_id와 decision |

`spawn` 예시(현재 스키마로 확인 후 호출):

```json
{
  "task": "파서 경계 조건 수정",
  "prompt": "완성된 지시서 전체를 여기에 전달한다.",
  "provider": "codex"
}
```

provider는 현재 작업이 허용한 provider 중에서 고르고, 권한 모드는 부모 권한을 넘을 수 없다. model을 생략하면 같은 provider에서는 부모의 모델, 다른 provider에서는 해당 provider 기본값을 따른다. 지원 여부를 모르는 모델명이나 effort 필드를 임의로 추가하지 않는다.

`wait_for`의 timeout_secs 지원 범위는 조사 버전에서 1~600초다. 실제 호출 제한과 사용자 진행 알림을 고려한다. `report`에는 child, turn_id, summary, status가 있으므로 현재 지시 턴과 연결해 기록한다. `request`는 질문 또는 승인 요청이다. `timeout`은 실행 중단이 아니고 `idle`은 기다릴 작업이 없다는 뜻이다. 모두 실제 상태와 보고서를 확인해 판정한다.

질문 choice/choices는 **0부터 시작**한다. CLI `--answer` 숫자는 1부터 시작하므로 혼용하지 않는다. 승인 decision=allow는 현재 권한과 기존 사용자 지시에 포함된 요청에만 사용한다. 추가 승인이 필요하면 사용자에게 요청 내용과 이유를 전달한다.

MCP 자식은 Git 저장소와 커밋이 있으면 별도 branch에서 작업한다. 없으면 부모와 같은 폴더에서 작업할 수 있다. branch가 반환되지 않았을 때 격리되었다고 가정하지 않는다. 여러 자식의 수정 파일을 겹치게 배정하지 않는다.

검토 자식에는 구현 branch/커밋과 diff를 명시하고, 검증은 구현 결과가 있는 checkout에서 수행하도록 지시한다. 단순히 같은 프로젝트에 새 자식을 만들었다는 이유로 구현 변경이 보인다고 가정하지 않는다.

출처: [입출력 스키마](https://github.com/herder-sh/herder/blob/701a5b527d486863442b9a3de218e6c02af0e2a4/crates/herder-tasktools/src/tools.rs).
