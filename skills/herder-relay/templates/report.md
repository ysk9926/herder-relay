# Herdr / hc 작업 결과

- 작업 ID / 이번 지시 ID:
- 단계: plan | work | review | verify
- 상태: done | needs_input | failed
- 신뢰도: not_run | reported_done | verified
- 요약:
- 실제 HC 터미널 주소 / 대상 머신 / 이번 지시 턴:
- 확인된 부모 주소와 근거 (없거나 미확인이면 명시):
- 실제 agent / model / effort (실행 옵션 확인과 실제 적용 확인을 구별, 미확인이면 명시):
- 실제 cwd / worktree 경로 / branch / 커밋 / 미커밋 변경 유무:
- 격리 구성과 근거 (HC parent 관계가 Git 격리의 증거는 아님):

## 변경
파일별 변경 내용과 이유를 적는다. 변경이 없으면 없다고 적는다.

## 검증 근거
각 검증의 실제 명령, cwd, 대상 커밋/변경 상태, 종료코드, 로그 또는 출력의 근거를 적는다.
실행하지 않은 검증은 not_run과 이유를 적는다. 계획한 명령을 실행한 것처럼 쓰지 않는다.
검증 성공 증거가 없으면 verified를 사용하지 않는다. 부모가 결과와 증거를 대조해 최종 판단한다.
hc wait의 CLI 종료코드나 idle·done은 테스트 명령의 성공 증거가 아니다.

## 질문·제한·다음 작업
질문, 미측정 값, 남은 오류, 후속 작업에 필요한 사항을 적는다.
보고할 실제 부모 주소가 제공되었다면 hc send로 결과 또는 이 보고 파일의 경로를 전달한다.

## 부모의 완료 후 정리 결과
- 생명주기 task ID / cleanup 상태(closed | retained | kept-open | eligible):
- 터미널별 종료·제거 상태와 보존 이유:
- 관리 worktree 제거 여부 / 보존 경로·이유:
- 보존한 branch·커밋 / 보고·로그 경로:
- keep-open 여부 / 후속 정리 명령:

자식 단계에서는 정리 미실행으로 기록한다. 부모는 finish/cleanup의 실제 결과로 이 항목을 채우며, 정리 실패를 작업 실패나 검증 성공과 혼동하지 않는다.
