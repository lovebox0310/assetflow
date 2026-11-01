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
