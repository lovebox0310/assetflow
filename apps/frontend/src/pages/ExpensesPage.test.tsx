import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExpensesPage } from "./ExpensesPage";
import { clearInflight } from "../api/client";
import { clearToken, saveToken } from "../auth/authStore";

/**
 * #36 AC: 지출 화면 — 항목 로드·추가·삭제, 수입 입력·월 확정, 401, 빈 상태.
 * 카드내역·미분류 정리는 §58 에서 CardExpensesPage 로 분리했다.
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

function renderPage(overrides: Partial<Parameters<typeof ExpensesPage>[0]> = {}) {
  return render(
    <ExpensesPage
      month="2026-10"
      onMonthChange={() => {}}
      onOpenDashboard={() => {}}
      onOpenAssets={() => {}}
      onOpenCards={() => {}}
      onOpenSettings={() => {}}
      {...overrides}
    />,
  );
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
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    renderPage();

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
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    renderPage();

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
      return apiResponse({}, false, 500);
    });
    renderPage();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const income = screen.getByLabelText("이번 달 수입") as HTMLInputElement;
    fireEvent.change(income, { target: { value: "8200000" } });
    fireEvent.click(screen.getByRole("button", { name: "월 확정" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/expenses/snapshots?month="), expect.objectContaining({ method: "PUT" })));
    expect(await screen.findByText(/확정됨 2026-10/)).toBeDefined();
    expect(screen.getAllByText(/1,350,000원/).length).toBeGreaterThan(0);
  });

  it("API 실패 시 카드 단위 오류와 재시도가 뜬다 (§26 재사용)", async () => {
    stubFetch((path) => {
      if (path.includes("/expenses/recurring")) return apiResponse([]);
      if (path.includes("/expenses/items")) return apiResponse({}, false, 500);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    renderPage();

    const alerts = await screen.findAllByText(/오류|실패|다시 시도|재시도|문제/i);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("미인증 401은 인증 오류 문구로 구분된다 (§26 연동 기준)", async () => {
    stubFetch((path) => {
      if (path.includes("/expenses/recurring")) return apiResponse([]);
      if (path.includes("/expenses/items")) {
        return { ok: false, status: 401, json: async () => ({ code: "AUTH_REQUIRED", message: "Authentication required", details: "", timestamp: "" }) } as Response;
      }
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    renderPage();

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
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    renderPage();

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
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    renderPage();

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
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    renderPage();

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
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    renderPage();

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
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    renderPage();

    // 이슈 #70: 행 액션 접근 이름에 항목명이 결합된다 ("편집" 중복 라벨 문제 해소)
    fireEvent.click(await screen.findByRole("button", { name: "DB손해보험 정기 항목으로 등록" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/expenses/items/9/convert-to-recurring", expect.objectContaining({ method: "POST" })));
  });

  it("카드내역 탭을 누르면 상위 화면 이동 콜백이 불린다 (§58)", async () => {
    stubFetch((path) => {
      if (path.includes("/expenses/recurring")) return apiResponse([]);
      if (path.includes("/expenses/items")) return apiResponse([]);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    const onOpenCards = vi.fn();
    renderPage({ onOpenCards });

    fireEvent.click(await screen.findByRole("button", { name: "카드내역 탭" }));
    expect(onOpenCards).toHaveBeenCalled();
  });

  it("월 선택을 바꾸면 상위(App)의 월 상태를 갱신한다", async () => {
    stubFetch((path) => {
      if (path.includes("/expenses/recurring")) return apiResponse([]);
      if (path.includes("/expenses/items")) return apiResponse([]);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    const onMonthChange = vi.fn();
    renderPage({ onMonthChange });

    const combo = await screen.findByRole("combobox", { name: "조회 월" });
    fireEvent.mouseDown(combo);
    fireEvent.click(await screen.findByTitle("2026-09"));
    // antd Select 는 (value, option) 두 인자로 onChange 를 부른다 — 첫 인자만 본다.
    expect(onMonthChange.mock.calls[0]?.[0]).toBe("2026-09");
  });
});
