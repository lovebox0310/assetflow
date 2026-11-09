import { test, expect, type Page } from "@playwright/test";
import { authToken } from "./fixtures";
import { mockScreenApi, type ScreenKey } from "./screens-mocks";

/**
 * iOS Safari 자동 확대 방지 가드.
 *
 * iOS 는 포커스된 폼 컨트롤의 계산 글꼴이 16px 미만이면 화면을 약 1.33x 확대한다.
 * `src/app/app.css` 의 `@media (pointer: coarse)` 블록이 터치 기기에서만 폼 컨트롤을
 * 16px 로 올리고, 데스크톱은 14px 를 유지한다.
 *
 * - 터치 프로젝트(chromium-mobile·chromium-tablet)에서만 입력 크기를 실측한다.
 *   Playwright 의 hasTouch 는 프로젝트 설정을 따르므로 프로젝트명으로 skip 을 나눈다.
 * - 데스크톱(chromium-desktop)에서는 14px 불변과 viewport meta 안전성을 확인한다.
 */

const TOUCH_PROJECTS = new Set(["chromium-mobile", "chromium-tablet"]);
const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

interface ScreenSpec {
  key: ScreenKey;
  name: string;
  hash: string;
  /** 목이 실제로 행을 렌더했는지 확인하는 문구. */
  readyText: string;
  /** 입력 폼을 펼쳐야 하는 화면(자산 계좌 추가). */
  openButton?: string;
}

const SCREENS: ScreenSpec[] = [
  { key: "expenses", name: "지출", hash: "#/expenses", readyText: "주말 장보기" },
  { key: "expenseCards", name: "카드내역", hash: "#/expenses/cards", readyText: "한마음식당" },
  { key: "settings", name: "설정", hash: "#/settings", readyText: "김가명" },
  { key: "assets", name: "자산", hash: "#/assets", readyText: "파킹통장", openButton: "+ 자산 추가" },
  { key: "dashboard", name: "대시보드", hash: "#/", readyText: "예측 비상금" },
];

/** 텍스트 입력·textarea·select 의 계산 font-size(px)를 보이는 것만 모은다. */
function measureInputs(page: Page) {
  return page.evaluate(() => {
    const isVisible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
    };
    const textTypes = new Set(["", "text", "email", "password", "search"]);
    return [...document.querySelectorAll("input, textarea, select")]
      .filter(isVisible)
      .filter((el) => {
        if (el.tagName !== "INPUT") return true; // textarea·select
        return textTypes.has((el.getAttribute("type") ?? "").toLowerCase());
      })
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: (el.getAttribute("type") ?? "").toLowerCase(),
        className: el.className.toString().slice(0, 80),
        font: Number.parseFloat(getComputedStyle(el).fontSize),
      }));
  });
}

test.describe("터치 기기 입력 16px", () => {
  /*
   * playwright.config.ts 의 chromium-tablet 은 `devices["iPad"]` 를 쓰는데
   * 이 Playwright 버전에는 그 이름이 없어(정의되지 않음) 프로젝트가 실제로는
   * 터치가 아니다. 스코프상 설정을 고칠 수 없으므로 이 블록에서만 hasTouch 를
   * 명시한다 — 실제 iPad 와 같은 포인터(coarse) 조건을 만든다.
   * 데스크톱 프로젝트는 아래에서 project 명으로 skip 하고, 불변 케이스는
   * 별도 describe 라 이 설정의 영향을 받지 않는다.
   */
  test.use({ hasTouch: true });

  for (const screen of SCREENS) {
    test(`${screen.name} — 터치 입력 font-size ≥ 16px`, async ({ page }, testInfo) => {
      test.skip(!TOUCH_PROJECTS.has(testInfo.project.name), "터치 프로젝트 전용(데스크톱은 불변 케이스)");

      await page.addInitScript((token) => {
        localStorage.setItem("assetflow.token", token);
        localStorage.setItem("assetflow.theme", "light");
      }, authToken());
      await mockScreenApi(page, screen.key);

      for (const viewport of VIEWPORTS) {
        // 같은 해시라도 새 문서로 로드해 목·레이아웃을 확실히 재적용한다.
        await page.setViewportSize(viewport);
        await page.goto(`/?qa-zoom=${viewport.width}${screen.hash}`, { waitUntil: "networkidle" });
        await expect(page.getByText(screen.readyText).first()).toBeVisible({ timeout: 15000 });

        // 자산 화면은 추가 폼을 펼쳐야 편집 입력까지 감사한다.
        if (screen.openButton) {
          await page.getByRole("button", { name: screen.openButton }).click();
          await expect(page.getByRole("button", { name: "저장" }).first()).toBeVisible();
        }

        const inputs = await measureInputs(page);
        expect(inputs.length, `${screen.name} ${viewport.width}px 에서 입력을 찾지 못했다`).toBeGreaterThan(0);

        const tooSmall = inputs.filter((input) => input.font < 16);
        expect(tooSmall, `${screen.name} ${viewport.width}px — 16px 미만 입력`).toEqual([]);

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${screen.name} ${viewport.width}px 가로 넘침`).toBe(0);
      }
    });
  }
});

test.describe("데스크톱 입력 크기 불변", () => {
  test("1280px pointer:fine — .ant-input 14px 유지", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "데스크톱 프로젝트 전용");

    await page.addInitScript((token) => {
      localStorage.setItem("assetflow.token", token);
      localStorage.setItem("assetflow.theme", "light");
    }, authToken());
    await mockScreenApi(page, "expenses");

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/?qa-zoom=1280#/expenses", { waitUntil: "networkidle" });
    await expect(page.getByText("주말 장보기").first()).toBeVisible({ timeout: 15000 });

    const measured = await page.evaluate(() => {
      const isVisible = (el: Element) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const fontOf = (selector: string) =>
        [...document.querySelectorAll(selector)]
          .filter(isVisible)
          .map((el) => Number.parseFloat(getComputedStyle(el).fontSize));
      return {
        pointerCoarse: window.matchMedia("(pointer: coarse)").matches,
        inputFonts: fontOf(".ant-input"),
        selectFonts: fontOf(".ant-select"),
        inputNumberFonts: fontOf(".ant-input-number"),
        viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "",
      };
    });

    expect(measured.pointerCoarse).toBe(false);
    expect(measured.inputFonts.length).toBeGreaterThan(0);
    expect(measured.inputFonts.every((font) => font === 14)).toBe(true);
    expect(measured.selectFonts.every((font) => font === 14)).toBe(true);
    expect(measured.inputNumberFonts.every((font) => font === 14)).toBe(true);

    // iOS 자동 확대를 viewport 로 막지 않았는지 — maximum-scale/user-scalable 금지.
    expect(measured.viewportMeta).not.toMatch(/maximum-scale|user-scalable/i);
    expect(measured.viewportMeta).toContain("width=device-width");
  });
});
