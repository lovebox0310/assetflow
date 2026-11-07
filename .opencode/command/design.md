---
description: UI/UX 범위를 리드가 Full 티어로 처리한다. 감사→스펙→구현→시각 검증.
agent: lead
---

**UI 범위:** $ARGUMENTS

UI 변경이므로 **Full 티어**로 시작한다. 범위가 작으면 planner를 생략할 수 있다.

1. **진단** — 화면/모달, 현재 `file:line`, 320/390에서의 문제
2. **designer** — `mobile-ui` 스킬 기반으로 감사 + 320/375/390/430 스펙
3. **Gate 1** — 스펙 승인
4. **developer** — 구현 + `tsc`/테스트/빌드 + before/after 스크린샷
5. **qa** — AC·스크린샷·측정값으로 독립 검증. Blocker면 멈춘다
6. **Gate 2** — 사람이 실제 아이폰/좁은 화면에서 확인

## 반드시

- `qa` 에는 개발자 설명을 넘기지 않는다
- 스크린샷은 `/tmp/opencode/` 에만 만든다
- 320px에서 먼저 맞춘다
- 모달은 `max-height: calc(100dvh - 32px)`, body 스크롤, footer 고정, safe-area
- **커밋하지 않는다**
