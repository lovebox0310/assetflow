import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CardExpensesPage } from "./CardExpensesPage";
import { clearInflight } from "../api/client";
import { clearToken, saveToken } from "../auth/authStore";

/**
 * §58 — 지출 화면에서 분리한 카드내역 탭.
 * 카드 원장 렌더·카테고리 분류·미분류 작업함·필터가 이 화면에서 동작한다.
 */

type Handler = (path: string, init?: RequestInit) => Response | Promise<Response>;

function stubFetch(handler: Handler) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    // 카드내역 화면은 카드메일 설정을 1회 읽는다 — 미설정(404 NOT_FOUND)이 정상이라 고정 응답한다.
    if (path.includes("/card-email-import-settings")) return Promise.resolve(notFound());
    return Promise.resolve(handler(path, init));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function apiResponse(data: unknown, ok = true, status = 200): Response {
  const body = ok
    ? { code: "OK", message: "loaded", data }
    : { code: "INVALID_REQUEST", message: "Invalid request", details: "", timestamp: "" };
  return { ok, status, json: async () => body } as Response;
}

/** 카드 명세서 자동 수집 설정이 아직 없을 때의 응답(404 NOT_FOUND). */
function notFound(): Response {
  return {
    ok: false,
    status: 404,
    json: async () => ({ code: "NOT_FOUND", message: "not found", details: "", timestamp: "" }),
  } as Response;
}

/**
 * 미분류 작업함만 채운 응답 — #46 검색 버튼 테스트 공용.
 * 카드 원장·명세서는 빈 배열로 둬 분류 편집 버튼이 작업함에만 생기게 한다.
 */
function unclassifiedStub(groups: unknown[]) {
  return (path: string) => {
    if (path.includes("/card-imports/row-keys")) return apiResponse([]);
    if (path.includes("/assets/card-imports/unclassified")) return apiResponse(groups);
    if (path.includes("/card-imports/statements")) return apiResponse([]);
    if (path.includes("/assets/card-imports")) return apiResponse([]);
    return apiResponse({}, false, 500);
  };
}

function renderPage(overrides: Partial<Parameters<typeof CardExpensesPage>[0]> = {}) {
  return render(
    <CardExpensesPage
      month="2026-10"
      onMonthChange={() => {}}
      onOpenDashboard={() => {}}
      onOpenAssets={() => {}}
      onOpenExpenses={() => {}}
      onOpenSettings={() => {}}
      {...overrides}
    />,
  );
}

describe("CardExpensesPage (§58 카드내역 탭)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    clearInflight();
  });

  beforeEach(() => {
    clearToken();
    saveToken("tok", Date.now() + 60_000);
  });

  it("가져온 카드내역을 카드 원장에서 렌더한다 (§41)", async () => {
    stubFetch((path) => {
      if (path.includes("/card-imports/row-keys")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/card-imports/statements")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse([
        { rowKey: "k1", approvedAt: "2026-10-01", merchantName: "우아한형제들", supplyExVat: 37_273, vat: 3_727, grossAmount: 41_000 },
        { rowKey: "k2", approvedAt: "2026-10-02", merchantName: "GS25", supplyExVat: 2_909, vat: 291, grossAmount: 3_200 },
      ]);
      return apiResponse({}, false, 500);
    });
    renderPage();

    expect(await screen.findByText("우아한형제들")).toBeDefined();
    expect(screen.getByText("GS25")).toBeDefined();
    // 합계(행 재계산): 41,000 + 3,200 = 44,200원
    expect(screen.getAllByText("44,200원").length).toBeGreaterThan(0);
  });

  it("카드사별 사용금액 표에 승인일 합계와 명세서 금액을 함께 보여 준다 (§72.1)", async () => {
    stubFetch((path) => {
      if (path.includes("/card-imports/row-keys")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/card-imports/statements")) return apiResponse([
        {
          id: 1, cardCompany: "현대카드", kind: "billing", usageMonth: "2026-10",
          periodStart: "2026-10-02", periodEnd: "2026-11-03", totalAmount: 3_326_643,
        },
        {
          id: 2, cardCompany: "삼성카드", kind: "billing", usageMonth: "2026-09",
          periodStart: "2026-09-03", periodEnd: "2026-10-02", totalAmount: 890_156,
        },
      ]);
      if (path.includes("/assets/card-imports")) return apiResponse([
        {
          rowKey: "h1", approvedAt: "2026-10-31", merchantName: "현대가맹점",
          supplyExVat: 3_149_266, vat: 314_907, grossAmount: 3_464_173, cardCompany: "현대카드",
        },
        {
          rowKey: "s1", approvedAt: "2026-10-21", merchantName: "삼성가맹점",
          supplyExVat: 329_300, vat: 32_930, grossAmount: 362_230, cardCompany: "삼성카드",
        },
      ]);
      return apiResponse({}, false, 500);
    });
    renderPage();

    expect(await screen.findByRole("heading", { name: "카드사별 사용금액" })).toBeDefined();
    const table = await screen.findByRole("table", { name: /카드사별 승인일 기준/ });
    expect(within(table).getByText("3,464,173원")).toBeDefined();
    expect(within(table).getByText("362,230원")).toBeDefined();
    expect(within(table).getByText("3,326,643원")).toBeDefined();
    expect(within(table).getByText("2026-10-02 ~ 2026-11-03")).toBeDefined();
    expect(within(table).getByText(/최근 수집 890,156원/)).toBeDefined();
    expect(within(table).getByText(/최근 2026-10-21/)).toBeDefined();
  });

  it("카드 명세서가 없으면 카드 금액 옆에 '추정' 배지를 붙인다 (이슈 #51)", async () => {
    stubFetch((path) => {
      if (path.includes("/card-imports/row-keys")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/card-imports/statements")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse([
        { rowKey: "k1", approvedAt: "2026-10-01", merchantName: "우아한형제들", supplyExVat: 37_273, vat: 3_727, grossAmount: 41_000, expenseKind: "식비", subCategory: "배달" },
      ]);
      return apiResponse({}, false, 500);
    });
    renderPage();

    const badge = await screen.findByText("추정");
    expect(badge.getAttribute("title")).toBe("카드 명세서가 없어 승인일 기준으로 계산했습니다");
  });

  it("명세서 기준이면 '추정' 배지가 없다 (이슈 #51)", async () => {
    stubFetch((path) => {
      if (path.includes("/card-imports/row-keys")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/card-imports/statements")) return apiResponse([
        {
          id: 1, cardCompany: "현대카드", kind: "billing", usageMonth: "2026-10",
          periodStart: "2026-10-02", periodEnd: "2026-11-03", totalAmount: 3_326_643,
        },
      ]);
      if (path.includes("/assets/card-imports")) return apiResponse([
        { rowKey: "k1", approvedAt: "2026-10-01", merchantName: "우아한형제들", supplyExVat: 37_273, vat: 3_727, grossAmount: 41_000, expenseKind: "식비", subCategory: "배달" },
      ]);
      return apiResponse({}, false, 500);
    });
    renderPage();

    // 명세서가 화면에 반영된 뒤(카드사별 표의 명세서 금액) 배지가 없음을 확인한다.
    const table = await screen.findByRole("table", { name: /카드사별 승인일 기준/ });
    expect(within(table).getAllByText("3,326,643원").length).toBeGreaterThan(0);
    expect(screen.queryByText("추정")).toBeNull();
  });

  it("카드 원장이 실패하면 카드 단위 오류와 재시도가 뜬다 (§26 재사용)", async () => {
    stubFetch((path) => {
      if (path.includes("/card-imports/row-keys")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/card-imports/statements")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse({}, false, 500);
      return apiResponse({}, false, 500);
    });
    renderPage();

    const alerts = await screen.findAllByText(/오류|실패|다시 시도|재시도|문제/i);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("카테고리 자동 분류 버튼은 reclassify 를 호출하고 결과를 안내한다 (§55.8)", async () => {
    const fetchMock = stubFetch((path, init) => {
      if (path.includes("/card-imports/reclassify") && init?.method === "POST") {
        return apiResponse({ total: 12, updated: 7 });
      }
      if (path.includes("/card-imports/row-keys")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/card-imports/statements")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) {
        return apiResponse([
          { rowKey: "k1", approvedAt: "2026-10-01", merchantName: "스타벅스 강남점", supplyExVat: 4500, vat: 500, grossAmount: 5000, cardMasked: "1234", expenseKind: "식비" },
        ]);
      }
      return apiResponse({}, false, 500);
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "카테고리 자동 분류" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/assets/card-imports/reclassify",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(await screen.findByText(/12건 중 7건을 자동 분류했습니다/)).toBeDefined();
    // 재분류 후 카드 내역을 다시 읽어 카테고리 열과 카테고리별 합계가 갱신된다
    expect((await screen.findAllByText(/식비/)).length).toBeGreaterThan(0);
    expect(await screen.findByText("카테고리별 합계")).toBeDefined();
    // 표가 아니라 카드로 보여 준다 — 합계 블록 안에 table 이 없다
    const categoryTotals = screen.getByLabelText("이 달 카드 카테고리별 합계");
    expect(categoryTotals.querySelector("table")).toBeNull();
    expect(categoryTotals.textContent).toContain("지출 합계");
  });

  it("미분류 작업함에서 가맹점을 지정하면 그 자리에서 사라지고 되돌릴 수 있다 (§55.8)", async () => {
    const fetchMock = stubFetch((path, init) => {
      if (path.includes("/card-imports/merchant-category") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return apiResponse({ merchantName: body.merchantName, category: body.category, subCategory: body.subCategory ?? "", updatedRows: 2 });
      }
      if (path.includes("/card-imports/row-keys")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) {
        return apiResponse([
          { merchantName: "네이버페이", count: 2, grossTotal: 30_000, firstApprovedAt: "2026-09-01", lastApprovedAt: "2026-10-01" },
        ]);
      }
      if (path.includes("/card-imports/statements")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) {
        return apiResponse([
          { rowKey: "k1", approvedAt: "2026-09-01", merchantName: "네이버페이", supplyExVat: 9_000, vat: 1_000, grossAmount: 10_000, cardMasked: "1234", expenseKind: "" },
          { rowKey: "k2", approvedAt: "2026-10-01", merchantName: "네이버페이", supplyExVat: 18_000, vat: 2_000, grossAmount: 20_000, cardMasked: "1234", expenseKind: "unclassified" },
        ]);
      }
      return apiResponse({}, false, 500);
    });
    renderPage();

    // 작업함: 금액 큰 순으로 가맹점 묶음이 뜨고 남은 건수가 보인다
    expect(await screen.findByText("남은 가맹점 1개")).toBeDefined();
    expect(screen.getAllByText("30,000원").length).toBeGreaterThan(0);

    // 분류 Select 는 행 탭으로 여는 편집 행에만 있다(모바일에서 clip 되는 meta 열에 두지 않는다).
    fireEvent.click(await screen.findByRole("button", { name: "네이버페이 분류 편집" }));
    const combo = await screen.findByRole("combobox", { name: "네이버페이 카테고리 지정" });
    fireEvent.mouseDown(combo);
    fireEvent.click(await screen.findByTitle("쇼핑/생활"));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((c) => (c[1]?.method ?? "GET") === "PATCH");
      expect(patch).toBeDefined();
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ merchantName: "네이버페이", category: "쇼핑/생활", subCategory: "" });
    });
    // 묶음은 재조회 없이 사라지고, 되돌리기 버튼이 뜬다
    expect(await screen.findByText("미분류 1개 가맹점을 모두 정리했습니다.")).toBeDefined();
    const undoBtn = await screen.findByRole("button", { name: "되돌리기" });
    expect(screen.queryByText("남은 가맹점 1개")).toBeNull();

    fireEvent.click(undoBtn);
    await waitFor(() => {
      const patches = fetchMock.mock.calls.filter((c) => (c[1]?.method ?? "GET") === "PATCH");
      expect(patches.length).toBe(2);
      expect(JSON.parse(String(patches[1]?.[1]?.body))).toEqual({ merchantName: "네이버페이", category: "", subCategory: "" });
    });
    // 되돌리면 묶음이 작업함에 다시 나타난다
    expect(await screen.findByText("남은 가맹점 1개")).toBeDefined();
    expect(screen.queryByRole("button", { name: "되돌리기" })).toBeNull();
  });

  it("미분류 검색 버튼 이름은 동작과 일치한다 — clear·표시 초기화, '검색' 버튼은 없다 (#46)", async () => {
    stubFetch(unclassifiedStub([
      { merchantName: "네이버페이", count: 2, grossTotal: 30_000, firstApprovedAt: "2026-09-01", lastApprovedAt: "2026-10-01" },
      { merchantName: "동네세탁", count: 1, grossTotal: 12_000, firstApprovedAt: "2026-09-02", lastApprovedAt: "2026-10-02" },
    ]));
    renderPage();

    const input = (await screen.findByLabelText("미분류 가맹점 검색")) as HTMLInputElement;
    // 값이 없으면 clear 버튼은 렌더되지 않는다(antd allowClear 와 같은 동작).
    expect(screen.queryByRole("button", { name: "검색어 지우기" })).toBeNull();

    // 오른쪽 버튼은 검색이 아니라 "표시 수 초기화"다 — 이 이름이 곧 계약이다.
    const reset = screen.getByRole("button", { name: "표시 초기화" });
    expect(reset.className).toContain("af-search-reset");
    // "검색" 이라는 이름의 버튼은 없어야 한다(필터는 입력 즉시 — 오해 방지).
    expect(screen.queryByRole("button", { name: "검색" })).toBeNull();

    // 입력 즉시 거르는 동작은 그대로다(§55.8).
    fireEvent.change(input, { target: { value: "네이버" } });
    await waitFor(() => expect(screen.queryByText("동네세탁")).toBeNull());
    expect(screen.getByText("남은 가맹점 2개")).toBeDefined();

    // clear 버튼: 한국어 이름 + 자체 44 박스 훅(히트는 e2e 실측).
    const clear = screen.getByRole("button", { name: "검색어 지우기" });
    expect(clear.className).toContain("af-search-clear");

    fireEvent.click(clear);
    // 값 비우기 + 포커스 유지(버튼이 사라지므로 입력으로 되돌린다).
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole("button", { name: "검색어 지우기" })).toBeNull();
    expect(await screen.findByText("동네세탁")).toBeDefined();
  });

  /*
   * #46 후속: Enter 는 아무 동작도 하지 않고, "표시 초기화"는 더 보기로 늘어난
   * 표시 수만 첫 묶음(10)으로 되돌린다. 검색어를 바꾸지 않는다.
   */
  it("Enter 는 무동작이고 표시 초기화만 표시 수를 10 으로 되돌린다 (#46)", async () => {
    const groups = Array.from({ length: 12 }, (_, i) => ({
      merchantName: `가맹점${i + 1}`,
      count: 1,
      grossTotal: 10_000 * (12 - i),
      firstApprovedAt: "2026-09-01",
      lastApprovedAt: "2026-10-01",
    }));
    stubFetch(unclassifiedStub(groups));
    renderPage();

    const input = (await screen.findByLabelText("미분류 가맹점 검색")) as HTMLInputElement;
    const rows = () => screen.queryAllByRole("button", { name: / 분류 편집$/ }).length;
    await waitFor(() => expect(rows()).toBe(10));

    fireEvent.click(screen.getByRole("button", { name: /더 보기/ }));
    expect(rows()).toBe(12);

    // Enter — 표시 수·검색어 어느 것도 바뀌지 않는다.
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    fireEvent.keyUp(input, { key: "Enter", code: "Enter" });
    expect(rows()).toBe(12);
    expect(input.value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "표시 초기화" }));
    expect(rows()).toBe(10);
    // 초기화는 검색어를 지우지 않는다(그건 clear 버튼의 일이다).
    expect(input.value).toBe("");
  });

  it("미분류만 보기 필터는 분류된 행을 숨긴다 (§55.8)", async () => {
    stubFetch((path) => {
      if (path.includes("/card-imports/row-keys")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/card-imports/statements")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) {
        return apiResponse([
          { rowKey: "k1", approvedAt: "2026-10-01", merchantName: "분류된상점", supplyExVat: 4_500, vat: 500, grossAmount: 5_000, expenseKind: "식비" },
          { rowKey: "k2", approvedAt: "2026-10-02", merchantName: "미분류상점", supplyExVat: 9_000, vat: 1_000, grossAmount: 10_000, expenseKind: "" },
        ]);
      }
      return apiResponse({}, false, 500);
    });
    renderPage();

    expect(await screen.findByText("분류된상점")).toBeDefined();
    expect(screen.getByText("미분류상점")).toBeDefined();

    fireEvent.click(screen.getByRole("checkbox", { name: /미분류만 보기/ }));
    await waitFor(() => expect(screen.queryByText("분류된상점")).toBeNull());
    expect(screen.getByText("미분류상점")).toBeDefined();

    fireEvent.click(screen.getByRole("checkbox", { name: /미분류만 보기/ }));
    expect(await screen.findByText("분류된상점")).toBeDefined();
  });

  it("카테고리를 바꿔도 목록을 다시 읽지 않는다 (§55.8)", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      rowKey: `k${i + 1}`,
      approvedAt: `2026-10-${String(i + 1).padStart(2, "0")}`,
      merchantName: `가맹점${i + 1}`,
      supplyExVat: 9_000,
      vat: 1_000,
      grossAmount: 10_000,
      cardMasked: "1234",
      expenseKind: "",
      memberRelation: i % 2 === 0 ? "본인" : "가족",
    }));
    const fetchMock = stubFetch((path, init) => {
      if (path.includes("/card-imports/category") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        const row = rows.find((r) => r.rowKey === body.rowKey);
        return apiResponse({ rowKey: body.rowKey, merchantName: row?.merchantName, category: body.category, subCategory: body.subCategory ?? "", updatedRows: 1 });
      }
      if (path.includes("/card-imports/row-keys")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/card-imports/statements")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse(rows);
      return apiResponse({}, false, 500);
    });
    renderPage();

    await screen.findByText("가맹점1");
    // 본인/가족 구분 배지가 노출된다
    expect(screen.getAllByText("본인").length).toBeGreaterThan(0);
    expect(screen.getAllByText("가족").length).toBeGreaterThan(0);

    // 첫 번째 가맹점을 분류하면 PATCH 만 날아가고 카드 내역 GET 은 다시 일어나지 않는다
    // 분류 Select 는 행 탭으로 여는 편집 행에만 있다.
    fireEvent.click(await screen.findByRole("button", { name: "가맹점1 분류 편집" }));
    const combo = await screen.findByRole("combobox", { name: "가맹점1 카테고리" });
    fireEvent.mouseDown(combo);
    fireEvent.click(await screen.findByTitle("식비"));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((c) => (c[1]?.method ?? "GET") === "PATCH");
      expect(patch).toBeDefined();
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ rowKey: "k1", category: "식비", subCategory: "" });
    });

    // 목록이 재조회되지 않아 동일한 가맹점이 그대로 남는다
    const cardGets = fetchMock.mock.calls.filter(([url, init]) =>
      String(url).includes("/assets/card-imports")
      && !String(url).includes("/unclassified")
      && !String(url).includes("/row-keys")
      && !String(url).includes("/statements")
      && !String(url).includes("/by-card")
      && (init?.method ?? "GET") === "GET");
    expect(cardGets.length).toBe(1);
    expect(screen.getByText("가맹점1")).toBeDefined();
  });

  it("총계 라벨의 건수는 nowrap 으로 묶여 '건' 만 다음 줄에 남지 않는다 (#34 C-11)", async () => {
    stubFetch((path) => {
      if (path.includes("/card-imports/row-keys")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/card-imports/statements")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse([
        { rowKey: "k1", approvedAt: "2026-10-01", merchantName: "우아한형제들", supplyExVat: 37_273, vat: 3_727, grossAmount: 41_000, expenseKind: "식비" },
        { rowKey: "k2", approvedAt: "2026-10-02", merchantName: "GS25", supplyExVat: 2_909, vat: 291, grossAmount: 3_200, expenseKind: "식비" },
      ]);
      return apiResponse({}, false, 500);
    });
    renderPage();

    const summary = await screen.findByLabelText("이 달 카드 카테고리별 합계");
    const label = summary.querySelector("div > span");
    expect(label?.textContent).toContain("지출 합계");
    // 라벨은 어절 단위로만 끊고, "· 2건" 은 한 덩어리로 둔다.
    expect((label as HTMLElement).style.wordBreak).toBe("keep-all");
    const count = label?.querySelector("span");
    expect(count?.textContent).toBe("· 2건");
    expect((count as HTMLElement).style.whiteSpace).toBe("nowrap");
  });

  it("카드 업로드 패널이 카드내역 탭에 있다 (§58)", async () => {
    stubFetch((path) => {
      if (path.includes("/card-imports/row-keys")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/card-imports/statements")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse([]);
      return apiResponse({}, false, 500);
    });
    renderPage();

    expect(await screen.findByRole("heading", { name: "카드 내역 가져오기" })).toBeDefined();
    expect(await screen.findByTestId("card-file")).toBeDefined();
  });
});
