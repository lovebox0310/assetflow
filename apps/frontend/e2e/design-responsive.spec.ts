import { test, expect } from "@playwright/test";
import { authToken } from "./fixtures";
import { mockDashboardApi } from "./dashboard-mocks";

/**
 * 반응형 디자인 검증 (Responsive Design)
 * 
 * 주요 검증:
 * - 모바일 (360px): 단일 열, 터치 친화적
 * - 태블릿 (768px): 2열 격자, 적절한 패딩
 * - 데스크톱 (1280px): 3열 이상, 최대 너비 제한
 * - 텍스트 줄임, 이미지 스케일링, 네비게이션 전환
 */

test.describe("반응형 디자인 검증", () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardApi(page);
    await page.addInitScript((token) => {
      localStorage.setItem("assetflow.token", token);
    }, authToken());
  });

  test("모바일 360px - 세로 (가로 스크롤 없음)", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/", { waitUntil: "networkidle" });
    
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - 
             document.documentElement.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
    
    await expect(page).toHaveScreenshot("responsive-mobile-360x800.png", {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test("모바일 390px (iPhone SE) - 세로", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    
    await expect(page).toHaveScreenshot("responsive-mobile-390x844-iphone.png", {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test("모바일 412px (Pixel 6) - 세로", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto("/", { waitUntil: "networkidle" });
    
    await expect(page).toHaveScreenshot("responsive-mobile-412x915-pixel.png", {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test("모바일 - 가로 방향 (800x360)", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 360 });
    await page.goto("/", { waitUntil: "networkidle" });
    
    await expect(page).toHaveScreenshot("responsive-mobile-800x360-landscape.png", {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test("태블릿 768px (iPad) - 세로", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/", { waitUntil: "networkidle" });
    
    await expect(page).toHaveScreenshot("responsive-tablet-768x1024-portrait.png", {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test("태블릿 1024px (iPad) - 가로", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/", { waitUntil: "networkidle" });
    
    await expect(page).toHaveScreenshot(
      "responsive-tablet-1024x768-landscape.png",
      {
        fullPage: true,
        maxDiffPixels: 200,
      }
    );
  });

  test("데스크톱 1280px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/", { waitUntil: "networkidle" });
    
    await expect(page).toHaveScreenshot("responsive-desktop-1280x720.png", {
      fullPage: true,
      maxDiffPixels: 150,
    });
  });

  test("데스크톱 1920px (풀HD)", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/", { waitUntil: "networkidle" });
    
    await expect(page).toHaveScreenshot("responsive-desktop-1920x1080-fullhd.png", {
      fullPage: true,
      maxDiffPixels: 150,
    });
  });

  test("데스크톱 2560px (2K)", async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.goto("/", { waitUntil: "networkidle" });
    
    await expect(page).toHaveScreenshot("responsive-desktop-2560x1440-2k.png", {
      fullPage: true,
      maxDiffPixels: 150,
    });
  });

  test("모바일: 카드 1열 배치", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/", { waitUntil: "networkidle" });
    
    const cashCards = page.locator('[aria-label*="계좌"]').first();
    
    await expect(cashCards).toHaveScreenshot(
      "responsive-mobile-cash-cards-1col.png",
      { maxDiffPixels: 100 }
    );
  });

  test("태블릿: 카드 2열 배치", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/", { waitUntil: "networkidle" });
    
    const cashCards = page.locator('[aria-label*="계좌"]').first();
    await expect(cashCards).toHaveScreenshot(
      "responsive-tablet-cash-cards-2col.png",
      { maxDiffPixels: 100 }
    );
  });

  test("데스크톱: 카드 3열 이상 배치", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/", { waitUntil: "networkidle" });
    
    const cashCards = page.locator('[aria-label*="계좌"]').first();
    await expect(cashCards).toHaveScreenshot(
      "responsive-desktop-cash-cards-3col.png",
      { maxDiffPixels: 100 }
    );
  });

  test("모바일: 하단 탭 네비게이션", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/", { waitUntil: "networkidle" });
    
    const nav = page.locator("nav").first();
    await expect(nav).toHaveScreenshot(
      "responsive-mobile-bottom-nav-360.png",
      { maxDiffPixels: 50 }
    );
  });

  test("데스크톱: 좌측 사이드 네비게이션", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/", { waitUntil: "networkidle" });
    
    const nav = page.locator("aside").first();
    await expect(nav).toHaveScreenshot(
      "responsive-desktop-left-nav-1280.png",
      { maxDiffPixels: 50 }
    );
  });

  test("모바일: 엣지 공간 확인 (안전 영역)", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/", { waitUntil: "networkidle" });
    
    const buttons = await page.locator("button").all();
    for (const button of buttons) {
      const box = await button.boundingBox();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(8);
        expect(box.x + box.width).toBeLessThanOrEqual(360 - 8);
      }
    }
  });
});
