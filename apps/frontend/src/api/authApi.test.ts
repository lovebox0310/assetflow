import { describe, expect, it } from "vitest";
import { loginWithEmail } from "./authApi";

describe("authApi", () => {
  it("이메일이 비면 거절한다", async () => {
    await expect(loginWithEmail({ email: "", password: "password1" }))
      .rejects.toThrow("Invalid credentials");
  });

  it("비밀번호가 비면 거절한다", async () => {
    await expect(loginWithEmail({ email: "a@b.com", password: "" }))
      .rejects.toThrow("Invalid credentials");
  });

  it("둘 다 있으면 토큰을 돌려준다", async () => {
    const out = await loginWithEmail({ email: "a@b.com", password: "password1" });
    expect(out.token).toBeTruthy();
  });

  it("이메일 형식이 틀리면 공통 메시지로 거절한다 (§21 경계 검증)", async () => {
    await expect(loginWithEmail({ email: "not-an-email", password: "password1" }))
      .rejects.toThrow("Invalid credentials");
  });

  it("비밀번호가 8자 미만이면 공통 메시지로 거절한다 (§21 경계 검증)", async () => {
    await expect(loginWithEmail({ email: "a@b.com", password: "1234567" }))
      .rejects.toThrow("Invalid credentials");
  });

  it("성공 시 만료 시각을 함께 돌려준다 (§21 토큰 만료 처리)", async () => {
    const out = await loginWithEmail({ email: "a@b.com", password: "password1" });
    expect(out.expiresAt).toBeGreaterThan(Date.now());
  });
});
