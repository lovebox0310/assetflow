import { test, expect } from "@playwright/test";

/**
 * 로그인 페이지 디자인 검증
 * 
 * Playwright의 toHaveScreenshot()를 사용한 시각적 회귀 테스트.
 * 스크린샷 변경이 생기면 테스트 실패 → 의도적 변경인지 확인 후 승인.
 * 
 * 베이스라인 생성:
 *   npm run e2e:update-design
 * 
 * 변경사항 확인:
 *   npm run e2e:design-login
 */

test.describe("로그인 페이지 디자인", () => {
  test("기본 상태 (데스크톱 1280x720)", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveScreenshot("login-desktop-1280x720.png", {
      mask: [
        page.locator('input[type="email"]'),
        page.locator('input[type="password"]'),
      ],
      maxDiffPixels: 100,
    });
  });

  test("오류 상태 (잘못된 자격증명)", async ({ page }) => {
    await page.goto("/");
    await page.fill('input[type="email"]', "wrong@example.com");
    await page.fill('input[type="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    
    await page.locator('[role="alert"]').waitFor({ state: "visible" });
    await expect(page).toHaveScreenshot("login-desktop-error-1280x720.png", {
      maxDiffPixels: 100,
    });
  });

  test("포커스 상태 (키보드 네비게이션)", async ({ page }) => {
    await page.goto("/");
    
    await page.locator('input[type="email"]').focus();
    await page.waitForTimeout(300);
    
    await expect(page).toHaveScreenshot("login-desktop-focus-1280x720.png", {
      maxDiffPixels: 100,
    });
  });

  test("모바일 세로 방향 (393x851)", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await page.goto("/");
    
    await expect(page).toHaveScreenshot("login-mobile-portrait-393x851.png", {
      maxDiffPixels: 150,
    });
  });

  test("모바일 가로 방향 (851x393)", async ({ page }) => {
    await page.setViewportSize({ width: 851, height: 393 });
    await page.goto("/");
    
    await expect(page).toHaveScreenshot("login-mobile-landscape-851x393.png", {
      maxDiffPixels: 150,
    });
  });

  test("태블릿 (768x1024)", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    
    await expect(page).toHaveScreenshot("login-tablet-768x1024.png", {
      maxDiffPixels: 150,
    });
  });

  test("다크 모드", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    
    await expect(page).toHaveScreenshot("login-dark-mode-1280x720.png", {
      maxDiffPixels: 100,
    });
  });

  test("텍스트 줄임 (긴 이메일)", async ({ page }) => {
    await page.goto("/");
    await page.fill(
      'input[type="email"]',
      "very.long.email.address.that.might.overflow@example.com"
    );
    
    await expect(page).toHaveScreenshot("login-text-overflow-1280x720.png", {
      maxDiffPixels: 100,
    });
  });
});
