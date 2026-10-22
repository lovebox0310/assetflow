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

  /**
   * #69: 저장/삭제가 실패하면 그 사실이 화면에 드러나야 한다.
   *
   * 이전에는 핸들러가 async 인 채로 onClick/onConfirm 에 그대로 넘겨져
   * reject 가 unhandled promise rejection 이 됐고, UI 는 아무 일도 없던 것처럼
   * 남았다. 아래 테스트는 실패를 주입했을 때 사용자가 볼 수 있는 신호가
   * 실제로 생기는지를 본다 — 수정 전에는 둘 다 실패한다.
   */
  describe("#69 저장/삭제 실패 노출", () => {
    it("저장이 실패하면 role=alert 로 오류를 보여 주고 편집 상태를 유지한다", async () => {
      const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PUT") {
          // 서버 오류를 흉내 낸다. api client 가 message 를 Error 로 올린다.
          return Promise.resolve(apiResponse(null, false, 500));
        }
        return Promise.resolve(apiResponse(seedAccounts()));
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<AssetsPage onBack={() => {}} />);
      await screen.findByText("우리 파킹통장");

      const editBtn = screen.getAllByRole("button", { name: "편집" })[0];
      if (!editBtn) throw new Error("편집 버튼 없음");
      fireEvent.click(editBtn);
      await screen.findByRole("combobox", { name: "계정 유형" });

      fireEvent.click(screen.getByRole("button", { name: "저장" }));

      // 사용자가 볼 수 있는 오류 신호가 있어야 한다 (이전: 조용히 아무 일도 없음)
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBeTruthy();
      // 입력값을 잃지 않는다 — 편집 폼이 그대로 남아 있어야 한다
      expect(screen.getByRole("button", { name: "취소" })).toBeDefined();
    });

    it("삭제가 실패하면 role=alert 로 오류를 보여 주고 행을 남긴다", async () => {
      const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "DELETE") return Promise.resolve(apiResponse(null, false, 500));
        return Promise.resolve(apiResponse(seedAccounts()));
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<AssetsPage onBack={() => {}} />);
      await screen.findByText("우리 파킹통장");

      const delBtn = screen.getAllByRole("button", { name: "삭제" })[0];
      if (!delBtn) throw new Error("삭제 버튼 없음");
      fireEvent.click(delBtn);
      // Popconfirm 확인 버튼 — 기본 로케일이 OK 다(koKR 미설정, 기존 테스트와 동일)
      const confirm = await screen.findByRole("button", { name: /OK/i });
      fireEvent.click(confirm);

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBeTruthy();
      // 실패했으므로 행이 사라지면 안 된다
      expect(screen.getByText("우리 파킹통장")).toBeDefined();
    });
  });

  it("부채가 비면 비어 있는 것이 정상이라는 문구를 보여 준다 (§31.4)", async () => {
    const seed = seedAccounts().filter((r) => !r.isDebt);
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(apiResponse(seed))));
    render(<AssetsPage onBack={() => {}} />);
    await screen.findByText("우리 파킹통장");
    expect(screen.getByText("부채가 비어 있는 것은 정상이다 (§31.4)")).toBeDefined();
  });

  /**
   * #68: 유형이 숨은 필드였을 때는 저장된 값을 읽을 수도 바꿀 수도 없었고,
   * `invest` 유형이 하나도 없어 §28.7 비상금 유지 개월이 0.0 이 나왔다.
   * 아래 3건은 그 입력 경로가 실제로 열렸는지를 고정한다.
   */
  describe("#68 계정 유형 입력 경로", () => {
    it("편집 폼에 계정 유형 Select 가 보이고 현재 저장값을 선택하고 있다", async () => {
      vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(apiResponse(seedAccounts()))));
      render(<AssetsPage onBack={() => {}} />);
      await screen.findByText("우리 파킹통장");

      const editBtn = screen.getAllByRole("button", { name: "편집" })[0];
      if (!editBtn) throw new Error("편집 버튼 없음");
      fireEvent.click(editBtn);

      // 라벨이 붙어 있어야 화면에서 읽을 수 있다 (숨은 필드였던 것이 핵심 결함)
      expect(await screen.findByText("계정 유형")).toBeDefined();
      const combo = await screen.findByRole("combobox", { name: "계정 유형" });
      expect(combo).toBeDefined();
      // antd Select 의 combobox role/값은 입력용 <input> 에 붙고 그 input 은 항상
      // value="" 다(실측). 선택된 값은 .ant-select 래퍼의 텍스트로 읽는다.
      const wrapper = document.querySelector(".ant-select");
      // 시드 0번 행은 dashboardMock 의 첫 자산 = cash → "현금성" 이 선택돼 있어야 한다.
      await waitFor(() => expect(wrapper?.textContent).toBe("현금성"));
    });

    it("유형을 invest 로 바꿔 저장하면 PUT 본문에 invest 가 실린다", async () => {
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

      const combo = await screen.findByRole("combobox", { name: "계정 유형" });
      fireEvent.mouseDown(combo);
      const option = await screen.findByTitle("투자");
      fireEvent.click(option);
      fireEvent.click(screen.getByRole("button", { name: "저장" }));

      await waitFor(() => {
        const put = fetchMock.mock.calls.find((c) => (c[1]?.method ?? "GET") === "PUT");
        expect(put).toBeDefined();
        const body = JSON.parse(String(put?.[1]?.body));
        // 유형이 payload 에 실제로 실려야 한다 — 이전에는 hidden 필드가
        // setFieldsValue 로만 채워져 화면에서 바꿀 방법이 없었다.
        expect(body.accountType).toBe("invest");
      });
    });

    it("유형별 합계를 보여 준다 — invest 합계로 §28.7 분자를 눈으로 확인한다", async () => {
      // cash 1,000,000 + invest 3,000,000 두 행
      const rows = [
        { id: 1, accountType: "cash" as const, name: "현금", institutionName: "", balance: 1_000_000, isDebt: false, openedAt: null },
        { id: 2, accountType: "invest" as const, name: "투자", institutionName: "", balance: 3_000_000, isDebt: false, openedAt: null },
      ];
      vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(apiResponse(rows))));
      render(<AssetsPage onBack={() => {}} />);
      // 행 이름이 "투자" 이므로 합계 텍스트로 대기한다 — getByText("투자") 는
      // 행 이름과 합계 줄 둘 다 잡아 multiple 로 실패한다.
      await screen.findByText(/^투자 3,000,000원$/);

      expect(screen.getByText(/^현금성 1,000,000원$/)).toBeDefined();
      expect(screen.getByText(/^투자 3,000,000원$/)).toBeDefined();
      // 값이 0 인 유형도 자리를 지킨다 — 0 을 숨기면 "행 없음"과 구별되지 않는다
      expect(screen.getByText(/^예적금 0원$/)).toBeDefined();
      expect(screen.getByText(/^부동산·기타 0원$/)).toBeDefined();
      // 총합계는 유형별 합계와 별개로 그대로 (§31.1)
      expect(screen.getAllByText(/합계 4,000,000원/).length).toBeGreaterThan(0);
    });
  });
});
