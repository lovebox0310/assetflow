import { test, expect, type Page } from "@playwright/test";
import { authToken } from "./fixtures";
import { mockScreenApi } from "./screens-mocks";

/**
 * 이슈 #36 P2 — 자산 화면 터치·포커스 (AS-05 · AS-06).
 *
 * - AS-05: coarse 에서 자산 폼(Input 36 / InputNumber 34)과 은행 연결 모달의
 *   컨트롤이 44 미만이었다. 투자 화면(§125)은 이미 44.
 * - AS-06: 터치 태블릿(768)에서 행 이름 탭 대상이 글자 높이(22px)뿐이었다 —
 *   행 전체 확장(`::after inset 0`)이 `<768` 블록에만 있었기 때문.
 *
 * `pointer: coarse` 는 이 저장소의 태블릿 프로젝트가 실제로는 터치가 아니라
 * (playwright.config.ts 의 `devices["iPad"]` 가 이 버전에 없다) 여기서
 * hasTouch 를 명시하고 320/390/768 을 직접 순회한다(mobile-input-zoom 과 같은 방식).
 */

const TOUCH_MIN = 44;
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
];

async function gotoAssets(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(`/?qa-assets-touch=${width}#/assets`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "자산" })).toBeVisible();
  await expect(page.getByText("파킹통장").first()).toBeVisible();
}

/** 보이는 요소들의 시각 높이(px). */
function heights(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const out: number[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden") continue;
      out.push(Math.round(rect.height * 10) / 10);
    }
    return out;
  }, selector);
}

/**
 * 실제 탭 영역 = 시각 rect ∪ `::after` 확장.
 *
 * `getComputedStyle(el, "::after")` 의 inset 은 사용값(px)으로 해석되므로,
 * 절대 배치 기준 상자(가장 가까운 positioned 조상)의 rect 에 더하면 탭 영역이
 * 나온다. `elementFromPoint` 로 밀어 재면 확장 폭이 44 를 넘어 탐색 한계에
 * 걸리고, 셀 안의 positioned 요소(Tag 등)가 구멍을 내 측정이 흔들린다.
 */
function tapRect(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const box = {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    };
    const after = getComputedStyle(el, "::after");
    if (after.content !== "none" && after.position === "absolute") {
      /* 절대 배치 상자 = 가장 가까운 positioned 조상(자기 자신 포함 — `.af-icon-btn`
       * 처럼 버튼이 직접 기준 상자인 경우가 있다). */
      let cb: HTMLElement | null = el;
      while (cb && getComputedStyle(cb).position === "static") cb = cb.parentElement;
      const px = (value: string) => (value.endsWith("px") ? Number.parseFloat(value) : null);
      const top = px(after.top);
      const right = px(after.right);
      const bottom = px(after.bottom);
      const left = px(after.left);
      if (cb && top !== null && right !== null && bottom !== null && left !== null) {
        const c = cb.getBoundingClientRect();
        box.left = Math.min(box.left, c.left + left);
        box.right = Math.max(box.right, c.right - right);
        box.top = Math.min(box.top, c.top + top);
        box.bottom = Math.max(box.bottom, c.bottom - bottom);
      }
    }
    return {
      ...box,
      width: Math.round((box.right - box.left) * 10) / 10,
      height: Math.round((box.bottom - box.top) * 10) / 10,
    };
  }, selector);
}

/** 탭 영역 위·아래 가장자리에서 실제 히트가 그 요소인지 — ::after 가 살아 있는지 확인. */
function ownsEdges(page: Page, selector: string, box: { left: number; right: number; top: number; bottom: number }) {
  return page.evaluate(
    ({ sel, b }) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) return { top: false, bottom: false };
      const owned = (node: Element | null) => !!node && (node === el || el.contains(node));
      const cx = (b.left + b.right) / 2;
      return {
        top: owned(document.elementFromPoint(cx, b.top + 2)),
        bottom: owned(document.elementFromPoint(cx, b.bottom - 2)),
      };
    },
    { sel: selector, b: box },
  );
}

/** 두 박스의 교집합 — 면적(px²)과 중심점. area 0 이면 겹치지 않는다. */
function overlapBox(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
) {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  const top = Math.max(a.top, b.top);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right <= left || bottom <= top) return { area: 0, cx: 0, cy: 0 };
  return {
    area: Math.round((right - left) * (bottom - top)),
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
  };
}

/** 그 지점의 최상위 히트가 selector 요소(또는 자손)인지. */
function ownerAt(page: Page, x: number, y: number, selector: string) {
  return page.evaluate(
    ({ px, py, sel }) => {
      const el = document.querySelector<HTMLElement>(sel);
      const hit = document.elementFromPoint(px, py);
      return !!el && !!hit && (hit === el || el.contains(hit));
    },
    { px: x, py: y, sel: selector },
  );
}

/** 모달 등장 모션(zoom)이 끝나 크기가 고정될 때까지 — 애니메이션 중 측정 방지. */
async function settleModal(page: Page) {
  await expect
    .poll(async () => {
      const size = () =>
        page.evaluate(() => {
          const el = document.querySelector<HTMLElement>(".af-bank-modal .ant-modal-container");
          const r = el?.getBoundingClientRect();
          return r ? [r.width, r.height] : [0, 0];
        });
      const a = await size();
      await page.waitForTimeout(80);
      const b = await size();
      return a[0] > 0 && Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5;
    })
    .toBe(true);
}

test.describe("자산 터치 44 (이슈 #36 P2)", () => {
  test.use({ hasTouch: true });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-mobile", "터치 프로젝트 전용");
    await page.addInitScript((token) => {
      localStorage.setItem("assetflow.token", token);
      localStorage.setItem("assetflow.theme", "light");
    }, authToken());
    await mockScreenApi(page, "assets");
  });

  test("320/390/768 — 자산 폼·은행 모달 컨트롤 ≥44, 가로 넘침 0 (AS-05)", async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await gotoAssets(page, viewport.width, viewport.height);
      expect(
        await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches),
        `${viewport.width}px pointer: coarse 전제`,
      ).toBe(true);

      /* ── 자산 추가 폼: Input 2 + InputNumber 1 + Select 1 ── */
      await page.getByRole("button", { name: "+ 자산 추가" }).click();
      await expect(page.getByRole("group", { name: "자산 추가 폼" })).toBeVisible();

      const inputs = await heights(page, ".af-assets .af-item-form .ant-input:not([type='hidden'])");
      const numbers = await heights(page, ".af-assets .af-item-form .ant-input-number");
      const selects = await heights(page, ".af-assets .af-item-form .ant-select");
      console.log(
        `[AS-05 폼] ${viewport.width}px input=${JSON.stringify(inputs)} `
        + `number=${JSON.stringify(numbers)} select=${JSON.stringify(selects)}`,
      );
      expect(Math.min(...inputs), `${viewport.width}px 폼 Input 히트`).toBeGreaterThanOrEqual(TOUCH_MIN);
      expect(Math.min(...numbers), `${viewport.width}px 폼 InputNumber 히트`).toBeGreaterThanOrEqual(TOUCH_MIN);
      expect(Math.min(...selects), `${viewport.width}px 폼 Select 히트`).toBeGreaterThanOrEqual(TOUCH_MIN);
      await page.getByRole("button", { name: "취소" }).first().click();

      /* ── 은행 연결 모달(정기예금 = 연결 안 됨): Select 1 + Input 1 + Password 2 ── */
      await page.getByRole("button", { name: "계좌 연결" }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await settleModal(page);

      const modalInputs = await heights(page, ".af-bank-modal .ant-input:not(.ant-input-affix-wrapper > .ant-input)");
      const modalNumbers = await heights(page, ".af-bank-modal .ant-input-number");
      const modalSelects = await heights(page, ".af-bank-modal .ant-select");
      const modalPasswords = await heights(page, ".af-bank-modal .ant-input-affix-wrapper");
      console.log(
        `[AS-05 모달] ${viewport.width}px input=${JSON.stringify(modalInputs)} `
        + `number=${JSON.stringify(modalNumbers)} select=${JSON.stringify(modalSelects)} `
        + `password=${JSON.stringify(modalPasswords)}`,
      );
      expect(Math.min(...modalInputs), `${viewport.width}px 모달 Input 히트`).toBeGreaterThanOrEqual(TOUCH_MIN);
      expect(Math.min(...modalSelects), `${viewport.width}px 모달 Select 히트`).toBeGreaterThanOrEqual(TOUCH_MIN);
      expect(Math.min(...modalPasswords), `${viewport.width}px 모달 비밀번호 히트`).toBeGreaterThanOrEqual(TOUCH_MIN);

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.querySelector<HTMLElement>(".ant-modal-body");
        return {
          doc: doc.scrollWidth - doc.clientWidth,
          body: body ? body.scrollWidth - body.clientWidth : null,
        };
      });
      expect(overflow.doc, `${viewport.width}px 문서 가로 넘침`).toBe(0);
      expect(overflow.body, `${viewport.width}px 모달 본문 가로 넘침`).toBe(0);

      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  });

  test("320/390/768 — 행 이름 탭 영역 ≥44, `⋯` 히트와 겹침 0 (AS-06)", async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await gotoAssets(page, viewport.width, viewport.height);

      // 지출·카드내역·투자·대시보드도 같은 표를 쓴다 — 회귀는 별도 스펙에서 잰다.
      const nameSel = 'table[aria-labelledby="h-assets"] tbody tr .af-list__cell--primary .af-list__edit';
      const menuSel = 'table[aria-labelledby="h-assets"] tbody tr .af-list__cell--actions .af-icon-btn';
      const name = await tapRect(page, nameSel);
      const menu = await tapRect(page, menuSel);
      expect(name, `${viewport.width}px 행 이름 버튼 없음`).not.toBeNull();
      expect(menu, `${viewport.width}px ⋯ 버튼 없음`).not.toBeNull();

      const overlap = overlapBox(name!, menu!);
      const edges = await ownsEdges(page, nameSel, name!);
      console.log(
        `[AS-06] ${viewport.width}px nameTap=${name!.width}×${name!.height} `
        + `(${Math.round(name!.left)}..${Math.round(name!.right)} / ${Math.round(name!.top)}..${Math.round(name!.bottom)}) `
        + `menuTap=${menu!.width}×${menu!.height} (${Math.round(menu!.left)}..${Math.round(menu!.right)}) `
        + `overlap=${overlap.area} edges=${JSON.stringify(edges)}`,
      );

      expect(name!.height, `${viewport.width}px 행 이름 탭 높이`).toBeGreaterThanOrEqual(TOUCH_MIN);
      expect(name!.width, `${viewport.width}px 행 이름 탭 폭`).toBeGreaterThanOrEqual(TOUCH_MIN);
      // 계산이 아니라 실제 히트 — 확장 영역의 위·아래 가장자리도 이름 버튼이 받는다.
      expect(edges, `${viewport.width}px 탭 영역 가장자리 히트`).toEqual({ top: true, bottom: true });

      if (viewport.width >= 768) {
        // AC: 768 터치에서 이름 히트와 `⋯` 히트의 교집합 0.
        expect(overlap.area, `${viewport.width}px 이름 히트 ∩ ⋯ 히트`).toBe(0);
      } else if (overlap.area > 0) {
        // 320/390 은 기존 모바일 규칙대로 행 전체 확장이라 기하로는 겹친다.
        // 액션 셀(z-index 1)이 위에 있어 겹친 지점의 탭은 `⋯` 가 받는다 —
        // 이름이 `⋯` 탭을 가로채지 않는 것을 실제 히트로 확인한다.
        expect(
          await ownerAt(page, overlap.cx, overlap.cy, menuSel),
          `${viewport.width}px 겹침 지점 탭이 ⋯ 로 간다`,
        ).toBe(true);
      }

      // 문서 가로 넘침 0 — 행 확장이 레이아웃을 밀지 않는다.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${viewport.width}px 문서 가로 넘침`).toBe(0);
    }
  });
});
