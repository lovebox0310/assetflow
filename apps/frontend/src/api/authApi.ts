import type { LoginInput, LoginOutput } from "../types/auth";
import { validateLoginInput, hasErrors } from "../auth/validate";
import { apiUrl } from "./base";

/** 서버가 만료시를 주기 전까지의 로컬 기본값 (§21 만료 처리 유지). */
export const SESSION_TTL_MS = 60 * 60 * 1000;

export async function loginWithEmail(payload: LoginInput): Promise<LoginOutput> {
  // 형식 검증을 API 계층에서 한 번 더 거친다: 화면 검증을 우회해 호출해도 통과하지 못한다.
  if (hasErrors(validateLoginInput(payload))) {
    throw new Error("Invalid credentials");
  }

  // Issue 7 연동: POST /api/v1/auth/login (§38.2). 실패는 계정 유무를 노출하지
  // 않는 공통 메시지로 감춘다 (§21) — 네트워크 오류여도 같은 메시지가 정책이다.
  try {
    const response = await fetch(apiUrl("/api/v1/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as
      | { code?: string; data?: { token?: string } }
      | null;
    const token = body?.data?.token;
    if (!response.ok || !body || body.code !== "OK" || !token) {
      throw new Error("server rejected");
    }
    return { token, expiresAt: Date.now() + SESSION_TTL_MS };
  } catch {
    throw new Error("Invalid credentials");
  }
}
