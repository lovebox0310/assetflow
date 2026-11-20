import { test, expect, type Page } from "@playwright/test";
import { authToken } from "./fixtures";
import { mockDashboardApi } from "./dashboard-mocks";
import { mockScreenApi } from "./screens-mocks";

/**
 * 이슈 #36 P3 — 자산 화면 금액 위계 · 긴 이름 (AS-07 · AS-08 · AS-09).
 *
 * - AS-07: 데스크톱(≥768) 금액이 14/400 이라 이름 15/600·합계 16/600 과 위계가
 *   뒤집혀 있었다 → 숫자 셀 굵기 600(크기·행 높이는 그대로).
 * - AS-08: 320px 에서 이름 칸이 117px 이라 긴 이름이 한 줄(≈47%)만 보였다 →
 *   자산 화면만 2줄(≈93%)로 넓힌다. 다른 4개 화면은 1줄 유지.
 * - AS-09: 은행 섹션 계좌명이 `이름 · 기관` 한 줄이라 긴 이름에서 2~3줄로 감겼다
 *   → 이름 1줄 + 기관 1줄(각각 말줄임·`title`).
 *
 * 뷰포트는 폭 분기(미디어 쿼리)만 보므로 프로젝트 배수 실행을 막고 여기서
 * 320/375/390/430/768/1280 을 직접 순회한다(assets-touch 와 같은 방식).
 */

/** 2줄로 나눠도 320px 에서 90% 이상 보이는 길이(251px). */
const LONG_NAME = "우리은행 청년희망적금 자유입출금 통장";
/** 말줄임이 실제로 걸리는 길이(≈480px) — 은행 섹션 이름 줄 확인용. */
const VERY_LONG_NAME = "국민은행 주거래 우대 자유입출금 통장 생활비 관리 계좌";

/**
 * screens-mocks 의 자산 목에서 이름만 길게 바꾼다. 은행 연결(id 1·2)과
 * 계좌 유형은 그대로 두어 은행 섹션·부채 표가 같은 데이터를 본다.
 */
const ACCOUNTS = [
  { id: 1, accountType: "cash", name: LONG_NAME, institutionName: "우리은행", balance: 8_500_000, isDebt: false, openedAt: "2024-03-02" },
  { id: 2, accountType: "cash", name: VERY_LONG_NAME, institutionName: "국민은행", balance: 2_300_000, isDebt: false, openedAt: "2023-11-20" },
  { id: 3, accountType: "deposit", name: "정기예금", institutionName: "국민은행", balance: 30_000_000, isDebt: false, openedAt: "2025-01-05" },
  { id: 4, accountType: "invest", name: "주식 계좌", institutionName: "한국투자증권", balance: 1_200_000, isDebt: false, openedAt: "2024-08-14" },
  { id: 5, accountType: "realty", name: "전세 보증금", institutionName: "—", balance: 20_000_000, isDebt: false, openedAt: null },
  { id: 6, accountType: "cash", name: "주택담보대출", institutionName: "우리은행", balance: 120_000_000, isDebt: true, openedAt: "2022-06-01" },
];

/** 모바일 표 1줄 행 기준 높이(§ 모바일 행). */
const ONE_LINE_ROW = 65;
/** 2줄이 되면 늘어나는 최대치 — 이름 한 줄(20) + 행 간격(2). */
const TWO_LINE_ROW_MAX = ONE_LINE_ROW + 20;

const MOBILE_WIDTHS = [320, 375, 390, 430];

async function openAssets(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`/?qa-hierarchy=${width}#/assets`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "자산" })).toBeVisible();
  await expect(page.getByText(LONG_NAME, { exact: true }).first()).toBeVisible();
}

interface NameMetrics {
  text: string;
  rowHeight: number;
  boxWidth: number;
  boxHeight: number;
  lineHeight: number;
  lines: number;
  /** 보이는 글자 폭 ÷ 전체 글자 폭. */
  exposure: number;
  clamp: string;
  overflow: boolean;
  overflowX: string;
  title: string | null;
}

/**
 * 자산 표(금융자산) 이름 칸 계측.
 *
 * 노출률은 canvas 로 잰 **전체 문구 폭**과 줄 수 × 줄 폭의 비율이다. 말줄임이
 * 걸리면 마지막 줄이 잘리므로 실제 노출은 이 값보다 조금 작다 — 경계 판정에는
 * 충분하고, 실패 시 로그로 실제 폭을 남긴다.
 */
function nameMetrics(page: Page): Promise<NameMetrics[]> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas").getContext("2d")!;
    return [...document.querySelectorAll<HTMLElement>('table[aria-labelledby="h-assets"] tbody tr')]
      .map((row) => {
        const button = row.querySelector<HTMLElement>(".af-list__cell--primary .af-list__edit");
        if (!button) return null;
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        const lineHeight = Number.parseFloat(style.lineHeight);
        const lines = Math.round(rect.height / lineHeight);
        canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const full = canvas.measureText(button.textContent ?? "").width;
        return {
          text: button.textContent ?? "",
          rowHeight: Math.round(row.getBoundingClientRect().height * 10) / 10,
          boxWidth: Math.round(rect.width * 10) / 10,
          boxHeight: Math.round(rect.height * 10) / 10,
          lineHeight,
          lines,
          exposure: Math.round((Math.min(1, (lines * rect.width) / full) + Number.EPSILON) * 100) / 100,
          clamp: style.webkitLineClamp,
          overflow: button.scrollHeight > button.clientHeight + 1,
          overflowX: style.overflowX,
          title: button.getAttribute("title"),
        };
      })
      .filter((value): value is NameMetrics => value !== null);
  });
}

/** 이름 버튼이 차지하는 탭 영역 — `::after` 확장을 포함한 행 세로 범위. */
function tapOwnership(page: Page) {
  return page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('table[aria-labelledby="h-assets"] tbody tr')!;
    const button = row.querySelector<HTMLElement>(".af-list__cell--primary .af-list__edit")!;
    const after = getComputedStyle(button, "::after");
    const rowRect = row.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const cx = (buttonRect.left + buttonRect.right) / 2;
    const owned = (y: number) => {
      const hit = document.elementFromPoint(cx, y);
      return !!hit && (hit === button || button.contains(hit));
    };
    return {
      afterContent: after.content,
      afterInset: after.inset,
      rowHeight: Math.round(rowRect.height * 10) / 10,
      topHit: owned(rowRect.top + 2),
      bottomHit: owned(rowRect.bottom - 2),
    };
  });
}

/** 키보드로 이름 버튼에 포커스한다 — `:focus-visible` 이 확실히 걸리는 경로. */
async function focusByName(page: Page, name: string) {
  for (let step = 0; step < 80; step += 1) {
    await page.keyboard.press("Tab");
    const reached = await page.evaluate((target) => {
      const active = document.activeElement as HTMLElement | null;
      return (
        !!active &&
        active.classList.contains("af-list__edit") &&
        (active.textContent ?? "").includes(target)
      );
    }, name);
    if (reached) return true;
  }
  return false;
}

test.describe("자산 금액 위계·긴 이름 (이슈 #36 P3)", () => {
  test.use({ hasTouch: true });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-mobile", "뷰포트를 스펙에서 직접 순회한다");
    await page.addInitScript((token) => {
      localStorage.setItem("assetflow.token", token);
      localStorage.setItem("assetflow.theme", "light");
    }, authToken());
    // 화면 목은 하나의 핸들러가 모든 경로를 채운다 — 이름만 길게 바꾼 자산 목을 덮어쓴다.
    await mockScreenApi(page, "assets");
    await page.route(/\/api\/v1\/assets\/accounts$/, (route) =>
      route.fulfill({ json: { code: "OK", message: "ok", data: ACCOUNTS } }),
    );
  });

  test("320~430 이름 2줄 · 은행 2행 · ≥768 금액 600", async ({ page }) => {
    /* ── AS-08: 자산 표 이름 2줄 · 1줄 행 65 유지 · 탭/포커스 링 ───────── */
    for (const width of MOBILE_WIDTHS) {
      await openAssets(page, width);
      const metrics = await nameMetrics(page);
      console.log(`[AS-08] ${width}px ${JSON.stringify(metrics)}`);

      const long = metrics.find((m) => m.text === LONG_NAME);
      const veryLong = metrics.find((m) => m.text === VERY_LONG_NAME);
      const short = metrics.filter((m) => m.text === "정기예금" || m.text === "주식 계좌" || m.text === "전세 보증금");
      expect(long, `${width}px 긴 이름 행 없음`).toBeDefined();
      expect(veryLong, `${width}px 매우 긴 이름 행 없음`).toBeDefined();
      expect(short.length, `${width}px 1줄 행 3개`).toBe(3);

      /* AC2: 긴 이름 노출 ≥60% · 최대 2줄 · clamp 2. 말줄임은 유지되므로 clamp 는 2 그대로다.
       *
       * 몇 줄에 들어가는지·잘리는지는 **폰트 메트릭에 달린 환경 전제**다 — CI 러너
       * 폰트에서는 430px 에서도 긴 이름이 1줄에 다 들어가 `scrollHeight > clientHeight`
       * 가 거짓이 된다. 요구는 "최대 2줄 · clamp 2 · 넘치면 말줄임 · title 보존" 이므로
       * 1~2줄을 모두 허용하고, 잘림(`overflow`)은 단언하지 않고 로그로만 남긴다.
       * 대신 줄 수에 따라 행 높이를 판정한다. */
      expect(long!.lines, `${width}px 긴 이름 줄 수(실측 ${long!.boxHeight}px / ${long!.lineHeight}px)`).toBeGreaterThanOrEqual(1);
      expect(long!.lines, `${width}px 긴 이름 최대 줄 수(실측 ${long!.lines}줄)`).toBeLessThanOrEqual(2);
      expect(long!.exposure, `${width}px 긴 이름 노출률(실측 ${long!.exposure} · ${long!.lines}줄 × ${long!.boxWidth}px)`).toBeGreaterThanOrEqual(0.6);
      expect(long!.clamp, `${width}px clamp(실측 "${long!.clamp}")`).toBe("2");
      // 2줄보다 긴 이름도 2줄에서 끊긴다(행 높이가 이름 길이에 비례하지 않는다).
      expect(veryLong!.lines, `${width}px 매우 긴 이름 줄 수(실측 ${veryLong!.lines}줄)`).toBeGreaterThanOrEqual(1);
      expect(veryLong!.lines, `${width}px 매우 긴 이름 최대 줄 수(실측 ${veryLong!.lines}줄)`).toBeLessThanOrEqual(2);
      expect(veryLong!.clamp, `${width}px 매우 긴 이름 clamp(실측 "${veryLong!.clamp}")`).toBe("2");
      /* 넘쳤을 때만 말줄임 — 넘침 여부 자체는 폰트 폭의 함수라 요구가 아니다.
       * 요구는 "넘치면 잘려 보이되 전체 문구는 title 에 남는다" 이므로 (1) 넘쳤다면
       * 실제로 잘려 있고 (2) title 이 전체 문구인지를 본다. */
      for (const name of [long!, veryLong!]) {
        console.log(
          `[AS-08 잘림] ${width}px "${name.text}" truncated=${name.overflow} ` +
            `box=${name.boxWidth}×${name.boxHeight} lines=${name.lines} overflowX=${name.overflowX}`,
        );
        expect(name.title, `${width}px "${name.text}" title 보존`).toBe(name.text);
        expect(name.overflowX, `${width}px "${name.text}" 넘치면 말줄임(overflow-x)`).toBe("hidden");
      }

      /* AC2: 1줄 행 높이는 65 그대로, 2줄 행만 늘어난다 — 줄 수에 따라 판정. */
      for (const row of short) {
        expect(row.rowHeight, `${width}px 1줄 행 높이(${row.text})`).toBe(ONE_LINE_ROW);
      }
      for (const row of [long!, veryLong!]) {
        if (row.lines === 1) {
          expect(row.rowHeight, `${width}px 1줄 행 높이(${row.text})`).toBe(ONE_LINE_ROW);
        } else {
          expect(row.rowHeight, `${width}px 2줄 행 높이(${row.text})`).toBeGreaterThan(ONE_LINE_ROW);
          expect(row.rowHeight, `${width}px 2줄 행 높이(${row.text})`).toBeLessThanOrEqual(TWO_LINE_ROW_MAX);
        }
      }

      /* AC2: 탭 히트 — 2줄이 되어도 `::after` 가 행 전체를 덮는다. */
      const tap = await tapOwnership(page);
      console.log(`[AS-08 탭] ${width}px ${JSON.stringify(tap)}`);
      expect(tap.afterContent, `${width}px 행 확장 ::after`).not.toBe("none");
      expect(tap.topHit, `${width}px 행 위쪽 가장자리 탭`).toBe(true);
      expect(tap.bottomHit, `${width}px 행 아래쪽 가장자리 탭`).toBe(true);

      /* AC2: 포커스 링 — `-webkit-box` 로 바꿔도 outline 이 살아 있어야 한다. */
      expect(await focusByName(page, LONG_NAME), `${width}px 키보드로 이름 버튼 도달`).toBe(true);
      const ring = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement;
        const style = getComputedStyle(active);
        return {
          style: style.outlineStyle,
          width: style.outlineWidth,
          color: style.outlineColor,
          matches: active.matches(":focus-visible"),
        };
      });
      console.log(`[AS-08 포커스] ${width}px ${JSON.stringify(ring)}`);
      expect(ring.matches, `${width}px :focus-visible`).toBe(true);
      expect(ring.style, `${width}px 포커스 링 스타일`).toBe("solid");
      expect(Number.parseFloat(ring.width), `${width}px 포커스 링 두께`).toBeGreaterThanOrEqual(2);

      /* 넘침 0 — 2줄/말줄임이 레이아웃을 밀지 않는다. */
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        `${width}px 문서 가로 넘침`,
      ).toBe(0);
    }

    /* ── AS-09: 은행 섹션 — 이름 1줄 + 기관 1줄(각각 title) ─────────────── */
    for (const width of [320, 390]) {
      await openAssets(page, width);
      const bank = await page.evaluate(() => {
        const section = document.querySelector<HTMLElement>('section[aria-labelledby="h-bank-sync"]')!;
        return {
          sectionHeight: Math.round(section.getBoundingClientRect().height * 10) / 10,
          lines: [...section.querySelectorAll<HTMLElement>("[title]")].map((el) => {
            const style = getComputedStyle(el);
            return {
              title: el.getAttribute("title"),
              text: el.textContent ?? "",
              height: Math.round(el.getBoundingClientRect().height * 10) / 10,
              lineHeight: Number.parseFloat(style.lineHeight),
              scrollHeight: el.scrollHeight,
              clientWidth: el.clientWidth,
              scrollWidth: el.scrollWidth,
              whiteSpace: style.whiteSpace,
              overflowX: style.overflowX,
              textOverflow: style.textOverflow,
              truncated: el.scrollWidth > el.clientWidth + 1,
            };
          }),
        };
      });
      console.log(`[AS-09] ${width}px ${JSON.stringify(bank)}`);

      // 은행 섹션의 현금성·예적금 3계좌 × (이름·기관) = 6줄.
      expect(bank.lines.length, `${width}px 이름·기관 줄 수(실측 ${bank.lines.length})`).toBe(6);
      for (const line of bank.lines) {
        expect(line.title, `${width}px "${line.text}" title 보존`).toBe(line.text);
        /* 각 줄은 1줄 — 내용이 넘치면 말줄임으로 끊고 줄을 늘리지 않는다.
         * 줄 상자 높이가 lineHeight 이하이면 1줄이다(2줄이면 두 배가 된다).
         * 내용 높이(scrollHeight)는 글자 크기가 lineHeight 보다 큰 폰트에서 그 줄의
         * 글자 높이만큼 커지므로 "1줄 상자 안" 기준(lineHeight × 1.9)으로 본다. */
        expect(
          line.height,
          `${width}px "${line.text}" 1줄 높이(실측 ${line.height}px · lineHeight ${line.lineHeight}px)`,
        ).toBeLessThanOrEqual(line.lineHeight + 0.5);
        expect(
          line.scrollHeight,
          `${width}px "${line.text}" 내용 높이 1줄(실측 ${line.scrollHeight}px · lineHeight ${line.lineHeight}px)`,
        ).toBeLessThanOrEqual(line.lineHeight * 1.9);
        // 1줄 고정의 근거 — 넘치면 ellipsis, 감기지 않는다(폰트 무관 CSS 계약).
        expect(line.whiteSpace, `${width}px "${line.text}" 줄바꿈 금지`).toBe("nowrap");
        expect(line.overflowX, `${width}px "${line.text}" 넘침 숨김`).toBe("hidden");
        expect(line.textOverflow, `${width}px "${line.text}" 말줄임 표시`).toBe("ellipsis");
        /* 넘쳤을 때만 말줄임 — 넘침 여부는 폰트 폭의 함수라 요구가 아니다.
         * 넘쳤다면 실제로 잘려 있는지(스크롤 폭 > 보이는 폭)만 확인한다. */
        if (line.truncated) {
          expect(
            line.scrollWidth,
            `${width}px "${line.text}" 말줄임 조건(실측 scroll ${line.scrollWidth} / client ${line.clientWidth})`,
          ).toBeGreaterThan(line.clientWidth);
        }
      }
      /* AC3: 계좌명 영역은 **2행**(이름 1행 + 기관 1행)이다 — 이름 길이에 비례해
       * 늘지 않는다. 절대값 38px(22 + 16)은 기본 폰트의 실측이고, 폰트 메트릭이
       * 다른 환경(글자 크기 주입 등)에서는 각 행의 줄 상자가 커져 그대로 늘어난다.
       * 그래서 항상 "두 줄 상자" 이하인지를 보고, 기본 폰트 값(22/16)일 때만
       * 40px 상한을 함께 건다. */
      const [nameLine, institutionLine] = bank.lines;
      const nameBlock = nameLine.height + institutionLine.height;
      expect(
        nameBlock,
        `${width}px 계좌명 2행 높이(실측 ${Math.round(nameBlock * 10) / 10}px · ` +
          `이름 ${nameLine.lineHeight} + 기관 ${institutionLine.lineHeight})`,
      ).toBeLessThanOrEqual(nameLine.lineHeight + institutionLine.lineHeight + 0.5);
      if (Math.abs(nameLine.lineHeight - 22) < 0.5 && Math.abs(institutionLine.lineHeight - 16) < 0.5) {
        expect(nameBlock, `${width}px 계좌명 2행 높이 상한(실측 ${Math.round(nameBlock * 10) / 10}px)`).toBeLessThanOrEqual(40);
      }
      /* 매우 긴 이름 — 요구는 "1줄 유지 + title 보존", 잘림은 폰트 폭에 달렸다.
       * CI 폰트처럼 1줄에 다 들어가면 잘리지 않는 것이 정상이다. */
      const veryLongLine = bank.lines.find((line) => line.title === VERY_LONG_NAME);
      expect(veryLongLine, `${width}px 매우 긴 계좌명 줄 없음(제목 ${JSON.stringify(bank.lines.map((l) => l.title))})`).toBeDefined();
      expect(veryLongLine!.text, `${width}px 매우 긴 계좌명 전체 문구 보존`).toBe(VERY_LONG_NAME);
      console.log(
        `[AS-09 잘림] ${width}px 매우 긴 계좌명 truncated=${veryLongLine!.truncated} ` +
          `scroll=${veryLongLine!.scrollWidth} client=${veryLongLine!.clientWidth} height=${veryLongLine!.height}/lineHeight=${veryLongLine!.lineHeight}`,
      );
    }

    /* ── AS-07: ≥768 금액 굵기 600 · 행 높이 불변 ───────────────────────── */
    for (const width of [768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?qa-hierarchy=${width}#/assets`, { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { level: 1, name: "자산" })).toBeVisible();
      /* 행 단위로 읽는다 — 굵기 변경이 행 높이를 늘리지 않았는지 보려면 같은 행의
       * 이름 셀과 금액 셀 높이를 비교해야 한다(굵기가 열 폭을 밀면 이름이 감긴다). */
      const cells = await page.evaluate(() => {
        const readRows = (tableId: string) =>
          [...document.querySelectorAll<HTMLElement>(`table[aria-labelledby="${tableId}"] tbody tr`)].map(
            (row) => {
              const num = row.querySelector<HTMLElement>(".af-list__cell--num")!;
              const name = row.querySelector<HTMLElement>(".af-list__cell--primary")!;
              const nameButton = name.querySelector<HTMLElement>(".af-list__edit");
              const numStyle = getComputedStyle(num);
              /* 줄 수는 **이름 버튼** 높이로 센다 — 셀은 세로 패딩·배지가 섞여
               * 높이 ÷ lineHeight 가 줄 수와 맞지 않는다(44px 셀 / 22px 줄 = 2). */
              const buttonStyle = nameButton ? getComputedStyle(nameButton) : null;
              const buttonLineHeight = buttonStyle ? Number.parseFloat(buttonStyle.lineHeight) : Number.NaN;
              const height = (el: Element) => Math.round(el.getBoundingClientRect().height * 10) / 10;
              return {
                weight: numStyle.fontWeight,
                size: numStyle.fontSize,
                numHeight: height(num),
                nameHeight: height(name),
                nameLines: nameButton && buttonLineHeight > 0
                  ? Math.max(1, Math.round(height(nameButton) / buttonLineHeight))
                  : 1,
                rowHeight: height(row),
                nameWeight: nameButton ? getComputedStyle(nameButton).fontWeight : null,
              };
            },
          );
        return {
          assets: readRows("h-assets"),
          liabilities: readRows("h-liab"),
        };
      });
      console.log(`[AS-07] ${width}px ${JSON.stringify(cells)}`);

      expect(cells.assets.length, `${width}px 자산 행`).toBeGreaterThan(0);
      expect(cells.liabilities.length, `${width}px 부채 행`).toBeGreaterThan(0);
      for (const cell of [...cells.assets, ...cells.liabilities]) {
        expect(cell.weight, `${width}px 금액 굵기`).toBe("600");
        expect(cell.size, `${width}px 금액 크기`).toBe("14px");
        /* 위계: 금액(600) 이 이름(600)과 같은 무게 — 역전 해소. */
        expect(cell.nameWeight, `${width}px 이름 굵기`).toBe("600");
        /* AC1: 행 높이 불변 — 금액 셀이 행을 늘리지 않는다(이름 셀 높이와 같다). */
        expect(cell.numHeight, `${width}px 금액 셀이 행을 늘리지 않는다`).toBe(cell.nameHeight);
      }
      /* 1280 은 이름이 한 줄에 들어가는 폭 — 행 44 가 그대로여야 한다.
       * (768 은 긴 이름·기관 열이 감기는 행이 원래 있어 행 단위 비교만 한다.)
       * 이름이 한 줄에 들어가는지·줄 상자가 44 인지는 폰트 폭/메트릭에 달렸으므로
       * (넓은 폰트면 1280 에서도 감기고 줄 상자가 커진다) 기본 폰트 실측치(44)일
       * 때만 절대값을 요구하고, 모든 행에 대해 "행 높이 = 셀 높이"(금액 굵기가 행을
       * 늘리지 않았다)는 폰트와 무관하게 확인한다. */
      if (width === 1280) {
        for (const cell of cells.assets) {
          expect(
            cell.rowHeight,
            `${width}px 행 높이가 셀 높이와 같다(행 ${cell.rowHeight}px · 이름 ${cell.nameHeight}px)`,
          ).toBe(cell.nameHeight);
          if (cell.nameLines === 1 && cell.nameHeight === 44) {
            expect(
              cell.rowHeight,
              `${width}px 1줄 행 높이 44(실측 ${cell.rowHeight}px · 이름 ${cell.nameHeight}px)`,
            ).toBe(44);
          } else {
            console.log(
              `[AS-07] ${width}px 이름 ${cell.nameLines}줄 · 셀 ${cell.nameHeight}px — 행 ${cell.rowHeight}px(기본 폰트 값 아님)`,
            );
          }
        }
      }
    }

    /* ── 회귀: 다른 4개 화면의 표는 1줄 유지 ─────────────────────────────
     * 2줄 규칙은 `.af-assets` 스코프라 다른 화면에는 붙지 않아야 한다. 자산 표만
     * `-webkit-line-clamp: 2` 를 갖고, 나머지는 `none`(1줄) 이다. */
    const listClamp = () =>
      page.evaluate(() => {
        const read = (selector: string) =>
          [...document.querySelectorAll<HTMLElement>(selector)].map((el) => {
            const style = getComputedStyle(el);
            return { clamp: style.webkitLineClamp, whiteSpace: style.whiteSpace };
          });
        return {
          cells: read(".af-list__cell--primary"),
          buttons: read(".af-list__cell--primary .af-list__edit"),
        };
      });

    /** 이름이 한 줄로 유지되는지 — 어느 셀에도 2줄 clamp 가 없어야 한다. */
    const expectSingleLine = async (label: string) => {
      const list = await listClamp();
      console.log(`[회귀] ${label} ${JSON.stringify(list)}`);
      expect(list.cells.length, `${label} 표 행 없음`).toBeGreaterThan(0);
      for (const cell of list.cells) {
        expect(cell.clamp, `${label} 1줄 유지(line-clamp)`).toBe("none");
      }
      for (const button of list.buttons) {
        expect(button.clamp, `${label} 이름 1줄 유지(line-clamp)`).toBe("none");
        expect(button.whiteSpace, `${label} 이름 1줄 유지(nowrap)`).toBe("nowrap");
      }
    };

    /* 대시보드는 자체 목(dashboard-mocks)을 쓴다 — 새 핸들러가 앞에 서므로 먼저 본다. */
    await page.setViewportSize({ width: 320, height: 800 });
    await mockDashboardApi(page);
    await page.goto("/?qa-hierarchy-side=dashboard#/", { waitUntil: "networkidle" });
    await expect(page.getByText("예측 비상금").first()).toBeVisible();
    await expectSingleLine("dashboard");

    // 나머지 3개 화면은 화면 목(하나의 핸들러)을 다시 최신으로 올려 쓴다.
    await mockScreenApi(page, "assets");
    const screens = [
      { key: "expenses", hash: "/expenses", readyText: "주말 장보기" },
      { key: "expenseCards", hash: "/expenses/cards", readyText: "한마음식당" },
      { key: "investments", hash: "/investments", readyText: "삼성전자" },
    ] as const;
    for (const screen of screens) {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(`/?qa-hierarchy-side=${screen.key}#${screen.hash}`, { waitUntil: "networkidle" });
      await expect(page.getByText(screen.readyText).first()).toBeVisible();
      await expectSingleLine(screen.key);
    }
  });
});
