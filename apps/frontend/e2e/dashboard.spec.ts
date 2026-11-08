import { test, expect } from "@playwright/test";
import { authToken } from "./fixtures";
import { mockDashboardApi } from "./dashboard-mocks";

test.describe("DashboardPage E2E", () => {
test.beforeEach(async ({ page }) => {
    await mockDashboardApi(page);

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
      "비상금 계좌",
      "카드별 본인·가족 사용 내역",
      "지출 추이",
      "월별 현금흐름",
    ]);
  });

  test("핵심 지표 카드가 렌더된다", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "순자산" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "월 수지" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: /비상금|투자금 유지 개월/ })).toBeVisible();
  });

  test("비상금 계좌가 카드형으로 렌더된다", async ({ page }) => {
    const items = page.locator(".af-cash-item");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("우리 파킹통장");
    await expect(items.first()).toContainText("18,500,000원");
    await expect(items.first()).toContainText("비상금의 100.0%");

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

  test("카드별 본인·가족 차트가 렌더된다", async ({ page }) => {
    const section = page.locator("section", { has: page.getByRole("heading", { name: "카드별 본인·가족 사용 내역" }) });
    await expect(section).toBeVisible();
    // 차트 컨테이너는 role="img" 와 요약 aria-label 을 갖는다.
    await expect(
      section.getByRole("img", { name: /카드별 본인·가족 사용 내역/ }),
    ).toBeVisible();
  });

  /**
   * 실브라우저 접근성 실측 (스크린리더가 받는 트리 기준).
   * jsdom 단위 테스트는 DOM 속성만 보므로, 브라우저가 실제로 계산한
   * 접근성 트리(역할·이름)와 포커스 이동을 여기서 확인한다.
   */
  test("스킵 링크가 첫 Tab 대상이고 Enter 로 본문에 포커스가 이동한다", async ({ page }) => {
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "본문으로 건너뛰기" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  });

  test("접근성 트리에 랜드마크·제목·목록 의미가 노출된다", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "대시보드" })).toBeVisible();

    const main = await page.locator("main#main").ariaSnapshot();
    expect(main).toContain('heading "대시보드" [level=1]');
    expect(main).toContain('heading "핵심 지표" [level=2]');
    expect(main).toContain('heading "비상금 계좌" [level=2]');
    // 현금 계좌는 목록 의미로 노출된다 (카드형이어도 ul/li 유지).
    expect(main).toContain("list");
    expect(main).toContain('listitem');
    expect(main).toContain("우리 파킹통장");
  });

  test("제목 단계가 건너뛰지 않고 id 가 중복되지 않는다", async ({ page }) => {
    const levels = await page.evaluate(() =>
      [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName.slice(1))),
    );
    // 첫 제목은 h1, 이후에는 직전 단계보다 2 이상 깊어지지 않는다.
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    }

    const duplicateIds = await page.evaluate(() => {
      const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
      return ids.filter((id, index) => ids.indexOf(id) !== index);
    });
    expect(duplicateIds).toEqual([]);
  });
});
