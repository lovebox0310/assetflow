import { test, expect } from "@playwright/test";
import { authToken } from "./fixtures";
import { mockDashboardApi, waitForDashboardCharts } from "./dashboard-mocks";

/**
 * 대시보드 페이지 디자인 검증
 * 
 * 주요 검증 대상:
 * - 헤더, 네비게이션, 메인 콘텐츠 레이아웃
 * - 카드 격자 배치 (반응형: 1열 → 2열 → 3열)
 * - 숫자, 차트, 목록 표시 정확성
 * - 다크/라이트 모드
 * - 반응형 디자인 (모바일 360px → 태블릿 768px → 데스크톱 1280px)
 */

/** 대시보드 진입 + 차트 애니메이션 종료까지 기다린 뒤 스냅샷을 찍는다. */
async function openDashboard(page: import("@playwright/test").Page) {
  // recharts 는 `prefers-reduced-motion` 이면 애니메이션을 끈다(Pie default 'auto').
  // 애니메이션 프레임에 따라 마지막 각도가 미세하게 달라져 스냅샷이 흔들리므로 끈다.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForDashboardCharts(page);
}

test.describe("대시보드 페이지 디자인", () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardApi(page);
    await page.addInitScript((token) => {
      localStorage.setItem("assetflow.token", token);
    }, authToken());
  });

  test("데스크톱 기본 상태 (1280x720)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openDashboard(page);
    
    await page.locator("text=핵심 지표").waitFor({ state: "visible" });
    
    await expect(page).toHaveScreenshot("dashboard-desktop-1280x720.png", {
      fullPage: true,
      maxDiffPixels: 150,
    });
  });

  test("헤더 영역", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openDashboard(page);
    
    const header = page.locator("header");
    await header.waitFor({ state: "visible" });
    
    await expect(header).toHaveScreenshot("dashboard-header-1280x720.png", {
      maxDiffPixels: 50,
    });
  });

  test("핵심 지표 카드 영역", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openDashboard(page);
    
    const metricsSection = page.locator('section[aria-labelledby="h-core"]');
    await metricsSection.waitFor({ state: "visible" });
    
    await expect(metricsSection).toHaveScreenshot(
      "dashboard-metrics-cards-1280x720.png",
      { maxDiffPixels: 100 }
    );
  });

  test("차트 영역 (자산 구성비)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openDashboard(page);
    
    const chartSection = page.locator('section[aria-labelledby="h-composition"]');
    await chartSection.locator("svg").first().waitFor({ state: "attached" });
    await page.waitForTimeout(500);
    await expect(chartSection).toHaveScreenshot(
      "dashboard-chart-composition-1280x900.png",
      { maxDiffPixels: 150 }
    );
  });

  test("모바일 세로 (393x851)", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await openDashboard(page);
    
    await expect(page).toHaveScreenshot(
      "dashboard-mobile-portrait-393x851.png",
      {
        fullPage: true,
        maxDiffPixels: 200,
      }
    );
  });

  test("태블릿 (768x1024)", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await openDashboard(page);
    
    await expect(page).toHaveScreenshot(
      "dashboard-tablet-768x1024.png",
      {
        fullPage: true,
        maxDiffPixels: 200,
      }
    );
  });

  test("스크롤 시 헤더 고정", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openDashboard(page);
    
    const headerBefore = await page.locator("header").boundingBox();
    
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(300);
    
    const headerAfter = await page.locator("header").boundingBox();
    
    expect(headerAfter?.y).toBe(headerBefore?.y);
    
    await expect(page).toHaveScreenshot(
      "dashboard-scroll-header-fixed-1280x720.png",
      { maxDiffPixels: 100 }
    );
  });

  test("다크 모드", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openDashboard(page);
    
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await page.waitForTimeout(300);
    
    await expect(page).toHaveScreenshot(
      "dashboard-dark-mode-1280x720.png",
      {
        fullPage: true,
        maxDiffPixels: 150,
      }
    );
  });

  test("인쇄 모드", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openDashboard(page);
    
    await page.emulateMedia({ media: "print", reducedMotion: "reduce" });
    await page.waitForTimeout(300);
    
    await expect(page).toHaveScreenshot(
      "dashboard-print-mode-1280x720.png",
      {
        fullPage: true,
        maxDiffPixels: 150,
      }
    );
  });
});
