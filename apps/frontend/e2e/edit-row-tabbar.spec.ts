import { test, expect, type Page } from "@playwright/test";
import { authToken } from "./fixtures";
import { mockScreenApi, type ScreenKey } from "./screens-mocks";

/**
 * 이슈 #45 — 좁은 화면(320×568)에서 편집 셀 하단이 하단 탭바에 가린다.
 *
 * Chrome 은 포커스 스크롤에 `scroll-margin` 을 적용하지 않는다(§122 C-02 실측).
 * 그래서 편집 행으로 진입하면 초점을 받은 입력만 뷰포트에 맞춰지고, 셀의
 * 아래쪽은 고정 탭바 뒤로 남는다(실측: 셀 462~572, 탭바 511~568 → 59px 가림).
 * `AfListTable` 이 편집 행에 초점을 옮긴 직후 하단 고정 요소 높이를 **실제
 * 값으로** 읽어 문서를 보정한다.
 *
 * - (a) 마지막 행을 탭바 바로 위에 붙여 놓고 클릭 → 편집 셀 하단 가림 0.
 * - (b) 포커스는 편집 셀 안, Esc 1회로 종료(§124 유지).
 * - (c) 편집 셀이 이미 들어가는 위치에서 마우스 클릭 → 불필요한 스크롤 ≤ 16px.
 * - 탭바가 없는 768/1280 은 보정할 것이 없으므로 스크롤이 생기지 않는다.
 *
 * jsdom 은 레이아웃이 0 이라 이 축(가림·스크롤)을 볼 수 없다 — e2e 로 검증한다.
 * 뷰포트를 직접 지정하므로 chromium-desktop 프로젝트에서만 돈다.
 */

interface ScreenSpec {
  key: ScreenKey;
  name: string;
  hash: string;
  /** 목이 행을 실제로 렌더했는지 확인하는 문구. */
  readyText: string;
  tableSelector: string;
}

const SCREENS: ScreenSpec[] = [
  {
    key: "expenseCards",
    name: "카드내역",
    hash: "#/expenses/cards",
    readyText: "한마음식당",
    tableSelector: 'table[aria-labelledby="h-card-imports"]',
  },
  {
    key: "assets",
    name: "자산",
    hash: "#/assets",
    readyText: "파킹통장",
    tableSelector: 'table[aria-labelledby="h-assets"]',
  },
];

/** 마지막 행을 탭바 바로 위에 붙이는 여유(px). 사용자가 흔히 두는 스크롤 위치. */
const CLIP_TOLERANCE = 0;

interface Geometry {
  cellTop: number;
  cellBottom: number;
  tabbarTop: number | null;
  tabbarH: number;
  innerHeight: number;
  scrollY: number;
  focusInCell: boolean;
  /** 보정이 허용하는 하한 — 탭바 위쪽 끝(탭바가 없으면 뷰포트 하단). */
  limit: number;
}

function geometry(page: Page): Promise<Geometry | null> {
  return page.evaluate(() => {
    const cell = document.querySelector<HTMLElement>(
      ".af-list__row--editing td.af-list__cell--editor",
    );
    if (!cell) return null;
    const rect = cell.getBoundingClientRect();
    const tabbar = document.querySelector<HTMLElement>(".af-tabbar");
    const tabbarH = tabbar ? tabbar.getBoundingClientRect().height : 0;
    const active = document.activeElement as HTMLElement | null;
    return {
      cellTop: Math.round(rect.top),
      cellBottom: Math.round(rect.bottom),
      tabbarTop: tabbar ? Math.round(tabbar.getBoundingClientRect().top) : null,
      tabbarH: Math.round(tabbarH),
      innerHeight: window.innerHeight,
      scrollY: Math.round(window.scrollY),
      focusInCell: Boolean(active && cell.contains(active)),
      limit: Math.round(window.innerHeight - tabbarH),
    };
  });
}

/**
 * 지정한 행의 아래쪽 끝을 하단 고정 요소 바로 위에 붙인다.
 * (편집 행을 열기 전 상태다 — 행 높이는 아직 편집 셀 높이가 아니다.)
 */
async function flushRowToBottom(page: Page, selector: string, index: number) {
  await page.evaluate(
    ({ sel, i }) => {
      const table = document.querySelector<HTMLElement>(sel);
      const rows = [...(table?.querySelectorAll<HTMLElement>("tbody tr.af-list__row") ?? [])];
      const row = rows[i];
      if (!row) return;
      const tabbar = document.querySelector<HTMLElement>(".af-tabbar");
      const inset = tabbar ? tabbar.getBoundingClientRect().height : 0;
      window.scrollBy(0, row.getBoundingClientRect().bottom - (window.innerHeight - inset));
    },
    { sel: selector, i: index },
  );
}

/** 마지막 행의 위쪽 끝을 "편집 셀이 들어가는 위치"로 옮긴다(아래 여유 editorH+8). */
async function fitRowForEditor(page: Page, selector: string, index: number, editorH: number) {
  await page.evaluate(
    ({ sel, i, h }) => {
      const table = document.querySelector<HTMLElement>(sel);
      const rows = [...(table?.querySelectorAll<HTMLElement>("tbody tr.af-list__row") ?? [])];
      const row = rows[i];
      if (!row) return;
      const tabbar = document.querySelector<HTMLElement>(".af-tabbar");
      const inset = tabbar ? tabbar.getBoundingClientRect().height : 0;
      const target = window.innerHeight - inset - h - 40;
      window.scrollBy(0, row.getBoundingClientRect().top - target);
    },
    { sel: selector, i: index, h: editorH },
  );
}

/** 브라우저 자체 스크롤·보정 rAF 가 끝난 뒤로 미룬다. */
function settle(page: Page) {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function openScreen(page: Page, screen: ScreenSpec, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(`/?qa-edit-tabbar=${screen.key}-${width}${screen.hash}`, { waitUntil: "networkidle" });
  await expect(page.getByText(screen.readyText).first()).toBeVisible();
}

test.describe("편집 행 하단 탭바 가림", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "뷰포트를 직접 지정한다 — desktop 프로젝트 전용");
    await page.addInitScript((token) => {
      localStorage.setItem("assetflow.token", token);
      localStorage.setItem("assetflow.theme", "light");
    }, authToken());
  });

  for (const screen of SCREENS) {
    test(`${screen.name} — 320×568 마지막 행 편집: 가림 0, 포커스 유지, Esc 1회, 클릭 스크롤 ≤16`, async ({
      page,
    }) => {
      await mockScreenApi(page, screen.key);
      await openScreen(page, screen, 320, 568);

      const table = page.locator(screen.tableSelector).first();
      const triggers = table.locator("button.af-list__edit");
      const count = await triggers.count();
      expect(count, "표에 편집 가능한 행이 있다").toBeGreaterThan(0);
      const last = count - 1;
      /* 편집 행으로 바뀌면 트리거 버튼이 DOM 에서 사라진다 — 접근 이름은 미리 읽는다. */
      const label = await triggers.nth(last).getAttribute("aria-label");

      /* (a)(b) 마지막 행을 탭바 바로 위에 붙이고 클릭 — 보고된 위치 재현. */
      await flushRowToBottom(page, screen.tableSelector, last);
      await triggers.nth(last).click();
      await expect(page.locator(".af-list__row--editing")).toBeVisible();
      await settle(page);

      const clipped = await geometry(page);
      expect(clipped, "편집 셀이 렌더됐다").not.toBeNull();
      expect(clipped!.tabbarH, "320 에는 하단 탭바가 있다").toBeGreaterThan(0);
      expect(
        clipped!.cellBottom,
        `편집 셀 하단(${clipped!.cellBottom}) 은 탭바 위(${clipped!.limit})에서 끝나야 한다`,
      ).toBeLessThanOrEqual(clipped!.limit - CLIP_TOLERANCE);
      expect(clipped!.focusInCell, "포커스가 편집 셀 안에 남는다").toBe(true);
      // 초점을 받은 입력도 같은 경계 안에 있다(가림 0 의 실제 조건).
      const focusBox = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || active === document.body) return null;
        const rect = active.getBoundingClientRect();
        const tabbar = document.querySelector<HTMLElement>(".af-tabbar");
        const inset = tabbar ? tabbar.getBoundingClientRect().height : 0;
        return { bottom: Math.round(rect.bottom), limit: Math.round(window.innerHeight - inset) };
      });
      expect(focusBox, "포커스된 컨트롤").not.toBeNull();
      expect(focusBox!.bottom, "포커스된 입력도 탭바에 가리지 않는다").toBeLessThanOrEqual(focusBox!.limit);

      /* Esc 1회로 종료(§124) + 포커스가 그 행 탭 버튼으로 복귀. */
      await page.keyboard.press("Escape");
      await expect(page.locator(".af-list__row--editing")).toHaveCount(0);
      await expect(
        // 같은 접근 이름이 다른 표에도 있을 수 있다(카드내역: 미분류 정리 ↔ 가져온 카드내역) — 이 표 안에서 찾는다.
        table.getByRole("button", { name: label ?? "", exact: true }),
        "Esc 후 포커스가 편집을 열었던 행 버튼으로 돌아온다",
      ).toBeFocused();

      /* (c) 편집 셀이 이미 들어가는 위치에서 마우스 클릭 — 불필요한 스크롤 없음. */
      const editorH = clipped!.cellBottom - clipped!.cellTop;
      await fitRowForEditor(page, screen.tableSelector, last, editorH);
      const before = await page.evaluate(() => Math.round(window.scrollY));
      await triggers.nth(last).click();
      await expect(page.locator(".af-list__row--editing")).toBeVisible();
      await settle(page);

      const fitted = await geometry(page);
      expect(fitted, "두 번째 편집 셀").not.toBeNull();
      expect(
        fitted!.cellBottom,
        "이미 보이는 편집 셀은 아래 경계 안에 그대로 있다",
      ).toBeLessThanOrEqual(fitted!.limit);
      expect(
        Math.abs(fitted!.scrollY - before),
        `클릭 진입 시 스크롤 변화(${fitted!.scrollY - before}px) 는 16px 이하`,
      ).toBeLessThanOrEqual(16);
    });
  }

  for (const screen of SCREENS) {
    test(`${screen.name} — 768/1280(탭바 없음) 편집 진입 스크롤 없음`, async ({ page }) => {
      await mockScreenApi(page, screen.key);

      for (const viewport of [
        { width: 768, height: 1024 },
        { width: 1280, height: 720 },
      ]) {
        await openScreen(page, screen, viewport.width, viewport.height);
        await expect(page.locator(".af-tabbar"), `${viewport.width}px 에는 탭바가 없다`).toHaveCount(0);

        const triggers = page.locator(screen.tableSelector).first().locator("button.af-list__edit");
        expect(await triggers.count(), `${viewport.width}px 행 수`).toBeGreaterThan(0);
        // 첫 행: 편집 셀이 뷰포트에 들어오는 위치다 — 보정할 것이 없다.
        // 클릭 전에 스크롤해 둔다(Playwright 의 자동 스크롤을 측정에 넣지 않는다).
        await triggers.first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(100);
        const before = await page.evaluate(() => Math.round(window.scrollY));
        await triggers.first().click();
        await expect(page.locator(".af-list__row--editing")).toBeVisible();
        await settle(page);

        const box = await geometry(page);
        expect(box, `${viewport.width}px 편집 셀`).not.toBeNull();
        expect(box!.tabbarH, `${viewport.width}px 하단 고정 요소 없음`).toBe(0);
        expect(
          Math.abs(box!.scrollY - before),
          `${viewport.width}px 편집 진입 스크롤(${box!.scrollY - before}px)`,
        ).toBeLessThanOrEqual(16);
        await page.keyboard.press("Escape");
        await expect(page.locator(".af-list__row--editing")).toHaveCount(0);
      }
    });
  }
});
