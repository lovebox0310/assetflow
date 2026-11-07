---
description: 리드가 요구를 해석·진단하고 비용 티어에 맞춰 전문 에이전트에 위임한다. 요구사항을 인자로 받는다.
agent: lead
---

**요구사항:** $ARGUMENTS

리드 워크플로우를 따른다.

1. **해석** — 요구·의도·제약을 한 문장으로 다시 쓴다
2. **코드 분석** — `git status`, 관련 파일, `.ai/project.md` 해당 §
3. **진단** — 현재 동작과 원인을 `file:line` 으로
4. **티어 선택**
   - Lite: 작은 수정 → lead + developer
   - Standard: 일반 버그/기능 → lead + developer + qa
   - Full: 새 기능/UI → planner(선택) + designer(UI) + developer + qa
   - Deep: 대규모/계약 변경 → Full + architect + 병렬 조사
5. **태스크 패킷** — Why / Current / Problem / Scope / AC / Owner / Verification
6. **Gate 1** — 진단·티어·태스크 분해를 사람에게 승인받는다
7. **위임** — 태스크 패킷만 넘긴다. 전체 대화를 넘기지 않는다
8. **통합** — QA 실패 시 최대 2회만 재시도. 3회째는 멈추고 보고
9. **Gate 2/3** — 외부 접근(은행·증권·이메일·키·권한)과 최종 QA는 사람이 확인
10. **보고** — 바뀐 것/검증한 것/못 한 것/사람이 할 일

## 반드시

- `qa` 에는 AC·범위·산출물만 넘긴다. 개발자 설명은 넘기지 않는다
- 예상 호출이 티어 상한(Lite 3 / Standard 6 / Full 12 / Deep 20)을 넘으면 멈추고 묻는다
- `planner`·`designer`·`architect` 는 필요할 때만 부른다
- 외부 시스템이 나오면 `integration-runbook` 스킬을 읽고 사람이 할 일을 분리한다
- **커밋하지 않는다**
- 새 문서를 만들지 않는다. 기록은 `.ai/session-log.md` 에 제안만 한다
