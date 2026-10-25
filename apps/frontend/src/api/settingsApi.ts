import { apiFetch } from "./client";

/** §46 — 설정 화면 값. 이메일은 토큰 subject. */
export interface UserSettings {
  id: number;
  email: string;
  displayName: string;
  targetMonths: number;
}

export function getSettings(): Promise<UserSettings> {
  return apiFetch<UserSettings>("/api/v1/settings");
}

export function updateSettings(targetMonths: number): Promise<UserSettings> {
  return apiFetch<UserSettings>("/api/v1/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetMonths }),
  });
}

export interface PasswordUpdateInput {
  currentPassword: string;
  newPassword: string;
}

export function updatePassword(input: PasswordUpdateInput): Promise<void> {
  return apiFetch<void>("/api/v1/auth/password", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
