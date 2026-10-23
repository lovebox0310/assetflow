import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";
import { clearToken, saveToken } from "../auth/authStore";
import { dashboardMock } from "../data/dashboardMock";

// Issue 7: 로그인·대시보드 모두 실제 fetch 를 부른다. 테스트에서 §38 포맷으로
// 응답하는 대역을 심는다 — 서버 없이도 AC 경로를 검증한다.
function apiResponse(data: unknown, ok = true, status = 200): Response {
  const body = ok ? { code: "OK", message: "loaded", data } : { code: "X", message: "err", details: "", timestamp: "" };
  return { ok, status, json: async () => body } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const path = String(input);
    if (path.includes("/auth/login")) {
      return Promise.resolve(apiResponse({ token: "jwt-test", }));
    }
    if (path.includes("/dashboard/summary")) return Promise.resolve(apiResponse(dashboardMock));
    if (path.includes("/dashboard/cashflow")) return Promise.resolve(apiResponse([]));
    return Promise.resolve(apiResponse({}, false, 500));
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// App 은 실제 authApi(mock 토큰)를 쓴다. Issue 7 에서 서버 연동되면
// 이 테스트의 성공 경로가 그대로 AC "정상 계정으로 로그인 시 대시보드 진입"이 된다.
describe("App 인증 흐름", () => {
  afterEach(cleanup);

  beforeEach(() => {
    clearToken();
  });

  it("미로그인 상태에서는 로그인 화면만 보인다 (§21 보호 라우트)", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "로그인" })).toBeDefined();
    expect(screen.queryByText("핵심 지표")).toBeNull();
  });

  it("로그아웃 후 대시보드 재접근이 차단된다 (§21 AC)", async () => {
    saveToken("tok", Date.now() + 60_000);
    render(<App />);
    expect(screen.getByText("핵심 지표")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /로그아웃/ }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "로그인" })).toBeDefined());
    expect(screen.queryByText("핵심 지표")).toBeNull();
  });

  it("로그인 성공 시 대시보드로 전환하고, reload 없이 화면이 바뀐다", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "password1" } });
    const form = screen.getByRole("button", { name: "로그인" }).closest("form");
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => expect(screen.getByText("핵심 지표")).toBeDefined());
    expect(screen.queryByRole("heading", { name: "로그인" })).toBeNull();
  });

  it("토큰이 만료되면 보호 화면이 로그인으로 되돌아온다 (§21 만료 재로그인 유도)", () => {
    saveToken("tok", Date.now() - 1_000); // 이미 만료
    render(<App />);
    expect(screen.getByRole("heading", { name: "로그인" })).toBeDefined();
    expect(screen.queryByText("핵심 지표")).toBeNull();
  });

describe("401 자동 로그아웃 (이슈 #38)", () => {
  it("어떤 화면에서든 401 응답이 오면 토큰 정리 후 로그인 화면으로 전환한다", async () => {
    saveToken("tok", Date.now() + 60_000);
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/dashboard/summary")) {
        return Promise.resolve({ ok: false, status: 401, json: async () => ({ code: "AUTH_REQUIRED", message: "Authentication required", details: "", timestamp: "" }) } as Response);
      }
      if (path.includes("/dashboard/cashflow")) return Promise.resolve(apiResponse([]));
      return Promise.resolve(apiResponse({}, false, 500));
    }));
    render(<App />);

    // summary 가 401 → 토큰 정리 + 로그인 화면 전환
    await screen.findByRole("heading", { name: "로그인" });
  });
});
});

describe("URL 상태 동기화 (이슈 #72)", () => {
  afterEach(cleanup);

  beforeEach(() => {
    // 테스트마다 주소·제목을 초기화한다. 이전 테스트의 해시가 남으면 App 의 초기 화면이 흔들린다.
    window.history.replaceState(null, "", "/");
    document.title = "";
    clearToken();
    saveToken("tok", Date.now() + 60_000);
  });

  it("내비 클릭이 URL·탭 제목·aria-current 를 함께 바꾼다", async () => {
    render(<App />);
    await screen.findByText("핵심 지표");

    fireEvent.click(screen.getByRole("button", { name: "자산" }));

    expect(await screen.findByRole("heading", { name: "자산" })).toBeDefined();
    expect(window.location.hash).toBe("#/assets");
    expect(document.title).toBe("자산 · AssetFlow");
    expect(screen.getByRole("button", { name: "자산" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "대시보드" }).getAttribute("aria-current")).toBeNull();
  });

  it("자산 하위의 투자 화면으로 들어가도 URL·제목이 바뀌고 전역 nav 는 자산이 현재다", async () => {
    render(<App />);
    await screen.findByText("핵심 지표");

    fireEvent.click(screen.getByRole("button", { name: "자산" }));
    await screen.findByRole("heading", { name: "자산" });
    fireEvent.click(screen.getByRole("button", { name: "투자 탭" }));

    expect(await screen.findByRole("heading", { name: "투자" })).toBeDefined();
    expect(window.location.hash).toBe("#/investments");
    expect(document.title).toBe("투자 · AssetFlow");
    expect(screen.getByRole("button", { name: "자산" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "투자 탭" }).getAttribute("aria-current")).toBe("page");
  });

  it("뒤로가기(popstate) 면 이전 화면으로 돌아온다", async () => {
    render(<App />);
    await screen.findByText("핵심 지표");
    fireEvent.click(screen.getByRole("button", { name: "지출" }));
    await screen.findByRole("heading", { name: "지출" });

    // jsdom 의 history.back() 은 비동기·불안정하므로, 주소를 되돌린 뒤 브라우저가 보내는
    // popstate 를 직접 보낸다. App 의 리스너 경로는 실제 뒤로가기와 같다.
    window.history.replaceState(null, "", "#/");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(await screen.findByText("핵심 지표")).toBeDefined();
    expect(document.title).toBe("대시보드 · AssetFlow");
    expect(screen.getByRole("button", { name: "대시보드" }).getAttribute("aria-current")).toBe("page");
  });

  it("새로고침·딥링크: 해시로 진입하면 그 화면이 유지된다", async () => {
    window.history.replaceState(null, "", "#/settings");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "설정" })).toBeDefined();
    expect(document.title).toBe("설정 · AssetFlow");
    expect(window.location.hash).toBe("#/settings");
  });

  it("미인증 딥링크는 로그인 화면을 거쳐 원래 경로로 복귀한다", async () => {
    clearToken();
    window.history.replaceState(null, "", "#/expenses");
    render(<App />);

    expect(await screen.findByRole("heading", { name: /로그인|login/i })).toBeDefined();
    expect(document.title).toBe("로그인 · AssetFlow");

    // #74(한국어화) 전후 어느 라벨이든 통과하도록 두 언어를 함께 받는다.
    fireEvent.change(screen.getByLabelText(/이메일|email/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/비밀번호|password/i), { target: { value: "password1" } });
    const form = screen.getByRole("button", { name: /로그인|sign in/i }).closest("form");
    fireEvent.submit(form as HTMLFormElement);

    expect(await screen.findByRole("heading", { name: "지출" })).toBeDefined();
    expect(window.location.hash).toBe("#/expenses");
  });

  it("알 수 없는 해시는 대시보드로 정규화한다", async () => {
    window.history.replaceState(null, "", "#/nope");
    render(<App />);

    expect(await screen.findByText("핵심 지표")).toBeDefined();
    expect(window.location.hash).toBe("#/");
    expect(document.title).toBe("대시보드 · AssetFlow");
  });
});
