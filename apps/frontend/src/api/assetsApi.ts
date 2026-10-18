import { apiFetch, dedupe } from "./client";

/** §40.3 AssetRow — 백엔드 원장 행. 계산(합계·구성비)은 metrics.ts 가 한다 (§31.1). */
export interface AssetAccountRow {
  id: number;
  accountType: "cash" | "deposit" | "invest" | "realty";
  name: string;
  institutionName: string;
  balance: number;
  isDebt: boolean;
  openedAt: string | null;
}

/** §40.2 검증 규칙을 화면이 보내는 형태에도 동일 적용한다. */
export interface UpsertPayload {
  accountType: AssetAccountRow["accountType"];
  name: string;
  institutionName?: string;
  balance: number;
  isDebt: boolean;
  openedAt?: string | null;
}

export function listAccounts(): Promise<AssetAccountRow[]> {
  return dedupe("assets.accounts", () => apiFetch<AssetAccountRow[]>("/api/v1/assets/accounts"));
}

export function createAccount(payload: UpsertPayload): Promise<AssetAccountRow> {
  return apiFetch<AssetAccountRow>("/api/v1/assets/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateAccount(id: number, payload: UpsertPayload): Promise<AssetAccountRow> {
  return apiFetch<AssetAccountRow>(`/api/v1/assets/accounts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteAccount(id: number): Promise<number> {
  return apiFetch<number>(`/api/v1/assets/accounts/${id}`, { method: "DELETE" });
}
