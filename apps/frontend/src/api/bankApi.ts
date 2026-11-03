import { apiFetch, dedupe } from "./client";

/**
 * §61 은행 잔액 빠른조회 API 클라이언트.
 *
 * 계좌번호는 서버가 암호화해 저장하고 목록에는 마스킹해서만 내려준다.
 * 계좌 비밀번호·생년월일은 **저장하지 않는다** — 연결·동기화 요청 본문에만 실린다.
 */

/** 무로그인 빠른조회 지원 은행. 서버 `BankCode` 와 같은 4개다. */
export interface BankOption {
  code: string;
  label: string;
}

export interface BankLink {
  accountId: number;
  bankCode: string;
  bankLabel: string;
  accountNumberMasked: string;
  accountType: "personal" | "business";
  lastSyncedAt: string | null;
  lastBalance: number | null;
}

export interface BankTransaction {
  date: string;
  time: string;
  description: string;
  displayName: string;
  counterparty: string;
  amount: number;
  balance: number;
  type: string;
  branch: string;
  memo: string;
}

export interface BankSyncResult {
  accountId: number;
  bankCode: string;
  balance: number;
  transactionCount: number;
  latest: BankTransaction | null;
  syncedAt: string;
}

export interface BankLinkResult {
  link: BankLink;
  sync: BankSyncResult;
}

export interface BankLinkRequest {
  bankCode: string;
  accountNumber: string;
  accountPassword: string;
  residentNumber: string;
  accountType?: "personal" | "business";
}

export interface BankSyncRequest {
  accountPassword: string;
  residentNumber: string;
  days?: number;
}

/**
 * 서버가 목록을 주지 못할 때 쓰는 기본값. 서버 응답을 우선하되,
 * 테스트·오프라인에서도 은행 선택지가 비지 않게 한다.
 */
export const FALLBACK_BANKS: BankOption[] = [
  { code: "NH", label: "농협은행" },
  { code: "KB", label: "국민은행" },
  { code: "WR", label: "우리은행" },
  { code: "IBK", label: "기업은행" },
];

/** 지원 은행 목록. 응답 형식이 다르면(구버전·목업) 기본 목록으로 폴백한다. */
export async function listBankOptions(): Promise<BankOption[]> {
  try {
    const banks = await apiFetch<BankOption[]>("/api/v1/assets/bank/banks");
    const valid = Array.isArray(banks)
      ? banks.filter((bank) => typeof bank?.code === "string" && typeof bank?.label === "string")
      : [];
    return valid.length > 0 ? valid : FALLBACK_BANKS;
  } catch {
    return FALLBACK_BANKS;
  }
}

export function listBankLinks(): Promise<BankLink[]> {
  return dedupe("assets.bankLinks", () => apiFetch<BankLink[]>("/api/v1/assets/bank-links"));
}

export function linkBankAccount(accountId: number, payload: BankLinkRequest): Promise<BankLinkResult> {
  return apiFetch<BankLinkResult>(`/api/v1/assets/accounts/${accountId}/bank-link`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function unlinkBankAccount(accountId: number): Promise<number> {
  return apiFetch<number>(`/api/v1/assets/accounts/${accountId}/bank-link`, { method: "DELETE" });
}

export function syncBankAccount(accountId: number, payload: BankSyncRequest): Promise<BankSyncResult> {
  return apiFetch<BankSyncResult>(`/api/v1/assets/accounts/${accountId}/bank-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** 목록 응답을 신뢰하기 전에 모양을 확인한다 — 다른 GET 응답이 섞여 와도 무시한다. */
export function isBankLink(value: unknown): value is BankLink {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Partial<BankLink>;
  return typeof row.accountId === "number" && typeof row.bankCode === "string";
}
