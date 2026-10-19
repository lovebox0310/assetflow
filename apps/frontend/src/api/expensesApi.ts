import { apiFetch } from "./client";

/** §43 — 월 지출 항목 행. 합계는 없다 — 프론트가 행에서 계산한다(§34.6). */
export interface ExpenseItemRow {
  id: number;
  month: string;
  label: string;
  amount: number;
  isEssential: boolean;
  purchaseVat: number;
}

/** §41 — 카드 원장 반영 행(월별 조회). */
export interface CardImportRowFull {
  rowKey: string;
  approvedAt: string;
  merchantName: string;
  supplyExVat: number;
  vat: number;
  grossAmount: number;
  cardMasked?: string;
  expenseKind?: string;
}

/** §44 — 월 스냅샷(시점값, §37). */
export interface MonthSnapshot {
  month: string;
  totalAssets: number;
  totalDebts: number;
  income: number;
  expenses: number;
  essentialExpenses: number;
  essentialComplete: boolean;
}

export interface ItemPayload {
  label: string;
  amount: number;
  isEssential?: boolean;
  purchaseVat?: number;
}

export function listExpenseItems(month: string): Promise<ExpenseItemRow[]> {
  return apiFetch<ExpenseItemRow[]>(`/api/v1/expenses/items?month=${month}`);
}

export function createExpenseItem(month: string, payload: ItemPayload): Promise<ExpenseItemRow> {
  return apiFetch<ExpenseItemRow>(`/api/v1/expenses/items?month=${month}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateExpenseItem(id: number, payload: ItemPayload): Promise<ExpenseItemRow> {
  return apiFetch<ExpenseItemRow>(`/api/v1/expenses/items/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteExpenseItem(id: number): Promise<number> {
  return apiFetch<number>(`/api/v1/expenses/items/${id}`, { method: "DELETE" });
}

export function listCardImports(month: string): Promise<CardImportRowFull[]> {
  return apiFetch<CardImportRowFull[]>(`/api/v1/assets/card-imports?month=${month}`);
}

export function getSnapshot(month: string): Promise<MonthSnapshot | null> {
  return apiFetch<MonthSnapshot | null>(`/api/v1/expenses/snapshots?month=${month}`);
}

/** 월 확정: 수입만 받고 지출·필수 합계는 서버가 원장에서 재계산한다(§44). */
export function confirmMonth(month: string, income: number): Promise<MonthSnapshot> {
  return apiFetch<MonthSnapshot>(`/api/v1/expenses/snapshots?month=${month}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ income }),
  });
}
