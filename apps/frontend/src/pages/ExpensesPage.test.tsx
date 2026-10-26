import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExpensesPage } from "./ExpensesPage";
import { clearInflight } from "../api/client";
import { clearToken, saveToken } from "../auth/authStore";

/**
 * #36 AC: 지출 화면 — 항목 로드·추가·삭제, 수입 입력·월 확정, 401, 빈 상태.
 * fetch 는 §38/§43/§44 포맷의 대역 — 타이밍 운 없이 resolve로 검증한다.
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

/** 표(데스크톱 경로)를 렌더하려면 matchMedia 가 데스크톱으로 응답해야 한다. */
function setViewport(desktop: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: desktop,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }),
  });
}

describe("ExpensesPage (스프린트 3 #36)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    clearInflight();
    setViewport(false);
  });

  beforeEach(() => {
    clearToken();
    saveToken("tok", Date.now() + 60_000);
  });

  it("월 지출 항목과 목록 합계를 행에서 계산해 보여준다 (§34.6)", async () => {
    stubFetch((path) => {
      if (path.includes("/expenses/recurring")) return apiResponse([]);
      if (path.includes("/expenses/items")) return apiResponse([
        { id: 1, month: "2026-10", label: "임대료", amount: 1_200_000, isEssential: true, purchaseVat: 0 },
        { id: 2, month: "2026-10", label: "주유비", amount: 150_000, isEssential: false, purchaseVat: 13_636 },
      ]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse([]);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenSettings={() => {}} />);

    expect(await screen.findByText("임대료")).toBeDefined();
    expect(await screen.findByText("주유비")).toBeDefined();
    // 목록 합계 1,350,000 — 행에서 재계산
    expect(await screen.findByText("합계 (2항목)")).toBeDefined();
    expect(screen.getAllByText("1,350,000원").length).toBeGreaterThan(0);
    // 필수 합계 1,200,000
    expect(screen.getAllByText(/필수/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1,200,000원/).length).toBeGreaterThan(0);
  });

  it("항목 추가는 POST로 반영되고 목록이 재조회된다", async () => {
    const fetchMock = stubFetch((path, init) => {
      if (path.includes("/expenses/items") && init?.method === "POST") {
        return apiResponse({ id: 9, month: "2026-10", label: "통신비", amount: 60_000, isEssential: true, purchaseVat: 0 });
      }
      if (path.includes("/expenses/recurring")) return apiResponse([]);
      if (path.includes("/expenses/items")) {
        return apiResponse([
          { id: 9, month: "2026-10", label: "통신비", amount: 60_000, isEssential: true, purchaseVat: 0 },
        ]);
      }
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse([]);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenSettings={() => {}} />);

    await screen.findByText("통신비");
    const name = screen.getByLabelText("항목 이름") as HTMLInputElement;
    const amount = screen.getByLabelText("월 금액") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "구독료" } });
    fireEvent.change(amount, { target: { value: "20000" } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/expenses/items?month="), expect.objectContaining({ method: "POST" })));
  });

  it("수입 입력 후 월 확정은 PUT으로 스냅샷을 갱신해 표시한다 (§44)", async () => {
    const fetchMock = stubFetch((path, init) => {
      if (path.includes("/expenses/snapshots") && init?.method === "PUT") {
        return apiResponse({
          month: "2026-10", totalAssets: 761_200_000, totalDebts: 69_355_560,
          income: 8_200_000, expenses: 1_350_000, essentialExpenses: 1_200_000, essentialComplete: true,
        });
      }
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      if (path.includes("/expenses/recurring")) return apiResponse([]);
      if (path.includes("/expenses/items")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse([]);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenSettings={() => {}} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const income = screen.getByLabelText("이번 달 수입") as HTMLInputElement;
    fireEvent.change(income, { target: { value: "8200000" } });
    fireEvent.click(screen.getByRole("button", { name: "월 확정" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/expenses/snapshots?month="), expect.objectContaining({ method: "PUT" })));
    expect(await screen.findByText(/확정됨 2026-10/)).toBeDefined();
    expect(screen.getAllByText(/1,350,000원/).length).toBeGreaterThan(0);
  });

  it("가져온 카드내역 표는 카드 원장에서 렌더한다 (§41)", async () => {
    stubFetch((path) => {
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse([
        { rowKey: "k1", approvedAt: "2026-10-01", merchantName: "우아한형제들", supplyExVat: 37_273, vat: 3_727, grossAmount: 41_000 },
        { rowKey: "k2", approvedAt: "2026-10-02", merchantName: "GS25", supplyExVat: 2_909, vat: 291, grossAmount: 3_200 },
      ]);
      if (path.includes("/expenses/recurring")) return apiResponse([]);
      if (path.includes("/expenses/items")) return apiResponse([]);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenSettings={() => {}} />);

    expect(await screen.findByText("우아한형제들")).toBeDefined();
    expect(screen.getByText("GS25")).toBeDefined();
    // 합계(행 재계산): 41,000 + 3,200 = 44,200원
    expect(screen.getAllByText("44,200원").length).toBeGreaterThan(0);
  });

  it("API 실패 시 카드 단위 오류와 재시도가 뜬다 (§26 재사용)", async () => {
    stubFetch((path) => {
      if (path.includes("/expenses/recurring")) return apiResponse([]);
      if (path.includes("/expenses/items")) return apiResponse({}, false, 500);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse([], true, 200);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenSettings={() => {}} />);

    const alerts = await screen.findAllByText(/오류|실패|다시 시도|재시도|문제/i);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("미인증 401은 인증 오류 문구로 구분된다 (§26 연동 기준)", async () => {
    stubFetch((path) => {
      if (path.includes("/expenses/recurring")) return apiResponse([]);
      if (path.includes("/expenses/items")) {
        return { ok: false, status: 401, json: async () => ({ code: "AUTH_REQUIRED", message: "Authentication required", details: "", timestamp: "" }) } as Response;
      }
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse([]);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenSettings={() => {}} />);

    await screen.findAllByText(/인증|로그인/i);
  });

  it("정기 항목 칩이 정의를 보여주고, 행에 정기 배지가 붙는다 (§45)", async () => {
    stubFetch((path) => {
      if (path.includes("/expenses/recurring")) return apiResponse([
        { id: 3, label: "임대료", amount: 1_200_000, isEssential: true, purchaseVat: 0, startMonth: "2026-10", endMonth: null },
      ]);
      if (path.includes("/expenses/items")) return apiResponse([
        { id: 7, month: "2026-10", label: "임대료", amount: 1_200_000, isEssential: true, purchaseVat: 0, recurringId: 3 },
      ]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse([]);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenSettings={() => {}} />);

    expect(await screen.findByText(/무기한/)).toBeDefined();
    expect(await screen.findByText("정기")).toBeDefined();
    expect(screen.queryByText("수동")).toBeNull();
  });

  it("정기 정의 금액과 다른 행에는 '이 달만 수정' 표시가 붙는다", async () => {
    stubFetch((path) => {
      if (path.includes("/expenses/recurring")) return apiResponse([
        { id: 3, label: "임대료", amount: 200_000, isEssential: true, purchaseVat: 0, startMonth: "2026-10", endMonth: null },
      ]);
      if (path.includes("/expenses/items")) return apiResponse([
        { id: 7, month: "2026-10", label: "임대료", amount: 1_200_000, isEssential: true, purchaseVat: 0, recurringId: 3 },
      ]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse([]);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenSettings={() => {}} />);

    expect(await screen.findByText("이 달만 수정")).toBeDefined();
  });

  it("빈 월에서 지난달 복사 배너가 제안되고 클릭 시 POST copy가 불린다 (§45.4)", async () => {
    const fetchMock = stubFetch((path) => {
      if (path.includes("/items/copy")) return apiResponse(2);
      if (path.includes("/expenses/recurring")) return apiResponse([]);
      if (path.includes("/expenses/items?month=2026-09")) return apiResponse([
        { id: 1, month: "2026-09", label: "주유비", amount: 100_000, isEssential: false, purchaseVat: 0 },
        { id: 2, month: "2026-09", label: "통신비", amount: 60_000, isEssential: true, purchaseVat: 0 },
      ]);
      if (path.includes("/expenses/items")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse([]);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenSettings={() => {}} />);

    await screen.findByText(/지난달\(2026-09\)/);
    fireEvent.click(screen.getByRole("button", { name: "지난달 항목 가져오기" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/expenses/items/copy?from=2026-09&to=2026-10"), expect.objectContaining({ method: "POST" })));
  });

  it("정기 항목 추가 폼이 열리고 저장 시 POST recurring가 불린다", async () => {
    const fetchMock = stubFetch((path, init) => {
      if (path.includes("/expenses/recurring") && init?.method === "POST") {
        return apiResponse({ id: 5, label: "통신비", amount: 60_000, isEssential: true, purchaseVat: 0, startMonth: "2026-10", endMonth: null });
      }
      if (path.includes("/expenses/recurring")) return apiResponse([]);
      if (path.includes("/expenses/items")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse([]);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenSettings={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "+ 정기 항목 추가" }));
    const name = screen.getByLabelText("정기 항목 이름") as HTMLInputElement;
    const amount = screen.getByLabelText("정기 월 금액") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "통신비" } });
    fireEvent.change(amount, { target: { value: "60000" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/expenses/recurring", expect.objectContaining({ method: "POST" })));
  });

  it("수동 항목에서 고정지출로 등록하면 폼이 채워지고 POST recurring로 저장된다 (§45.5)", async () => {
    const fetchMock = stubFetch((path, init) => {
      if (path.includes("/expenses/recurring") && init?.method === "POST") {
        return apiResponse({ id: 8, label: "DB손해보험", amount: 34160, isEssential: true, purchaseVat: 0, startMonth: "2026-10", endMonth: null });
      }
      if (path.includes("/expenses/recurring")) return apiResponse([]);
      if (path.includes("/expenses/items")) return apiResponse([
        { id: 9, month: "2026-10", label: "DB손해보험", amount: 34160, isEssential: true, purchaseVat: 0, recurringId: null },
      ]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse([]);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenSettings={() => {}} />);

    // 이슈 #70: 행 액션 접근 이름에 항목명이 결합된다 ("편집" 중복 라벨 문제 해소)
    fireEvent.click(await screen.findByRole("button", { name: "DB손해보험 정기 항목으로 등록" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/expenses/items/9/convert-to-recurring", expect.objectContaining({ method: "POST" })));
  });

  it("카테고리 자동 분류 버튼은 reclassify 를 호출하고 결과를 안내한다 (§55.8)", async () => {
    const fetchMock = stubFetch((path, init) => {
      if (path.includes("/card-imports/reclassify") && init?.method === "POST") {
        return apiResponse({ total: 12, updated: 7 });
      }
      if (path.includes("/expenses/recurring")) return apiResponse([]);
      if (path.includes("/expenses/items")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) {
        return apiResponse([
          { rowKey: "k1", approvedAt: "2026-10-01", merchantName: "스타벅스 강남점", supplyExVat: 4500, vat: 500, grossAmount: 5000, cardMasked: "1234", expenseKind: "식비" },
        ]);
      }
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenSettings={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "카테고리 자동 분류" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/assets/card-imports/reclassify",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(await screen.findByText(/12건 중 7건을 자동 분류했습니다/)).toBeDefined();
    // 재분류 후 카드 내역을 다시 읽어 카테고리 열과 카테고리별 합계가 갱신된다
    expect((await screen.findAllByText(/식비/)).length).toBeGreaterThan(0);
    expect(await screen.findByText("카테고리별 합계")).toBeDefined();
  });

  it("미분류 작업함에서 가맹점을 지정하면 그 자리에서 사라지고 되돌릴 수 있다 (§55.8)", async () => {
    const fetchMock = stubFetch((path, init) => {
      if (path.includes("/card-imports/merchant-category") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return apiResponse({ merchantName: body.merchantName, category: body.category, subCategory: body.subCategory ?? "", updatedRows: 2 });
      }
      if (path.includes("/expenses/recurring")) return apiResponse([]);
      if (path.includes("/expenses/items")) return apiResponse([]);
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
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenSettings={() => {}} />);

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
      if (path.includes("/expenses/recurring")) return apiResponse([]);
      if (path.includes("/expenses/items")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) {
        return apiResponse([
          { rowKey: "k1", approvedAt: "2026-10-01", merchantName: "분류된상점", supplyExVat: 4_500, vat: 500, grossAmount: 5_000, expenseKind: "식비" },
          { rowKey: "k2", approvedAt: "2026-10-02", merchantName: "미분류상점", supplyExVat: 9_000, vat: 1_000, grossAmount: 10_000, expenseKind: "" },
        ]);
      }
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenSettings={() => {}} />);

    expect(await screen.findByText("분류된상점")).toBeDefined();
    expect(screen.getByText("미분류상점")).toBeDefined();

    fireEvent.click(screen.getByRole("checkbox", { name: /미분류만 보기/ }));
    await waitFor(() => expect(screen.queryByText("분류된상점")).toBeNull());
    expect(screen.getByText("미분류상점")).toBeDefined();

    fireEvent.click(screen.getByRole("checkbox", { name: /미분류만 보기/ }));
    expect(await screen.findByText("분류된상점")).toBeDefined();
  });

  it("카테고리를 바꿔도 표를 다시 읽지 않아 페이지가 유지된다 (§55.8)", async () => {
    setViewport(true);
    const rows = Array.from({ length: 12 }, (_, i) => ({
      rowKey: `k${i + 1}`,
      approvedAt: `2026-10-${String(i + 1).padStart(2, "0")}`,
      merchantName: `가맹점${i + 1}`,
      supplyExVat: 9_000,
      vat: 1_000,
      grossAmount: 10_000,
      cardMasked: "1234",
      expenseKind: "",
    }));
    const fetchMock = stubFetch((path, init) => {
      if (path.includes("/card-imports/category") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        const row = rows.find((r) => r.rowKey === body.rowKey);
        return apiResponse({ rowKey: body.rowKey, merchantName: row?.merchantName, category: body.category, subCategory: body.subCategory ?? "", updatedRows: 1 });
      }
      if (path.includes("/expenses/recurring")) return apiResponse([]);
      if (path.includes("/expenses/items")) return apiResponse([]);
      if (path.includes("/assets/card-imports/unclassified")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse(rows);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenSettings={() => {}} />);

    // 2페이지로 이동
    await screen.findByText("가맹점1");
    fireEvent.click(await screen.findByTitle("2"));
    expect(await screen.findByText("가맹점12")).toBeDefined();

    // 2페이지의 행 하나를 분류
    const combo = await screen.findByRole("combobox", { name: "가맹점11 카테고리" });
    fireEvent.mouseDown(combo);
    fireEvent.click(await screen.findByTitle("식비"));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((c) => (c[1]?.method ?? "GET") === "PATCH");
      expect(patch).toBeDefined();
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ rowKey: "k11", category: "식비", subCategory: "" });
    });

    // 재조회 없음 + 2페이지 그대로 (가맹점12 가 계속 보인다)
    const cardGets = fetchMock.mock.calls.filter(([url, init]) =>
      String(url).includes("/assets/card-imports")
      && !String(url).includes("/unclassified")
      && (init?.method ?? "GET") === "GET");
    expect(cardGets.length).toBe(1);
    expect(screen.getByText("가맹점12")).toBeDefined();
  });
});
