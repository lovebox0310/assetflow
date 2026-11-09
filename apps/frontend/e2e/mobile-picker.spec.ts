import { test, expect, type Page } from "@playwright/test";
import { authToken } from "./fixtures";
import { mockDashboardApi } from "./dashboard-mocks";

/**
 * 휴대폰 달력(RangePicker) 팝업 가로 잘림 가드.
 *
 * antd 의 월 RangePicker 는 패널 2개(330×2=660px)를 고정폭으로 그린다. 320~430px
 * 터치 화면에서는 팝업이 뷰포트 밖으로 밀려 왼쪽이 잘린다. app.css 의
 * `@media (pointer: coarse) and (max-width: 659px)` 블록이 두 패널을 유지한 채
 * 폭만 (100vw-16)/2 로 줄인다. 이 스펙은 그 계약을 실측한다.
 */

const TOUCH_VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

interface PickerGeometry {
  innerWidth: number;
  mediaMatches: boolean;
  dropdown: { x: number; right: number; width: number };
  panelCount: number;
  panels: { x: number; right: number; width: number }[];
  cellCount: number;
  cellTdWidths: number[];
  clippedCellCount: number;
  maxCellOverflow: number;
  overflow: number;
}

/** 열린 달력 팝업의 기하를 한 번에 읽는다. */
function readPicker(page: Page): Promise<PickerGeometry> {
  return page.evaluate(() => {
    const dropdown = document.querySelector<HTMLElement>(
      ".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)",
    );
    if (!dropdown) throw new Error("열린 달력 팝업을 찾지 못했다");
    const rect = dropdown.getBoundingClientRect();
    const panels = [...dropdown.querySelectorAll<HTMLElement>(".ant-picker-panel")].map((panel) => {
      const panelRect = panel.getBoundingClientRect();
      return { x: panelRect.x, right: panelRect.right, width: panelRect.width };
    });
    const cells = [...dropdown.querySelectorAll<HTMLElement>("td.ant-picker-cell .ant-picker-cell-inner")];
    const cellTds = [...dropdown.querySelectorAll<HTMLElement>("td.ant-picker-cell")];
    return {
      innerWidth: window.innerWidth,
      mediaMatches: window.matchMedia("(pointer: coarse) and (max-width: 659px)").matches,
      dropdown: { x: rect.x, right: rect.right, width: rect.width },
      panelCount: panels.length,
      panels,
      cellCount: cells.length,
      cellTdWidths: cellTds.map((td) => td.getBoundingClientRect().width),
      clippedCellCount: cells.filter((cell) => cell.scrollWidth > cell.clientWidth + 1).length,
      maxCellOverflow: Math.max(0, ...cells.map((cell) => cell.scrollWidth - cell.clientWidth)),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

async function openDashboardPicker(page: Page, width: number) {
  // 뷰포트마다 새 문서로 로드해 팝업 상태가 섞이지 않게 한다.
  await page.goto(`/?qa-picker=${width}#/`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "대시보드" })).toBeVisible();
  await expect(page.locator(".ant-picker").first()).toBeVisible({ timeout: 15000 });
  await page.locator(".ant-picker").first().click();
  await expect(
    page.locator(".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)"),
  ).toBeVisible();
}

test.describe("휴대폰 달력 팝업", () => {
  test("터치 320/360/390/430 — 팝업이 뷰포트 안에 들어온다", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-mobile", "터치(mobile) 프로젝트 전용");

    await page.addInitScript((token) => {
      localStorage.setItem("assetflow.token", token);
      localStorage.setItem("assetflow.theme", "light");
    }, authToken());
    await mockDashboardApi(page);

    for (const viewport of TOUCH_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await openDashboardPicker(page, viewport.width);

      // 1) 팝업이 좌우로 잘리지 않는다. (초기 위치 계산 전에 잰 값은 poll 로 흘려보낸다)
      await expect
        .poll(async () => (await readPicker(page)).dropdown.x, {
          message: `${viewport.width}px 팝업 left`,
        })
        .toBeGreaterThanOrEqual(0);
      await expect
        .poll(async () => {
          const geometry = await readPicker(page);
          return geometry.dropdown.right <= geometry.innerWidth + 1;
        }, { message: `${viewport.width}px 팝업 right` })
        .toBe(true);

      // 2) 두 달 패널 유지(세로 스택·단일 패널로 바뀌면 실패).
      await expect(
        page.locator(".ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-panel"),
      ).toHaveCount(2);

      // 3) 각 패널도 뷰포트 안.
      await expect
        .poll(async () => {
          const geometry = await readPicker(page);
          return geometry.panels.every((panel) => panel.right <= geometry.innerWidth + 1);
        }, { message: `${viewport.width}px 패널 right` })
        .toBe(true);

      // 4) 셀 텍스트 잘림 0.
      await expect
        .poll(async () => (await readPicker(page)).clippedCellCount, {
          message: `${viewport.width}px 잘린 셀`,
        })
        .toBe(0);

      // 5) 문서 가로 넘침 0.
      expect(
        (await readPicker(page)).overflow,
        `${viewport.width}px 가로 넘침`,
      ).toBe(0);
    }
  });

  test("데스크톱 1280 — 팝업 폭 660·셀 105 유지(미디어 미적용)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "데스크톱 프로젝트 전용");

    await page.addInitScript((token) => {
      localStorage.setItem("assetflow.token", token);
      localStorage.setItem("assetflow.theme", "light");
    }, authToken());
    await mockDashboardApi(page);

    await page.setViewportSize({ width: 1280, height: 900 });
    await openDashboardPicker(page, 1280);

    await expect
      .poll(async () => (await readPicker(page)).mediaMatches, {
        message: "모바일 미디어가 데스크톱에 적용되면 안 된다",
      })
      .toBe(false);

    const geometry = await readPicker(page);
    expect(geometry.dropdown.width).toBeGreaterThanOrEqual(658);
    expect(geometry.dropdown.width).toBeLessThanOrEqual(662);
    expect(geometry.panelCount).toBe(2);
    expect(geometry.cellTdWidths.length).toBeGreaterThan(0);
    for (const width of geometry.cellTdWidths) {
      expect(width).toBeGreaterThanOrEqual(102);
      expect(width).toBeLessThanOrEqual(108);
    }
    expect(geometry.clippedCellCount).toBe(0);
    expect(geometry.overflow).toBe(0);
  });
});
