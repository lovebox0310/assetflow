import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { authToken } from "./fixtures";

/**
 * 이슈 #55 Stage 3 — 토스 연동 모달의 폰 조건.
 *
 * 320 에서 ① 허용 IP 안내가 보이고 ② 문서·모달 본문 가로 넘침이 0 이며
 * ③ footer(저장/취소)가 뷰포트 안에 남고 ④ 입력·셀렉트/버튼 히트가 44 이상인지 잰다.
 * ⑤ axe 새 위반 0 — 모달 서브트리만 검사한다(화면 전체는 a11y.spec.ts 담당).
 *
 * 계좌 목록은 미설정 상태라 부르지 않는다 — 이 스펙은 폼 셸과 안내만 본다.
 */

const ACCOUNT_NAME = "토스 주식";
const PORTFOLIO = {
  holdings: [],
  accounts: [
    {
      accountId: 7, accountName: ACCOUNT_NAME, institutionName: "토스증권",
      cashBalance: 0, holdingsValue: 0, totalValue: 0,
    },
  ],
  warning: null,
};

const TOSS_STATUS = { configured: false, accountId: null, hasAccountSeq: false };

async function mockInvestments(page: Page) {
  await page.route(/\/api\/v1\/.*/, (route) => {
    const { pathname } = new URL(route.request().url());
    const ok = (data: unknown) => route.fulfill({ json: { code: "OK", message: "ok", data } });
    if (pathname === "/api/v1/investments/holdings") return ok(PORTFOLIO);
    if (pathname === "/api/v1/investments/quotes/refresh") return ok(PORTFOLIO);
    if (pathname === "/api/v1/integrations/upbit") {
      return ok({ configured: false, accessKeyMasked: null });
    }
    if (pathname === "/api/v1/integrations/toss") return ok(TOSS_STATUS);
    if (pathname === "/api/v1/integrations/toss/token-preview") {
      return ok({ status: 403, code: "access_denied", error: null, body: '{"error":"access_denied"}' });
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
  await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
  await page.goto(`/?qa-toss-modal=${width}#/investments`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "투자" })).toBeVisible();
  await expect(page.getByRole("button", { name: `${ACCOUNT_NAME} 메뉴` })).toBeVisible();
}

async function openTossModal(page: Page) {
  await page.getByRole("button", { name: `${ACCOUNT_NAME} 메뉴` }).click();
  await page.getByRole("menuitem", { name: "토스 연결 설정" }).click();
  await expect(page.locator(".af-toss-modal .ant-modal-container")).toBeVisible();
  await expect(page.getByText(`토스 연동 설정 · ${ACCOUNT_NAME}`)).toBeVisible();
  // 드롭다운 닫힘 모션이 끝날 때까지 기다린다(다음 클릭이 메뉴에 먹히지 않게).
  await expect(page.locator(".ant-dropdown:not(.ant-dropdown-hidden)")).toHaveCount(0, {
    timeout: 10_000,
  });
  // 등장 모션이 끝나야 기하가 고정된다.
  await expect.poll(async () => {
    const rect = await page.locator(".af-toss-modal .ant-modal-footer").boundingBox();
    await page.waitForTimeout(80);
    const again = await page.locator(".af-toss-modal .ant-modal-footer").boundingBox();
    return rect !== null && again !== null && Math.abs(rect.y - again.y) < 0.5;
  }).toBe(true);
}

/** 히트 높이 — `::after` 로 넓힌 버튼은 그 확장값까지 더한다. */
function hitHeights(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const heights: number[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden") continue;
      const after = getComputedStyle(el, "::after");
      const expand = Math.abs(Number.parseFloat(after.top || "0")) || 0;
      // rect.height 는 이미 border-box 높이다 — 테두리를 다시 빼면 44 를 42 로 재게 된다.
      heights.push(+(rect.height + expand * 2).toFixed(1));
    }
    return heights;
  }, selector);
}

function geometry(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.querySelector<HTMLElement>(".af-toss-modal .ant-modal-body");
    const footer = document.querySelector<HTMLElement>(".af-toss-modal .ant-modal-footer");
    if (!body || !footer) throw new Error("토스 모달 body/footer 를 찾지 못했다");
    const footerRect = footer.getBoundingClientRect();
    return {
      innerHeight: window.innerHeight,
      docOverflow: doc.scrollWidth - doc.clientWidth,
      bodyOverflow: body.scrollWidth - body.clientWidth,
      footer: { top: footerRect.top, bottom: footerRect.bottom },
    };
  });
}

test.describe("토스 연동 모달 (이슈 #55 Stage 3)", () => {
  test("320/390 — 허용 IP 안내 · 넘침 0 · footer 뷰포트 안 · 터치 44 · axe 위반 0", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-mobile", "터치(mobile) 프로젝트 전용");

    for (const width of [320, 390]) {
      await gotoInvestments(page, width);
      await openTossModal(page);

      // ① 허용 IP 안내
      // 문구는 컴포넌트의 IP_HELP 단일 노드다 — 구현 문구와 일치시킨다.
      await expect(page.getByText(/허용 IP 관리에 이 서버의 IP 를 등록해야 합니다/)).toBeVisible();
      await expect(page.getByText(/403\(ip-not-allowed\) 이 발생합니다/)).toBeVisible();

      // ② 넘침 0 — 문서와 모달 본문 모두.
      const geo = await geometry(page);
      console.log(
        `[#55] ${width}px docOverflow=${geo.docOverflow} bodyOverflow=${geo.bodyOverflow} `
        + `footer.top=${geo.footer.top.toFixed(1)} footer.bottom=${geo.footer.bottom.toFixed(1)} vh=${geo.innerHeight}`,
      );
      expect(geo.docOverflow, `${width}px 문서 가로 넘침`).toBe(0);
      expect(geo.bodyOverflow, `${width}px 모달 본문 가로 넘침`).toBe(0);

      // ③ footer 는 뷰포트 안(§93 셸 계약: top ≥ 8, bottom ≤ vh − 8).
      expect(geo.footer.top, `${width}px footer top`).toBeGreaterThanOrEqual(8);
      expect(geo.footer.bottom, `${width}px footer 뷰포트 안`).toBeLessThanOrEqual(
        geo.innerHeight - 8,
      );

      // ④ 터치 44 — 입력·셀렉트는 시각 높이, 버튼은 ::after 히트까지.
      const inputs = await hitHeights(page, ".af-toss-modal .ant-form-item-control-input");
      const buttons = await hitHeights(page, ".af-toss-modal .ant-modal-footer .ant-btn");
      console.log(`[#55] ${width}px input=${JSON.stringify(inputs)} button=${JSON.stringify(buttons)}`);
      expect(inputs.length, `${width}px 입력 개수`).toBeGreaterThanOrEqual(2);
      for (const height of inputs) {
        expect(height, `${width}px 입력 히트`).toBeGreaterThanOrEqual(44);
      }
      expect(buttons.length, `${width}px footer 버튼 개수`).toBeGreaterThanOrEqual(3);
      for (const height of buttons) {
        expect(height, `${width}px 버튼 히트`).toBeGreaterThanOrEqual(44);
      }

      // ⑤ axe — 모달 서브트리만. 새 위반이 있으면 규칙 id 와 노드를 그대로 보여 준다.
      const results = await new AxeBuilder({ page })
        .include(".af-toss-modal .ant-modal-container")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const summary = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target.join(" ")),
      }));
      expect(summary, `${width}px axe 위반`).toEqual([]);

      await page.keyboard.press("Escape");
      await expect(page.locator(".af-toss-modal .ant-modal-container")).toHaveCount(0, {
        timeout: 5000,
      });
    }
  });
});
