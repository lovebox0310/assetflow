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
    // main 랜드마크는 antd Layout.Content 하나뿐이다(#main 은 그 안의 div).
    await expect(page.locator("main")).toHaveCount(1);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "본문으로 건너뛰기" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });

  test("접근성 트리에 랜드마크·제목·목록 의미가 노출된다", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "대시보드" })).toBeVisible();

    const main = await page.locator("#main").ariaSnapshot();
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

/*
 * §80 회귀 가드 — 대시보드 지표 카드/구성비 범례의 실측 계약.
 *
 * jsdom 은 레이아웃·계산된 글꼴 크기를 계산하지 않으므로 이 계약은 실브라우저에서만
 * 지킬 수 있다. 픽스처 금액을 하드코딩하지 않고 CSS 실측값만 단언한다 —
 * mockDashboardApi 의 응답 금액이 바뀌어도 레이아웃 계약은 그대로 검증된다.
 * 뷰포트는 프로젝트 device 설정을 덮어써 test.use 로 고정한다.
 */

async function openDashboard(page: import("@playwright/test").Page) {
  // recharts 애니메이션을 끄고 레이아웃을 고정한다(디자인 스펙과 같은 방식).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockDashboardApi(page);
  await page.addInitScript((token) => {
    localStorage.setItem("assetflow.token", token);
  }, authToken());
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "대시보드" })).toBeVisible();
  // 요약 줄은 설정·카드지출까지 모두 도착해야 렌더된다. 이 줄이 보이면
  // 지표 카드 3장이 최종 내용(힌트 1~2줄)으로 안정된 상태다.
  await expect(page.locator(".af-runway-summary")).toBeVisible();
}

function coreCards(page: import("@playwright/test").Page) {
  return page.locator('section[aria-labelledby="h-core"] .ant-card');
}

/** 핵심 지표 카드 3장의 높이 차(max-min). 실측 전용. */
function coreCardHeightSpread(page: import("@playwright/test").Page) {
  return coreCards(page).evaluateAll((els) => {
    const heights = els.map((el) => el.getBoundingClientRect().height);
    return Math.max(...heights) - Math.min(...heights);
  });
}

test.describe("핵심 지표 카드 높이 @320", () => {
  test.use({ viewport: { width: 320, height: 800 } });

  test("세 카드의 높이 차가 20px 이하다", async ({ page }) => {
    await openDashboard(page);
    await expect(coreCards(page)).toHaveCount(3);
    await expect.poll(() => coreCardHeightSpread(page)).toBeLessThanOrEqual(20);
  });
});

test.describe("핵심 지표 카드 높이 @1280", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("세 카드의 높이 차가 1px 이하다", async ({ page }) => {
    await openDashboard(page);
    await expect(coreCards(page)).toHaveCount(3);
    await expect.poll(() => coreCardHeightSpread(page)).toBeLessThanOrEqual(1);
  });
});

test.describe("핵심 지표 값 타이포", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("숫자부 24px · 단위부 0.62em(14.5~15.2px)", async ({ page }) => {
    await openDashboard(page);

    const metrics = await page.evaluate(() => {
      const section = document.querySelector('section[aria-labelledby="h-core"]');
      if (!section) return [];
      return [...section.querySelectorAll(".ant-card")].map((card) => {
        const value = card.querySelector(".af-metric-value");
        const unit = value?.querySelector(".af-metric-unit") ?? null;
        const fullText = value?.textContent ?? "";
        const unitText = unit?.textContent ?? null;
        // 숫자부는 DOM 구조(sr-only 중복 여부)에 기대지 않고 전체 문자열에서 단위를 뺀다.
        const numberText =
          unitText && fullText.endsWith(unitText)
            ? fullText.slice(0, fullText.length - unitText.length)
            : fullText;
        // 단위가 있으면 그 부모가 숫자부 래퍼다 — 계산된 글꼴 크기를 여기서 읽는다.
        const numberEl = unit?.parentElement ?? value;
        return {
          title: card.querySelector("h3")?.textContent?.trim() ?? "",
          fullText,
          numberText,
          unitCount: value ? value.querySelectorAll(".af-metric-unit").length : 0,
          unitText,
          numberFontSize: numberEl ? Number.parseFloat(getComputedStyle(numberEl).fontSize) : null,
          unitFontSize: unit ? Number.parseFloat(getComputedStyle(unit).fontSize) : null,
        };
      });
    });

    expect(metrics).toHaveLength(3);
    // 비상금/투자금 카드에도 같은 값 컨테이너가 있다.
    const runway = metrics.find((m) => /유지 개월$/.test(m.title));
    expect(runway).toBeDefined();

    for (const metric of metrics) {
      expect(metric.numberFontSize).not.toBeNull();
      expect(Math.abs((metric.numberFontSize ?? 0) - 24)).toBeLessThanOrEqual(0.5);
    }

    const withUnit = metrics.filter((m) => m.unitCount > 0);
    for (const metric of withUnit) {
      expect(metric.unitCount).toBe(1);
      expect(metric.unitText).not.toBeNull();
      expect(metric.unitFontSize ?? 0).toBeGreaterThanOrEqual(14.5);
      expect(metric.unitFontSize ?? 0).toBeLessThanOrEqual(15.2);
      // 전체 값 = 숫자부 + 단위. 숫자부에 단위가 섞이지 않았는지도 확인한다.
      expect(metric.fullText).toBe(`${metric.numberText}${metric.unitText}`);
      expect(metric.numberText).toMatch(/^[+\-−]?[\d.,]+$/);
    }

    // 단위가 없는 값은 스킵하지 않고 "단위 요소 0개"를 명시적으로 단언한다.
    const withoutUnit = metrics.filter((m) => m.unitCount === 0);
    for (const metric of withoutUnit) {
      expect(metric.unitText).toBeNull();
      expect(/[억만원%]$|개월$/.test(metric.fullText.trim())).toBe(false);
    }

    // 순자산(억/만)·월 수지(원)·유지 개월(개월) 중 최소 2종에서 단위 분리가 확인돼야 한다.
    expect(withUnit.length).toBeGreaterThanOrEqual(2);
    expect(new Set(withUnit.map((m) => m.title)).size).toBeGreaterThanOrEqual(2);
  });
});

test.describe("비상금 카드 접힘·펼침 @320", () => {
  test.use({ viewport: { width: 320, height: 800 } });

  test("요약 1줄 → 펼침 → 다시 접힘", async ({ page }) => {
    await openDashboard(page);
    const toggle = page.locator(".af-runway-more");
    const detail = page.locator("#runway-detail");
    const summaryRects = () =>
      page.locator(".af-runway-summary").evaluate((el) => el.getClientRects().length);

    // 접힘: 요약은 한 줄, 상세는 DOM 에 없다.
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-controls", "runway-detail");
    await expect(toggle).toHaveText("자세히");
    await expect.poll(summaryRects).toBe(1);
    await expect(detail).toHaveCount(0);

    // 펼침: 상세가 나타나고 월 사용액 내역을 보여 준다.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toHaveText("접기");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("월 사용액");

    // 다시 접힘: 상세가 DOM 에서 사라진다.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(detail).toHaveCount(0);
  });
});

test.describe("자산 구성비 범례 @320", () => {
  test.use({ viewport: { width: 320, height: 800 } });

  test("범례 높이 96px 이하 · 도넛-범례 간격 12~20px", async ({ page }) => {
    await openDashboard(page);
    const legend = page.locator('ul[aria-label="자산 구성비 범례"]');
    await expect(legend).toBeVisible();
    await expect(legend.locator("li")).not.toHaveCount(0);

    await expect
      .poll(() => legend.evaluate((el) => el.getBoundingClientRect().height))
      .toBeLessThanOrEqual(96);

    const gap = () =>
      page.evaluate(() => {
        const section = document.querySelector('section[aria-labelledby="h-composition"]');
        const svg = section?.querySelector(".recharts-surface");
        const ul = section?.querySelector('ul[aria-label="자산 구성비 범례"]');
        if (!svg || !ul) throw new Error("구성비 도넛/범례를 찾지 못했다");
        return ul.getBoundingClientRect().top - svg.getBoundingClientRect().bottom;
      });

    await expect.poll(gap).toBeGreaterThanOrEqual(12);
    await expect.poll(gap).toBeLessThanOrEqual(20);
  });
});

test.describe("자산 구성비 도넛·범례 배치 @1280", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("도넛과 범례가 같은 행에서 세로 중심이 8px 이내로 맞는다", async ({ page }) => {
    await openDashboard(page);
    const legend = page.locator('ul[aria-label="자산 구성비 범례"]');
    await expect(legend).toBeVisible();
    await expect(legend.locator("li")).not.toHaveCount(0);

    const centers = () =>
      page.evaluate(() => {
        const section = document.querySelector('section[aria-labelledby="h-composition"]');
        const svg = section?.querySelector(".recharts-surface");
        const ul = section?.querySelector('ul[aria-label="자산 구성비 범례"]');
        if (!svg || !ul) throw new Error("구성비 도넛/범례를 찾지 못했다");
        const svgRect = svg.getBoundingClientRect();
        const ulRect = ul.getBoundingClientRect();
        return {
          centerDiff: Math.abs(
            (svgRect.top + svgRect.bottom) / 2 - (ulRect.top + ulRect.bottom) / 2,
          ),
          sideBySide: ulRect.left >= svgRect.right,
        };
      });

    await expect.poll(async () => (await centers()).centerDiff).toBeLessThanOrEqual(8);
    expect((await centers()).sideBySide).toBe(true);
  });
});
