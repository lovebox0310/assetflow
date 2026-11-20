import { test, expect, type Page } from "@playwright/test";
import { authToken } from "./fixtures";
import { mockScreenApi } from "./screens-mocks";

/**
 * A7-1 / A10-A — 자산 화면의 은행 동작과 섹션 순서.
 *
 * A10-A: 읽는 순서를 금융자산 → 부채 → 은행 → 다른 화면으로 둔다.
 * A7-1: 현금성 행의 `⋯` 메뉴에서 `잔액 가져오기` 를 열면 **은행 섹션의 모달**이
 *       뜨고, Esc 로 닫으면 그 행 `⋯` 로 포커스가 돌아온다(§125 I-03 과 같은 규칙).
 *       320 에서 항목이 4개(연결·잔액·해제·삭제)가 되어도 메뉴가 뷰포트를 넘지 않아야 한다.
 *
 * 뷰포트를 직접 지정하므로 chromium-desktop 프로젝트에서만 돈다.
 */

const SECTION_IDS = ["h-assets", "h-liab", "h-bank-sync", "h-expense-owned"];
const DROPDOWN_OPEN = ".ant-dropdown:not(.ant-dropdown-hidden)";
const LINKED_ACCOUNT = "파킹통장";

/** 섹션 제목 요소의 세로 위치 순서 — DOM 순서가 아니라 화면에 그려진 순서. */
async function sectionOrder(page: Page) {
  return page.evaluate((ids) => {
    return ids
      .map((id) => {
        const el = document.getElementById(id);
        return el ? { id, top: el.getBoundingClientRect().top } : { id, top: Number.POSITIVE_INFINITY };
      })
      .sort((a, b) => a.top - b.top)
      .map((item) => item.id);
  }, SECTION_IDS);
}

async function openAssets(page: Page, width: number, height: number, tag: string) {
  await page.setViewportSize({ width, height });
  await page.goto(`/?qa-assets-bank=${tag}#/assets`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "자산" })).toBeVisible();
  await expect(page.getByText("파킹통장").first()).toBeVisible();
}

function focusedLabel(page: Page) {
  return page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null);
}

test.describe("자산 행 은행 메뉴 (A7-1) · 섹션 순서 (A10-A)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "뷰포트를 직접 지정한다 — desktop 프로젝트 전용");
    await page.addInitScript((token) => {
      localStorage.setItem("assetflow.token", token);
      localStorage.setItem("assetflow.theme", "light");
    }, authToken());
    await mockScreenApi(page, "assets");
  });

  for (const { width, height } of [
    { width: 320, height: 568 },
    { width: 1280, height: 720 },
  ]) {
    test(`${width} — 섹션 순서는 금융자산 → 부채 → 은행 → 다른 화면`, async ({ page }) => {
      await openAssets(page, width, height, `order-${width}`);
      expect(await sectionOrder(page)).toEqual(SECTION_IDS);
      // 앵커 제목이 그대로 살아 있는지(aria-labelledby 가 가리키는 id)
      await expect(page.getByRole("heading", { level: 2, name: "부채" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "은행 잔액 가져오기" })).toBeVisible();
    });
  }

  test("320 — cash 행 ⋯ → 잔액 가져오기 → Esc → 그 행 ⋯ 복귀, 메뉴는 뷰포트 안", async ({ page }) => {
    await openAssets(page, 320, 568, "menu-320");
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    const trigger = page.getByRole("button", { name: `${LINKED_ACCOUNT} 행 메뉴` });
    await trigger.click();
    await expect(page.locator(DROPDOWN_OPEN)).toBeVisible();

    // 4개 항목(연결·잔액·해제·삭제)이 모두 그려지고, 메뉴 상자가 뷰포트 안에 있다.
    const items = page.locator(`${DROPDOWN_OPEN} [role="menuitem"]`);
    await expect(items).toHaveCount(4);
    for (const name of ["은행 연결", "잔액 가져오기", "연결 해제", "삭제"]) {
      await expect(page.locator(DROPDOWN_OPEN).getByRole("menuitem", { name })).toHaveCount(1);
    }
    const box = await page.locator(DROPDOWN_OPEN).boundingBox();
    expect(box, "메뉴 상자를 재지 못했다").not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(568);

    // 은행 섹션의 모달이 열린다 — 행 메뉴가 모달을 복제하지 않고 그 섹션의 것을 연다.
    await page.locator(DROPDOWN_OPEN).getByRole("menuitem", { name: "잔액 가져오기" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator(".ant-modal-title")).toContainText(`${LINKED_ACCOUNT} 잔액 가져오기`);
    await expect(page.getByRole("button", { name: "가져오기", exact: true })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect.poll(() => focusedLabel(page)).toBe(`${LINKED_ACCOUNT} 행 메뉴`);
  });

  test("320 — 연결 안 된 계좌는 잔액·해제가 비활성이다", async ({ page }) => {
    await openAssets(page, 320, 568, "menu-unlinked");
    const trigger = page.getByRole("button", { name: "정기예금 행 메뉴" });
    await trigger.click();
    await expect(page.locator(DROPDOWN_OPEN)).toBeVisible();

    const menu = page.locator(DROPDOWN_OPEN);
    // antd 는 비활성 항목에만 `*-menu-item-disabled` 클래스와 aria-disabled="true" 를 준다 —
    // 활성 항목에는 aria-disabled 자체가 없다(null). 그래서 클래스로 양쪽을 확인한다.
    await expect(menu.getByRole("menuitem", { name: "은행 연결" })).not.toHaveClass(
      /ant-dropdown-menu-item-disabled/,
    );
    await expect(menu.getByRole("menuitem", { name: "잔액 가져오기" })).toHaveClass(
      /ant-dropdown-menu-item-disabled/,
    );
    await expect(menu.getByRole("menuitem", { name: "연결 해제" })).toHaveClass(
      /ant-dropdown-menu-item-disabled/,
    );
  });
});
