import { test, expect, type Page } from "@playwright/test";
import { authToken } from "./fixtures";

/**
 * 이슈 #35 묶음 B — 투자 계좌 모달 셸의 두 구멍.
 *
 * I-02: 제목이 2줄이 되면 320~430 에서 antd 닫기 버튼과 겹쳤다(제목 right 284 vs
 *       닫기 left 262). 헤더 오른쪽 패딩으로 닫기 자리를 비운다 — 4개 모달이 같은
 *       공통 셸(src/theme/modalShell.ts)을 쓴다.
 * I-03: 계좌 `⋯` 메뉴에서 연 모달을 Esc 로 닫으면 포커스가 BODY 로 떨어졌다.
 *       이제 그 계좌의 `⋯` 로 돌아온다.
 *
 * 모달 안의 숫자·목록 값은 이 스펙의 관심사가 아니다 — 계좌 이름만 길게 두어
 * 제목이 2줄이 되게 하고, 셸 기하만 잰다.
 */

/**
 * 제목이 320~430 모두에서 2줄 이상이 되도록 긴 계좌 이름을 쓴다 — 겹침 회귀가
 * 드러나는 조건(제목 2줄)을 재현하려는 것이고, 값 자체는 가명이다.
 */
const LONG_ACCOUNT_NAME = "퇴직연금 IRP 주식 계좌 한국투자 장기투자";
const PORTFOLIO = {
  holdings: [
    {
      id: 1, accountId: 4, assetClass: "stock", symbol: "005930", name: "삼성전자",
      currency: "KRW", quantity: 10, avgPrice: 70_000, marketPrice: 75_000, fxRate: 1,
      priceAsOf: "2026-11-06",
    },
  ],
  accounts: [
    {
      accountId: 4, accountName: LONG_ACCOUNT_NAME, institutionName: "한국투자증권",
      cashBalance: 1_200_000, holdingsValue: 750_000, totalValue: 1_950_000,
    },
  ],
  warning: null,
};

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

interface TitleGeometry {
  innerHeight: number;
  title: { right: number; height: number; lines: number };
  close: { left: number; right: number };
  /** 제목 오른쪽 − 닫기 왼쪽. 0 이하면 겹치지 않는다. */
  overlap: number;
  footer: { top: number; bottom: number };
  bodyScrolls: boolean;
  /** 셸이 maxHeight(100dvh − 32px)에 닿아 잘렸는가 — 이때만 footer 가 vh−16 에 붙는다(§93). */
  capped: boolean;
  overflowX: number;
}

function measureTitle(page: Page): Promise<TitleGeometry> {
  return page.evaluate(() => {
    const title = document.querySelector<HTMLElement>(".ant-modal-title");
    const close = document.querySelector<HTMLElement>(".ant-modal-close");
    const footer = document.querySelector<HTMLElement>(".ant-modal-footer");
    const body = document.querySelector<HTMLElement>(".ant-modal-body");
    const container = document.querySelector<HTMLElement>(".ant-modal-container");
    if (!title || !close || !footer || !body || !container) throw new Error("모달 헤더/푸터를 찾지 못했다");
    const titleRect = title.getBoundingClientRect();
    const closeRect = close.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    const maxHeight = Number.parseFloat(getComputedStyle(container).maxHeight);
    const bodyScrolls = body.scrollHeight > body.clientHeight;
    // 제목 줄 수 — 줄 높이(antd 16px 글꼴이면 24px)로 나눈 근사값. 로그·전제 확인용.
    const lineHeight = Number.parseFloat(getComputedStyle(title).lineHeight);
    const lines = Number.isFinite(lineHeight) && lineHeight > 0
      ? Math.round(titleRect.height / lineHeight)
      : 0;
    return {
      innerHeight: window.innerHeight,
      title: { right: titleRect.right, height: titleRect.height, lines },
      close: { left: closeRect.left, right: closeRect.right },
      overlap: titleRect.right - closeRect.left,
      footer: { top: footerRect.top, bottom: footerRect.bottom },
      bodyScrolls,
      capped: bodyScrolls || (Number.isFinite(maxHeight) && Math.abs(box.height - maxHeight) <= 1),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

async function mockInvestments(page: Page) {
  await page.route(/\/api\/v1\/.*/, (route) => {
    const { pathname } = new URL(route.request().url());
    const ok = (data: unknown) => route.fulfill({ json: { code: "OK", message: "ok", data } });
    if (pathname === "/api/v1/investments/holdings") return ok(PORTFOLIO);
    if (pathname === "/api/v1/investments/quotes/refresh") return ok(PORTFOLIO);
    // 자격증명이 없는 계좌 — 모달은 '신규 입력' 으로 열린다(폼이 가장 길다).
    if (pathname.endsWith("/kis-credentials")) {
      return route.fulfill({
        status: 404,
        json: { code: "NOT_FOUND", message: "not found", data: null },
      });
    }
    // 업비트는 이 화면에서 쓰지 않는다 — 실패해도 '미설정' 으로 넘어간다.
    if (pathname === "/api/v1/integrations/upbit") {
      return ok({ configured: false, accessKeyMasked: null });
    }
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: `not mocked: ${pathname}`, data: null },
    });
  });
}

async function gotoInvestments(page: Page, width: number) {
  await page.addInitScript((token) => {
    localStorage.setItem("assetflow.token", token);
    localStorage.setItem("assetflow.theme", "light");
  }, authToken());
  await mockInvestments(page);
  await page.setViewportSize({ width, height: VIEWPORTS.find((v) => v.width === width)?.height ?? 800 });
  await page.goto(`/?qa-invest-modal=${width}#/investments`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "투자" })).toBeVisible();
  await expect(page.getByRole("button", { name: `${LONG_ACCOUNT_NAME} 메뉴` })).toBeVisible();
}

/**
 * 드롭다운 팝업이 완전히 닫힐 때까지 기다린다.
 * antd Dropdown 은 닫힘 모션이 끝날 때까지 Esc 를 자기 몫으로 가져간다(전역 Esc 스택의
 * top). 메뉴가 닫히기 전에 Esc 를 누르면 모달이 아니라 메뉴가 먹으므로, 순서를 고정한다.
 */
async function waitForMenusClosed(page: Page) {
  await expect(
    page.locator(".ant-dropdown:not(.ant-dropdown-hidden)"),
    "계좌 메뉴가 닫혀야 Esc 가 모달에 닿는다",
  ).toHaveCount(0, { timeout: 10_000 });
}

async function openKisCredentialsModal(page: Page) {
  await page.getByRole("button", { name: `${LONG_ACCOUNT_NAME} 메뉴` }).click();
  await page.getByRole("menuitem", { name: "한국투자 연결 설정" }).click();
  await expect(page.locator(".ant-modal-container")).toBeVisible();
  await expect(page.getByText(`KIS 연동 설정 · ${LONG_ACCOUNT_NAME}`)).toBeVisible();
  await waitForMenusClosed(page);
  // 등장 zoom 모션이 끝나야 기하가 고정된다.
  await expect.poll(async () => {
    const a = await measureTitle(page);
    await page.waitForTimeout(80);
    const b = await measureTitle(page);
    return Math.abs(a.title.right - b.title.right) < 0.5 && Math.abs(a.footer.bottom - b.footer.bottom) < 0.5;
  }).toBe(true);
}

async function closeModal(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.locator(".ant-modal-container")).toHaveCount(0, { timeout: 5000 });
}

test.describe("투자 계좌 모달 셸 (이슈 #35)", () => {
  test("320/375/390/430 — 제목이 닫기 버튼과 겹치지 않고 footer·가로 넘침이 유지된다 (I-02)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-mobile", "터치(mobile) 프로젝트 전용");

    for (const viewport of VIEWPORTS) {
      await gotoInvestments(page, viewport.width);
      await openKisCredentialsModal(page);

      const geometry = await measureTitle(page);
      console.log(
        `[I-02] ${viewport.width}px lines=${geometry.title.lines} title.right=${geometry.title.right.toFixed(1)} `
        + `close.left=${geometry.close.left.toFixed(1)} overlap=${geometry.overlap.toFixed(1)} `
        + `footer.bottom=${geometry.footer.bottom.toFixed(1)} vh-16=${geometry.innerHeight - 16} overflowX=${geometry.overflowX} bodyScrolls=${geometry.bodyScrolls} capped=${geometry.capped}`,
      );
      // 제목 줄 수는 폰트에 좌우되는 전제라 단언하지 않는다(로그만). 요구는 겹침 0 이다.
      // 2줄 이상이면 이 회귀(닫기 버튼 겹침)를 실제로 재게 된다.
      // 겹침 0 — 제목 오른쪽이 닫기 버튼 왼쪽보다 오른쪽에 있으면 안 된다.
      expect(geometry.overlap, `${viewport.width}px 제목/닫기 겹침`).toBeLessThanOrEqual(0);
      // 닫기 버튼은 뷰포트 안에 남아 있다.
      expect(geometry.close.left).toBeGreaterThan(0);
      // footer 는 뷰포트 안. 내용이 넘치는 폭에서는 아래 16px 여백에 붙어 있다(셸 계약).
      expect(geometry.footer.top, `${viewport.width}px footer 위쪽`).toBeGreaterThanOrEqual(8);
      expect(geometry.footer.bottom, `${viewport.width}px footer 뷰포트 안`).toBeLessThanOrEqual(
        geometry.innerHeight - 8,
      );
      if (geometry.capped) {
        expect(
          Math.abs(geometry.footer.bottom - (geometry.innerHeight - 16)),
          `${viewport.width}px footer bottom`,
        ).toBeLessThanOrEqual(1);
      }
      // 문서 가로 넘침 0.
      expect(geometry.overflowX, `${viewport.width}px 가로 넘침`).toBe(0);

      await closeModal(page);
    }
  });

  test("320 — Esc 로 닫으면 포커스가 그 계좌 `⋯` 로 돌아온다 (I-03)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-mobile", "터치(mobile) 프로젝트 전용");

    await gotoInvestments(page, 320);
    const menuButton = page.getByRole("button", { name: `${LONG_ACCOUNT_NAME} 메뉴` });
    await menuButton.click();
    await page.getByRole("menuitem", { name: "한국투자 연결 설정" }).click();
    await expect(page.locator(".ant-modal-container")).toBeVisible();
    await waitForMenusClosed(page);
    // 모달이 열리면 포커스는 모달 안에 있다 — 닫힌 뒤와 구분하기 위한 전제.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null))
      .not.toBe(`${LONG_ACCOUNT_NAME} 메뉴`);

    await page.keyboard.press("Escape");
    await expect(page.locator(".ant-modal-container")).toHaveCount(0, { timeout: 5000 });

    await expect(menuButton).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  });
});
