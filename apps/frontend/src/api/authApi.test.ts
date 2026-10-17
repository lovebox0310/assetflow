import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loginWithEmail } from "./authApi";
import { clearToken } from "../auth/authStore";

// Issue 7: authApi 는 이제 실제 POST /api/v1/auth/login 을 호출한다.
// jsdom 테스트에서 fetch 를 대체해 응답 포맷(§38 ApiResponse)을 시뮬레이션한다.
function jsonResponse(ok: boolean, body: unknown, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("authApi", () => {
  beforeEach(() => {
    clearToken();
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("이메일이 비면 거절한다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(loginWithEmail({ email: "", password: "password1" }))
      .rejects.toThrow("Invalid credentials");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("비밀번호가 비면 거절한다", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(loginWithEmail({ email: "a@b.com", password: "" }))
      .rejects.toThrow("Invalid credentials");
  });

  it("서버 성공 응답의 토큰을 돌려준다 (§38.2)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(true, { code: "OK", message: "Login success", data: { token: "jwt-from-server" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await loginWithEmail({ email: "a@b.com", password: "password1" });
    expect(out.token).toBe("jwt-from-server");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/auth/login");
  });

  it("이메일 형식이 틀리면 공통 메시지로 거절한다 (§21 경계 검증)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(loginWithEmail({ email: "not-an-email", password: "password1" }))
      .rejects.toThrow("Invalid credentials");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("비밀번호가 8자 미만이면 공통 메시지로 거절한다 (§21 경계 검증)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(loginWithEmail({ email: "a@b.com", password: "1234567" }))
      .rejects.toThrow("Invalid credentials");
  });

  it("성공 시 만료 시각을 함께 돌려준다 (§21 토큰 만료 처리)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse(true, { code: "OK", data: { token: "t" } }),
    ));
    const out = await loginWithEmail({ email: "a@b.com", password: "password1" });
    expect(out.expiresAt).toBeGreaterThan(Date.now());
  });

  it("서버가 거절하면(401) 공통 메시지로 감춘다 (§21 계정 유무 비노출)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse(false, { code: "AUTH_REQUIRED", message: "Authentication required" }, 401),
    ));
    await expect(loginWithEmail({ email: "a@b.com", password: "password1" }))
      .rejects.toThrow("Invalid credentials");
  });

  it("네트워크 실패도 공통 메시지로 감춘다 (§21 정책)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(loginWithEmail({ email: "a@b.com", password: "password1" }))
      .rejects.toThrow("Invalid credentials");
  });
});
