import { test, expect, type Page } from "@playwright/test";
import { authToken } from "./fixtures";
import { mockScreenApi } from "./screens-mocks";

/**
 * #33: 목록 표(`AfListTable`)의 행 `⋯` 오버레이.
 *
 * jsdom 은 좌표가 없고 antd 포털 위치도 계산하지 않는다. 그래서 뷰포트 경계와
 * 키보드 포커스 복귀는 실제 브라우저에서 확인한다.
 *
 * - 320/375 에서 **마지막 행** 의 `⋯` 메뉴와 Popconfirm 이 뷰포트를 넘지 않는다.
 * - `⋯` → Esc 로 닫으면 포커스가 그 행 `⋯` 로 돌아온다.
 * - Popconfirm Esc/취소 뒤에도 같은 자리로 돌아온다.
 *
 * 두 확인(키보드 메뉴 / Popconfirm)은 **각각 새 문서**에서 시작한다. antd 메뉴를
 * 키보드로 열었다 닫으면 문서가 스크롤되는 기존 동작이 있어(아래 남은 한계),
 * 한 흐름에 이어 붙이면 좌표 측정이 그 스크롤에 오염된다.
 *
 * 뷰포트를 직접 지정하므로 chromium-desktop 프로젝트에서만 돈다.
 */

const ASSETS_TABLE = 'table[aria-labelledby="h-assets"]';
const LAST_ROW_MENU = "전세 보증금 행 메뉴";
const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
];

const DROPDOWN_OPEN = ".ant-dropdown:not(.ant-dropdown-hidden)";
const POPOVER_OPEN = ".ant-popover:not(.ant-popover-hidden)";

async function openAssets(
  page: Page,
  { width, height }: { width: number; height: number },
  tag: string,
) {
  await page.setViewportSize({ width, height });
  // 쿼리를 붙여 같은 해시라도 새 문서로 로드한다(스크롤·포커스 이력 초기화).
  // 같은 URL 로 다시 goto 하면 브라우저가 스크롤을 복원해 좌표 측정이 흔들린다.
  await page.goto(`/?qa-list-overlay=${tag}#/assets`, { waitUntil: "networkidle" });
  // 목이 행을 실제로 렌더했는지 — 빈 표를 통과시키지 않는다.
  await expect(page.locator(ASSETS_TABLE)).toBeVisible();
  await expect(page.getByText("파킹통장").first()).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
}

function lastRowMenuButton(page: Page) {
  return page.locator(`${ASSETS_TABLE} tbody tr`).last().locator(".af-icon-btn");
}

/** 오버레이 박스가 뷰포트 안인지 — px 수치를 실패 메시지에 남긴다. */
async function expectInsideViewport(page: Page, selector: string, label: string) {
  const rect = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }, selector);
  expect(rect, `${label} 가 열려 있지 않다`).not.toBeNull();
  const { width, height } = page.viewportSize()!;
  expect(rect!.left, `${label} left=${rect!.left.toFixed(1)}`).toBeGreaterThanOrEqual(0);
  expect(rect!.right, `${label} right=${rect!.right.toFixed(1)} > ${width}`).toBeLessThanOrEqual(width);
  expect(rect!.top, `${label} top=${rect!.top.toFixed(1)}`).toBeGreaterThanOrEqual(0);
  expect(rect!.bottom, `${label} bottom=${rect!.bottom.toFixed(1)} > ${height}`).toBeLessThanOrEqual(height);
}

function focusedLabel(page: Page) {
  return page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null);
}

test.describe("목록 표 행 오버레이", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "뷰포트를 직접 지정한다 — desktop 프로젝트 전용");
    await page.addInitScript((token) => {
      localStorage.setItem("assetflow.token", token);
    }, authToken());
    await mockScreenApi(page, "assets");
  });

  test("320/375 마지막 행 ⋯ 메뉴·Popconfirm 이 뷰포트 안이고, 닫으면 포커스가 ⋯ 로 돌아온다", async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      const { width } = viewport;

      // ── 1) 메뉴: 키보드로 열고 Esc 로 닫는다.
      await openAssets(page, viewport, `${width}-menu`);
      const menuBtn = lastRowMenuButton(page);
      await expect(menuBtn).toHaveAttribute("aria-label", LAST_ROW_MENU);
      await menuBtn.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(DROPDOWN_OPEN)).toBeVisible();
      await expectInsideViewport(page, DROPDOWN_OPEN, `${width} 메뉴`);

      await page.keyboard.press("Escape");
      await expect(page.locator(DROPDOWN_OPEN)).toHaveCount(0);
      expect(await focusedLabel(page), `${width} 메뉴 Esc 후 포커스`).toBe(LAST_ROW_MENU);

      // ── 2) Popconfirm: 새 문서에서 메뉴 항목 선택 → 확인 팝업.
      await openAssets(page, viewport, `${width}-confirm`);
      const btn = lastRowMenuButton(page);
      const openConfirm = async () => {
        await btn.click();
        await page.locator(`${DROPDOWN_OPEN} .ant-dropdown-menu-item`).filter({ hasText: "삭제" }).click();
        await expect(page.locator(POPOVER_OPEN)).toBeVisible();
        // antd 팝업은 열림 모션(≈200ms) 뒤에 좌표가 확정되고 Esc 스택에 등록된다.
        // 모션 중에 재면 scale 이 섞인 좌표가, 등록 전에 Esc 를 누르면 닫히지 않는다.
        await page.waitForTimeout(300);
      };

      await openConfirm();
      await expectInsideViewport(page, POPOVER_OPEN, `${width} Popconfirm`);

      // 1×1 앵커는 포커스 대상이 아니다.
      const anchorTabIndex = await page.evaluate(() => {
        const anchor = document.querySelector(".af-list__cell--actions > span");
        return anchor ? anchor.getAttribute("tabindex") : "missing";
      });
      expect(anchorTabIndex, "Popconfirm 앵커는 포커스 대상이 아니어야 한다").toBeNull();

      await page.keyboard.press("Escape");
      await expect(page.locator(POPOVER_OPEN)).toHaveCount(0);
      expect(await focusedLabel(page), `${width} Popconfirm Esc 후 포커스`).toBe(LAST_ROW_MENU);

      // 취소 경로도 같은 자리로 돌아온다.
      await openConfirm();
      await page.getByRole("button", { name: /^(Cancel|취소)$/ }).last().click();
      await expect(page.locator(POPOVER_OPEN)).toHaveCount(0);
      expect(await focusedLabel(page), `${width} Popconfirm 취소 후 포커스`).toBe(LAST_ROW_MENU);
    }
  });
});
