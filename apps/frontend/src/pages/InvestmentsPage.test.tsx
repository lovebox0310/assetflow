import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { InvestmentsPage } from "./InvestmentsPage";
import { clearInflight } from "../api/client";
import { clearToken, saveToken } from "../auth/authStore";

// 채권 보조 API 는 fetch 가 아니라 모듈 함수로 모킹한다 — 테스트가 실제 네트워크를
// 타지 않고, 디바운스 뒤 호출되는 검색도 즉시 결정되게 한다.
const { searchBondsMock, fetchBondIssueInfoMock, fetchBondValuationMock } = vi.hoisted(() => ({
  searchBondsMock: vi.fn(),
  fetchBondIssueInfoMock: vi.fn(),
  fetchBondValuationMock: vi.fn(),
}));

vi.mock("../api/investmentsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/investmentsApi")>();
  return {
    ...actual,
    searchBonds: searchBondsMock,
    fetchBondIssueInfo: fetchBondIssueInfoMock,
    fetchBondValuation: fetchBondValuationMock,
    /*
     * #58: 화면이 진입 시 sync-status 를 확인한다. 테스트 기본값은 "대상 없음" —
     * 자동 동기화가 끼어들어 기존 단언(모달·포커스)의 타이밍을 흔들지 않게 한다.
     * 대상이 있는 경우는 이 파일의 전용 테스트에서 개별로 덮어쓴다.
     */
    getSyncStatus: vi.fn().mockResolvedValue({ due: 0, providers: [] }),
    syncDue: vi.fn().mockResolvedValue({ due: 0, outcomes: [] }),
  };
});

/** §38 표준 포맷 대역. */
/** 자산군 Select 에서 "채권" 옵션을 고른다 — 목록 부제(title="채권")와 겹치지 않게 드롭다운 한정. */
async function selectBondClass() {
  const option = await waitFor(() => {
    const found = document.querySelector<HTMLElement>(
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="채권"]',
    );
    if (!found) throw new Error("채권 option not found");
    return found;
  });
  fireEvent.click(option);
}

/**
 * 섹션 액션 열기(INV-01). jsdom 의 matchMedia 는 `matches:false` 라 항상 좁은 화면
 * 분기로 렌더된다 — 시세 새로고침·가격 갱신·업비트 동작은 `⋯` 메뉴 안에 있다.
 * 보조 동작이므로 "+ 종목 추가" 는 직접 버튼으로 남는다.
 */
async function clickSectionMenu(label: string) {
  fireEvent.click(screen.getByRole("button", { name: "보유종목 메뉴" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: label }));
}

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
    searchBondsMock.mockReset();
    fetchBondIssueInfoMock.mockReset();
    fetchBondValuationMock.mockReset();
    searchBondsMock.mockResolvedValue({ items: [], warning: null });
    fetchBondIssueInfoMock.mockResolvedValue({
      issuerName: null, couponRate: null, issueDate: null, maturityDate: null,
      bondClass: null, creditRating: null, error: null,
    });
    fetchBondValuationMock.mockResolvedValue({
      pdno: null, name: null, asOf: null, unitPrice: null, evaluated: 0,
      avgYieldRate: null, kisUnitPrice: null, kbpUnitPrice: null,
      niceUnitPrice: null, fnpUnitPrice: null, error: "평가단가가 없습니다",
    });
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
      // §54.4 시세 — 서버가 네이버 금융을 대신 호출한다.
      if (path.includes("/investments/quotes/refresh") && method === "POST") {
        return Promise.resolve(apiResponse(portfolioFixture()));
      }
      if (path.includes("/investments/quotes") && method === "GET") {
        const isUsd = path.includes("AAPL");
        return Promise.resolve(apiResponse(isUsd
          ? {
              symbol: "AAPL", quoteSymbol: "AAPL.O", name: "애플", currency: "USD",
              price: 347.1, priceAsOf: "2026-10-27",
            }
          : {
              symbol: "005930", quoteSymbol: "005930", name: "삼성전자", currency: "KRW",
              price: 244_000, priceAsOf: "2026-10-28",
            }));
      }
      if (path.includes("/investments/fx")) {
        return Promise.resolve(apiResponse({ currency: "USD", rate: 1339, priceAsOf: "2026-10-28" }));
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
    const amounts = screen.getByRole("group", { name: "키움 투자금 금액" });
    expect(within(amounts).getByText("1,300,000원")).toBeDefined();
    expect(within(amounts).getByText("31,000,000원")).toBeDefined();
    // 기준일은 보유종목의 최신값
    expect(screen.getByText("기준일 2026-10-24")).toBeDefined();
  });

  it("'업비트' 계좌가 있으면 상단 버튼 대신 계좌 메뉴에 연결 설정·동기화가 보인다", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/integrations/upbit")) {
        return Promise.resolve(apiResponse({ configured: true, accessKeyMasked: "abcd****efgh" }));
      }
      const fixture = portfolioFixture();
      return Promise.resolve(apiResponse({
        holdings: fixture.holdings,
        accounts: [
          ...fixture.accounts,
          {
            accountId: 6, accountName: "업비트", institutionName: "업비트",
            cashBalance: 0, holdingsValue: 0, totalValue: 0,
          },
        ],
      }));
    }));
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    // '업비트' 계좌가 생기면 부트스트랩 상단 버튼은 사라진다.
    expect(screen.queryByRole("button", { name: "업비트 연동" })).toBeNull();
    expect(screen.queryByRole("button", { name: "업비트에서 가져오기" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "업비트 메뉴" }));
    expect(await screen.findByText("업비트 연결 설정")).toBeDefined();
    expect(screen.getByText("잔고 동기화")).toBeDefined();
  });

  /* ── 이슈 #55 Stage 3: 토스 메뉴는 토스증권 계좌에서만 ───────────── */
  function accountsFixture(account: { accountId: number; accountName: string; institutionName: string }) {
    return Promise.resolve(apiResponse({
      holdings: [],
      accounts: [{ ...account, cashBalance: 0, holdingsValue: 0, totalValue: 0 }],
    }));
  }

  it("토스증권 계좌에는 토스 메뉴 3개만 보이고 KIS 메뉴는 없다", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/integrations/upbit")) {
        return Promise.resolve(apiResponse({ configured: false, accessKeyMasked: null }));
      }
      return accountsFixture({ accountId: 7, accountName: "토스 주식", institutionName: "토스증권" });
    }));
    render(<InvestmentsPage />);
    await screen.findByText("토스 주식 · 토스증권");

    fireEvent.click(screen.getByRole("button", { name: "토스 주식 메뉴" }));
    expect(await screen.findByRole("menuitem", { name: "토스 연결 설정" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "잔고 동기화" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "토스 진단" })).toBeDefined();
    // KIS 전용 항목은 토스 계좌에 없다.
    expect(screen.queryByRole("menuitem", { name: "한국투자 연결 설정" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "채권 진단" })).toBeNull();
  });

  it("'토스뱅크' 계좌에는 토스 메뉴가 없다(다른 회사)", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/integrations/upbit")) {
        return Promise.resolve(apiResponse({ configured: false, accessKeyMasked: null }));
      }
      return accountsFixture({ accountId: 8, accountName: "토스뱅크 파킹", institutionName: "토스뱅크" });
    }));
    render(<InvestmentsPage />);
    await screen.findByText("토스뱅크 파킹 · 토스뱅크");

    fireEvent.click(screen.getByRole("button", { name: "토스뱅크 파킹 메뉴" }));
    expect(await screen.findByRole("menuitem", { name: "계좌 편집" })).toBeDefined();
    expect(screen.queryByRole("menuitem", { name: "토스 연결 설정" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "토스 진단" })).toBeNull();
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

  /* ── 이슈 #35 I-01 / I-20: 빈 화면이 막다른 길 ─────────────────── */

  it("계좌 0·보유 0 이면 계좌 추가를 안내하고, 비활성 '+ 종목 추가'를 지시하지 않는다 (I-01)", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve(apiResponse({ holdings: [], accounts: [] })),
    ));
    render(<InvestmentsPage />);

    // status 는 "empty" 다 — 예전에는 ready 조건이라 안내가 도달하지 못했다.
    expect(
      await screen.findByText('투자 계좌가 없습니다 — 자산 → 계좌 추가(유형 "투자")'),
    ).toBeDefined();
    // 빈 상태 문구도 '+ 종목 추가'가 아니라 계좌 추가를 가리킨다.
    expect(screen.getByText(/투자 계좌를 먼저 추가하세요/)).toBeDefined();
    expect(screen.queryByText("보유종목이 없습니다 — '+ 종목 추가'로 시작하세요")).toBeNull();

    // 근거: 계좌가 없으면 그 버튼은 눌러도 아무 일이 없는 비활성 상태다.
    const addButton = screen.getByRole("button", { name: "+ 종목 추가" }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);
  });

  it("보유종목이 0이면 자산군 필터 그룹을 남기지 않는다 (I-20)", async () => {
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

    // 계좌는 있으니 상태는 ready — 필터를 좁힐 대상이 없으므로 칩도 없다.
    expect(
      await screen.findByText("보유종목이 없습니다 — '+ 종목 추가'로 시작하세요"),
    ).toBeDefined();
    expect(screen.queryByRole("group", { name: "자산군 필터" })).toBeNull();
    expect(screen.queryByRole("button", { name: "코인" })).toBeNull();
  });

  it("종목 추가는 POST 로 저장하고 목록을 다시 읽는다", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    fireEvent.click(screen.getByRole("button", { name: "+ 종목 추가" }));
    fireEvent.change(await screen.findByLabelText("종목명"), { target: { value: "테스트주" } });
    fireEvent.change(screen.getByLabelText("수량"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("평단가"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("현재가"), { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST"
          && String((init as RequestInit).body).includes("테스트주"),
      );
      expect(post).toBeDefined();
      expect(String(post?.[0])).toContain("/api/v1/investments/holdings");
      // §54.4: 원화 종목은 환율을 묻지 않고 1 로 저장한다
      expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({
        currency: "KRW",
        fxRate: 1,
      });
    });
  });

  it("자산군=채권이면 금액·날짜 폼으로 전환하고 수량으로 나눠 저장한다 (BOND-FORM-3)", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    fireEvent.click(screen.getByRole("button", { name: "+ 종목 추가" }));
    fireEvent.mouseDown(screen.getByLabelText("자산군"));
    await selectBondClass();

    // 채권 전용 필드: 종목명(필수)·종목번호(선택)·수량·평가·매수·발행·만기.
    expect(await screen.findByLabelText("종목명")).toBeDefined();
    expect(screen.getByLabelText("종목번호")).toBeDefined();
    expect(screen.getByLabelText("보유수량")).toBeDefined();
    expect(screen.getByLabelText("평가금액")).toBeDefined();
    expect(screen.getByLabelText("매수금액")).toBeDefined();
    expect(screen.getByLabelText("발행일")).toBeDefined();
    expect(screen.getByLabelText("만기일")).toBeDefined();
    expect(screen.queryByLabelText("평단가")).toBeNull();
    expect(screen.queryByLabelText("현재가")).toBeNull();
    expect(screen.queryByLabelText("통화")).toBeNull();
    expect(screen.queryByLabelText("기준일")).toBeNull();

    fireEvent.change(screen.getByLabelText("종목명"), {
      target: { value: "국고03000-3412(24-13)" },
    });
    fireEvent.change(screen.getByLabelText("종목번호"), { target: { value: "KR103502GA34" } });
    fireEvent.change(screen.getByLabelText("보유수량"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("평가금액"), { target: { value: "880050" } });
    fireEvent.change(screen.getByLabelText("매수금액"), { target: { value: "881196" } });
    fireEvent.change(screen.getByLabelText("발행일"), { target: { value: "2024-05-01" } });
    fireEvent.change(screen.getByLabelText("만기일"), { target: { value: "2034-05-01" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST"
          && String((init as RequestInit).body).includes("KR103502GA34"),
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({
        assetClass: "bond",
        name: "국고03000-3412(24-13)",
        symbol: "KR103502GA34",
        currency: "KRW",
        quantity: 10,
        marketPrice: 88005,
        avgPrice: 88119.6,
        fxRate: 1,
        priceAsOf: null,
        issueDate: "2024-05-01",
        maturityDate: "2034-05-01",
      });
    });
  });

  it("종목번호 없이 종목명만으로 채권을 저장한다 (BOND-FORM-3)", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    fireEvent.click(screen.getByRole("button", { name: "+ 종목 추가" }));
    fireEvent.mouseDown(screen.getByLabelText("자산군"));
    await selectBondClass();
    expect(await screen.findByLabelText("보유수량")).toBeDefined();

    fireEvent.change(screen.getByLabelText("보유수량"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("평가금액"), { target: { value: "101200" } });

    // 종목명이 비면 제출이 막힌다 — POST 가 나가지 않는다.
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("종목명을 입력하세요")).toBeDefined();
    expect(fetchMock.mock.calls.some(
      ([url, init]) =>
        String(url).includes("/investments/holdings")
        && (init as RequestInit | undefined)?.method === "POST",
    )).toBe(false);

    const name = "메리츠화재 이율보증형보험III(3년)IRP형";
    fireEvent.change(screen.getByLabelText("종목명"), { target: { value: name } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST"
          && String((init as RequestInit).body).includes("메리츠화재"),
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({
        assetClass: "bond",
        name,
        symbol: null,
        quantity: 1,
        marketPrice: 101200,
      });
    });
  });

  const treasuryBond = {
    code: "KR103502GEC4",
    name: "국고03000-3412(24-13)",
    issueDate: "2024-12-10",
    maturityDate: "2034-12-10",
    bondType: "C0",
    bondClass: "GA",
  };

  it("종목명 자동완성 후보를 선택하면 4값이 채워지고 발행정보도 보강된다 (BOND-SEARCH-3)", async () => {
    searchBondsMock.mockResolvedValue({ items: [treasuryBond], warning: null });
    fetchBondIssueInfoMock.mockResolvedValue({
      issuerName: "기획재정부",
      couponRate: 3,
      issueDate: null,
      maturityDate: null,
      bondClass: "국고채",
      creditRating: "AAA",
      error: null,
    });
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    fireEvent.click(screen.getByRole("button", { name: "+ 종목 추가" }));
    fireEvent.mouseDown(screen.getByLabelText("자산군"));
    await selectBondClass();
    expect(await screen.findByLabelText("보유수량")).toBeDefined();
    // 모달·버튼 없는 자동완성이다.
    expect(screen.queryByRole("button", { name: "채권 찾기" })).toBeNull();

    const optionMeta =
      `${treasuryBond.code} · 발행 ${treasuryBond.issueDate} ~ 만기 ${treasuryBond.maturityDate}`;
    fireEvent.change(screen.getByLabelText("종목명"), { target: { value: "국고03000" } });
    // BOND-SEARCH-4: 2줄 블록 — 이름과 코드·발행~만기가 함께 보인다.
    expect(await screen.findByText(optionMeta, {}, { timeout: 3000 })).toBeDefined();
    expect(screen.getAllByText(treasuryBond.name).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText(optionMeta));

    expect((screen.getByLabelText("종목명") as HTMLInputElement).value).toBe(treasuryBond.name);
    expect((screen.getByLabelText("종목번호") as HTMLInputElement).value).toBe(treasuryBond.code);
    expect((screen.getByLabelText("발행일") as HTMLInputElement).value).toBe(treasuryBond.issueDate);
    expect((screen.getByLabelText("만기일") as HTMLInputElement).value).toBe(treasuryBond.maturityDate);

    // 계좌가 선택돼 있으면 발행정보(best-effort)가 자동으로 채워진다.
    await waitFor(() => {
      expect((screen.getByLabelText("발행기관") as HTMLInputElement).value).toBe("기획재정부");
      expect(Number((screen.getByLabelText("표면이율") as HTMLInputElement).value)).toBe(3);
    });

    fireEvent.change(screen.getByLabelText("보유수량"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("평가금액"), { target: { value: "880050" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST"
          && String((init as RequestInit).body).includes("KR103502GEC4"),
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({
        assetClass: "bond",
        name: treasuryBond.name,
        symbol: treasuryBond.code,
        issueDate: "2024-12-10",
        maturityDate: "2034-12-10",
        issuerName: "기획재정부",
        couponRate: 3,
        quantity: 10,
        marketPrice: 88005,
      });
    });
  });

  it("코드로 입력해도 후보가 표시된다 (BOND-SEARCH-3)", async () => {
    searchBondsMock.mockResolvedValue({ items: [treasuryBond], warning: null });
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    fireEvent.click(screen.getByRole("button", { name: "+ 종목 추가" }));
    fireEvent.mouseDown(screen.getByLabelText("자산군"));
    await selectBondClass();
    await screen.findByLabelText("보유수량");

    fireEvent.change(screen.getByLabelText("종목명"), { target: { value: "KR1035" } });
    const optionMeta =
      `${treasuryBond.code} · 발행 ${treasuryBond.issueDate} ~ 만기 ${treasuryBond.maturityDate}`;
    // filterOption=false — 서버가 코드로 찾은 후보가 클라이언트 재필터로 사라지면 안 된다.
    expect(await screen.findByText(optionMeta, {}, { timeout: 3000 })).toBeDefined();
    expect(screen.getAllByText(treasuryBond.name).length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("액면과 평가단가로 평가금액을 자동 계산해 저장한다 (BOND-VALUE-1)", async () => {
    fetchBondValuationMock.mockResolvedValue({
      pdno: "KR103502GEC4", name: "국고03000-3412(24-13)", asOf: "2026-11-14",
      unitPrice: 9758.65, evaluated: 975865, avgYieldRate: 3.8348,
      kisUnitPrice: 9750, kbpUnitPrice: 9760, niceUnitPrice: 9770, fnpUnitPrice: 9780,
      error: null,
    });
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    fireEvent.click(screen.getByRole("button", { name: "+ 종목 추가" }));
    fireEvent.mouseDown(screen.getByLabelText("자산군"));
    await selectBondClass();
    await screen.findByLabelText("보유수량");

    fireEvent.change(screen.getByLabelText("종목명"), { target: { value: "국고03000-3412(24-13)" } });
    fireEvent.change(screen.getByLabelText("종목번호"), { target: { value: "KR103502GEC4" } });
    fireEvent.change(screen.getByLabelText("보유수량"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("액면(원)"), { target: { value: "1000000" } });
    const valuationButton = screen.getByRole("button", { name: "평가단가 가져오기" }) as HTMLButtonElement;
    await waitFor(() => expect(valuationButton.disabled).toBe(false));
    fireEvent.click(valuationButton);

    await waitFor(() => {
      expect(Number((screen.getByLabelText("평가금액") as HTMLInputElement).value)).toBe(975865);
    });
    expect(await screen.findByText(
      "2026-11-14 기준 · 평균평가단가 9,758.65 · 수익률 3.8348%",
    )).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST"
          && String((init as RequestInit).body).includes("KR103502GEC4"),
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({
        assetClass: "bond",
        faceAmount: 1000000,
        marketPrice: 975865,
      });
    });
  });

  it("평가단가 조회가 실패해도 경고만 남기고 저장할 수 있다 (BOND-VALUE-1)", async () => {
    // beforeEach 기본값이 error 응답이다.
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    fireEvent.click(screen.getByRole("button", { name: "+ 종목 추가" }));
    fireEvent.mouseDown(screen.getByLabelText("자산군"));
    await selectBondClass();
    await screen.findByLabelText("보유수량");

    fireEvent.change(screen.getByLabelText("종목명"), { target: { value: "국고03000-3412(24-13)" } });
    fireEvent.change(screen.getByLabelText("종목번호"), { target: { value: "KR103502GEC4" } });
    fireEvent.change(screen.getByLabelText("보유수량"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("액면(원)"), { target: { value: "1000000" } });
    fireEvent.change(screen.getByLabelText("평가금액"), { target: { value: "880050" } });
    const valuationButton = screen.getByRole("button", { name: "평가단가 가져오기" }) as HTMLButtonElement;
    await waitFor(() => expect(valuationButton.disabled).toBe(false));
    fireEvent.click(valuationButton);

    expect(await screen.findByText("평가단가가 없습니다")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST"
          && String((init as RequestInit).body).includes("KR103502GEC4"),
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({
        assetClass: "bond",
        faceAmount: 1000000,
      });
    });
  });

  it("종목번호가 없는 보험은 평가단가 버튼이 비활성이다 (BOND-VALUE-1)", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    fireEvent.click(screen.getByRole("button", { name: "+ 종목 추가" }));
    fireEvent.mouseDown(screen.getByLabelText("자산군"));
    await selectBondClass();
    await screen.findByLabelText("보유수량");
    fireEvent.change(screen.getByLabelText("액면(원)"), { target: { value: "1000000" } });

    expect((screen.getByRole("button", { name: "평가단가 가져오기" }) as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it("후보가 없으면 직접 입력으로 저장한다 (보험, BOND-SEARCH-3)", async () => {
    // beforeEach 기본값이 빈 검색 결과다.
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    fireEvent.click(screen.getByRole("button", { name: "+ 종목 추가" }));
    fireEvent.mouseDown(screen.getByLabelText("자산군"));
    await selectBondClass();
    await screen.findByLabelText("보유수량");

    const name = "메리츠화재 이율보증형보험III(3년)IRP형";
    fireEvent.change(screen.getByLabelText("종목명"), { target: { value: name } });
    expect(await screen.findByText(
      "일치하는 채권이 없습니다 — 직접 입력할 수 있습니다", {}, { timeout: 3000 },
    )).toBeDefined();

    fireEvent.change(screen.getByLabelText("보유수량"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("평가금액"), { target: { value: "101200" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST"
          && String((init as RequestInit).body).includes("메리츠화재"),
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({
        assetClass: "bond",
        name,
        symbol: null,
      });
    });
  });

  it("발행정보 조회가 실패해도 채권 저장은 가능하다 (BOND-INFO-1)", async () => {
    fetchBondIssueInfoMock.mockResolvedValue({
      issuerName: null, couponRate: null, issueDate: null, maturityDate: null,
      bondClass: null, creditRating: null, error: "KIS 자격증명이 없습니다",
    });
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    fireEvent.click(screen.getByRole("button", { name: "+ 종목 추가" }));
    fireEvent.mouseDown(screen.getByLabelText("자산군"));
    await selectBondClass();
    await screen.findByLabelText("보유수량");

    fireEvent.change(screen.getByLabelText("종목명"), { target: { value: "국고03000-3412(24-13)" } });
    fireEvent.change(screen.getByLabelText("종목번호"), { target: { value: "KR103502GEC4" } });
    fireEvent.change(screen.getByLabelText("보유수량"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("평가금액"), { target: { value: "101200" } });

    fireEvent.click(screen.getByRole("button", { name: "발행정보 가져오기" }));
    expect(await screen.findByText("KIS 자격증명이 없습니다")).toBeDefined();

    // 보조 정보 실패는 저장을 막지 않는다.
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST"
          && String((init as RequestInit).body).includes("KR103502GEC4"),
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({
        assetClass: "bond",
        name: "국고03000-3412(24-13)",
        issuerName: null,
        couponRate: null,
      });
    });
  });

  it("종목번호 없는 채권도 목록 제목이 종목명이다 (BOND-FORM-3)", async () => {
    const name = "메리츠화재 이율보증형보험III(3년)IRP형";
    const bond = {
      id: 99, accountId: 4, assetClass: "bond", symbol: null, name,
      currency: "KRW", quantity: 1, avgPrice: 99000, marketPrice: 101200, fxRate: 1,
      priceAsOf: null, issueDate: "2024-03-12", maturityDate: "2034-03-12",
      issuerName: "기획재정부", couponRate: 3,
    };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/integrations/upbit")) {
        return Promise.resolve(apiResponse({ configured: false, accessKeyMasked: null }));
      }
      return Promise.resolve(apiResponse({
        ...portfolioFixture(),
        holdings: [...portfolioFixture().holdings, bond],
      }));
    }));
    render(<InvestmentsPage />);

    expect(await screen.findByText(name)).toBeDefined();
    // BOND-INFO-1: 표면이율·발행기관·만기일을 있는 값만 조립하고 title 에 전체 문자열을 둔다.
    expect(screen.getByText("채권 · 3% · 기획재정부 · 2034-03-12 만기")).toBeDefined();
    expect(screen.getByTitle("채권 · 3% · 기획재정부 · 2034-03-12 만기")).toBeDefined();
  });

  it("채권 목록 부제는 만기일을 보여 주고 '주'를 붙이지 않는다 (BOND-FORM-1)", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("국고채 10년");

    // 값이 없는 항목은 생략한다 — 기본 fixture 는 표면이율/발행기관/만기일이 없다.
    expect(screen.getByTitle("채권")).toBeDefined();
    expect(screen.queryByText(/국고채 10년.*100주/)).toBeNull();
  });

  it("종목 추가 폼은 수량·평단가·현재가를 비워 두고, 원화면 환율 란을 숨긴다 (§54.4)", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    fireEvent.click(screen.getByRole("button", { name: "+ 종목 추가" }));

    // 붙여넣기를 방해하던 초기값 0/1 이 없다
    expect((screen.getByLabelText("수량") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("평단가") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("현재가") as HTMLInputElement).value).toBe("");
    expect(screen.queryByLabelText("환율")).toBeNull();
  });

  it("계좌 선택지는 이름과 기관을 함께 보여 준다 (§54.2)", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    fireEvent.click(screen.getByRole("button", { name: "+ 종목 추가" }));
    fireEvent.mouseDown(screen.getByLabelText("계좌"));

    await waitFor(() => {
      const options = Array.from(document.querySelectorAll(".ant-select-item-option"))
        .map((el) => el.getAttribute("title"));
      expect(options).toContain("키움 투자금 · 키움증권");
      expect(options).toContain("미국주식");
    });
  });

  it("미국달러를 고르면 환율 란이 나타나고 네이버 환율로 채워진다 (§54.4)", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    fireEvent.click(screen.getByRole("button", { name: "+ 종목 추가" }));
    fireEvent.mouseDown(screen.getByLabelText("통화"));
    fireEvent.click(await screen.findByTitle("미국달러 (USD)"));

    const fx = await screen.findByLabelText("환율");
    await waitFor(() => expect(Number((fx as HTMLInputElement).value)).toBe(1339));
  });

  it("'현재가 가져오기'는 심볼 시세로 현재가·통화·종목명을 채운다 (§54.4)", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    fireEvent.click(screen.getByRole("button", { name: "+ 종목 추가" }));
    fireEvent.change(screen.getByLabelText("심볼"), { target: { value: "AAPL" } });
    fireEvent.click(screen.getByRole("button", { name: "현재가 가져오기" }));

    await waitFor(() => {
      expect(Number((screen.getByLabelText("현재가") as HTMLInputElement).value)).toBe(347.1);
    });
    expect((screen.getByLabelText("종목명") as HTMLInputElement).value).toBe("애플");
    expect(await screen.findByLabelText("환율")).toBeDefined();
    const fx = screen.getByLabelText("환율") as HTMLInputElement;
    await waitFor(() => expect(Number(fx.value)).toBe(1339));
  });

  it("화면 진입 시 현재가를 자동으로 갱신한다 (§54.4)", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    await waitFor(() => {
      const refresh = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes("/investments/quotes/refresh") &&
          (init as RequestInit | undefined)?.method === "POST",
      );
      expect(refresh).toBeDefined();
    });
  });

  it("삭제는 DELETE 로 반영된다", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    // 행 동작은 ⋯ 메뉴 → 삭제 → Popconfirm 확인 순서다.
    fireEvent.click(screen.getByRole("button", { name: "삼성전자 행 메뉴" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "삭제" }));
    // Popconfirm 확인 버튼 — 기본 로케일 OK
    fireEvent.click(await screen.findByRole("button", { name: /^(OK|확인)$/ }));

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

    fireEvent.click(screen.getByRole("button", { name: "키움 투자금 메뉴" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "계좌 편집" }));
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

    fireEvent.click(screen.getByRole("button", { name: "키움 투자금 메뉴" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "계좌 삭제" }));
    expect(await screen.findByText("보유종목 3건도 함께 삭제됩니다")).toBeDefined();

    fireEvent.click(await screen.findByRole("button", { name: /^(OK|확인)$/ }));

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

    await clickSectionMenu("가격 갱신");
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

  it("가격 갱신 모드의 현재가 입력은 잘리지 않는 슬롯에 있고 폭 120·기본 높이다 (INV-02)", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    await clickSectionMenu("가격 갱신");

    // 4개 종목 모두 편집 입력을 갖는다 — meta 셀로 clip 되면 폭·높이가 0 이 된다.
    const inputs = screen.getAllByLabelText(/ 현재가$/);
    expect(inputs.length).toBe(4);

    for (const input of inputs) {
      const wrapper = input.closest(".ant-input-number") as HTMLElement;
      expect(wrapper.style.width).toBe("120px");
      // size="small" 이면 높이 28 이다 — 모바일 하한 36 을 지키려면 기본 크기여야 한다.
      expect(wrapper.className).not.toContain("ant-input-number-sm");
      // clip 되는 meta 셀은 1×1 로 잘린다. value 슬롯이어야 화면에 남는다.
      expect((input.closest("td") as HTMLElement).className).toContain("af-list__cell--value");
    }

    // 같은 행의 평가액 셀은 반대로 meta 로 내려간다(value 슬롯은 하나만).
    const row = inputs[0]?.closest("tr") as HTMLElement;
    const valueCell = row.querySelector('td[data-label="평가액"]') as HTMLElement;
    expect(valueCell.className).not.toContain("af-list__cell--value");
  });

  it("좁은 화면은 섹션 액션을 ⋯ 메뉴로 접고 '+ 종목 추가'만 남긴다 (INV-01)", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    // 기본 상태: 직접 버튼은 추가 하나뿐이다.
    expect(screen.getByRole("button", { name: "+ 종목 추가" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "가격 갱신" })).toBeNull();
    expect(screen.queryByRole("button", { name: "시세 새로고침" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "보유종목 메뉴" }));
    for (const label of ["업비트 연동", "업비트에서 가져오기", "시세 새로고침", "가격 갱신"]) {
      expect(await screen.findByRole("menuitem", { name: label })).toBeDefined();
    }
  });

  it("요약 카드는 좁은 화면 2열이고 값은 tabular-nums 다 (INV-04)", async () => {
    render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    const grid = screen.getByText("총 평가액").parentElement?.parentElement as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
    // 값은 .af-num(자리수 정렬) + 20/700
    const value = screen.getByText("53,100,000원");
    expect(value.className).toContain("af-num");
    expect(value.style.fontSize).toBe("20px");
  });

  it("자산군 비중 도넛은 role=img 요약 하나로 노출되고 application 탭 스톱이 없다 (INV-07)", async () => {
    const { container } = render(<InvestmentsPage />);
    await screen.findByText("삼성전자");

    expect(screen.getByRole("img", { name: /자산군 비중 도넛 차트/ })).toBeDefined();
    expect(screen.getByRole("heading", { level: 3, name: "자산군 비중" })).toBeDefined();
    // recharts 접근성 레이어는 무명 application 랜드마크를 만든다 — 꺼야 한다.
    expect(container.querySelector('[role="application"]')).toBeNull();
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

  it("KIS 계좌 메뉴에 '연금 진단'이 있고, 누르면 원본 진단 모달이 열린다", async () => {
    const pensionPortfolio = {
      holdings: [],
      accounts: [
        {
          accountId: 4, accountName: "개인연금", institutionName: "한국투자",
          cashBalance: 0, holdingsValue: 0, totalValue: 0,
        },
        {
          accountId: 5, accountName: "미국주식", institutionName: "",
          cashBalance: 0, holdingsValue: 0, totalValue: 0,
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/kis-pension-preview")) {
        return Promise.resolve(apiResponse({
          balance: { output1: [], output2: [] },
          warning: null,
          error: null,
          acntPrdtCd: "22",
          isMock: false,
        }));
      }
      if (path.includes("/integrations/upbit")) {
        return Promise.resolve(apiResponse({ configured: false, accessKeyMasked: null }));
      }
      return Promise.resolve(apiResponse(pensionPortfolio));
    }));

    render(<InvestmentsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "개인연금 메뉴" }));

    // 채권 진단 옆에 연금 진단이 함께 있다.
    expect(await screen.findByRole("menuitem", { name: "채권 진단" })).toBeDefined();
    fireEvent.click(screen.getByRole("menuitem", { name: "연금 진단" }));

    expect(await screen.findByText("연금 진단 · 개인연금")).toBeDefined();
    expect(screen.getByLabelText("연금 계좌 요약").textContent).toContain("상품코드");
    expect(screen.getByLabelText("연금 진단 원본 JSON").textContent).toContain('"acntPrdtCd": "22"');
  });

  // 이슈 #32 — 기관명은 자유 입력이라 `한국투자증권` 으로 저장하면 메뉴가 통째로
  // 사라졌다. e2e 목도 `한국투자증권` 을 쓰므로 여기서 그 값을 그대로 박는다.
  it("기관명이 '한국투자증권' 인 계좌에서도 KIS 메뉴가 보인다", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/integrations/upbit")) {
        return Promise.resolve(apiResponse({ configured: false, accessKeyMasked: null }));
      }
      return Promise.resolve(apiResponse({
        holdings: [],
        accounts: [
          {
            accountId: 4, accountName: "개인연금", institutionName: "한국투자증권",
            cashBalance: 0, holdingsValue: 0, totalValue: 0,
          },
        ],
      }));
    }));

    render(<InvestmentsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "개인연금 메뉴" }));

    expect(await screen.findByRole("menuitem", { name: "잔고 동기화" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "연금 진단" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "한국투자 연결 설정" })).toBeDefined();
  });

  it("비KIS 계좌 메뉴에는 '연금 진단'이 없다", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/integrations/upbit")) {
        return Promise.resolve(apiResponse({ configured: false, accessKeyMasked: null }));
      }
      return Promise.resolve(apiResponse({
        holdings: [],
        accounts: [
          {
            accountId: 4, accountName: "개인연금", institutionName: "한국투자",
            cashBalance: 0, holdingsValue: 0, totalValue: 0,
          },
          {
            accountId: 5, accountName: "미국주식", institutionName: "",
            cashBalance: 0, holdingsValue: 0, totalValue: 0,
          },
        ],
      }));
    }));

    render(<InvestmentsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "미국주식 메뉴" }));

    expect(await screen.findByRole("menuitem", { name: "계좌 편집" })).toBeDefined();
    expect(screen.queryByRole("menuitem", { name: "연금 진단" })).toBeNull();
    // 채권 진단도 KIS 전용이므로 함께 없다.
    expect(screen.queryByRole("menuitem", { name: "채권 진단" })).toBeNull();
  });

  it("KIS 동기화가 예수금을 못 읽으면 서버 경고를 화면에 보여 준다 (§62.3)", async () => {
    const warning = "KIS에서 예수금을 읽지 못해 계좌 잔액을 유지했습니다.";
    const kisPortfolio = {
      holdings: [],
      accounts: [
        {
          accountId: 4,
          accountName: "비상금",
          institutionName: "한국투자",
          cashBalance: 0,
          holdingsValue: 0,
          totalValue: 0,
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/investments/holdings/sync-kis")) {
        return Promise.resolve(apiResponse({ ...kisPortfolio, warning }));
      }
      if (path.includes("/investments/quotes/refresh")) {
        return Promise.resolve(apiResponse(kisPortfolio));
      }
      if (path.includes("/investments/holdings")) {
        return Promise.resolve(apiResponse(kisPortfolio));
      }
      return Promise.resolve(apiResponse({}, false, 400));
    }));

    render(<InvestmentsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "비상금 메뉴" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "잔고 동기화" }));

    expect(await screen.findByText(warning)).toBeDefined();
  });

  /* ── 이슈 #35 I-03: 계좌 모달을 닫으면 그 계좌 `⋯` 로 포커스가 돌아온다 ──── */

  /**
   * KIS 계좌 2개 — 계좌 메뉴에 연결 설정·채권/연금 진단이 모두 있다.
   * 자격증명 GET 은 404 로 두어 모달이 '신규 입력' 상태로 열린다(폼은 열린 채다).
   */
  function stubTwoKisAccounts() {
    const portfolio = {
      holdings: [],
      accounts: [
        {
          accountId: 4, accountName: "개인연금", institutionName: "한국투자증권",
          cashBalance: 0, holdingsValue: 0, totalValue: 0,
        },
        {
          accountId: 5, accountName: "IRP", institutionName: "한국투자증권",
          cashBalance: 0, holdingsValue: 0, totalValue: 0,
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/kis-credentials")) return Promise.resolve(apiResponse({}, false, 404));
      if (path.includes("/kis-bond-preview")) {
        return Promise.resolve(apiResponse({ balance: null, prices: [], error: null }));
      }
      if (path.includes("/kis-pension-preview")) {
        return Promise.resolve(apiResponse({
          balance: null, warning: null, error: null, acntPrdtCd: "22", isMock: false,
          stock: null, account: null, pension: null, usedPath: null, balancePreview: null,
        }));
      }
      return Promise.resolve(apiResponse(portfolio));
    }));
  }

  /**
   * 계좌 `⋯` 메뉴를 열어 항목 하나를 고른다. jsdom 은 닫힌 드롭다운의 hidden 클래스가
   * 늦게 붙어 같은 이름의 메뉴가 여럿 남으므로 **가장 나중에 만들어진 팝업**에서 고른다.
   */
  async function openAccountMenu(name: string, item: string) {
    fireEvent.click(await screen.findByRole("button", { name: `${name} 메뉴` }));
    const dropdown = await waitFor(() => {
      const all = [...document.querySelectorAll<HTMLElement>(".ant-dropdown")];
      const el = all.at(-1);
      if (!el) throw new Error("열린 계좌 메뉴를 찾지 못했습니다");
      return el;
    });
    fireEvent.click(await within(dropdown).findByRole("menuitem", { name: item }));
  }

  /**
   * jsdom 한정 주의: antd Dropdown 은 닫힘 모션이 끝나지 않아 Esc 등록이 남고,
   * 그 뒤로 Esc 가 모달에 닿지 않는다(브라우저에서는 모션이 끝나며 해제된다).
   * 그래서 Esc 경로는 e2e(investments-modal-focus)와 모달 단위 테스트가 검증하고,
   * 여기서는 같은 `onClose` 로 모이는 × · 바깥 클릭 2경로를 실행한다.
   */
  it("모달 닫힘(×·바깥 클릭) 후 그 계좌 `⋯` 로 포커스가 돌아온다 (I-03)", async () => {
    stubTwoKisAccounts();
    render(<InvestmentsPage />);

    const menuButton = await screen.findByRole("button", { name: "개인연금 메뉴" });

    // 1) × 버튼
    await openAccountMenu("개인연금", "한국투자 연결 설정");
    expect(await screen.findByText("KIS 연동 설정 · 개인연금")).toBeDefined();
    fireEvent.click(document.querySelector<HTMLElement>(".ant-modal-close")!);
    await waitFor(() => expect(document.activeElement).toBe(menuButton));
    expect(document.activeElement).not.toBe(document.body);

    // 2) 바깥(오버레이) 클릭 — antd 는 mask 에서 mousedown 이 시작돼야 닫는다.
    await openAccountMenu("개인연금", "한국투자 연결 설정");
    await screen.findByText("KIS 연동 설정 · 개인연금");
    const wrap = document.querySelector<HTMLElement>(".ant-modal-wrap")!;
    fireEvent.mouseDown(wrap);
    fireEvent.click(wrap);
    await waitFor(() => expect(document.activeElement).toBe(menuButton));
  });

  it("모달을 연 계좌로 돌아간다 — 다른 계좌 모달을 열고 닫아도 엉뚱한 행으로 가지 않는다 (I-03)", async () => {
    stubTwoKisAccounts();
    render(<InvestmentsPage />);

    const first = await screen.findByRole("button", { name: "개인연금 메뉴" });
    const second = await screen.findByRole("button", { name: "IRP 메뉴" });

    // 계좌 4 의 채권 진단 → 닫기
    await openAccountMenu("개인연금", "채권 진단");
    expect(await screen.findByText("채권 진단 · 개인연금")).toBeDefined();
    fireEvent.click(document.querySelector<HTMLElement>(".ant-modal-close")!);
    await waitFor(() => expect(document.activeElement).toBe(first));

    // 곧바로 계좌 5 의 연금 진단 → 닫기: 대상 계좌가 바뀌어도 그 계좌로 돌아간다.
    await openAccountMenu("IRP", "연금 진단");
    expect(await screen.findByText("연금 진단 · IRP")).toBeDefined();
    const wrap = document.querySelector<HTMLElement>(".ant-modal-wrap")!;
    fireEvent.mouseDown(wrap);
    fireEvent.click(wrap);
    await waitFor(() => expect(document.activeElement).toBe(second));
  });

  describe("#58 접속 시 자동 동기화", () => {
    it("오래된 계좌가 없으면 sync-due 를 호출하지 않는다", async () => {
      const { getSyncStatus, syncDue } = await import("../api/investmentsApi");
      vi.mocked(getSyncStatus).mockResolvedValue({ due: 0, providers: [] });
      render(<InvestmentsPage />);
      await waitFor(() => expect(vi.mocked(getSyncStatus)).toHaveBeenCalled());
      expect(vi.mocked(syncDue)).not.toHaveBeenCalled();
    });

    it("오래된 계좌가 있으면 1회 동기화하고 목록을 다시 읽는다", async () => {
      const { getSyncStatus, syncDue } = await import("../api/investmentsApi");
      vi.mocked(getSyncStatus).mockResolvedValue({
        due: 1,
        providers: [
          { provider: "toss", accountId: 7, accountName: "토스", lastStatus: "ok", lastSyncedAt: null, stale: true },
        ],
      });
      render(<InvestmentsPage />);
      await waitFor(() => expect(vi.mocked(syncDue)).toHaveBeenCalledTimes(1));
    });

    it("자동 동기화가 실패해도 화면이 깨지지 않는다", async () => {
      const { getSyncStatus, syncDue } = await import("../api/investmentsApi");
      vi.mocked(getSyncStatus).mockRejectedValue(new Error("network"));
      vi.mocked(syncDue).mockRejectedValue(new Error("boom"));
      render(<InvestmentsPage />);
      // 화면은 정상 렌더되고, 사용자에게 오류를 띄우지 않는다.
      expect(await screen.findByRole("heading", { level: 1, name: "투자" })).toBeDefined();
      expect(screen.queryByText(/동기화에 실패/)).toBeNull();
    });
  });
});
