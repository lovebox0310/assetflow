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
});
