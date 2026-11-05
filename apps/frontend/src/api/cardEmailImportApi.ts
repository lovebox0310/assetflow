import { apiFetch } from "./client";

/** §63 — 카드 이메일 명세서 자동 수집 설정. */
export interface CardEmailImportSettings {
  id: number;
  enabled: boolean;
  cardCompany: string;
  emailProvider: string;
  emailAddress: string;
  lastImportStatus?: string | null;
}

export interface CardEmailImportSettingsInput {
  enabled: boolean;
  emailProvider: string;
  emailAddress: string;
  emailPassword: string;
  vestmailPassword: string;
}

const basePath = "/api/v1/card-email-import-settings";

export function getCardEmailImportSettings(
  cardCompany: string,
): Promise<CardEmailImportSettings> {
  return apiFetch<CardEmailImportSettings>(`${basePath}/${cardCompany}`);
}

export function saveCardEmailImportSettings(
  cardCompany: string,
  input: CardEmailImportSettingsInput,
): Promise<CardEmailImportSettings> {
  return apiFetch<CardEmailImportSettings>(`${basePath}/${cardCompany}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteCardEmailImportSettings(cardCompany: string): Promise<void> {
  return apiFetch<void>(`${basePath}/${cardCompany}`, { method: "DELETE" });
}

export function runCardEmailImport(cardCompany: string): Promise<number> {
  return apiFetch<number>(`${basePath}/${cardCompany}/run`, { method: "POST" });
}
