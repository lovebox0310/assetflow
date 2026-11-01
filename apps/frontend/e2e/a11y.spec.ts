import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { authToken } from "./fixtures";
import { mockDashboardApi } from "./dashboard-mocks";

/**
 * §53.1 A2 — 자동 접근성 감사(axe-core)를 실브라우저에서 돌린다.
 * jsdom·접근성 트리 확인으로는 잡히지 않는 규칙(대비, 폼 라벨, 중복 랜드마크,
 * 문서 언어 등)을 WCAG 2.1 A/AA 기준으로 검사한다.
 *
 * 자동 검사는 스크린리더 낭독을 대신하지 않는다 — 규칙 위반만 잡는다.
 */

async function analyze(page: import("@playwright/test").Page) {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
}

test("대시보드에 WCAG A/AA 위반이 없다", async ({ page }) => {
  await mockDashboardApi(page);
  await page.addInitScript((token) => {
    localStorage.setItem("assetflow.token", token);
  }, authToken());

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "대시보드" })).toBeVisible();

  const results = await analyze(page);
  // 위반이 있으면 규칙 id 와 대상 노드를 그대로 보여 준다 — "실패"만으로는 고칠 수 없다.
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => n.target.join(" ")),
  }));
  expect(summary).toEqual([]);
});

test("로그인 화면에 WCAG A/AA 위반이 없다", async ({ page }) => {
  // 토큰이 없으면 로그인 화면이다.
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: /로그인/ })).toBeVisible();

  const results = await analyze(page);
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => n.target.join(" ")),
  }));
  expect(summary).toEqual([]);
});
