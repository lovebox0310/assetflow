import { test, expect } from "@playwright/test";
import { authToken } from "./fixtures";
import { mockDashboardApi } from "./dashboard-mocks";

/**
 * Sprint 1 스모크 테스트: 로그인 → 대시보드 전환
 * 
 * 운영 환경(redbox9.iptime.org)에서 실제 로그인 흐름을 검증한다.
 * - 로그인 페이지 접속
 * - 시드 사용자로 로그인
 * - 대시보드로 즉시 전환 확인
 * - API 호출 작동 확인
 *
 * CI/로컬은 스텁, TEST_URL 지정 시 실서버: 백엔드가 없는 환경에서만 API 를
 * 모의하고, TEST_URL 이 있으면 실제 서버를 그대로 호출한다.
 */

const BASE_URL = process.env.TEST_URL || "http://localhost:5173";
const TEST_EMAIL = "redbox9@example.com";
const TEST_PASSWORD = "AssetFlow@2026!Test";

test.describe("Login & Dashboard Smoke Test", () => {
  // TEST_URL 이 없으면 로컬 Vite dev(= 백엔드 없음)이므로 API를 스텁한다.
  // TEST_URL 이 있으면 운영/실서버 스모크이므로 실제 API를 그대로 호출한다.
  test.beforeEach(async ({ page }) => {
    if (process.env.TEST_URL) return;
    // 라우트는 나중에 등록한 것이 우선한다. 대시보드 목을 먼저, auth 를 마지막에 건다.
    await mockDashboardApi(page);
    await page.route("**/api/v1/auth/login", async (route) => {
      const body = route.request().postDataJSON() as { email?: string; password?: string } | null;
      const ok = body?.email === TEST_EMAIL && body?.password === TEST_PASSWORD;
      if (!ok) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ code: "AUTH_FAILED", message: "이메일 또는 비밀번호를 확인해 주세요", details: "", timestamp: new Date().toISOString() }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: "OK", message: "로그인 성공", data: { token: authToken() } }),
      });
    });
  });

  test("should login and navigate to dashboard immediately", async ({
    page,
  }) => {
    // 1. 로그인 페이지 접속
    await page.goto(`${BASE_URL}/`);
    await page.waitForURL(/.*/, { timeout: 5000 });
    
    // 2. 로그인 페이지 표시 확인
    const heading = page.locator("h1");
    await heading.waitFor({ state: "visible", timeout: 5000 });
    await expect(heading).toContainText("로그인");
    
    // 3. 이메일 입력
    await page.fill('input[type="email"]', TEST_EMAIL);
    
    // 4. 비밀번호 입력
    await page.fill('input[type="password"]', TEST_PASSWORD);
    
    // 5. 로그인 버튼 클릭
    await page.click('button[type="submit"]');
    
    // 6. 대시보드로 즉시 전환 (새로고침 불필요)
    // dashboard page의 main ID 요소를 대상으로 함
    const dashboardMain = page.locator('main#main');
    await dashboardMain.waitFor({ state: "visible", timeout: 10000 });
    
    // 대시보드 콘텐츠 확인: "핵심 지표" 섹션이 보여야 함
    const content = page.locator("text=핵심 지표");
    await expect(content).toBeVisible();
    
    // 7. JWT 토큰 저장 확인
    const token = await page.evaluate(() => {
      return localStorage.getItem("assetflow.token");
    });
    expect(token).toBeTruthy();
    expect(token).toMatch(/^eyJ/);
  });

  test("should show error on invalid credentials", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForURL(/.*/, { timeout: 5000 });
    
    await page.fill('input[type="email"]', "wrong@example.com");
    await page.fill('input[type="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    
    // 오류 메시지 표시 확인
    const alert = page.locator('[role="alert"]');
    await alert.waitFor({ state: "visible", timeout: 5000 });
    await expect(alert).toContainText("이메일 또는 비밀번호를 확인해 주세요");
    
    // 로그인 페이지 유지
    await expect(page.locator("h1")).toContainText("로그인");
  });
});
