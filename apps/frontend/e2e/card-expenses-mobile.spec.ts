import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { authToken } from "./fixtures";
import { mockScreenApi } from "./screens-mocks";

/**
 * 카드내역 화면 모바일 가드 (designer 감사 D-01/D-02/D-03/D-04).
 *
 * - 검토 상태(샘플 CSV 업로드)에서 320/375/390/430 문서 가로 넘침 0.
 *   검토 표(≈649px)는 카드 내부 가로 스크롤로만 접근한다.
 * - 파일 선택 버튼 히트 ≥ 44×120, 접근 이름 "카드 명세서 파일 선택".
 * - 자동 분류 결과 알림(live region)은 1개이고 클릭한 버튼과 같은 뷰포트 안에 있다.
 * - 사업자 모달 320×568 — footer 가 뷰포트 안, 스크롤은 body 하나.
 *
 * 뷰포트 3개 프로젝트에서 같은 단언을 반복하지 않도록 chromium-desktop 에서만 돈다.
 */

const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

/** 업로드할 익명화 샘플 — e2e 는 apps/frontend 에서 실행된다. */
const SAMPLE_CSV = path.resolve(
  process.cwd(),
  "../../samples/card/anonymized/hyundaicard-personal-anon.csv",
);

/** 검토 표의 열 폭 합(가맹점 자동 + 70 + 130 + 120 + 110 + 150 + 150)이 320 보다 넓다. */
const REVIEW_TABLE = "가져온 카드 내역 검토";

function overflow(page: Page) {
  return page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    viewport: document.documentElement.scrollWidth - window.innerWidth,
  }));
}

async function openCardExpenses(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(`/?qa-card-mobile=${width}#/expenses/cards`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "카드내역" })).toBeVisible();
  // 목이 행을 실제로 렌더했는지 — 빈 화면을 통과시키지 않는다.
  await expect(page.getByText("한마음식당").first()).toBeVisible();
}

/** 샘플 CSV 를 올려 검토 단계로 들어간다. */
async function enterReview(page: Page) {
  await page.setInputFiles('[data-testid="card-file"]', SAMPLE_CSV);
  await expect(page.getByRole("table", { name: REVIEW_TABLE })).toBeVisible({ timeout: 15000 });
}

test.describe("카드내역 모바일", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "뷰포트를 직접 지정한다 — desktop 프로젝트 전용");

    await page.addInitScript((token) => {
      localStorage.setItem("assetflow.token", token);
      localStorage.setItem("assetflow.theme", "light");
    }, authToken());
    await mockScreenApi(page, "expenseCards");
  });

  test("검토 상태 — 320/375/390/430 문서 넘침 0, 표는 카드 안에서 스크롤", async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await openCardExpenses(page, viewport.width, viewport.height);
      await enterReview(page);

      const { doc, viewport: vsInner } = await overflow(page);
      expect(doc, `${viewport.width}px 문서 넘침`).toBe(0);
      expect(vsInner, `${viewport.width}px scrollWidth vs innerWidth`).toBeLessThanOrEqual(0);

      // 표 내용은 카드 내부 가로 스크롤로만 접근한다.
      const scroller = await page.evaluate(() => {
        const table = document.querySelector<HTMLElement>(
          '[aria-label="가져온 카드 내역 검토"]',
        );
        const box = table?.closest<HTMLElement>(".ant-table-content, .ant-table-body");
        if (!box) return null;
        return { scrollWidth: box.scrollWidth, clientWidth: box.clientWidth };
      });
      expect(scroller, `${viewport.width}px 검토 표 스크롤 컨테이너`).not.toBeNull();
      expect(
        scroller!.scrollWidth,
        `${viewport.width}px 표 내부 스크롤(내용이 카드보다 넓다)`,
      ).toBeGreaterThan(scroller!.clientWidth);
    }
  });

  test("파일 선택 컨트롤 — 44×120 히트, 접근 이름, input 은 탭 정지 없음", async ({ page }) => {
    await openCardExpenses(page, 320, 800);

    const button = page.getByRole("button", { name: "카드 명세서 파일 선택" });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    if (!box) throw new Error("파일 선택 버튼 히트를 재지 못했다");
    expect(box.height, "버튼 높이").toBeGreaterThanOrEqual(44);
    expect(box.width, "버튼 폭").toBeGreaterThanOrEqual(120);

    // 안내 문단은 접근 이름에 섞이지 않고 설명으로만 연결된다.
    const describedBy = await button.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`#${describedBy}`)).toBeVisible();

    // 실제 input 은 화면 밖으로 숨기되 파일 주입 경로는 살아 있어야 한다.
    const input = page.locator('[data-testid="card-file"]');
    expect(await input.getAttribute("tabindex")).toBe("-1");
    expect(await input.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);

    // 버튼이 실제 파일 선택기를 연다(숨긴 input 을 감싼 label 이 아니라 버튼 경로).
    const chooserPromise = page.waitForEvent("filechooser");
    await button.click();
    const chooser = await chooserPromise;
    await chooser.setFiles(SAMPLE_CSV);
    await expect(page.getByRole("table", { name: REVIEW_TABLE })).toBeVisible({ timeout: 15000 });

    const { doc } = await overflow(page);
    expect(doc, "320px 문서 넘침").toBe(0);
  });

  test("자동 분류 결과 알림 — 클릭한 위치의 뷰포트 안에 보이고 live region 1개", async ({ page }) => {
    await page.route("**/api/v1/assets/card-imports/reclassify", (route) =>
      route.fulfill({ json: { code: "OK", message: "ok", data: { total: 12, updated: 7 } } }),
    );

    await openCardExpenses(page, 320, 800);
    const trigger = page.getByRole("button", { name: "카테고리 자동 분류" });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();

    const notice = page.locator('[role="status"][aria-live="polite"]').first();
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/12건 중 7건을 자동 분류했습니다/);

    // live region 은 한 시점에 1개 — 중복 낭독을 막는다.
    expect(await page.locator('[role="status"][aria-live="polite"]').count()).toBe(1);

    const box = await notice.boundingBox();
    if (!box) throw new Error("알림 상자를 재지 못했다");
    const innerHeight = await page.evaluate(() => window.innerHeight);
    expect(box.y, "알림 상단이 뷰포트 안").toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, "알림 하단이 뷰포트 안").toBeLessThanOrEqual(innerHeight);
  });

  test("사업자 모달 320×568 — footer 가 뷰포트 안, 스크롤은 body", async ({ page }) => {
    // 모달 본문이 스크롤될 만큼 긴 응답을 준다(마지막 등록 라우트가 우선).
    await page.route("**/api/v1/assets/business-info/**", (route) =>
      route.fulfill({
        json: {
          code: "OK",
          message: "ok",
          data: {
            businessNo: "1234567890",
            companyName: "한마음식당",
            ceoName: "김가명",
            bizType: "음식점업",
            bizItem: "한식",
            mainProduct: "김치찌개",
            phone: "02-000-0000",
            fax: "02-000-0001",
            email: "qa@example.com",
            homepage: "https://example.com",
            zipCode: "00000",
            address: "서울특별시 어딘가로 1길 2, 3층 301호".repeat(3),
            taxOffice: "가상세무서",
            businessStatus: "계속사업자",
            taxType: "일반과세자",
            corporateType: "개인",
            corporateForm: "단독",
            companySize: "소기업",
            headquarters: "본사",
            registeredAt: "2020-01-01",
            fiscalMonth: 12,
            employees: 3,
            source: "bizno.net",
            cached: true,
            fetchedAt: "2026-11-01T09:00:00",
          },
        },
      }),
    );

    await openCardExpenses(page, 320, 568);

    await page.getByRole("button", { name: "한마음식당 분류 편집" }).click();
    await page.getByRole("button", { name: /한마음식당 .* 사업자 정보 보기/ }).click();
    await expect(page.locator(".ant-modal-container")).toBeVisible();

    // 등장 애니메이션이 끝난 뒤의 기하만 본다(고정 대기 없이 두 번 같은 값일 때).
    let previous = "";
    await expect
      .poll(async () => {
        const key = await page.evaluate(() => {
          const c = document.querySelector<HTMLElement>(".ant-modal-container")?.getBoundingClientRect();
          const f = document.querySelector<HTMLElement>(".ant-modal-footer")?.getBoundingClientRect();
          return `${Math.round(c?.top ?? -1)}|${Math.round(c?.bottom ?? -1)}|${Math.round(f?.bottom ?? -1)}`;
        });
        const stable = key === previous && !key.startsWith("-1");
        previous = key;
        return stable;
      }, { message: "모달 레이아웃 안정화", intervals: [100, 100, 150, 200], timeout: 8000 })
      .toBe(true);

    const geometry = await page.evaluate(() => {
      const rect = (selector: string) => {
        const el = document.querySelector<HTMLElement>(selector);
        if (!el) throw new Error(`${selector} 없음`);
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height };
      };
      const body = document.querySelector<HTMLElement>(".ant-modal-body");
      const wrap = document.querySelector<HTMLElement>(".ant-modal-wrap");
      return {
        innerHeight: window.innerHeight,
        container: rect(".ant-modal-container"),
        footer: rect(".ant-modal-footer"),
        body: { scrollHeight: body?.scrollHeight ?? 0, clientHeight: body?.clientHeight ?? 0 },
        wrap: { scrollHeight: wrap?.scrollHeight ?? 0, clientHeight: wrap?.clientHeight ?? 0 },
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    expect(geometry.container.top, "컨테이너 상단").toBeGreaterThanOrEqual(0);
    expect(geometry.container.bottom, "컨테이너 하단").toBeLessThanOrEqual(geometry.innerHeight);
    expect(geometry.footer.top, "footer 상단").toBeGreaterThanOrEqual(0);
    expect(geometry.footer.bottom, "footer 하단").toBeLessThanOrEqual(geometry.innerHeight);

    // body 만 스크롤한다 — 페이지형(wrap) 스크롤이 생기면 footer 가 밀린다.
    expect(geometry.body.scrollHeight, "body 스크롤").toBeGreaterThan(geometry.body.clientHeight);
    expect(geometry.wrap.scrollHeight, "wrap 스크롤 없음").toBe(geometry.wrap.clientHeight);
    expect(geometry.doc, "320px 문서 넘침").toBe(0);

    // 닫기 버튼은 항상 활성(모달 우상단 X 와 구분해 footer 안에서 찾는다).
    await expect(
      page.locator(".ant-modal-footer").getByRole("button", { name: "닫기" }),
    ).toBeEnabled();
  });
});
