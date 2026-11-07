---
name: Mobile UI
description: iPhone/Android 좁은 화면에서 가로 넘침, 모달 잘림, 터치 타깃, safe-area, 키보드 가림을 점검하고 Ant Design 패턴으로 수정하는 절차.
---

## 언제 쓰는가

- "아이폰에서 가로가 좁다/넘친다"
- "모달이 커서 버튼이 안 보인다"
- "표/차트가 모바일에서 깨진다"
- "입력하면 화면이 확대된다"
- 모바일 UI 변경 전 감사·구현·검증

## 뷰포트

| 이름 | 크기 |
|---|---|
| iPhone SE 1 | 320×568 |
| iPhone SE 2/3 | 375×667 |
| iPhone 14/15 | 390×844 |
| iPhone Pro Max | 430×932 |

320px 에서 먼저 맞춘다. 320px에서 되면 나머지는 대개 된다.

## 측정 스크립트 (Playwright 예)

```js
import { chromium } from "playwright";

const url = process.env.URL;
const widths = [320, 375, 390, 430];
const browser = await chromium.launch();
for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.goto(url, { waitUntil: "networkidle" });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  const modal = await page.evaluate(() => {
    const el = document.querySelector(".ant-modal-content");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const footer = el.querySelector(".ant-modal-footer");
    const fr = footer?.getBoundingClientRect();
    return {
      content: { top: r.top, bottom: r.bottom, height: r.height },
      footerVisible: fr ? fr.bottom <= window.innerHeight && fr.top >= 0 : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
  console.log(width, { overflow, modal });
  await page.screenshot({ path: `/tmp/opencode/ui-${width}.png`, fullPage: true });
  await page.close();
}
await browser.close();
```

- 저장소 의존성을 바꾸지 않는다. Playwright 는 `/tmp/opencode` 임시 프로젝트에서 실행한다
- 로그인 토큰이 필요하면 기존 테스트의 `saveToken` 방식을 참고한다
- 스크린샷은 `/tmp/opencode/` 에만 만든다

## 모달 체크리스트

- width: `min(640px, calc(100vw - 24px))`
- content: `max-height: calc(100dvh - 32px)`, `display: flex`, `flex-direction: column`
- body: `overflow-y: auto`
- footer: 항상 보임, `padding-bottom: calc(12px + env(safe-area-inset-bottom))`
- 저장/취소/닫기 버튼이 스크롤 없이 보이는가
- 키보드가 올라와도 입력과 버튼이 가려지지 않는가

Ant Design 예:

```tsx
<Modal
  width="min(640px, calc(100vw - 24px))"
  styles={{
    content: {
      maxHeight: "calc(100dvh - 32px)",
      display: "flex",
      flexDirection: "column",
    },
    body: { overflowY: "auto" },
    footer: {
      margin: 0,
      padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
      borderTop: "1px solid var(--af-border)",
    },
  }}
/>
```

## 레이아웃 체크리스트

- `index.html` viewport 에 `viewport-fit=cover`
- `100vh` → `100dvh`
- 페이지 전체 `overflow-x: hidden` 으로 문제를 숨기지 않는다
- 표는 `overflow-x: auto` 또는 모바일 카드형
- 긴 텍스트는 wrap/truncate, 겹침 없음
- 고정 하단 요소는 safe-area 확보
- 차트는 `ResponsiveContainer` + 최소 높이

## 입력/터치

- `input`, `select`, `textarea` font-size ≥ 16px (iOS 자동 확대 방지)
- 버튼·링크·셀렉트 터치 타깃 ≥ 44×44px
- 숫자 입력에 `inputMode`/`autoComplete` 유지
- 라벨과 입력 연결, 에러 메시지 공간 확보

## AC 예시

- 320px 에서 `document.documentElement.scrollWidth === window.innerWidth`
- 모든 모달의 footer 버튼이 320×568 에서 스크롤 없이 보인다
- 입력 font-size ≥ 16px
- 터치 타깃 ≥ 44px
- 375/390/430 스크린샷에서 텍스트 겹침 0건

## 출력

1. 문제 표 (화면·뷰포트·문제·file:line·심각도)
2. 수정 내용
3. before/after 스크린샷 경로
4. 실행한 검증 명령
5. 미검증 항목
