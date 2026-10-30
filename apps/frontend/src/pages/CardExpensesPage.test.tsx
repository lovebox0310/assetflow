import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CardExpensesPage } from "./CardExpensesPage";
import { clearInflight } from "../api/client";
import { clearToken, saveToken } from "../auth/authStore";

/**
 * §58 — 지출 화면에서 분리한 카드내역 탭.
 * 카드 원장 렌더·카테고리 분류·미분류 작업함·필터가 이 화면에서 동작한다.
 */

type Handler = (path: string, init?: RequestInit) => Response | Promise<Response>;

function stubFetch(handler: Handler) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function apiResponse(data: unknown, ok = true, status = 200): Response {
  const body = ok
    ? { code: "OK", message: "loaded", data }
    : { code: "INVALID_REQUEST", message: "Invalid request", details: "", timestamp: "" };
  return { ok, status, json: async () => body } as Response;
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

  it("카드 원장이 실패하면 카드 단위 오류와 재시도가 뜬다 (§26 재사용)", async () => {
    stubFetch((path) => {
      if (path.includes("/card-imports/row-keys")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
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

  it("미분류만 보기 필터는 분류된 행을 숨긴다 (§55.8)", async () => {
    stubFetch((path) => {
      if (path.includes("/card-imports/row-keys")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
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
      if (path.includes("/assets/card-imports")) return apiResponse(rows);
      return apiResponse({}, false, 500);
    });
    renderPage();

    await screen.findByText("가맹점1");
    // 본인/가족 구분 배지가 노출된다
    expect(screen.getAllByText("본인").length).toBeGreaterThan(0);
    expect(screen.getAllByText("가족").length).toBeGreaterThan(0);

    // 첫 번째 가맹점을 분류하면 PATCH 만 날아가고 카드 내역 GET 은 다시 일어나지 않는다
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
      && (init?.method ?? "GET") === "GET");
    expect(cardGets.length).toBe(1);
    expect(screen.getByText("가맹점1")).toBeDefined();
  });

  it("카드 업로드 패널이 카드내역 탭에 있다 (§58)", async () => {
    stubFetch((path) => {
      if (path.includes("/card-imports/row-keys")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse([]);
      return apiResponse({}, false, 500);
    });
    renderPage();

    expect(await screen.findByRole("heading", { name: "카드 내역 가져오기" })).toBeDefined();
    expect(await screen.findByTestId("card-file")).toBeDefined();
  });
});
