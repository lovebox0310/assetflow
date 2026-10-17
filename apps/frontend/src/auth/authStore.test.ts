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

  it("만료 시각이 지난 토큰은 없는 토큰과 같다 (§21 토큰 만료 처리)", () => {
    saveToken("token-1", Date.now() - 1_000);
    expect(isAuthenticated()).toBe(false);
    // 만료를 감지하면 저장소도 정리해야 재접속 시 로그인 화면이 유지된다.
    expect(localStorage.getItem("assetflow.token")).toBeNull();
  });

  it("만료 전 토큰은 인증 상태를 유지한다", () => {
    saveToken("token-1", Date.now() + 60_000);
    expect(isAuthenticated()).toBe(true);
  });

  it("만료 시각이 없으면 세션 토큰으로 둔다 (Issue 7 에서 서버 만료시로 대체)", () => {
    saveToken("token-1");
    expect(isAuthenticated()).toBe(true);
  });
});
