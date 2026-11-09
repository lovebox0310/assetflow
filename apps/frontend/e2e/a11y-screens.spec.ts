import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { authToken } from "./fixtures";
import { mockScreenApi, type ScreenKey } from "./screens-mocks";

/**
 * §80 후속 — 대시보드 밖 5개 화면까지 axe 가드를 넓힌다.
 *
 * 기존 e2e/a11y.spec.ts 는 데스크톱 1뷰포트·라이트·wcag 태그만 본다. 여기서는
 * 6화면 × 2테마를 320/390/1280 에서 각각 로드해 axe 를 돌리고 넘침까지 확인한다.
 *
 * - 6 × 2 = 12 테스트. 각 테스트가 뷰포트 3개를 순회한다.
 * - 프로젝트 3배 실행을 막기 위해 chromium-desktop 에서만 실행하고 나머지는 skip.
 * - 위반은 이 단계에서 고치지 않는다(제품 코드 수정 금지) — 목/스펙만 추가한다.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];
const THEMES = ["light", "dark"] as const;

interface ScreenSpec {
  key: ScreenKey;
  name: string;
  hash: string;
  /** 목이 실제로 행을 렌더했는지 확인하는 문구 — 실패하면 목 형태가 틀린 것이다. */
  readyText: string;
}

const SCREENS: ScreenSpec[] = [
  { key: "dashboard", name: "대시보드", hash: "#/", readyText: "예측 비상금" },
  { key: "assets", name: "자산", hash: "#/assets", readyText: "파킹통장" },
  { key: "investments", name: "투자", hash: "#/investments", readyText: "삼성전자" },
  { key: "expenses", name: "지출", hash: "#/expenses", readyText: "주말 장보기" },
  { key: "expenseCards", name: "카드내역", hash: "#/expenses/cards", readyText: "한마음식당" },
  { key: "settings", name: "설정", hash: "#/settings", readyText: "김가명" },
];

interface ViolationSummary {
  screen: string;
  theme: string;
  viewport: string;
  id: string;
  impact: string | null;
  target: string;
  nodes: number;
}

for (const screen of SCREENS) {
  for (const theme of THEMES) {
    test(`${screen.name} · ${theme}`, async ({ page }, testInfo) => {
      // 프로젝트 3배 실행 금지 — desktop 프로젝트에서만 실제로 돈다.
      test.skip(
        testInfo.project.name !== "chromium-desktop",
        "a11y 화면 감사는 chromium-desktop 에서만 실행한다(중복 실행 방지)",
      );

      await page.addInitScript(
        ({ token, mode }) => {
          localStorage.setItem("assetflow.token", token);
          localStorage.setItem("assetflow.theme", mode);
        },
        { token: authToken(), mode: theme },
      );

      await mockScreenApi(page, screen.key);

      const violations: ViolationSummary[] = [];
      const overflows: { viewport: string; value: number }[] = [];

      for (const viewport of VIEWPORTS) {
        // 쿼리를 붙여 같은 해시라도 반드시 새 문서로 로드한다(목·테마 재적용 보장).
        const url = `/?qa-a11y=${viewport.width}${screen.hash}`;
        await page.setViewportSize(viewport);
        await page.goto(url, { waitUntil: "networkidle" });

        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        // 목이 행을 렌더했는지 먼저 확인한다 — 여기서 실패하면 접근성 위반이 아니라
        // 목 응답 형태가 틀린 것이므로 원인을 바로 알 수 있다.
        await expect(page.getByText(screen.readyText).first()).toBeVisible({ timeout: 15000 });

        const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        for (const violation of results.violations) {
          for (const node of violation.nodes) {
            violations.push({
              screen: screen.name,
              theme,
              viewport: `${viewport.width}x${viewport.height}`,
              id: violation.id,
              impact: violation.impact ?? null,
              target: node.target.join(" "),
              nodes: violation.nodes.length,
            });
          }
        }

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow !== 0) overflows.push({ viewport: `${viewport.width}x${viewport.height}`, value: overflow });
      }

      // 넘침 0 — 조합별로 남긴다.
      expect(overflows, `${screen.name}/${theme} 가로 넘침`).toEqual([]);
      // 위반은 화면·테마·뷰포트·rule·impact·셀렉터를 남긴 채 실패시킨다.
      expect(violations, `${screen.name}/${theme} axe 위반`).toEqual([]);
    });
  }
}
