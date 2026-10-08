import { beforeEach, describe, expect, it } from "vitest";
import { clearToken, isAuthenticated, saveToken } from "./authStore";

describe("authStore", () => {
  beforeEach(() => {
    clearToken();
  });

  it("시작은 로그인 전이다", () => {
    expect(isAuthenticated()).toBe(false);
  });

  it("토큰을 저장한다", () => {
    saveToken("token-1");
    expect(isAuthenticated()).toBe(true);
  });

  it("로그아웃하면 토큰이 사라진다", () => {
    saveToken("token-1");
    clearToken();
    expect(isAuthenticated()).toBe(false);
  });
});
