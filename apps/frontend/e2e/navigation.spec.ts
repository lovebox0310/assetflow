import { test, expect, type Page } from "@playwright/test";
import { authToken } from "./fixtures";

/**
 * §53.1 A1 — 실브라우저 실측: 해시 딥링크·뒤로가기·탭 제목.
 * jsdom 단위 테스트(App.test.tsx)와 달리 실제 히스토리·주소창·새로고침을 쓴다.
 */

/** 화면마다 필요한 최소 응답만 돌려준다 — 레이아웃 확인이 목적이라 빈 데이터면 충분하다. */
async function mockApi(page: Page) {
  await page.route(/\/api\/v1\/.*/, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const ok = (data: unknown) =>
      route.fulfill({ json: { code: "OK", message: "loaded", data } });

    if (pathname === "/api/v1/assets/accounts") return ok([]);
    if (pathname === "/api/v1/investments/portfolio") return ok({ accounts: [], holdings: [], summary: [] });
    if (pathname === "/api/v1/dashboard/summary")
      return ok({
        asOf: new Date().toISOString(),
        assets: [],
        liabilities: [],
        monthly: {
          income: 0,
          vatSetAside: 0,
          expenses: 0,
          essentialExpenses: 0,
          essentialComplete: true,
          balance: 0,
        },
      });
    if (pathname === "/api/v1/dashboard/cashflow") return ok([]);
    if (pathname === "/api/v1/dashboard/monthly-income") return ok([]);
    if (pathname === "/api/v1/assets/card-imports/monthly-categories") return ok([]);
    if (pathname === "/api/v1/assets/card-imports/by-card") return ok([]);
    if (pathname === "/api/v1/settings")
      return ok({ targetMonths: 6, emergencyAvgMonths: 3, emergencyAccountIds: [], emergencyCategories: [] });

    return route.fulfill({ status: 404, body: "Not mocked: " + pathname });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.addInitScript((token) => {
    localStorage.setItem("assetflow.token", token);
  }, authToken());
});

test("해시 딥링크로 바로 열고, 새로고침해도 같은 화면·제목이 유지된다", async ({ page }) => {
  await page.goto("/#/assets", { waitUntil: "networkidle" });
  await expect(page).toHaveTitle("자산 · AssetFlow");
  await expect(page.getByRole("heading", { level: 1, name: "자산" })).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await expect(page).toHaveTitle("자산 · AssetFlow");
  await expect(page).toHaveURL(/#\/assets$/);
  await expect(page.getByRole("heading", { level: 1, name: "자산" })).toBeVisible();
});

test("모르는 해시는 대시보드로 정규화하고 주소창에도 표준 경로를 남긴다", async ({ page }) => {
  await page.goto("/#/does-not-exist", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/#\/$/);
  await expect(page).toHaveTitle("대시보드 · AssetFlow");
  await expect(page.getByRole("heading", { level: 1, name: "대시보드" })).toBeVisible();
});

test("내비 이동 후 뒤로가기로 원래 화면·제목으로 돌아온다", async ({ page }) => {
  await page.goto("/#/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "대시보드" })).toBeVisible();

  await page.getByRole("button", { name: "자산" }).click();
  await expect(page).toHaveURL(/#\/assets$/);
  await expect(page).toHaveTitle("자산 · AssetFlow");

  await page.goBack();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page).toHaveTitle("대시보드 · AssetFlow");
  await expect(page.getByRole("heading", { level: 1, name: "대시보드" })).toBeVisible();

  // 앞으로가기도 같은 경로로 처리된다.
  await page.goForward();
  await expect(page).toHaveTitle("자산 · AssetFlow");
});

test("헤더 내비에서 현재 화면 항목만 aria-current=page 다", async ({ page }) => {
  await page.goto("/#/assets", { waitUntil: "networkidle" });
  // 자산 화면 안의 자산/투자 탭도 aria-current 를 쓰므로 헤더로 범위를 좁힌다.
  const current = page.locator("header").locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText("자산");
});
