import { test, expect } from "@playwright/test";
import {
  authToken,
  cardCompanyGroupsResponse,
  cashflowResponse,
  monthlyCategoriesResponse,
  monthlyIncomeResponse,
  settingsResponse,
  summaryResponse,
} from "./fixtures";

test.describe("DashboardPage E2E", () => {
test.beforeEach(async ({ page }) => {
    // API 응답을 모의로 채워 백엔드 없이도 대시보드를 렌더링한다.
    await page.route(/\/api\/v1\/.*/, async (route) => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      const search = url.search;

      if (pathname === "/api/v1/dashboard/summary") {
        return route.fulfill({ json: summaryResponse() });
      }
      if (pathname === "/api/v1/dashboard/cashflow") {
        return route.fulfill({ json: cashflowResponse() });
      }
      if (pathname === "/api/v1/dashboard/monthly-income") {
        return route.fulfill({ json: monthlyIncomeResponse() });
      }
      if (pathname === "/api/v1/assets/card-imports/monthly-categories") {
        return route.fulfill({ json: monthlyCategoriesResponse() });
      }
      if (pathname === "/api/v1/assets/card-imports/by-card") {
        return route.fulfill({ json: cardCompanyGroupsResponse() });
      }
      if (pathname === "/api/v1/settings") {
        return route.fulfill({ json: settingsResponse() });
      }

      // 모의가 없는 엔드포인트는 404 로 남긴다.
      return route.fulfill({ status: 404, body: "Not mocked: " + pathname + search });
    });

    // 인증 토큰을 미리 주입해 로그인 화면을 걷어낸다.
    await page.addInitScript((token) => {
      localStorage.setItem("assetflow.token", token);
    }, authToken());

    await page.goto("/", { waitUntil: "networkidle" });
  });

  test("대시보드 섹션이 정보 계층 순서로 배치된다", async ({ page }) => {
    const headings = await page.locator("h2").allTextContents();
    expect(headings).toEqual([
      "핵심 지표",
      "자산 구성비",
      expect.stringMatching(/^현금/),
      "카드별 본인·가족 사용 내역",
      "지출 추이",
      "월별 현금흐름",
    ]);
  });

  test("핵심 지표 카드가 렌더된다", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "순자산" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "월 수지" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /비상금|투자금 유지 개월/ })).toBeVisible();
  });

  test("현금 계좌가 카드형으로 렌더되고 비상금 계좌만 강조된다", async ({ page }) => {
    const items = page.locator(".af-cash-item");
    await expect(items).toHaveCount(2);
    // 현금 합계 25,500,000 → 18,500,000 은 72.5%
    await expect(items.first()).toContainText("우리 파킹통장");
    await expect(items.first()).toContainText("18,500,000원");
    await expect(items.first()).toContainText("현금의 72.5%");

    const emergency = page.locator(".af-cash-item--emergency");
    await expect(emergency).toHaveCount(1);
    await expect(emergency).toContainText("비상금");
  });

  test("현금 계좌 카드는 좁은 화면 1열·넓은 화면 다열", async ({ page }) => {
    const grid = page.locator(".af-cash-grid");
    const columns = () =>
      grid.evaluate((el) =>
        getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length,
      );

    await page.setViewportSize({ width: 360, height: 800 });
    expect(await columns()).toBe(1);

    await page.setViewportSize({ width: 1280, height: 900 });
    expect(await columns()).toBeGreaterThanOrEqual(2);
  });

  test("카드별 본인·가족 차트가 렌더된다", async ({ page }) => {    const section = page.locator("section", { has: page.getByRole("heading", { name: "카드별 본인·가족 사용 내역" }) });
    await expect(section).toBeVisible();
    // 차트 컨테이너는 role="img" 와 요약 aria-label 을 갖는다.
    await expect(
      section.getByRole("img", { name: /카드별 본인·가족 사용 내역/ }),
    ).toBeVisible();
  });
});
