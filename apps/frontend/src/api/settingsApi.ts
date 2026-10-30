import { apiFetch } from "./client";

/** §46 — 설정 화면 값. 이메일은 토큰 subject. */
export interface UserSettings {
  id: number;
  email: string;
  displayName: string;
  targetMonths: number;
  /** §59 비상금 통장(현금성 계좌) id 목록. 자산 API 와 같은 문자열 형식. 미지정이면 빈 배열. */
  emergencyAccountIds?: string[];
  /** 카드지출 평균 개월 수 — 당월 제외 이전 N개월. */
  emergencyAvgMonths?: number;
  /** 변동지출로 볼 9개 대분류. */
  emergencyCategories?: string[];
}

/**
 * 모든 필드는 선택 — 보내지 않은 필드는 서버가 기존 값을 유지한다.
 * emergencyAccountIds 에 [] 를 보내면 지정 해제.
 */
export interface SettingsUpdateInput {
  targetMonths?: number;
  emergencyAccountIds?: string[];
  emergencyAvgMonths?: number;
  emergencyCategories?: string[];
}

export function getSettings(): Promise<UserSettings> {
  return apiFetch<UserSettings>("/api/v1/settings");
}

export function updateSettings(input: SettingsUpdateInput): Promise<UserSettings> {
  return apiFetch<UserSettings>("/api/v1/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
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
