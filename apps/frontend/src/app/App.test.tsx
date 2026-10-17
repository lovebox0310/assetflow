import { beforeEach, describe, expect, it, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";
import { clearToken, saveToken } from "../auth/authStore";

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
    expect(screen.queryByText(/Dashboard/i)).toBeNull();
  });

  it("로그아웃 후 대시보드 재접근이 차단된다 (§21 AC)", async () => {
    saveToken("tok", Date.now() + 60_000);
    render(<App />);
    expect(screen.getByText(/Dashboard/i)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /logout/i }));

    await waitFor(() => expect(screen.getByText(/AssetFlow Login/i)).toBeDefined());
    expect(screen.queryByText(/Dashboard/i)).toBeNull();
  });

  it("로그인 성공 시 대시보드로 전환하고, reload 없이 화면이 바뀐다", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password1" } });
    const form = screen.getByRole("button", { name: /sign in/i }).closest("form");
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => expect(screen.getByText(/Dashboard/i)).toBeDefined());
    expect(screen.queryByText(/AssetFlow Login/i)).toBeNull();
  });

  it("토큰이 만료되면 보호 화면이 로그인으로 되돌아온다 (§21 만료 재로그인 유도)", () => {
    saveToken("tok", Date.now() - 1_000); // 이미 만료
    render(<App />);
    expect(screen.getByText(/AssetFlow Login/i)).toBeDefined();
    expect(screen.queryByText(/Dashboard/i)).toBeNull();
  });
});
