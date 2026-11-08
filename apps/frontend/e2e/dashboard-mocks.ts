import type { Page } from "@playwright/test";
import {
  cardCompanyGroupsResponse,
  cashflowResponse,
  monthlyCategoriesResponse,
  monthlyIncomeResponse,
  settingsResponse,
  summaryResponse,
} from "./fixtures";

/**
 * 대시보드가 부르는 API 를 한 곳에서 모의한다.
 * 여러 스펙(dashboard·layout·a11y)이 같은 응답을 봐야 화면이 같다.
 */
export async function mockDashboardApi(page: Page) {
  await page.route(/\/api\/v1\/.*/, async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

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
    return route.fulfill({ status: 404, body: "Not mocked: " + pathname + url.search });
  });
}

/**
 * 디자인 스냅샷 촬영 전에 도넛 차트가 그려질 때까지 기다린다.
 * 애니메이션 자체는 `prefers-reduced-motion: reduce` 로 끈다(openDashboard).
 * 여기서는 lazy 로딩된 차트가 실제로 마운트되고 DOM 이 안정될 때까지 확인한다 —
 * 스켈레톤 상태로 찍히면 baseline 이 화면 상태에 따라 달라진다.
 */
export async function waitForDashboardCharts(page: Page) {
  const svg = page.locator('section[aria-labelledby="h-composition"] svg').first();
  await svg.waitFor({ state: "attached" });
  let prev = await svg.evaluate((el) => el.outerHTML);
  let stable = 0;
  for (let i = 0; i < 50; i += 1) {
    await page.waitForTimeout(100);
    const cur = await svg.evaluate((el) => el.outerHTML);
    stable = cur === prev ? stable + 1 : 0;
    if (stable >= 3) return;
    prev = cur;
  }
}
