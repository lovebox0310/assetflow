import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
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

/**
 * #34 C-01: 긴 가맹점명 케이스 — 저장소에 픽스처를 추가하지 않고(tmp 에만 쓴다)
 * 익명화 현대카드 샘플의 가맹점 하나를 긴 상호로 바꿔 만든다.
 * 카드사 판별은 헤더 시그니처가 하므로 가맹점 문자열은 계약에 영향이 없다.
 */
const LONG_MERCHANT = "합성컴퓨터전문점및서비스센터강남역지점";
const LONG_SAMPLE_CSV = path.join(os.tmpdir(), "assetflow-long-merchant.csv");

function writeLongMerchantSample() {
  const text = fs.readFileSync(SAMPLE_CSV, "utf8");
  if (!text.includes("합성컴퓨터")) throw new Error("샘플에 합성컴퓨터 가맹점이 없다");
  fs.writeFileSync(LONG_SAMPLE_CSV, text.split("합성컴퓨터").join(LONG_MERCHANT), "utf8");
  return LONG_SAMPLE_CSV;
}

/** 검색 표(검토 표)의 스크롤 상자·고정 열 기하. #34 C-01 실측용. */
function reviewGeometry(page: Page) {
  return page.evaluate((label) => {
    const table = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
    if (!table) return null;
    const box = table.closest<HTMLElement>(".ant-table-content, .ant-table-body");
    const th = table.querySelector<HTMLElement>("thead th");
    if (!box || !th) return null;
    const boxRect = box.getBoundingClientRect();
    const thRect = th.getBoundingClientRect();
    return {
      stickyWidth: thRect.width,
      // 고정 열의 오른쪽 끝(스크롤 상자 좌변 기준) — 그 오른쪽이 가시 창이다.
      stickyRight: thRect.right - boxRect.left,
      clientWidth: box.clientWidth,
      scrollWidth: box.scrollWidth,
    };
  }, REVIEW_TABLE);
}

function overflow(page: Page) {
  return page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    viewport: document.documentElement.scrollWidth - window.innerWidth,
  }));
}

/** 같은 URL 로 다시 들어갈 때 goto 가 해시 내비게이션(무동작)이 되지 않게 번호를 붙인다. */
let visit = 0;

async function openCardExpenses(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  visit += 1;
  await page.goto(`/?qa-card-mobile=${width}&visit=${visit}#/expenses/cards`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "카드내역" })).toBeVisible();
  // 목이 행을 실제로 렌더했는지 — 빈 화면을 통과시키지 않는다.
  await expect(page.getByText("한마음식당").first()).toBeVisible();
}

/** 샘플 CSV 를 올려 검토 단계로 들어간다. */
async function enterReview(page: Page, file: string = SAMPLE_CSV) {
  await page.setInputFiles('[data-testid="card-file"]', file);
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

  test("파일 선택 컨트롤 — 44×120 히트, 접근 이름, input 은 탭 정지 없음", async ({ page }) => {    await openCardExpenses(page, 320, 800);

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

  test("자동 분류 결과 알림 — 클릭한 위치의 뷰포트 안에 보이고 live region 1개", async ({ page }) => {    await page.route("**/api/v1/assets/card-imports/reclassify", (route) =>
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

  /**
   * #34 C-01 (Blocker): 가맹점 열은 `fixed: "left"` 인데 폭이 내용 기반이면
   * 긴 상호에서 고정 열(실측 318.9px)이 스크롤 상자(254px)를 넘어 나머지 열이
   * 전부 가려진다. <768 에서는 폭을 112 로 고정하고 이름만 말줄임한다.
   */
  test("긴 가맹점명 — 320~430 고정 열 ≤113px, 가시 창 ≥140px (#34 C-01)", async ({ page }) => {
    const longCsv = writeLongMerchantSample();

    for (const viewport of VIEWPORTS) {
      const samples = [
        { label: "표준", file: SAMPLE_CSV },
        { label: "긴 가맹점명", file: longCsv },
      ];
      for (const sample of samples) {
        await openCardExpenses(page, viewport.width, viewport.height);
        await enterReview(page, sample.file);

        const g = await reviewGeometry(page);
        expect(g, `${viewport.width}px ${sample.label} 검토 표`).not.toBeNull();
        const at = `${viewport.width}px ${sample.label}`;
        // 헤더 셀(고정 열) 자체가 113 이하 — 말줄임이 걸리는 폭과 같다.
        expect(g!.stickyWidth, `${at} 고정 열 폭`).toBeLessThanOrEqual(113);
        // 고정 열 오른쪽부터 스크롤 상자 끝까지가 실제로 보이는 창이다.
        expect(g!.clientWidth - g!.stickyRight, `${at} 가시 창`).toBeGreaterThanOrEqual(140);
        // 넘칠 내용은 여전히 있다(스크롤 가능) — 문서가 아니라 표 안에서만.
        expect(g!.scrollWidth, `${at} 표 내부 스크롤`).toBeGreaterThan(g!.clientWidth);

        const { doc } = await overflow(page);
        expect(doc, `${at} 문서 넘침`).toBe(0);
      }
    }
  });

  /**
   * #34 C-02 (High): 키보드로 분류 Select 에 포커스하면 브라우저가 스크롤해
   * 컨트롤이 고정 열 아래(가로)·하단 탭바 뒤(세로)에 깔렸다.
   * 5행(실측 y=517)을 탭바 뒤에 붙여 놓고 포커스한 뒤 실제 히트를 잰다.
   */
  test("320 에서 분류 Select 포커스가 고정 열·탭바에 가리지 않는다 (#34 C-02)", async ({ page }) => {
    await openCardExpenses(page, 320, 568);
    await enterReview(page);

    // 실제 키보드 경로: 첫 대분류에 포커스한 뒤 Tab 으로 표를 내려간다.
    // (감사 당시 5행째가 y=517 로 탭바 512~568 뒤에 깔렸다.)
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('input[aria-label$=" 대분류"]').first().focus();
    // 포커스 보정(포커스 이벤트 + 다음 프레임 보정)이 끝난 뒤 잰다.
    await page.waitForTimeout(120);

    const measured: Array<{
      label: string;
      top: number;
      bottom: number;
      relLeft: number;
      stickyRight: number;
      tabbarTop: number;
      hitIsControl: boolean;
      hitClass: string;
    }> = [];

    for (let i = 0; i < 10; i += 1) {
      const snap = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        const root = (el?.closest?.(".ant-select") as HTMLElement | null) ?? el;
        if (!root) throw new Error("포커스된 컨트롤이 없다");
        const r = root.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + 12, r.top + 10);
        const tabbar = document.querySelector<HTMLElement>(".af-tabbar");
        const table = document.querySelector<HTMLElement>('[aria-label="가져온 카드 내역 검토"]');
        const box = table?.closest<HTMLElement>(".ant-table-content, .ant-table-body");
        const th = table?.querySelector<HTMLElement>("thead th");
        if (!tabbar || !box || !th) throw new Error("탭바/스크롤 상자를 찾지 못했다");
        const boxRect = box.getBoundingClientRect();
        return {
          label: root.getAttribute("aria-label") ?? "",
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          relLeft: Math.round(r.left - boxRect.left),
          stickyRight: Math.round(th.getBoundingClientRect().right - boxRect.left),
          tabbarTop: Math.round(tabbar.getBoundingClientRect().top),
          hitIsControl: hit ? root === hit || root.contains(hit) : false,
          hitClass: hit instanceof HTMLElement ? hit.className.toString() : String(hit),
        };
      });
      measured.push(snap);
      await page.keyboard.press("Tab");
      await page.waitForTimeout(120);
    }

    for (const m of measured) {
      // 가로: 좌상단 지점의 히트가 그 Select(또는 자손) — 고정 열이 덮지 않는다.
      expect(m.hitIsControl, `${m.label} 좌상단이 ${m.hitClass} 에 가린다`).toBe(true);
      expect(m.relLeft, `${m.label} 좌변이 고정 열(${m.stickyRight}px) 오른쪽`).toBeGreaterThanOrEqual(
        m.stickyRight,
      );
      // 세로: 하단 탭바(고정 56px) 뒤로 내려가지 않는다.
      expect(m.bottom, `${m.label} 하단이 탭바(${m.tabbarTop}px) 위`).toBeLessThanOrEqual(m.tabbarTop);
    }
    // 실측 좌표를 보고에 남길 수 있게 최소 1개는 표 하단(탭바 근처)까지 내려간다.
    expect(Math.max(...measured.map((m) => m.bottom)), "탭바 근처까지 확인").toBeGreaterThan(430);
  });

  /**
   * #34 AC-6: C-02 보정이 **포인터**에도 걸리면 탭할 때 화면이 튄다
   * (수정 전 실측: 컨트롤 하단이 탭바에 20px 걸친 상태에서 클릭 → 28px 스크롤,
   *  드롭다운 기준점도 그만큼 어긋난다). 클릭 전후 스크롤 변화 ≤16px 를 지킨다.
   * 1행은 왼쪽 고정 열 아래에 30px 걸치게, 5행은 하단 탭바에 20px 걸치게 둔다 —
   * 두 축 모두에서 보정이 일어날 수 있는 가장 나쁜 배치다.
   */
  test("표 컨트롤을 클릭해도 페이지가 스크롤되지 않는다 (#34 AC-6)", async ({ page }) => {
    const cases = [
      { width: 320, height: 800 },
      { width: 375, height: 812 },
    ];

    for (const viewport of cases) {
      for (const rowIndex of [0, 4]) {
        const sample = rowIndex === 0 ? "고정 열 아래" : "탭바 뒤";
        await openCardExpenses(page, viewport.width, viewport.height);
        await enterReview(page);

        // 클릭하기 전 상태를 만든다: 1행은 고정 열 밑으로, 5행은 탭바 뒤로.
        const before = await page.evaluate(
          ({ idx, mode }) => {
            const table = document.querySelector<HTMLElement>(`[aria-label="가져온 카드 내역 검토"]`);
            const scroller = table?.closest<HTMLElement>(".ant-table-content, .ant-table-body");
            const th = table?.querySelector<HTMLElement>("thead th");
            const row = document.querySelectorAll<HTMLElement>(
              '[aria-label="가져온 카드 내역 검토"] tbody tr.ant-table-row',
            )[idx];
            const root = row?.querySelector<HTMLElement>('input[aria-label$=" 대분류"]')?.closest<HTMLElement>(".ant-select");
            const tabbar = document.querySelector<HTMLElement>(".af-tabbar");
            if (!scroller || !th || !root || !tabbar) throw new Error("검토 표 컨트롤을 찾지 못했다");

            const sticky = th.getBoundingClientRect().width;
            const boxRect = scroller.getBoundingClientRect();
            if (mode === "sticky") {
              /* 가로: 컨트롤 왼쪽 30px 이 고정 열 아래로 들어가게 민다. */
              scroller.scrollLeft += root.getBoundingClientRect().left - (boxRect.left + sticky - 30);
              window.scrollBy(0, root.getBoundingClientRect().top - 300);
            } else {
              /* 세로: 컨트롤 하단이 탭바에 20px 걸치게 둔다(가로는 보이게). */
              scroller.scrollLeft += root.getBoundingClientRect().left - (boxRect.left + sticky + 8);
              const tabbarTop = tabbar.getBoundingClientRect().top;
              window.scrollBy(0, root.getBoundingClientRect().bottom - (tabbarTop + 20));
            }

            const r = root.getBoundingClientRect();
            const tabbarTop = tabbar.getBoundingClientRect().top;
            /* 고정 열·탭바에 가리지 않는 지점을 누른다(사용자가 실제로 누를 수 있는 곳). */
            const visibleLeft = boxRect.left + sticky + 16;
            return {
              x: Math.round(Math.min(Math.max(r.left + 16, visibleLeft), r.right - 16)),
              y: Math.round(Math.min(r.top + 10, tabbarTop - 6)),
              scrollY: window.scrollY,
              scrollTop: document.scrollingElement?.scrollTop ?? 0,
              scrollLeft: scroller.scrollLeft,
            };
          },
          { idx: rowIndex, mode: rowIndex === 0 ? "sticky" : "tabbar" },
        );

        await page.mouse.click(before.x, before.y);
        await page.waitForTimeout(250);

        const after = await page.evaluate(() => {
          const table = document.querySelector<HTMLElement>(`[aria-label="가져온 카드 내역 검토"]`);
          const scroller = table?.closest<HTMLElement>(".ant-table-content, .ant-table-body");
          return {
            scrollY: window.scrollY,
            scrollTop: document.scrollingElement?.scrollTop ?? 0,
            scrollLeft: scroller?.scrollLeft ?? 0,
            /* 클릭이 실제로 그 Select 에 포커스를 줬는지 — 아니면 이 테스트는 공허하다. */
            focused: document.activeElement?.getAttribute("aria-label") ?? "",
          };
        });

        const at = `${viewport.width}px ${rowIndex + 1}행(${sample})`;
        expect(after.focused, `${at} 클릭이 Select 에 포커스`).toMatch(/ 대분류$/);
        expect(Math.abs(after.scrollY - before.scrollY), `${at} window.scrollY 변화`).toBeLessThanOrEqual(16);
        expect(Math.abs(after.scrollTop - before.scrollTop), `${at} scrollTop 변화`).toBeLessThanOrEqual(16);
        expect(Math.abs(after.scrollLeft - before.scrollLeft), `${at} 표 가로 스크롤 변화`).toBeLessThanOrEqual(16);
        await page.keyboard.press("Escape");
      }
    }
  });
});

/**
 * #34 묶음 B — 터치 타깃 44 (`app.css` 의 `.af-expenses` 규칙).
 *
 * 대상 6종: 카드사 Radio 버튼(C-04), Gmail 주소 입력(C-05), 비밀번호 표시 토글(C-05),
 * 오류 알림 재시도(C-06), 미분류 검색 상자(C-07), 검색 clear(C-08).
 * 768(태블릿)까지 같은 44 를 유지한다(C-14). 아이콘 2종은 시각 크기를 키우지 않고
 * `::after` 로만 히트를 넓히므로, `getBoundingClientRect` 가 아니라
 * `elementFromPoint` 로 0.5px 씩 바깥으로 밀어 실제 히트 높이를 잰다.
 */
const TOUCH_VIEWPORTS = [320, 375, 390, 430, 768];
const TOUCH_MIN = 44;

/** 폼 컨트롤의 시각 높이(px)와 문서 가로 넘침. */
function measureBoxes(page: Page) {
  return page.evaluate(() => {
    const height = (el: Element | null | undefined) => {
      if (!el) return null;
      return Math.round(el.getBoundingClientRect().height * 10) / 10;
    };
    const search = document.querySelector<HTMLElement>('input[aria-label="미분류 가맹점 검색"]');
    return {
      radio: height(document.querySelector(".af-expenses .ant-radio-button-wrapper")),
      gmail: height(document.querySelector('input[placeholder="example@gmail.com"]')),
      search: height(search?.closest(".ant-input-affix-wrapper")),
      alertRetry: height(document.querySelector(".af-expenses .ant-alert .af-retry-btn")),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

/**
 * 시각 rect 바깥으로 0.5px 씩 밀어 보며 elementFromPoint 가 그 요소(또는 자손)인
 * 최대 거리를 구한다 — `::after` 로 넓힌 히트를 실제로 확인하는 방법.
 */
function measureHit(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    const owned = (node: Element | null) => !!node && (node === el || el.contains(node));
    const cx = r.left + r.width / 2;
    const along = (dir: -1 | 1) => {
      let max = 0;
      for (let d = 0.5; d <= 24; d += 0.5) {
        const y = dir === -1 ? r.top - d : r.bottom + d;
        if (owned(document.elementFromPoint(cx, y))) max = d;
        else if (max > 0) break;
      }
      return max;
    };
    return {
      visual: Math.round(r.height * 10) / 10,
      hit: Math.round((r.height + along(-1) + along(1)) * 10) / 10,
    };
  }, selector);
}

test.describe("카드내역 터치 타깃 44", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "뷰포트를 직접 지정한다 — desktop 프로젝트 전용");

    await page.addInitScript((token) => {
      localStorage.setItem("assetflow.token", token);
      localStorage.setItem("assetflow.theme", "light");
    }, authToken());
    await mockScreenApi(page, "expenseCards");
  });

  test("대상 6종 높이 ≥44 — 320/375/390/430/768 (#34 C-04~C-08, C-14)", async ({ page }) => {
    for (const width of TOUCH_VIEWPORTS) {
      await openCardExpenses(page, width, 1000);
      // 비밀번호 토글은 값이 있을 때만, clear 는 입력값이 있을 때만 렌더된다.
      await page.locator('input[placeholder="abcd efgh ijkl mnop"]').fill("abcd");
      await page.locator('input[aria-label="미분류 가맹점 검색"]').fill("한");

      const box = await measureBoxes(page);
      const at = `${width}px`;
      expect(box.radio, `${at} 카드사 Radio 버튼`).not.toBeNull();
      expect(box.radio!, `${at} 카드사 Radio 버튼 높이`).toBeGreaterThanOrEqual(TOUCH_MIN);
      expect(box.gmail!, `${at} Gmail 주소 입력 높이`).toBeGreaterThanOrEqual(TOUCH_MIN);
      expect(box.search!, `${at} 미분류 검색 상자 높이`).toBeGreaterThanOrEqual(TOUCH_MIN);

      // 아이콘 2종 — 시각 크기는 그대로, 히트만 44.
      const password = await measureHit(page, ".af-expenses .ant-input-password-icon");
      expect(password, `${at} 비밀번호 토글`).not.toBeNull();
      expect(password!.visual, `${at} 비밀번호 토글 시각 크기 유지`).toBeLessThan(TOUCH_MIN);
      expect(password!.hit, `${at} 비밀번호 토글 히트 높이`).toBeGreaterThanOrEqual(TOUCH_MIN);

      const clear = await measureHit(page, ".af-expenses .ant-input-clear-icon");
      expect(clear, `${at} 검색 clear`).not.toBeNull();
      expect(clear!.visual, `${at} 검색 clear 시각 크기 유지`).toBeLessThan(TOUCH_MIN);
      expect(clear!.hit, `${at} 검색 clear 히트 높이`).toBeGreaterThanOrEqual(TOUCH_MIN);

      expect(box.overflow, `${at} 문서 넘침`).toBe(0);
    }

    // C-06: 설정 로딩 실패 → StateBlock 오류 알림의 재시도 버튼. 라우트는 나중에
    // 등록한 쪽이 먼저 매칭되므로(§80 목 규칙) 위 목을 덮는다.
    // #36 AS-03: 재시도는 `size="small"`(28) 대신 기본 크기 + `.af-retry-btn`
    // (min-height 44)이 됐다 — 히트 44 계약은 그대로이고 클래스만 바뀌었다.
    await page.route("**/api/v1/card-email-import-settings/**", (route) =>
      route.fulfill({ status: 500, json: { code: "SERVER_ERROR", message: "boom", data: null } }),
    );
    for (const width of TOUCH_VIEWPORTS) {
      await openCardExpenses(page, width, 1000);
      await expect(page.locator(".af-expenses .ant-alert .af-retry-btn")).toBeVisible();
      const box = await measureBoxes(page);
      expect(box.alertRetry!, `${width}px 오류 알림 재시도 높이`).toBeGreaterThanOrEqual(TOUCH_MIN);
      expect(box.overflow, `${width}px 오류 상태 문서 넘침`).toBe(0);
    }
  });
});

/**
 * #34 C-10/C-12 — 카드 상세 표(공용 `AfListTable`)의 편집 행 포커스와
 * 회원 Tag 행의 가맹점명 폭.
 */
test.describe("카드내역 상세 표 편집·폭", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-desktop", "뷰포트를 직접 지정한다 — desktop 프로젝트 전용");

    await page.addInitScript((token) => {
      localStorage.setItem("assetflow.token", token);
      localStorage.setItem("assetflow.theme", "light");
    }, authToken());
    await mockScreenApi(page, "expenseCards");
  });

  /**
   * C-10: 종전에는 편집을 연 행 탭 버튼이 DOM 에서 사라지며 포커스가 body 로
   * 떨어져 첫 Esc 가 무동작이었다(activeElement=BODY, 편집 유지).
   */
  test("편집 진입 포커스가 편집 셀 안 — Esc 1회로 종료·행 버튼 복귀 (#34 C-10)", async ({ page }) => {
    await openCardExpenses(page, 320, 800);
    const rowButton = page.getByRole("button", { name: "한마음식당 분류 편집" });
    await rowButton.click();

    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const rect = el?.getBoundingClientRect();
      const tabbar = document.querySelector<HTMLElement>(".af-tabbar");
      return {
        tag: el?.tagName ?? null,
        label: el?.getAttribute("aria-label") ?? null,
        inEditorCell: Boolean(el?.closest?.(".af-list__cell--editor")),
        bottom: rect ? Math.round(rect.bottom) : null,
        tabbarTop: tabbar ? Math.round(tabbar.getBoundingClientRect().top) : null,
      };
    });
    expect(focused.tag, "편집 진입 포커스가 body 로 떨어지면 안 된다").not.toBe("BODY");
    expect(focused.inEditorCell, `포커스 ${focused.tag}[${focused.label}] 가 편집 셀 밖이다`).toBe(true);
    // 편집 UI 가 하단 탭바(고정 56px) 뒤로 깔리지 않는다.
    expect(focused.bottom!).toBeLessThanOrEqual(focused.tabbarTop!);

    // Esc **한 번** — 드롭다운을 열지 않은 상태다.
    await page.keyboard.press("Escape");

    await expect(page.locator(".af-list__cell--editor")).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null)).toBe(
      "한마음식당 분류 편집",
    );
  });

  /**
   * C-12: 회원 Tag 가 있으면 320 에서 이름 가시 폭이 56.1px(금액 10억대)까지
   * 짜부라졌다. 이름이 최소 96px 를 먼저 쓰고, 자리가 없으면 Tag 가 다음 줄로
   * 감긴다 — 금액 열과 겹치지 않아야 한다.
   */
  test("회원 Tag 행 가맹점명 가시 폭 ≥96px, 금액 겹침 0 (#34 C-12)", async ({ page }) => {
    const bigRow = {
      rowKey: "qa-big",
      approvedAt: "2026-11-02",
      merchantName: "한마음식당",
      supplyExVat: 112_233_445,
      vat: 11_223_345,
      grossAmount: 1_234_567_890,
      cardMasked: "1234-****-5678",
      expenseKind: "식비",
      subCategory: "외식",
      businessNo: "123-45-67890",
      businessCategory: "음식점",
      memberRelation: "본인",
      cardCompany: "현대카드",
    };
    // 목은 나중에 등록한 라우트가 먼저 매칭된다(§80) — 화면 목을 덮는다.
    // 글롭은 쿼리까지 매칭하므로 경로 정규식으로 건다(월 파라미터가 붙는다).
    await page.route(/\/api\/v1\/assets\/card-imports(\?|$)/, (route) =>
      route.fulfill({ json: { code: "OK", message: "ok", data: [bigRow] } }),
    );
    await page.route(/\/api\/v1\/assets\/card-imports\/row-keys/, (route) =>
      route.fulfill({ json: { code: "OK", message: "ok", data: [bigRow.rowKey] } }),
    );

    await openCardExpenses(page, 320, 800);

    const geo = await page.evaluate(() => {
      const tr = document.querySelector<HTMLElement>('table[aria-labelledby="h-card-imports"] tbody tr');
      const name = tr?.querySelector<HTMLElement>(".af-list__cell--primary .af-list__edit");
      const amount = tr?.querySelector<HTMLElement>(".af-list__cell--value");
      const tag = tr?.querySelector<HTMLElement>(".af-list__extra .ant-tag");
      if (!tr || !name || !amount || !tag) return null;
      const n = name.getBoundingClientRect();
      const a = amount.getBoundingClientRect();
      return {
        nameW: Math.round(n.width * 10) / 10,
        // 이름 오른쪽과 금액 왼쪽 사이 — 음수면 겹친다.
        gap: Math.round((a.left - n.right) * 10) / 10,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(geo, "카드 상세 행을 찾지 못했다").not.toBeNull();
    expect(geo!.nameW, "가맹점명 가시 폭").toBeGreaterThanOrEqual(96);
    expect(geo!.gap, "이름과 금액 겹침").toBeGreaterThanOrEqual(0);
    expect(geo!.overflow, "320px 문서 넘침").toBe(0);
  });
});
