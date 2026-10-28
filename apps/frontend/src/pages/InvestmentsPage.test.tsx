import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InvestmentsPage } from "./InvestmentsPage";
import { clearInflight } from "../api/client";
import { clearToken, saveToken } from "../auth/authStore";

/** §38 표준 포맷 대역. */
function apiResponse(data: unknown, ok = true, status = 200): Response {
  const body = ok
    ? { code: "OK", message: "loaded", data }
    : { code: "INVALID_REQUEST", message: "bad request", details: "", timestamp: "" };
  return { ok, status, json: async () => body } as Response;
}

/** §54.2·§54.3 백엔드 시드와 같은 값 — 총액 3,100만 · 2,350만. */
function portfolioFixture() {
  return {
    holdings: [
      {
        id: 1, accountId: 4, assetClass: "stock", symbol: "005930", name: "삼성전자",
        currency: "KRW", quantity: 200, avgPrice: 70000, marketPrice: 75000, fxRate: 1,
        priceAsOf: "2026-10-24",
      },
      {
        id: 2, accountId: 4, assetClass: "etf", symbol: "069500", name: "KODEX 200",
        currency: "KRW", quantity: 300, avgPrice: 30000, marketPrice: 32000, fxRate: 1,
        priceAsOf: "2026-10-24",
      },
      {
        id: 3, accountId: 4, assetClass: "bond", symbol: "114260", name: "국고채 10년",
        currency: "KRW", quantity: 100, avgPrice: 50000, marketPrice: 51000, fxRate: 1,
        priceAsOf: "2026-10-24",
      },
      {
        id: 4, accountId: 5, assetClass: "stock", symbol: "AAPL", name: "애플",
        currency: "USD", quantity: 100, avgPrice: 150, marketPrice: 180, fxRate: 1300,
        priceAsOf: "2026-10-24",
      },
    ],
    accounts: [
      {
        accountId: 4, accountName: "키움 투자금", institutionName: "키움증권",
        cashBalance: 1_300_000, holdingsValue: 29_700_000, totalValue: 31_000_000,
      },
      {
        accountId: 5, accountName: "미국주식", institutionName: "",
        cashBalance: 100_000, holdingsValue: 23_400_000, totalValue: 23_500_000,
      },
    ],
  };
}

function zeroCostFixture() {
  return {
    holdings: [
      {
        id: 9, accountId: 4, assetClass: "crypto", symbol: "BTC", name: "비트코인",
        currency: "KRW", quantity: 0.5, avgPrice: 0, marketPrice: 46_000_000, fxRate: 1,
        priceAsOf: "2026-10-24",
      },
    ],
    accounts: [
      {
        accountId: 4, accountName: "키움 투자금", institutionName: "키움증권",
        cashBalance: 0, holdingsValue: 23_000_000, totalValue: 23_000_000,
      },
    ],
  };
}

describe("InvestmentsPage (§54 E2)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    clearInflight();
  });

  beforeEach(() => {
    clearToken();
    saveToken("tok", Date.now() + 60_000);
    fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      if (path.includes("/investments/holdings") && method === "PUT") {
        return Promise.resolve(apiResponse({}));
      }
      if (path.includes("/investments/holdings") && method === "POST") {
        return Promise.resolve(apiResponse({ id: 99 }));
      }
      if (path.includes("/investments/holdings") && method === "DELETE") {
        return Promise.resolve(apiResponse(9));
      }
      if (path.includes("/investments/holdings")) {
        return Promise.resolve(apiResponse(portfolioFixture()));
      }
      // §54.3: 투자 계좌(예수금) 편집·삭제는 자산 계정 API 를 쓴다.
      if (path.includes("/assets/accounts") && method === "PUT") {
        return Promise.resolve(apiResponse({ id: 4 }));
      }
      if (path.includes("/assets/accounts") && method === "DELETE") {
        return Promise.resolve(apiResponse(4));
      }
      return Promise.resolve(apiResponse({}, false, 400));
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("요약·계좌 그룹·종목을 보여 준다 (총액 = 예수금 + 평가액)", async () => {
    render(<InvestmentsPage />);

    expect(await screen.findByText("삼성전자")).toBeDefined();
    expect(screen.getByText("애플")).toBeDefined();
    // 총 평가액 = 15,000,000 + 9,600,000 + 5,100,000 + 23,400,000
    expect(screen.getByText("53,100,000원")).toBeDefined();
    // 예수금 합계 1,300,000 + 100,000
    expect(screen.getByText("1,400,000원")).toBeDefined();
    expect(screen.getByText("키움 투자금 · 키움증권")).toBeDefined();
    expect(screen.getByText("예수금 1,300,000원 · 총액 31,000,000원")).toBeDefined();
    // 기준일은 보유종목의 최신값
    expect(screen.getByText("기준일 2026-10-24")).toBeDefined();
  });

  it("보유종목이 없으면 빈 상태를 보여 주고, 추가 폼을 열 수 있다", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve(apiResponse({
        holdings: [],
        accounts: [
          {
            accountId: 4, accountName: "키움 투자금", institutionName: "키움증권",
            cashBalance: 0, holdingsValue: 0, totalValue: 0,
          },
        ],
      })),
    ));
    render(<InvestmentsPage />);

    expect(
      await screen.findByText("보유종목이 없습니다 — '+ 종목 추가'로 시작하세요"),
    ).toBeDefined();

    // 빈 상태에서도 추가 폼이 열려야 한다 (Empty 가 폼을 가리지 않는다)
    fireEvent.click(screen.getByRole("button", { name: "+ 종목 추가" }));
    expect(await screen.findByLabelText("종목명")).toBeDefined();
  });

  it("자산군 필터는 해당 종목만 남기고, 없으면 계좌별 안내를 보여 준다", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    fireEvent.click(screen.getByRole("button", { name: "코인" }));

    expect(screen.queryByText("삼성전자")).toBeNull();
    expect(screen.getAllByText("이 계좌에 해당 자산군 종목이 없습니다.").length).toBe(2);
  });

  it("종목 추가는 POST 로 저장하고 목록을 다시 읽는다", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    fireEvent.click(screen.getByRole("button", { name: "+ 종목 추가" }));
    fireEvent.change(await screen.findByLabelText("종목명"), { target: { value: "테스트주" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST",
      );
      expect(post).toBeDefined();
      expect(String(post?.[0])).toContain("/api/v1/investments/holdings");
      expect(String((post?.[1] as RequestInit).body)).toContain("테스트주");
    });
  });

  it("삭제는 DELETE 로 반영된다", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    const deleteButtons = screen.getAllByRole("button", { name: "삭제" });
    const firstDelete = deleteButtons[0];
    if (!firstDelete) throw new Error("삭제 버튼 없음");
    fireEvent.click(firstDelete);
    // Popconfirm 확인 버튼 — 기본 로케일 OK
    fireEvent.click(await screen.findByRole("button", { name: "OK" }));

    await waitFor(() => {
      const del = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
      );
      expect(del).toBeDefined();
      expect(String(del?.[0])).toContain("/api/v1/investments/holdings/1");
    });
  });

  it("계좌 헤더에서 예수금을 편집한다 — balance 는 총액이 아니라 예수금이다 (§54.3)", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("키움 투자금 · 키움증권");

    fireEvent.click(screen.getByRole("button", { name: "키움 투자금 계좌 편집" }));
    fireEvent.change(await screen.findByLabelText("예수금"), { target: { value: "2000000" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes("/assets/accounts/4") &&
          (init as RequestInit | undefined)?.method === "PUT",
      );
      expect(put).toBeDefined();
      expect(JSON.parse(String((put?.[1] as RequestInit).body))).toMatchObject({
        accountType: "invest",
        name: "키움 투자금",
        balance: 2_000_000,
        isDebt: false,
      });
    });
  });

  it("계좌 삭제는 보유종목 건수를 함께 경고하고 DELETE 로 반영된다", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("키움 투자금 · 키움증권");

    fireEvent.click(screen.getByRole("button", { name: "키움 투자금 계좌 삭제" }));
    expect(await screen.findByText("보유종목 3건도 함께 삭제됩니다")).toBeDefined();

    fireEvent.click(await screen.findByRole("button", { name: "OK" }));

    await waitFor(() => {
      const del = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes("/assets/accounts/4") &&
          (init as RequestInit | undefined)?.method === "DELETE",
      );
      expect(del).toBeDefined();
    });
  });

  it("가격 갱신은 현재가를 인라인 편집해 변경분만 PUT 으로 저장한다 (§54.4)", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    fireEvent.click(screen.getByRole("button", { name: "가격 갱신" }));
    const priceInput = screen.getByLabelText("삼성전자 현재가");
    fireEvent.change(priceInput, { target: { value: "80000" } });
    fireEvent.click(screen.getByRole("button", { name: "가격 저장" }));

    await waitFor(() => {
      const puts = fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === "PUT",
      );
      expect(puts.length).toBe(1); // 바꾼 1건만 저장한다
      const body = JSON.parse(String((puts[0]?.[1] as RequestInit).body));
      expect(body.marketPrice).toBe(80000);
      // 수동 시세 갱신이므로 기준일은 저장 시점(오늘)이다
      expect(body.priceAsOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("원금이 0이면 수익률을 0%가 아니라 — 로 표시한다 (§54.4)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(apiResponse(zeroCostFixture()))));
    render(<InvestmentsPage />);

    expect(await screen.findByText("비트코인")).toBeDefined();
    // 원금 0이면 요약 수익률은 "—" (0%·NaN 아님, §54.4)
    const summary = screen.getByText("평가손익").parentElement as HTMLElement;
    expect(summary.textContent).toContain("—");
    expect(summary.textContent).not.toContain("NaN");
  });
});
