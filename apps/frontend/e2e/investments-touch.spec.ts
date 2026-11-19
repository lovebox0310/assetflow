import { test, expect, type Page } from "@playwright/test";
import { authToken } from "./fixtures";

/**
 * 이슈 #35 묶음 C — 투자 화면 터치 44 (I-04 · I-10 · I-12).
 *
 * - I-04: 자격증명 모달의 API 환경 Radio 22px.
 * - I-10: 연금 진단 모달의 경로 탭 38px(글자 22).
 * - I-12: 종목 폼 Input/InputNumber/Select 36px, 9개.
 *
 * 커진 컨트롤 때문에 모달 본문이 길어질 수 있다 — footer 는 §93 셸 계약대로
 * 뷰포트 아래 16px 에 붙어 있어야 하고(footer bottom = vh − 16), 본문/문서는
 * 가로로 넘치지 않아야 한다.
 *
 * 터치(pointer: coarse)에서만 44 다. 데스크톱 36 불변은 이 스펙의 관심사가
 * 아니다(마우스 프로젝트에서 모달을 열 필요도 없다).
 */

const ACCOUNT_NAME = "주식 계좌";
const PORTFOLIO = {
  holdings: [
    {
      id: 1, accountId: 4, assetClass: "stock", symbol: "005930", name: "삼성전자",
      currency: "KRW", quantity: 120, avgPrice: 68_000, marketPrice: 75_000, fxRate: 1,
      priceAsOf: "2026-11-06",
    },
  ],
  accounts: [
    {
      accountId: 4, accountName: ACCOUNT_NAME, institutionName: "한국투자증권",
      cashBalance: 1_200_000, holdingsValue: 9_000_000, totalValue: 10_200_000,
    },
  ],
  warning: null,
};

/** 연금 진단 모달 — 탭 3개가 렌더될 만큼만 채운다(값은 가명). */
const PENSION_PREVIEW = {
  balance: { output1: [], output2: [] },
  warning: null,
  error: null,
  acntPrdtCd: "22",
  isMock: false,
  stock: { path: "/uapi/stock/balance", trId: "TTTC8434R", response: { output1: [] }, error: null },
  account: { path: "/uapi/account/balance", trId: "CTRP6548R", response: { output1: [] }, error: null },
  pension: { path: "/uapi/pension/balance", trId: "TTTC2208R", response: { output1: [] }, error: null },
  usedPath: "pension",
  balancePreview: { path: "pension", cash: 0, holdingCount: 0, warning: null, error: null },
};

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
];

async function mockInvestments(page: Page) {
  await page.route(/\/api\/v1\/.*/, (route) => {
    const { pathname } = new URL(route.request().url());
    const ok = (data: unknown) => route.fulfill({ json: { code: "OK", message: "ok", data } });
    if (pathname === "/api/v1/investments/holdings") return ok(PORTFOLIO);
    if (pathname === "/api/v1/investments/quotes/refresh") return ok(PORTFOLIO);
    if (pathname.endsWith("/kis-pension-preview")) return ok(PENSION_PREVIEW);
    if (pathname.endsWith("/kis-credentials")) {
      return route.fulfill({
        status: 404,
        json: { code: "NOT_FOUND", message: "not found", data: null },
      });
    }
    if (pathname === "/api/v1/integrations/upbit") {
      return ok({ configured: false, accessKeyMasked: null });
    }
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: `not mocked: ${pathname}`, data: null },
    });
  });
}

async function gotoInvestments(page: Page, width: number, height: number) {
  await page.addInitScript((token) => {
    localStorage.setItem("assetflow.token", token);
    localStorage.setItem("assetflow.theme", "light");
  }, authToken());
  await mockInvestments(page);
  await page.setViewportSize({ width, height });
  await page.goto(`/?qa-invest-touch=${width}#/investments`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "투자" })).toBeVisible();
  await expect(page.getByRole("button", { name: `${ACCOUNT_NAME} 메뉴` })).toBeVisible();
}

/** 보이는 요소만 — 히트 높이의 최솟값과 개수. */
function hitHeights(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const heights: number[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden") continue;
      heights.push(+rect.height.toFixed(1));
    }
    return heights;
  }, selector);
}

/** 문서 가로 넘침 + 모달 본문 가로 넘침. 모달이 없으면 bodyOverflow 는 null. */
function overflowGeometry(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.querySelector<HTMLElement>(".ant-modal-body");
    return {
      doc: doc.scrollWidth - doc.clientWidth,
      body: body ? body.scrollWidth - body.clientWidth : null,
    };
  });
}

function footerGeometry(page: Page) {
  return page.evaluate(() => {
    const footer = document.querySelector<HTMLElement>(".ant-modal-footer");
    const body = document.querySelector<HTMLElement>(".ant-modal-body");
    if (!footer || !body) throw new Error("모달 footer/body 를 찾지 못했다");
    const rect = footer.getBoundingClientRect();
    return {
      innerHeight: window.innerHeight,
      bottom: +rect.bottom.toFixed(1),
      top: +rect.top.toFixed(1),
      bodyScrolls: body.scrollHeight > body.clientHeight,
    };
  });
}

/** 등장 모션이 끝나 footer 위치가 고정될 때까지 기다린다. */
async function settle(page: Page) {
  await expect
    .poll(async () => {
      const a = await footerGeometry(page);
      await page.waitForTimeout(80);
      const b = await footerGeometry(page);
      return Math.abs(a.bottom - b.bottom) < 0.5;
    })
    .toBe(true);
}

async function waitForMenusClosed(page: Page) {
  await expect(page.locator(".ant-dropdown:not(.ant-dropdown-hidden)")).toHaveCount(0, {
    timeout: 10_000,
  });
}

async function openAccountMenu(page: Page, item: string) {
  await page.getByRole("button", { name: `${ACCOUNT_NAME} 메뉴` }).click();
  await page.getByRole("menuitem", { name: item }).click();
  await expect(page.locator(".ant-modal-container")).toBeVisible();
  await waitForMenusClosed(page);
}

async function closeModal(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.locator(".ant-modal-container")).toHaveCount(0, { timeout: 5000 });
}

test.describe("투자 터치 44 (이슈 #35 묶음 C)", () => {
  test("320/390 — Radio·Tabs·폼 히트 ≥44, footer bottom=vh−16, 가로 넘침 0 (I-04/I-10/I-12)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-mobile", "터치(mobile) 프로젝트 전용");

    for (const viewport of VIEWPORTS) {
      await gotoInvestments(page, viewport.width, viewport.height);

      /* ── I-12 종목 폼: Input 3 + InputNumber 3 + Select 3 = 9 ── */
      await page.getByRole("button", { name: "+ 종목 추가" }).click();
      await expect(page.getByRole("button", { name: "저장" }).first()).toBeVisible();

      const inputs = await hitHeights(page, ".af-investments .ant-input");
      const numbers = await hitHeights(page, ".af-investments .ant-input-number");
      // antd 6 의 Select 는 `.ant-select-selector` 가 아니라 루트 `.ant-select` 가 컨트롤이다.
      const selects = await hitHeights(page, ".af-investments .ant-select");
      console.log(
        `[I-12] ${viewport.width}px input=${JSON.stringify(inputs)} `
        + `number=${JSON.stringify(numbers)} select=${JSON.stringify(selects)}`,
      );
      expect(inputs.length, `${viewport.width}px Input 개수`).toBe(3);
      expect(numbers.length, `${viewport.width}px InputNumber 개수`).toBe(3);
      expect(selects.length, `${viewport.width}px Select 개수`).toBe(3);
      for (const [label, heights] of [
        ["Input", inputs],
        ["InputNumber", numbers],
        ["Select", selects],
      ] as const) {
        expect(Math.min(...heights), `${viewport.width}px ${label} 히트`).toBeGreaterThanOrEqual(44);
      }
      expect((await overflowGeometry(page)).doc, `${viewport.width}px 폼 문서 넘침`).toBe(0);
      await page.getByRole("button", { name: "취소" }).first().click();

      /* ── I-04 자격증명 모달 Radio ── */
      await openAccountMenu(page, "한국투자 연결 설정");
      await settle(page);
      const radios = await hitHeights(page, ".af-modal-touch .ant-radio-wrapper");
      console.log(`[I-04] ${viewport.width}px radio=${JSON.stringify(radios)}`);
      expect(radios.length, `${viewport.width}px Radio 개수`).toBe(2);
      expect(Math.min(...radios), `${viewport.width}px Radio 히트`).toBeGreaterThanOrEqual(44);

      const credFooter = await footerGeometry(page);
      const credOverflow = await overflowGeometry(page);
      console.log(
        `[footer] ${viewport.width}px credential bottom=${credFooter.bottom} `
        + `vh-16=${credFooter.innerHeight - 16} bodyOverflow=${credOverflow.body}`,
      );
      expect(credFooter.bodyScrolls, `${viewport.width}px 자격증명 본문 스크롤 전제`).toBe(true);
      expect(
        Math.abs(credFooter.bottom - (credFooter.innerHeight - 16)),
        `${viewport.width}px 자격증명 footer bottom`,
      ).toBeLessThanOrEqual(1);
      expect(credOverflow.doc, `${viewport.width}px 자격증명 문서 넘침`).toBe(0);
      expect(credOverflow.body, `${viewport.width}px 자격증명 본문 넘침`).toBe(0);
      await closeModal(page);

      /* ── I-10 연금 진단 모달 Tabs ── */
      await openAccountMenu(page, "연금 진단");
      await expect(page.locator(".af-modal-touch .ant-tabs-tab").first()).toBeVisible();
      await settle(page);
      const tabs = await hitHeights(page, ".af-modal-touch .ant-tabs-tab");
      console.log(`[I-10] ${viewport.width}px tab=${JSON.stringify(tabs)}`);
      expect(tabs.length, `${viewport.width}px 탭 개수`).toBe(3);
      expect(Math.min(...tabs), `${viewport.width}px 탭 히트`).toBeGreaterThanOrEqual(44);

      const pensionFooter = await footerGeometry(page);
      const pensionOverflow = await overflowGeometry(page);
      console.log(
        `[footer] ${viewport.width}px pension bottom=${pensionFooter.bottom} `
        + `vh-16=${pensionFooter.innerHeight - 16} bodyOverflow=${pensionOverflow.body}`,
      );
      expect(pensionFooter.bodyScrolls, `${viewport.width}px 연금 본문 스크롤 전제`).toBe(true);
      expect(
        Math.abs(pensionFooter.bottom - (pensionFooter.innerHeight - 16)),
        `${viewport.width}px 연금 footer bottom`,
      ).toBeLessThanOrEqual(1);
      expect(pensionOverflow.doc, `${viewport.width}px 연금 문서 넘침`).toBe(0);
      expect(pensionOverflow.body, `${viewport.width}px 연금 본문 넘침`).toBe(0);
      await closeModal(page);
    }
  });
});
