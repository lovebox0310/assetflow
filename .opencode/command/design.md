---
description: 모바일 UI/UX를 감사→설계→구현→시각 검증까지 처리한다. 화면·모달 범위를 인자로 받는다.
agent: build
---

AssetFlow 의 모바일 UI/UX 파이프라인을 순서대로 실행한다.

**범위:** $ARGUMENTS

## 넘기는 것과 넘기지 않는 것

| 단계 | 받는 것 | 받지 않는 것 |
|---|---|---|
| ux-auditor | 범위, 뷰포트, 관련 AC | — |
| design-architect | 감사 결과 원문, 범위 | — |
| mobile-ui-developer | 감사 결과, 디자인 스펙, AC | — |
| **visual-reviewer** | **AC, 범위, before/after 스크린샷** | **개발자의 설명·판단 근거** |

앞 단계 출력은 원문 그대로 넘긴다. 요약하면 근거가 사라진다.

## 순서

1. **ux-auditor** — 실제 렌더 + 측정. 문제 표와 AC 초안.
   - 뷰포트: 320×568, 375×667, 390×844, 430×932
   - 가로 넘침, 모달 footer 버튼 노출, 터치 타깃, 16px 입력, safe-area
2. **design-architect** — 화면별 레이아웃·모달·브레이크포인트 스펙과 AC.
3. **mobile-ui-developer** — 스펙 구현. `tsc`, 테스트, 빌드, before/after 스크린샷.
4. **visual-reviewer** — 스크린샷과 측정값으로 독립 검증. Blocker 면 멈춘다.

## 중단 조건

- 감사에서 Blocker(버튼 사용 불가·모달 잘림·가로 스크롤)가 나왔는데
  설계가 이를 다루지 않으면 멈추고 보고한다
- visual-reviewer 가 Blocker 를 내면 멈추고 개발자에게 되돌린다
- Playwright/브라우저 실행이 불가능하면 추측으로 진행하지 말고 사용자에게 알린다

## 완료 후

- **커밋하지 않는다.** `git status --porcelain` 으로 남은 변경을 보여준다
- what changed / what was verified / what was not verified 를 구분해 보고한다
- before/after 스크린샷 경로를 남긴다
- 새 문서를 만들지 않는다. 스펙과 결과는 응답에만 쓴다
