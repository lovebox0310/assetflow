import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DashboardPage } from "./DashboardPage";
import { clearInflight } from "../api/client";
import { clearToken, isAuthenticated, saveToken } from "../auth/authStore";
import { dashboardMock } from "../data/dashboardMock";

/**
 * Issue 7 AC: 정상/지연(로딩)/실패(오류+재시도) 시나리오를 실제 fetch 교체로 검증한다.
 * fetch 는 §38 포맷으로 응답하는 대역이고, 지연은 임의 sleep 이 아니라
 * 아직 resolve 되지 않은 Promise 로 만든다 (타이밍 운 금지).
 */

type Handler = (path: string) => Response | Promise<Response>;

/** 현금흐름 창은 오늘 기준(§35.1). 고정 월에 묶이지 않도록 상대 월 키를 만든다. */
function monthKey(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function stubFetch(handler: Handler) {
  const fetchMock = vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(handler(String(input))),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function apiResponse(data: unknown, ok = true, status = 200): Response {
  const body = ok
    ? { code: "OK", message: "loaded", data }
    : { code: "INTERNAL_ERROR", message: "Internal server error", details: "", timestamp: "" };
  return { ok, status, json: async () => body } as Response;
}

function route(path: string): Response | Promise<Response> {
  if (path.includes("/dashboard/summary")) return apiResponse(dashboardMock);
  if (path.includes("/dashboard/cashflow")) {
    return apiResponse([
      { month: monthKey(0), income: 8_200_000, vatSetAside: 0, expenses: 4_960_000, balance: 3_240_000 },
      { month: monthKey(1), income: 7_950_000, vatSetAside: 0, expenses: 5_310_000, balance: 2_640_000 },
      { month: monthKey(2), income: 8_200_000, vatSetAside: 0, expenses: 4_720_000, balance: 3_480_000 },
    ]);
  }
  // §57: 지출 추이 — 현재 월과 한 달 전의 대분류 합계
  if (path.includes("/card-imports/monthly-categories")) {
    return apiResponse([
      { month: monthKey(0), category: "식비", gross: 1_200_000 },
      { month: monthKey(1), category: "식비", gross: 900_000 },
      { month: monthKey(1), category: "미분류", gross: 10_000 },
    ]);
  }
  // §57.9: 수입 막대 — 최근 달은 확정(실수입+부가세통장), 그 이전 달은 미확정(행 없음)
  if (path.includes("/dashboard/monthly-income")) {
    return apiResponse([{ month: monthKey(0), income: 8_200_000, vatSetAside: 0, disposableIncome: 8_200_000 }]);
  }
  return apiResponse({}, false, 500);
}

describe("DashboardPage FE-BE 연동 (Issue 7)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    // dedupe 의 in-flight 맵은 모듈 단위다 — 끝나지 않는 fetch 를 심은 테스트가
    // 멈춘 Promise 를 남기므로 테스트마다 비운다.
    clearInflight();
  });

  beforeEach(() => {
    clearToken();
    saveToken("tok", Date.now() + 60_000);
  });

  it("핵심 카드 4종을 첫 화면에 배치한다 (§22 설계 기준)", () => {
    stubFetch(route);
    render(<DashboardPage onLogout={() => {}} />);
    expect(screen.getByRole("heading", { name: "핵심 지표" })).toBeDefined();
    // "자산 구성비"는 카드 제목과 하위 섹션 제목에 모두 나오므로 존재 자체를 검사한다.
    for (const title of ["순자산", "월 수지", "비상금 유지 개월", "자산 구성비"]) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
  });

  it("영역 순서가 정보구조와 일치한다 (지표→구성비→현금→현금흐름)", async () => {
    stubFetch(route);
    render(<DashboardPage onLogout={() => {}} />);
    // 로딩이 끝나야 컨테이너에 실측 가능한 콘텐츠가 채워진다.
    await screen.findByText("6.9억");
    const content = (document.querySelector(".af-container") as HTMLElement).textContent ?? "";
    const order = ["핵심 지표", "자산 구성비", "현금 2계좌", "월별 현금흐름"];
    const positions = order.map((name) => content.indexOf(name));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("헤더의 로그아웃은 토큰을 지우고 onLogout 을 부른다 (§21 승계)", () => {
    stubFetch(route);
    const onLogout = vi.fn();
    render(<DashboardPage onLogout={onLogout} />);
    fireEvent.click(screen.getByRole("button", { name: /로그아웃/ }));
    expect(isAuthenticated()).toBe(false);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("핵심 카드는 §35.2 분할(span 24/12/6)을 antd Col 계약대로 입힌다", () => {
    stubFetch(route);
    render(<DashboardPage onLogout={() => {}} />);
    const cols = document.querySelectorAll(".ant-col-xs-24.ant-col-md-12.ant-col-lg-6");
    expect(cols.length).toBe(4);
  });

  it("정상 응답 시 카드에 계산·포맷된 값과 현금 계좌가 노출된다 (§26 AC)", async () => {
    stubFetch(route);
    render(<DashboardPage onLogout={() => {}} />);

    // 순자산 691,844,440 → 6.9억 / 월 수지 +3,240,000원 / 비상금 28.8개월
    expect(await screen.findByText("6.9억")).toBeDefined();
    // 카드와 현금흐름 표가 같은 금액을 보일 수 있어 getAll 로 존재를 검사한다.
    expect((await screen.findAllByText("+3,240,000원")).length).toBeGreaterThan(0);
    expect(screen.getByText("28.8개월")).toBeDefined();
    // 구성비 카드와 도넛 범례가 같은 유형명을 보일 수 있어 getAll 로 존재를 검사한다.
    expect(screen.getAllByText("부동산·기타").length).toBeGreaterThan(0);
    expect(screen.getByText("84.1% · 6.4억")).toBeDefined();
    // 현금 계좌 섹션: summary 의 cash 계좌가 이름·금액으로 렌더
    expect(screen.getByText(/우리 파킹통장/)).toBeDefined();
    // 월별 현금흐름 표: 확정 3개월이 최신순으로 나온다
    expect(screen.getByText(monthKey(0))).toBeDefined();
    expect(screen.getByText(monthKey(1))).toBeDefined();
    expect(screen.getByText(monthKey(2))).toBeDefined();
    // 수지는 그 달 수입 − 부가세통장 이체 − 그 달 지출만 보여 준다(이전 달 누적 아님).
    // 2026-10: 8,200,000 − 0 − 4,960,000 = +3,240,000 / 2026-09: +2,640,000
    expect(screen.getByText("+2,640,000원")).toBeDefined();
    expect(screen.queryByText("+5,880,000원")).toBeNull();
  });

  it("요청 중에는 로딩(스켈레톤)이 보인다 (§26 AC)", () => {
    // resolve 시키지 않은 fetch: 로딩이 무기한 유지되는 대신 테스트는 스켈레톤만 확인한다.
    stubFetch(() => new Promise<Response>(() => {}));
    render(<DashboardPage onLogout={() => {}} />);
    expect(document.querySelectorAll(".ant-skeleton").length).toBeGreaterThan(0);
    // 아직 값은 없다
    expect(screen.queryByText("6.9억")).toBeNull();
  });

  it("API 실패 시 카드 단위 오류 UI와 재시도가 뜬다 (§26 AC)", async () => {
    let fail = true;
    stubFetch((path) => (path.includes("/dashboard/summary") && fail ? apiResponse(null, false, 500) : route(path)));
    render(<DashboardPage onLogout={() => {}} />);

    // summary 만 실패: 오류 UI 표시 (카드+섹션 6개 동시 오류 → findAll)
    await screen.findAllByText("데이터를 불러오지 못했습니다");
    expect(screen.queryByText("6.9억")).toBeNull();
    // cashflow 는 summary 실패와 무관하게 복구된다 (카드 단위 복구 우선)
    await screen.findByText(monthKey(0));

    // 재시도: 서버가 정상 응답으로 바뀌면 카드가 복구된다
    fail = false;
    const retry = screen.getAllByRole("button", { name: /재시도/ })[0];
    if (!retry) throw new Error("재시도 버튼 없음");
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByText("6.9억")).toBeDefined());
  });

  it("인증 실패(401)는 네트워크 오류와 구분된 문구를 보여 준다 (§26 연동 기준)", async () => {
    stubFetch((path) =>
      path.includes("/dashboard/summary")
        ? { ok: false, status: 401, json: async () => ({ code: "AUTH_REQUIRED", message: "Authentication required" }) } as Response
        : route(path),
    );
    render(<DashboardPage onLogout={() => {}} />);
    // 사용자 친화 인증 문구가 오류 설명에 노출된다
    await screen.findAllByText("데이터를 불러오지 못했습니다");
    expect((await screen.findAllByText("로그인이 만료되었습니다. 다시 로그인해 주세요.")).length).toBeGreaterThan(0);
  });

  it("빈 데이터는 '데이터가 없습니다' 상태로 보인다 (§26 AC)", async () => {
    stubFetch((path) =>
      path.includes("/dashboard/summary")
        ? apiResponse({ asOf: "2026-10", assets: [], liabilities: [], monthly: { income: 0, vatSetAside: 0, expenses: 0, essentialExpenses: 0, essentialComplete: false, balance: 0 } })
        : apiResponse([]),
    );
    render(<DashboardPage onLogout={() => {}} />);
    expect((await screen.findAllByText("데이터가 없습니다")).length).toBeGreaterThan(0);
    expect(screen.queryByText("6.9억")).toBeNull();
  });

  it("현금흐름은 6개월 창을 보여 주고 미확정 월을 명시한다 (#73 AC)", async () => {
    stubFetch(route);
    render(<DashboardPage onLogout={() => {}} />);
    await screen.findByText(monthKey(0));

    // 확정 3개월 + 미확정 3개월 = 6개월 창
    // 데스크톱(표)과 모바일(카드 리스트) 어느 쪽이든 월 6개가 한 번씩 나온다.
    expect(screen.getAllByText(/^\d{4}-\d{2}$/).length).toBe(6);
    expect(screen.getByText(/확정 3개월 · 미확정 3개월/)).toBeDefined();
    expect(screen.getAllByText("미확정").length).toBe(3);
    // 창의 가장 오래된 월까지 자리를 지킨다 (0원으로 채우지 않는다)
    expect(screen.getByText(monthKey(5))).toBeDefined();
  });

  it("'현금 N계좌'는 실제 현금성 계좌 수를 따른다 (#73 AC)", async () => {
    const oneCash = {
      ...dashboardMock,
      assets: [
        { id: "c1", type: "cash" as const, name: "우리 파킹통장", value: 18_500_000 },
        { id: "d1", type: "deposit" as const, name: "우리 예적금", value: 42_000_000 },
      ],
    };
    stubFetch((path) =>
      path.includes("/dashboard/summary") ? apiResponse(oneCash) : route(path),
    );
    render(<DashboardPage onLogout={() => {}} />);
    expect(await screen.findByRole("heading", { name: "현금 1계좌" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "현금 2계좌" })).toBeNull();
  });

  it("재요청 시 진행 중 요청은 중복으로 나가지 않는다 (§26 연동 기준)", async () => {
    const fetchMock = stubFetch(route);
    render(<DashboardPage onLogout={() => {}} />);
    await screen.findByText("6.9억");
    // mount 1회 로딩에서 summary 1회 + cashflow 1회
    const summaryCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/dashboard/summary")).length;
    expect(summaryCalls).toBe(1);
  });

  it("지출 추이는 기본 최근 12개월 범위로 1회 조회한다 (§57)", async () => {
    const fetchMock = stubFetch(route);
    render(<DashboardPage onLogout={() => {}} />);
    await screen.findByText("6.9억");

    const trendCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/card-imports/monthly-categories"),
    );
    expect(trendCalls.length).toBe(1);
    // 기본 범위 = 이번 달 포함 최근 12개월
    const url = String(trendCalls[0]?.[0] ?? "");
    expect(url).toContain(`to=${monthKey(0)}`);
    expect(url).toContain(`from=${monthKey(11)}`);

    // 섹션 제목과 범례(카테고리 + 미분류)가 렌더된다
    expect(screen.getByRole("heading", { name: "지출 추이" })).toBeDefined();
    await waitFor(() => expect(screen.getByLabelText("지출 추이 범례")).toBeDefined());
    expect(screen.getByText("미분류")).toBeDefined();

    // §57.9: 같은 범위로 확정 수입을 1회 더 조회한다 (수입 스택 2개 | 지출 스택)
    const incomeCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/dashboard/monthly-income"),
    );
    expect(incomeCalls.length).toBe(1);
    const incomeUrl = String(incomeCalls[0]?.[0] ?? "");
    expect(incomeUrl).toContain(`to=${monthKey(0)}`);
    expect(incomeUrl).toContain(`from=${monthKey(11)}`);

    const legend = screen.getByLabelText("지출 추이 범례");
    expect(within(legend).getByText("실수입")).toBeDefined();
    expect(within(legend).getByText("부가세통장")).toBeDefined();
    expect(within(legend).getByText("식비")).toBeDefined();
    // 미확정 달은 수입 막대를 0 으로 채우지 않는다고 화면에 적는다
    expect(screen.getByText(/수입 막대\(실수입\+부가세통장\)는 확정된 1개월만 표시합니다/)).toBeDefined();
  });

  it("수입 조회가 실패해도 지출 추이는 그려진다 (§57.8 폴다운)", async () => {
    stubFetch((path) =>
      path.includes("/dashboard/monthly-income") ? apiResponse(null, false, 500) : route(path),
    );
    render(<DashboardPage onLogout={() => {}} />);

    const legend = await screen.findByLabelText("지출 추이 범례");
    expect(within(legend).getByText("식비")).toBeDefined();
    // 수입 데이터가 없으면 수입 범례/막대를 만들지 않는다 — 0 원 막대를 지어내지 않는다.
    expect(within(legend).queryByText("실수입")).toBeNull();
    expect(within(legend).queryByText("부가세통장")).toBeNull();
  });
});
