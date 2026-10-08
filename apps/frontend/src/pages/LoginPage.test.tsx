import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LoginPage } from "./LoginPage";
import { clearToken, isAuthenticated } from "../auth/authStore";

describe("LoginPage", () => {
  // vitest globals 를 켜지 않았으므로 정리를 직접 한다. 두 번 렌더하면
  // 화면이 두 개라 "버튼이 두 개" 라며 쿼리가 실패한다.
  afterEach(cleanup);

  beforeEach(() => {
    clearToken();
  });

  it("이메일·비밀번호 칸과 로그인 버튼을 보여 준다", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/email/i)).toBeDefined();
    expect(screen.getByLabelText(/password/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeDefined();
    expect(isAuthenticated()).toBe(false);
  });

  // 빈 값으로 보내는 경로는 브라우저 검증이 막기 전에 화면이 막아 줘야 한다.
  // fireEvent.submit 은 브라우저 검증을 건너뛰고 onSubmit 을 직접 부른다.
  it("자격 증명이 비면 토큰을 만들지 않고 오류를 보여 준다", async () => {
    render(<LoginPage />);
    const form = screen.getByRole("button", { name: /sign in/i }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    expect(await screen.findByRole("alert")).toBeDefined();
    expect(isAuthenticated()).toBe(false);
  });
});
