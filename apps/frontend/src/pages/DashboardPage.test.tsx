import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DashboardPage } from "./DashboardPage";
import { clearToken, isAuthenticated, saveToken } from "../auth/authStore";

describe("DashboardPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    clearToken();
  });

  it("로그아웃 버튼은 토큰을 지우고 onLogout 을 부른다 (§21 로그아웃 처리)", () => {
    saveToken("tok", Date.now() + 60_000);
    const onLogout = vi.fn();
    render(<DashboardPage onLogout={onLogout} />);

    fireEvent.click(screen.getByRole("button", { name: /logout/i }));

    expect(isAuthenticated()).toBe(false);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
