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

describe("ExpensesPage (스프린트 3 #36)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    clearInflight();
  });

  beforeEach(() => {
    clearToken();
    saveToken("tok", Date.now() + 60_000);
  });

  it("월 지출 항목과 목록 합계를 행에서 계산해 보여준다 (§34.6)", async () => {
    stubFetch((path) => {
      if (path.includes("/expenses/items")) return apiResponse([
        { id: 1, month: "2026-10", label: "임대료", amount: 1_200_000, isEssential: true, purchaseVat: 0 },
        { id: 2, month: "2026-10", label: "주유비", amount: 150_000, isEssential: false, purchaseVat: 13_636 },
      ]);
      if (path.includes("/assets/card-imports")) return apiResponse([]);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} />);

    expect(await screen.findByText("임대료")).toBeDefined();
    expect(await screen.findByText("주유비")).toBeDefined();
    // 목록 합계 1,350,000 — 행에서 재계산
    expect(await screen.findByText("목록 합계 (2항목)")).toBeDefined();
    expect(screen.getAllByText("1,350,000원").length).toBeGreaterThan(0);
    // 필수 합계 1,200,000
    expect(screen.getAllByText("필수 1,200,000원").length).toBeGreaterThan(0);
  });

  it("항목 추가는 POST로 반영되고 목록이 재조회된다", async () => {
    const fetchMock = stubFetch((path, init) => {
      if (path.includes("/expenses/items") && init?.method === "POST") {
        return apiResponse({ id: 9, month: "2026-10", label: "통신비", amount: 60_000, isEssential: true, purchaseVat: 0 });
      }
      if (path.includes("/expenses/items")) {
        return apiResponse([
          { id: 9, month: "2026-10", label: "통신비", amount: 60_000, isEssential: true, purchaseVat: 0 },
        ]);
      }
      if (path.includes("/assets/card-imports")) return apiResponse([]);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} />);

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
      if (path.includes("/expenses/items")) return apiResponse([]);
      if (path.includes("/assets/card-imports")) return apiResponse([]);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} />);

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
      if (path.includes("/assets/card-imports")) return apiResponse([
        { rowKey: "k1", approvedAt: "2026-10-01", merchantName: "우아한형제들", supplyExVat: 37_273, vat: 3_727, grossAmount: 41_000 },
        { rowKey: "k2", approvedAt: "2026-10-02", merchantName: "GS25", supplyExVat: 2_909, vat: 291, grossAmount: 3_200 },
      ]);
      if (path.includes("/expenses/items")) return apiResponse([]);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} />);

    expect(await screen.findByText("우아한형제들")).toBeDefined();
    expect(screen.getByText("GS25")).toBeDefined();
    // 합계(행 재계산): 41,000 + 3,200 = 44,200원
    expect(screen.getAllByText("44,200원").length).toBeGreaterThan(0);
  });

  it("API 실패 시 카드 단위 오류와 재시도가 뜬다 (§26 재사용)", async () => {
    stubFetch((path) => {
      if (path.includes("/expenses/items")) return apiResponse({}, false, 500);
      if (path.includes("/assets/card-imports")) return apiResponse([], true, 200);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} />);

    const alerts = await screen.findAllByText(/오류|실패|다시 시도|재시도|문제/i);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("미인증 401은 인증 오류 문구로 구분된다 (§26 연동 기준)", async () => {
    stubFetch((path) => {
      if (path.includes("/expenses/items")) {
        return { ok: false, status: 401, json: async () => ({ code: "AUTH_REQUIRED", message: "Authentication required", details: "", timestamp: "" }) } as Response;
      }
      if (path.includes("/assets/card-imports")) return apiResponse([]);
      if (path.includes("/expenses/snapshots")) return apiResponse(null);
      return apiResponse({}, false, 500);
    });
    render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} />);

    await screen.findAllByText(/인증|로그인/i);
  });
});
