import { apiFetch } from "./client";

/** §43 — 월 지출 항목 행. 합계는 없다 — 프론트가 행에서 계산한다(§34.6). */
export interface ExpenseItemRow {
  id: number;
  month: string;
  label: string;
  amount: number;
  isEssential: boolean;
  purchaseVat: number;
  recurringId: number | null;
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
  subCategory?: string;
  businessNo?: string;
  businessCategory?: string;
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

/** §45 — 정기(고정) 지출 정의. endMonth null = 무기한. */
export interface RecurringRow {
  id: number;
  label: string;
  amount: number;
  isEssential: boolean;
  purchaseVat: number;
  startMonth: string;
  endMonth: string | null;
}

export interface RecurringPayload {
  label: string;
  amount: number;
  isEssential?: boolean;
  purchaseVat?: number;
  startMonth: string;
  endMonth?: string | null;
}

export function listRecurring(): Promise<RecurringRow[]> {
  return apiFetch<RecurringRow[]>("/api/v1/expenses/recurring");
}

export function createRecurring(payload: RecurringPayload): Promise<RecurringRow> {
  return apiFetch<RecurringRow>("/api/v1/expenses/recurring", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateRecurring(id: number, payload: RecurringPayload): Promise<RecurringRow> {
  return apiFetch<RecurringRow>(`/api/v1/expenses/recurring/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteRecurring(id: number): Promise<number> {
  return apiFetch<number>(`/api/v1/expenses/recurring/${id}`, { method: "DELETE" });
}

/** §45.5 월 항목을 그 값 그대로 정기 정의로 등록하고 행을 연결한다(서버 연산). */
export function convertItemToRecurring(id: number, month: string): Promise<RecurringRow> {
  return apiFetch<RecurringRow>(`/api/v1/expenses/items/${id}/convert-to-recurring`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startMonth: month }),
  });
}

/** §45.4 지난달 복사 — 멱등(중복 label 건너뜀). */
export function copyItems(from: string, to: string): Promise<number> {
  return apiFetch<number>(`/api/v1/expenses/items/copy?from=${from}&to=${to}`, { method: "POST" });
}
