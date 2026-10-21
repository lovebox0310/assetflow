import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AssetsPage } from "./AssetsPage";
import { clearInflight } from "../api/client";
import { clearToken, saveToken } from "../auth/authStore";
import { dashboardMock } from "../data/dashboardMock";

/**
 * §31/§40 AC: 행 편집·추가·삭제가 API 에 반영되고 화면에 반영된다.
 * fetch 대역은 §38/§40 표준 포맷. §36.2 기준선 시드를 가정한다.
 */
function apiResponse(data: unknown, ok = true, status = 200): Response {
  const body = ok
    ? { code: "OK", message: "loaded", data }
    : { code: "AUTH_REQUIRED", message: "Authentication required", details: "", timestamp: "" };
  return { ok, status, json: async () => body } as Response;
}

function seedAccounts() {
  return dashboardMock.assets.map((a, i) => ({
    id: i + 1,
    accountType: a.type,
    name: a.name,
    institutionName: "",
    balance: a.value,
    isDebt: false,
    openedAt: null,
  })).concat(
    dashboardMock.liabilities.map((l, i) => ({
      id: 10 + i,
      accountType: "realty" as const,
      name: l.name,
      institutionName: "",
      balance: l.balance,
      isDebt: true,
      openedAt: null,
    })),
  );
}

/** antd InputNumber 의 placeholder 는 내부 input 에 있다 — element 가 곧 input 일 수 있다. */
function findInnerInput(el: HTMLElement): HTMLInputElement {
  if (el.tagName === "INPUT") return el as HTMLInputElement;
  const inner = el.querySelector("input");
  if (!inner) throw new Error("내부 input 없음");
  return inner as HTMLInputElement;
}

describe("AssetsPage (§31 이관, §40 CRUD)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    clearInflight();
  });

  beforeEach(() => {
    clearToken();
    saveToken("tok", Date.now() + 60_000);
  });

  it("합계와 시드 행을 보여 준다 — 합계는 저장하지 않고 행에서 재계산(§31.1)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(apiResponse(seedAccounts()))));
    render(<AssetsPage onBack={() => {}} />);

    expect(await screen.findByText("우리 파킹통장")).toBeDefined();
    // 합계 = 시드 행의 합 (재계산 — 화면이 값을 소유하지 않는다)
    expect(screen.getAllByText(/합계 761,200,000원/).length).toBeGreaterThan(0);
    // 부채 표: 주택담보대출
    expect(screen.getByText("주택담보대출")).toBeDefined();
  });

  it("자산 추가는 POST 를 보내고 목록을 다시 읽는다", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(apiResponse({ id: 99, accountType: "cash", name: "새 통장", institutionName: "", balance: 5_000_000, isDebt: false, openedAt: null }));
      }
      return Promise.resolve(apiResponse(seedAccounts()));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AssetsPage onBack={() => {}} />);
    await screen.findByText("우리 파킹통장");

    fireEvent.click(screen.getByRole("button", { name: "+ 자산 추가" }));
    const nameInput = await screen.findByPlaceholderText("자산 이름");
    fireEvent.change(findInnerInput(nameInput), { target: { value: "새 통장" } });
    const balanceEl = await screen.findByPlaceholderText("잔액(원)");
    fireEvent.change(findInnerInput(balanceEl), { target: { value: "5000000" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => String(c[0]).includes("/assets/accounts") && (c[1]?.method ?? "GET") === "POST");
      expect(post).toBeDefined();
    });
    // 목록 재로딩: GET 이 두 번(초기 1 + 저장 후 1)
    const gets = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/assets/accounts") && (c[1]?.method ?? "GET") === "GET").length;
    expect(gets).toBe(2);
  });

  it("편집은 PUT 으로 반영된다", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") return Promise.resolve(apiResponse(seedAccounts()[0]));
      return Promise.resolve(apiResponse(seedAccounts()));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AssetsPage onBack={() => {}} />);
    await screen.findByText("우리 파킹통장");

    const editBtn = screen.getAllByRole("button", { name: "편집" })[0];
    if (!editBtn) throw new Error("편집 버튼 없음");
    fireEvent.click(editBtn);
    const balanceEl = await screen.findByPlaceholderText("잔액(원)");
    fireEvent.change(findInnerInput(balanceEl), { target: { value: "19000000" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find((c) => String(c[0]).includes("/assets/accounts/1") && (c[1]?.method ?? "GET") === "PUT");
      expect(put).toBeDefined();
    });
  });

  it("삭제는 DELETE 로 반영된다", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(apiResponse(seedAccounts())));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssetsPage onBack={() => {}} />);
    await screen.findByText("우리 파킹통장");

    const nameEl = screen.getByText("우리 파킹통장");
    // 테스트 환경의 matchMedia 는 모바일 경로를 타므로 tr 대신 카드 래퍼를 찾는다.
    // 모바일 카드에서 이름은 날 것의 div 안에 있고, 카드 래퍼는 그 부모다.
    const firstRow = nameEl.closest("tr") ?? nameEl.closest("div")?.parentElement;
    if (!firstRow) throw new Error("행 없음");
    const dangerBtn = Array.from(firstRow.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("삭제"),
    );
    if (!dangerBtn) throw new Error("삭제 버튼 없음");
    fireEvent.click(dangerBtn);
    // Popconfirm 확인 버튼 (기본 로케일 OK) — 행의 '삭제' 들과 구분된다
    const confirm = await screen.findByRole("button", { name: /OK/i });
    fireEvent.click(confirm);

    await waitFor(() => {
      const del = fetchMock.mock.calls.find((c) => (c[1]?.method ?? "GET") === "DELETE");
      expect(del).toBeDefined();
    });
  });

  it("401 오류는 인증 만료 문구를 보여 준다 (네트워크 오류와 구분)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(apiResponse(null, false, 401))));
    render(<AssetsPage onBack={() => {}} />);
    await screen.findAllByText("데이터를 불러오지 못했습니다");
    expect((await screen.findAllByText("로그인이 만료되었습니다. 다시 로그인해 주세요.")).length).toBeGreaterThan(0);
  });

  it("부채가 비면 비어 있는 것이 정상이라는 문구를 보여 준다 (§31.4)", async () => {
    const seed = seedAccounts().filter((r) => !r.isDebt);
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(apiResponse(seed))));
    render(<AssetsPage onBack={() => {}} />);
    await screen.findByText("우리 파킹통장");
    expect(screen.getByText("부채가 비어 있는 것은 정상이다 (§31.4)")).toBeDefined();
  });
});
