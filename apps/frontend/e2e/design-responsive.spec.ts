import { test, expect } from "@playwright/test";
import { authToken } from "./fixtures";
import { mockDashboardApi, waitForDashboardCharts } from "./dashboard-mocks";

/**
 * 반응형 디자인 검증 (Responsive Design)
 * 
 * 주요 검증:
 * - 모바일 (360px): 단일 열, 터치 친화적
 * - 태블릿 (768px): 2열 격자, 적절한 패딩
 * - 데스크톱 (1280px): 3열 이상, 최대 너비 제한
 * - 텍스트 줄임, 이미지 스케일링, 네비게이션 전환
 */

/** 대시보드 진입 + 차트 애니메이션 종료까지 기다린 뒤 스냅샷을 찍는다. */
async function openDashboard(page: import("@playwright/test").Page) {
  // recharts 는 `prefers-reduced-motion` 이면 애니메이션을 끈다(Pie default 'auto').
  // 애니메이션 프레임에 따라 마지막 각도가 미세하게 달라져 스냅샷이 흔들리므로 끈다.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForDashboardCharts(page);
}

test.describe("반응형 디자인 검증", () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardApi(page);
    await page.addInitScript((token) => {
      localStorage.setItem("assetflow.token", token);
    }, authToken());
  });

  test("모바일 360px - 세로 (가로 스크롤 없음)", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openDashboard(page);
    
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
    await openDashboard(page);
    
    await expect(page).toHaveScreenshot("responsive-mobile-390x844-iphone.png", {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test("모바일 412px (Pixel 6) - 세로", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await openDashboard(page);
    
    await expect(page).toHaveScreenshot("responsive-mobile-412x915-pixel.png", {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test("모바일 - 가로 방향 (800x360)", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 360 });
    await openDashboard(page);
    
    await expect(page).toHaveScreenshot("responsive-mobile-800x360-landscape.png", {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test("태블릿 768px (iPad) - 세로", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await openDashboard(page);
    
    await expect(page).toHaveScreenshot("responsive-tablet-768x1024-portrait.png", {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });

  test("태블릿 1024px (iPad) - 가로", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openDashboard(page);
    
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
    await openDashboard(page);
    
    await expect(page).toHaveScreenshot("responsive-desktop-1280x720.png", {
      fullPage: true,
      maxDiffPixels: 150,
    });
  });

  test("데스크톱 1920px (풀HD)", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openDashboard(page);
    
    await expect(page).toHaveScreenshot("responsive-desktop-1920x1080-fullhd.png", {
      fullPage: true,
      maxDiffPixels: 150,
    });
  });

  test("데스크톱 2560px (2K)", async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1440 });
    await openDashboard(page);
    
    await expect(page).toHaveScreenshot("responsive-desktop-2560x1440-2k.png", {
      fullPage: true,
      maxDiffPixels: 150,
    });
  });

  test("모바일: 카드 1열 배치", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openDashboard(page);
    
    const cashCards = page.locator(".af-cash-grid");
    
    await expect(cashCards).toHaveScreenshot(
      "responsive-mobile-cash-cards-1col.png",
      { maxDiffPixels: 100 }
    );
  });

  test("태블릿: 카드 2열 배치", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await openDashboard(page);
    
    const cashCards = page.locator(".af-cash-grid");
    await expect(cashCards).toHaveScreenshot(
      "responsive-tablet-cash-cards-2col.png",
      { maxDiffPixels: 100 }
    );
  });

  test("데스크톱: 카드 3열 이상 배치", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openDashboard(page);
    
    const cashCards = page.locator(".af-cash-grid");
    await expect(cashCards).toHaveScreenshot(
      "responsive-desktop-cash-cards-3col.png",
      { maxDiffPixels: 100 }
    );
  });

  test("모바일: 하단 탭 네비게이션", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openDashboard(page);
    
    const nav = page.locator("nav").first();
    await expect(nav).toHaveScreenshot(
      "responsive-mobile-bottom-nav-360.png",
      { maxDiffPixels: 50 }
    );
  });

  /* §75: 사이드바는 채택하지 않았다 — 데스크톱은 헤더 내비를 유지한다.
     (이전 "좌측 사이드 네비게이션" 스킵 테스트를 양성 가드로 교체) */
  test("데스크톱: 헤더 내비 유지(§74)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openDashboard(page);
    await expect(page.locator("header").getByRole("button", { name: "대시보드" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".af-tabbar")).toHaveCount(0);
  });

  test("모바일: 엣지 공간 확인 (안전 영역)", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openDashboard(page);
    
    const buttons = await page.locator("button:not(.af-tabbar__item)").all();
    for (const button of buttons) {
      const box = await button.boundingBox();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(8);
        expect(box.x + box.width).toBeLessThanOrEqual(360 - 8);
      }
    }
  });

  /* §75 하단 탭 계약 — 폭이 바뀌어도 4등분·44px·뷰포트 하단 고정이 유지된다. */
  test("모바일: 하단 탭 4개·44px·뷰포트 고정 (320/390/430)", async ({ page }) => {
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await openDashboard(page);

      const nav = page.locator('nav[aria-label="주 메뉴"]');
      await expect(nav).toHaveCount(1);

      const tabs = nav.locator("button.af-tabbar__item");
      await expect(tabs).toHaveCount(4);
      await expect(tabs).toHaveText(["대시보드", "자산", "지출", "설정"]);
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);

      const sizes = await tabs.evaluateAll((els) =>
        els.map((el) => {
          const rect = el.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
      );
      for (const size of sizes) {
        expect(size.width).toBeGreaterThanOrEqual(44);
        expect(size.height).toBeGreaterThanOrEqual(44);
      }

      const bar = await page.evaluate(() => {
        const rect = document.querySelector(".af-tabbar")!.getBoundingClientRect();
        return {
          bottom: Math.round(rect.bottom),
          innerHeight: window.innerHeight,
          docScrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        };
      });
      expect(bar.bottom).toBe(bar.innerHeight);
      expect(bar.docScrollWidth).toBe(bar.innerWidth);

      // 최하단까지 스크롤해도 마지막 카드가 탭에 가리지 않는다.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const gap = await page.evaluate(() => {
        const bar = document.querySelector(".af-tabbar")!.getBoundingClientRect();
        const cards = document.querySelectorAll("#main .ant-card");
        const last = cards[cards.length - 1]!.getBoundingClientRect();
        return { lastCardBottom: last.bottom, barTop: bar.top };
      });
      expect(gap.lastCardBottom).toBeLessThanOrEqual(gap.barTop - 8);
    }
  });

  /* §75 ≥576px 는 하단 탭이 없고 헤더 내비 4개가 그대로다(사이드바 미채택). */
  test("태블릿/데스크톱: 하단 탭 없이 헤더 내비 (768/1280)", async ({ page }) => {
    for (const width of [768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await openDashboard(page);

      await expect(page.locator(".af-tabbar")).toHaveCount(0);
      const headerNav = page.locator("header").getByRole("button", { name: "대시보드", exact: true });
      await expect(headerNav).toHaveCount(1);
      await expect(headerNav).toHaveAttribute("aria-current", "page");
    }
  });
});
