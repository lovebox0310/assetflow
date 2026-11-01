import { test, expect } from "@playwright/test";
import { authToken } from "./fixtures";
import { mockDashboardApi } from "./dashboard-mocks";

/**
 * 레이아웃 실측 — jsdom 은 레이아웃을 계산하지 않으므로 가로 넘침은
 * 실제 브라우저에서만 확인할 수 있다 (#70 모바일 360px 기준).
 */
test.describe("DashboardPage 레이아웃 실측", () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardApi(page);

    await page.addInitScript((token) => {
      localStorage.setItem("assetflow.token", token);
    }, authToken());

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/", { waitUntil: "networkidle" });
  });

  test("360px 에서 가로 스크롤이 생기지 않는다", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible();
    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
    }));
    expect(overflow.document).toBeLessThanOrEqual(0);
    expect(overflow.body).toBeLessThanOrEqual(0);
  });

  test("360px 에서 조회 범위 컨트롤이 카드 안에 들어온다", async ({ page }) => {
    const cards = page.locator("section", { has: page.getByRole("heading", { name: "지출 추이" }) });
    const picker = cards.locator(".ant-picker-range").first();
    await expect(picker).toBeVisible();
    const { cardRight, pickerRight } = await page.evaluate(() => {
      const section = [...document.querySelectorAll("section")].find((s) =>
        s.querySelector("h2")?.textContent?.includes("지출 추이"),
      );
      const card = section?.querySelector(".ant-card");
      const range = card?.querySelector(".ant-picker-range");
      return {
        cardRight: card?.getBoundingClientRect().right ?? 0,
        pickerRight: range?.getBoundingClientRect().right ?? 0,
      };
    });
    expect(pickerRight).toBeLessThanOrEqual(cardRight + 1);
  });
});
