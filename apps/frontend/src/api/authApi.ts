import type { LoginInput, LoginOutput } from "../types/auth";

export async function loginWithEmail(payload: LoginInput): Promise<LoginOutput> {
  // TODO: replace with real API request once backend auth endpoint is connected.
  if (!payload.email || !payload.password) {
    throw new Error("Invalid credentials");
  }

  return Promise.resolve({ token: "mock-jwt-token" });
}
