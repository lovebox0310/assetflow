import { test, expect, type Page } from "@playwright/test";
import { authToken } from "./fixtures";
import { mockDashboardApi } from "./dashboard-mocks";

/**
 * UI-7 비상금 설정 모달 모바일 셸 가드.
 *
 * 이 모달은 내용이 길어 320×568 에서 footer(저장/취소)가 화면 밖으로 밀렸다.
 * CompositionBasisModal 과 같은 셸(max-height + flex + body 스크롤 + footer 고정)을
 * 적용한 뒤, footer 가 항상 뷰포트 안에 있는지 실측한다.
 */

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
];

interface ModalGeometry {
  innerHeight: number;
  container: { top: number; bottom: number; height: number };
  footer: { top: number; bottom: number };
  body: { scrollHeight: number; clientHeight: number };
  wrap: { scrollHeight: number; clientHeight: number };
  overflow: number;
}

function measure(page: Page): Promise<ModalGeometry> {
  return page.evaluate(() => {
    const q = (selector: string) => document.querySelector<HTMLElement>(selector);
    const rect = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    };
    const container = q(".ant-modal-container");
    const footer = q(".ant-modal-footer");
    const body = q(".ant-modal-body");
    const wrap = q(".ant-modal-wrap");
    if (!container || !footer || !body || !wrap) throw new Error("모달 셸을 찾지 못했다");
    return {
      innerHeight: window.innerHeight,
      container: rect(container),
      footer: rect(footer),
      body: { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight },
      wrap: { scrollHeight: wrap.scrollHeight, clientHeight: wrap.clientHeight },
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

/**
 * antd 모달의 zoom 애니메이션이 끝날 때까지 기다린다.
 * 등장 애니메이션 중에는 컨테이너 transform 때문에 footer top 이 계속 움직여,
 * "스크롤해도 footer 가 고정" 단언이 거짓 실패한다. 두 번 연속 같은 기하일 때만 진행한다.
 */
async function waitForModalStable(page: Page) {
  let previous = "";
  await expect.poll(async () => {
    const geometry = await measure(page);
    const key = [
      Math.round(geometry.container.top),
      Math.round(geometry.container.height),
      Math.round(geometry.body.scrollHeight),
      Math.round(geometry.footer.top),
    ].join("|");
    const stable = key === previous;
    previous = key;
    return stable;
  }, { message: "모달 레이아웃 안정화", intervals: [100, 100, 150, 200], timeout: 8000 }).toBe(true);
}

async function openEmergencyModal(page: Page, width: number) {
  await page.setViewportSize(
    width === 320 ? { width: 320, height: 568 } : { width: 390, height: 844 },
  );
  await page.goto(`/?qa-emergency=${width}#/`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "대시보드" })).toBeVisible();
  await page.getByRole("button", { name: "기준 설정", exact: true }).click();
  await expect(page.locator(".ant-modal-container")).toBeVisible();
  await waitForModalStable(page);
}

test.describe("비상금 설정 모달 모바일 셸", () => {
  test("터치 320/390 — 모달과 footer 가 뷰포트 안에 있다", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-mobile", "터치(mobile) 프로젝트 전용");

    await page.addInitScript((token) => {
      localStorage.setItem("assetflow.token", token);
      localStorage.setItem("assetflow.theme", "light");
    }, authToken());
    await mockDashboardApi(page);

    for (const viewport of VIEWPORTS) {
      await openEmergencyModal(page, viewport.width);

      // 1) 컨테이너가 뷰포트 안(위아래 8px 여유, 높이는 뷰포트-32 이하).
      await expect
        .poll(async () => {
          const geometry = await measure(page);
          return geometry.container.top >= 8
            && geometry.container.bottom <= geometry.innerHeight - 8
            && geometry.container.height <= geometry.innerHeight - 32;
        }, { message: `${viewport.width}px 모달 컨테이너` })
        .toBe(true);

      // 2) footer 항상 보임.
      await expect
        .poll(async () => {
          const geometry = await measure(page);
          return geometry.footer.top >= 0 && geometry.footer.bottom <= geometry.innerHeight;
        }, { message: `${viewport.width}px footer` })
        .toBe(true);

      // 3) footer 는 body 스크롤과 무관하게 고정.
      const footerTop = (await measure(page)).footer.top;
      await page.evaluate(() => {
        const body = document.querySelector<HTMLElement>(".ant-modal-body");
        if (body) body.scrollTop = body.scrollHeight;
      });
      await expect
        .poll(async () => Math.abs((await measure(page)).footer.top - footerTop), {
          message: `${viewport.width}px footer 고정`,
        })
        .toBeLessThanOrEqual(0.5);

      const geometry = await measure(page);
      // 4) 스크롤 컨테이너는 body.
      expect(geometry.body.scrollHeight, `${viewport.width}px body 스크롤`).toBeGreaterThan(
        geometry.body.clientHeight,
      );
      // 5) 페이지형(wrap) 스크롤 없음.
      expect(geometry.wrap.scrollHeight, `${viewport.width}px wrap`).toBe(geometry.wrap.clientHeight);
      // 6) 가로 넘침 0.
      expect(geometry.overflow, `${viewport.width}px 가로 넘침`).toBe(0);
    }
  });

  test("데스크톱 1280 — 모달이 열리고 footer 가 보인다", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "데스크톱 프로젝트 전용");

    await page.addInitScript((token) => {
      localStorage.setItem("assetflow.token", token);
      localStorage.setItem("assetflow.theme", "light");
    }, authToken());
    await mockDashboardApi(page);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/?qa-emergency=1280#/", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1, name: "대시보드" })).toBeVisible();
    await page.getByRole("button", { name: "기준 설정", exact: true }).click();
    await expect(page.locator(".ant-modal-container")).toBeVisible();
    await waitForModalStable(page);

    await expect.poll(async () => {
      const geometry = await measure(page);
      return geometry.footer.top >= 0 && geometry.footer.bottom <= geometry.innerHeight;
    }, { message: "desktop footer" }).toBe(true);
  });
});
