import type { LoginInput, LoginOutput } from "../types/auth";
import { validateLoginInput, hasErrors } from "../auth/validate";

/** Issue 6/7 에서 서버가 주는 만료시로 대체될 때까지의 로컬 기본값 (1시간). */
export const MOCK_SESSION_TTL_MS = 60 * 60 * 1000;

export async function loginWithEmail(payload: LoginInput): Promise<LoginOutput> {
  // TODO: replace with real API request once backend auth endpoint is connected
  // (Issue 6 API 명세 → Issue 7 FE-BE 연동). 형식 검증까지 여기서 한 번 더 거치는
  // 것은 경계 검증: 화면 검증을 우회하고 들어온 호출도 통과하지 못하게 한다.
  if (hasErrors(validateLoginInput(payload))) {
    // §21 보안 기준: 계정 유무를 노출하지 않는 공통 메시지.
    throw new Error("Invalid credentials");
  }

  return {
    token: "mock-jwt-token",
    expiresAt: Date.now() + MOCK_SESSION_TTL_MS,
  };
}
