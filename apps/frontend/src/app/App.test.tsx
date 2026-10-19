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
    expect(screen.getByText(/AssetFlow Login/i)).toBeDefined();
    expect(screen.queryByText("핵심 지표")).toBeNull();
  });

  it("로그아웃 후 대시보드 재접근이 차단된다 (§21 AC)", async () => {
    saveToken("tok", Date.now() + 60_000);
    render(<App />);
    expect(screen.getByText("핵심 지표")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /로그아웃/ }));

    await waitFor(() => expect(screen.getByText(/AssetFlow Login/i)).toBeDefined());
    expect(screen.queryByText("핵심 지표")).toBeNull();
  });

  it("로그인 성공 시 대시보드로 전환하고, reload 없이 화면이 바뀐다", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password1" } });
    const form = screen.getByRole("button", { name: /sign in/i }).closest("form");
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => expect(screen.getByText("핵심 지표")).toBeDefined());
    expect(screen.queryByText(/AssetFlow Login/i)).toBeNull();
  });

  it("토큰이 만료되면 보호 화면이 로그인으로 되돌아온다 (§21 만료 재로그인 유도)", () => {
    saveToken("tok", Date.now() - 1_000); // 이미 만료
    render(<App />);
    expect(screen.getByText(/AssetFlow Login/i)).toBeDefined();
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
    await screen.findByText(/AssetFlow Login/i);
  });
});
});
