import { apiFetch, dedupe } from "./client";
import type { DashboardData } from "../data/dashboardMock";

/** §38.4: month 'YYYY-MM', 금액 원 단위 정수, 최신 월이 arr[0]. */
export interface CashflowRow {
  month: string;
  income: number;
  expenses: number;
}

/** §26 작업표의 months=3 기본값. 1..12 밖은 서버가 400 으로 막는다. */
export const DEFAULT_CASHFLOW_MONTHS = 3;

/** 중복 호출 방지(dedupe)는 클라이언트가 맡는다 — 이 함수의 키 고정. */
export function fetchDashboardSummary(): Promise<DashboardData> {
  return dedupe("dashboard.summary", () => apiFetch<DashboardData>("/api/v1/dashboard/summary"));
}

export function fetchCashflow(months: number = DEFAULT_CASHFLOW_MONTHS): Promise<CashflowRow[]> {
  return dedupe(`dashboard.cashflow.${months}`, () =>
    apiFetch<CashflowRow[]>(`/api/v1/dashboard/cashflow?months=${months}`),
  );
}
