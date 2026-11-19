import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { authToken } from "./fixtures";

/**
 * 이슈 #36 — 오류 상태의 정직성 (AS-01/AS-02/AS-03).
 *
 * 실측 항목(320 실측 전/후):
 * - AS-01: 알림 238×213, 설명 열 89, 제목 3줄 → 액션을 문구 아래 행으로 내려
 *   설명 열 ≥200, 높이 ≤160.
 * - AS-02: 자산 조회 실패 시 부채 카드 높이 2px(빈 판) → 문구 + 재시도 ≥44.
 * - AS-03: 재시도 55×28(`size="small"`) → 44 이상.
 *
 * 뷰포트는 테스트 안에서 명시한다(프로젝트 뷰포트에 의존하지 않는다).
 * 3개 프로젝트에서 같은 측정을 3번 하지 않도록 chromium-desktop 에서만 돈다 —
 * a11y-screens.spec 과 같은 방식이다.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
];

/** 서버 장애 상태를 만든다 — 화면별 실제 호출을 전부 500 으로 돌려준다. */
async function mockAllFailed(page: Page) {
  await page.route(/\/api\/v1\/.*/, (route) =>
    route.fulfill({ status: 500, json: { code: "INTERNAL", message: "boom", data: null } }),
  );
}

/** 로그인 상태·라이트 테마를 심는다 — 테스트당 한 번. */
async function initAuth(page: Page) {
  await page.addInitScript((token) => {
    localStorage.setItem("assetflow.token", token);
    localStorage.setItem("assetflow.theme", "light");
  }, authToken());
}

async function gotoErrorState(page: Page, hash: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  // 쿼리를 붙여 같은 해시라도 새 문서로 로드한다(모의 응답 재적용 보장).
  await page.goto(`/?qa-error=${width}${hash}`, { waitUntil: "networkidle" });
  await expect(page.locator(".ant-alert").first()).toBeVisible({ timeout: 15000 });
}

interface AlertGeometry {
  height: number;
  titleLines: number;
  /** 설명 열 폭 — 설명이 없으면 null */
  descriptionWidth: number | null;
  retry: { width: number; height: number } | null;
}

function alertGeometry(page: Page): Promise<AlertGeometry[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".af-alert")).map((alert) => {
      const rect = alert.getBoundingClientRect();
      const title = alert.querySelector<HTMLElement>(".ant-alert-title");
      const description = alert.querySelector<HTMLElement>(".ant-alert-description");
      const button = alert.querySelector<HTMLElement>(".ant-alert-actions button");
      const lineHeight = title ? parseFloat(getComputedStyle(title).lineHeight || "0") : 0;
      const buttonRect = button?.getBoundingClientRect();
      return {
        height: +rect.height.toFixed(1),
        titleLines: title && lineHeight > 0 ? Math.round(title.getBoundingClientRect().height / lineHeight) : 0,
        descriptionWidth: description ? +description.getBoundingClientRect().width.toFixed(1) : null,
        retry: buttonRect ? { width: +buttonRect.width.toFixed(1), height: +buttonRect.height.toFixed(1) } : null,
      };
    }),
  );
}

/** 부채 섹션(#h-liab)의 카드 — 높이와 문구/재시도 유무. */
function debtSection(page: Page) {
  return page.evaluate(() => {
    const heading = document.querySelector("#h-liab");
    const section = heading?.closest("section");
    if (!section) return null;
    const card = section.querySelector<HTMLElement>(".ant-card");
    const retry = Array.from(section.querySelectorAll<HTMLElement>("button")).find(
      (b) => b.textContent?.trim() === "재시도",
    );
    const retryRect = retry?.getBoundingClientRect();
    return {
      cardHeight: card ? +card.getBoundingClientRect().height.toFixed(1) : null,
      text: section.textContent ?? "",
      retry: retryRect ? { width: +retryRect.width.toFixed(1), height: +retryRect.height.toFixed(1) } : null,
    };
  });
}

test.describe("오류 상태 정직성 (이슈 #36)", () => {
  test("320/375/390 — 알림 설명 열 ≥200, 제목 ≤2줄, 높이 ≤160, 재시도 ≥44 (AS-01/AS-03)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "뷰포트를 테스트가 직접 정한다(중복 실행 방지)");
    await mockAllFailed(page);
    await initAuth(page);

    for (const viewport of VIEWPORTS) {
      await gotoErrorState(page, "#/assets", viewport.width, viewport.height);

      const alerts = await alertGeometry(page);
      console.log(`[#36] ${viewport.width}px alerts=${JSON.stringify(alerts)}`);
      expect(alerts.length, `${viewport.width}px 오류 알림 개수`).toBeGreaterThan(0);

      for (const alert of alerts) {
        expect(alert.descriptionWidth, `${viewport.width}px 설명 열`).not.toBeNull();
        expect(alert.descriptionWidth ?? 0, `${viewport.width}px 설명 열 ≥200`).toBeGreaterThanOrEqual(200);
        expect(alert.titleLines, `${viewport.width}px 제목 줄 수`).toBeLessThanOrEqual(2);
        expect(alert.height, `${viewport.width}px 알림 높이 ≤160`).toBeLessThanOrEqual(160);
        // 재시도: 시각 박스 자체가 44 이상이어야 한다 — ::after 히트 확장은
        // getBoundingClientRect 로 확인되지 않으므로 박스로 만족시킨다.
        expect(alert.retry?.height ?? 0, `${viewport.width}px 재시도 높이`).toBeGreaterThanOrEqual(44);
        expect(alert.retry?.width ?? 0, `${viewport.width}px 재시도 폭`).toBeGreaterThanOrEqual(44);
      }

      // AS-02: 부채 카드는 빈 판(2px)이 아니라 문구 + 재시도다.
      const debt = await debtSection(page);
      console.log(`[#36 AS-02] ${viewport.width}px debt=${JSON.stringify(debt)}`);
      expect(debt, `${viewport.width}px 부채 섹션`).not.toBeNull();
      expect(debt?.text, `${viewport.width}px 부채 실패 문구`).toContain("부채를 불러오지 못했습니다");
      // 빈 상태(정상) 문구가 함께 뜨면 "부채 없음"으로 오독된다.
      expect(debt?.text, `${viewport.width}px 부채 없음 오독`).not.toContain("등록된 부채가 없습니다");
      expect(debt?.retry?.height ?? 0, `${viewport.width}px 부채 재시도 높이`).toBeGreaterThanOrEqual(44);
      expect(debt?.cardHeight ?? 0, `${viewport.width}px 부채 카드 높이`).toBeGreaterThanOrEqual(44);
    }

    // 데스크톱은 배치를 바꾸지 않는다(인라인 유지) — 히트만 44.
    await gotoErrorState(page, "#/assets", 1280, 800);
    const desktop = await alertGeometry(page);
    console.log(`[#36] 1280px alerts=${JSON.stringify(desktop)}`);
    for (const alert of desktop) {
      expect(alert.height, "1280px 알림 높이").toBeLessThanOrEqual(160);
      expect(alert.retry?.height ?? 0, "1280px 재시도 높이").toBeGreaterThanOrEqual(44);
    }

    // AC: axe 새 위반 0 — 새로 만든 좁은 배치(그리드 + display:contents)에서 확인.
    await gotoErrorState(page, "#/assets", 320, 800);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(
      results.violations.map((v) => `${v.id}:${v.nodes.length}`),
      "320px 오류 상태 axe 위반",
    ).toEqual([]);
  });

  test("320 — 지출·카드내역·설정·투자·대시보드 오류 알림 회귀 없음 (AS-01/AS-03)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "뷰포트를 테스트가 직접 정한다(중복 실행 방지)");
    await mockAllFailed(page);
    await initAuth(page);

    const screens: { name: string; hash: string }[] = [
      { name: "지출", hash: "#/expenses" },
      { name: "카드내역", hash: "#/expenses/cards" },
      { name: "설정", hash: "#/settings" },
      { name: "투자", hash: "#/investments" },
      { name: "대시보드", hash: "#/" },
    ];

    for (const screen of screens) {
      await gotoErrorState(page, screen.hash, 320, 800);
      const alerts = await alertGeometry(page);
      console.log(`[#36 ${screen.name}] alerts=${JSON.stringify(alerts)}`);
      expect(alerts.length, `${screen.name} 오류 알림 개수`).toBeGreaterThan(0);

      for (const alert of alerts) {
        expect(alert.height, `${screen.name} 알림 높이 ≤160`).toBeLessThanOrEqual(160);
        expect(alert.titleLines, `${screen.name} 제목 줄 수`).toBeLessThanOrEqual(2);
        if (alert.descriptionWidth !== null) {
          // 설명이 있는 알림은 문구 열을 지킨다(대시보드 지표 카드는 설명 없이 제목만).
          expect(alert.descriptionWidth, `${screen.name} 설명 열 ≥200`).toBeGreaterThanOrEqual(200);
        }
        if (alert.retry !== null) {
          expect(alert.retry.height, `${screen.name} 재시도 높이`).toBeGreaterThanOrEqual(44);
        }
      }

      // 가로 넘침 0 — 액션을 아래 행으로 내린 배치가 폭을 넘기지 않아야 한다.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${screen.name} 가로 넘침`).toBe(0);
    }
  });
});
