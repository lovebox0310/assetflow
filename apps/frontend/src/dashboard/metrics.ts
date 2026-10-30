import type { AssetType, DashboardData } from "../data/dashboardMock";
import type { CashflowRow } from "../api/dashboardApi";
import { currentMonth, monthsEndingAt, previousMonth } from "../utils/months";

/**
 * §23 표시 규칙의 단일 구현체. 카드는 이 값들을 포맷만 해 보여 준다 —
 * 계산이 화면에 중복되지 않는다 (§34.6 단일 출처 관례).
 */

export interface CompositionSlice {
  type: AssetType;
  label: string;
  value: number;
  /** 백분율(0-100). 소수 둘째 자리까지 자른 뒤 합계 보정은 화면에서 하지 않는다. */
  percent: number;
}

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  cash: "현금성",
  deposit: "예적금",
  invest: "투자",
  realty: "부동산·기타",
};

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

/** 순자산 = 총자산 - 총부채 */
export function netWorth(data: DashboardData): number {
  return sum(data.assets.map((a) => a.value)) - sum(data.liabilities.map((l) => l.balance));
}

/** 월 수지 = 월 총수입 - 부가세통장 이체 - 월 총지출 (§57.9) */
export function monthlyBalance(data: DashboardData): number {
  return data.monthly.income - data.monthly.vatSetAside - data.monthly.expenses;
}

/**
 * 비상금 유지 개월 = 비상금 통장 잔액 / 월 사용액 (§59)
 *
 * - 분자: 사용자가 지정한 **현금성(cash) 비상금 통장들의 잔액 합계**.
 *   예적금(deposit)과 용도가 정해진 계좌(자동이체·부가세 등)는 지정하지 않는 방식으로 제외한다.
 * - 분모: 월 필수지출(고정) + 선택 카테고리 카드지출의 N개월 평균(변동).
 *   평균은 당월을 뺀 이전 N개월을 먼저 본다. 이전 카드 데이터가 전혀 없을 때만
 *   당월(진행 중)로 폴백한다. 카드 데이터가 없는 달은 0원으로 메우지 않는다.
 * - 예측 비상금 = 월 사용액 × 목표 개월.
 */
export interface EmergencyCardTotal {
  /** YYYY-MM */
  month: string;
  category: string;
  gross: number;
}

export interface EmergencyRunwayInput {
  assets: DashboardData["assets"];
  /** 지출 화면 단일 출처의 월 필수지출. */
  essentialExpenses: number;
  targetMonths: number;
  /** 비상금 통장으로 지정한 현금성 계좌 id 목록. */
  emergencyAccountIds: readonly string[];
  selectedCategories: readonly string[];
  /** 당월 제외 이전 N개월. */
  avgMonths: number;
  /** source=card 로 조회한 월별 대분류 합계(당월 + 이전 12개월이면 충분). */
  cardTotals: readonly EmergencyCardTotal[];
  now?: Date;
}

export interface EmergencyRunway {
  accountBalance: number;
  /** 비상금 통장이 하나 이상 지정됐는가. false 면 개월 수를 계산하지 않는다. */
  accountSelected: boolean;
  /** 잔액 합계에 실제로 포함된 현금성 계좌 수. */
  accountCount: number;
  fixedMonthly: number;
  variableMonthly: number;
  monthlySpend: number;
  predictedFund: number;
  runwayMonths: number | null;
  /** 실제 카드 데이터가 있는 달 수 — 요청한 avgMonths 와 다를 수 있다. */
  monthsWithCardData: number;
  /** 집계에 쓴 창(YYYY-MM, 오름차순). */
  window: string[];
  usedCurrentMonthFallback: boolean;
  unclassifiedTotal: number;
}

export function emergencyRunway(input: EmergencyRunwayInput): EmergencyRunway {
  const now = input.now ?? new Date();
  const current = currentMonth(now);
  const avgMonths = Math.max(1, Math.min(12, Math.trunc(input.avgMonths) || 1));
  const requestedWindow = monthsEndingAt(previousMonth(current), avgMonths);

  let window = requestedWindow;
  let rows = input.cardTotals.filter((row) => requestedWindow.includes(row.month));
  let usedCurrentMonthFallback = false;
  if (rows.length === 0) {
    window = [current];
    rows = input.cardTotals.filter((row) => row.month === current);
    usedCurrentMonthFallback = true;
  }

  const monthsWithCardData = new Set(rows.map((row) => row.month)).size;
  const selected = new Set(input.selectedCategories);
  const selectedTotal = rows.reduce(
    (acc, row) => (selected.has(row.category) ? acc + (Number(row.gross) || 0) : acc),
    0,
  );
  const variableMonthly = monthsWithCardData > 0 ? selectedTotal / monthsWithCardData : 0;
  const fixedMonthly = input.essentialExpenses > 0 ? input.essentialExpenses : 0;
  const monthlySpend = fixedMonthly + variableMonthly;

  const accountSelected = input.emergencyAccountIds.length > 0;
  // 지정된 id 중 현금성 계좌만 합산한다. 예적금·투자 계좌가 섞여 들어와도 분자에 더하지 않는다.
  const selectedAccounts = input.assets.filter(
    (asset) => asset.type === "cash" && input.emergencyAccountIds.includes(asset.id),
  );
  const accountBalance = sum(selectedAccounts.map((asset) => asset.value));
  const accountCount = selectedAccounts.length;
  const runwayMonths =
    accountSelected && monthlySpend > 0 ? accountBalance / monthlySpend : null;

  return {
    accountBalance,
    accountSelected,
    accountCount,
    fixedMonthly,
    variableMonthly,
    monthlySpend,
    predictedFund: monthlySpend * input.targetMonths,
    runwayMonths,
    monthsWithCardData,
    window,
    usedCurrentMonthFallback,
    unclassifiedTotal: rows
      .filter((row) => row.category === "미분류")
      .reduce((acc, row) => acc + (Number(row.gross) || 0), 0),
  };
}

/**
 * 투자금 유지 개월 = 투자금 총액 / 월 사용액.
 *
 * - 분자: 투자(invest) 계좌 총액(예수금 + 보유종목 평가액).
 * - 분모: 비상금과 같은 §59 월 사용액. 생략하면 기존처럼 월 필수지출만 쓴다.
 */
export function investMonths(data: DashboardData, monthlySpend?: number): number | null {
  const denominator = monthlySpend ?? data.monthly.essentialExpenses;
  if (denominator <= 0) return null;
  return investTotal(data) / denominator;
}

/** 투자금 총액. */
export function investTotal(data: DashboardData): number {
  return sum(data.assets.filter((a) => a.type === "invest").map((a) => a.value));
}

/** 자산 구성비 = 유형별 비율, 합계 100.0 (§23) */
export function assetComposition(data: DashboardData): CompositionSlice[] {
  const total = sum(data.assets.map((a) => a.value));
  const types = Object.keys(ASSET_TYPE_LABELS) as AssetType[];
  const slices = types
    .map((type) => {
      const value = sum(data.assets.filter((a) => a.type === type).map((a) => a.value));
      return { type, label: ASSET_TYPE_LABELS[type], value, percent: total > 0 ? (value / total) * 100 : 0 };
    })
    .filter((s) => s.value > 0);
  if (slices.length === 0) return slices;
  // 소수 1자리 반올림 합이 100.0 이 어긋날 수 있다. 마지막 조각에 잔차를 흡수시킨다
  // (부채 스케줄 마지막 회차와 같은 계약, §34 계열).
  const rounded = slices.map((s) => Math.round(s.percent * 10) / 10);
  const drift = Math.round((100 - sum(rounded)) * 10) / 10;
  const biggest = rounded.reduce((bi, v, i) => (v > (rounded[bi] ?? -1) ? i : bi), 0);
  rounded[biggest] = Math.round(((rounded[biggest] ?? 0) + drift) * 10) / 10;
  return slices.map((s, i) => ({ ...s, percent: rounded[i] ?? s.percent }));
}

/** 현금 계좌 수 — 대시보드 "현금 N계좌" 제목의 단일 출처 (#73). */
export function cashAccountCount(data: DashboardData): number {
  return data.assets.filter((a) => a.type === "cash").length;
}

export interface CashflowMonth {
  /** YYYY-MM */
  month: string;
  income: number | null;
  vatSetAside: number | null;
  expenses: number | null;
  /**
   * 수지 = **그 달** 수입 − **그 달** 부가세통장 이체 − **그 달** 지출.
   * 이전 달 수지를 더하지 않는다(누적 아님). 미확정 월은 null.
   * 화면은 이 값만 포맷한다 — 계산을 다시 하지 않는다 (§34.6 단일 출처).
   */
  balance: number | null;
  /** 확정 스냅샷이 있는 월인가. false 면 금액을 0 으로 메우지 않고 "미확정"으로 보여 준다. */
  confirmed: boolean;
}

/**
 * 최근 N개월(당월 포함) 창을 만든다 (§35.1 6개월, #73).
 * 서버는 **확정된 스냅샷만** 돌려주므로(§34.6 폴다운) 행이 없는 월이 생긴다.
 * 그 월을 mock 이나 0원으로 채우지 않고 `confirmed:false` 로 남겨 화면이 "미확정"을
 * 드러내게 한다 (§34.6 "없는 값을 있는 척하지 않는다").
 */
export function cashflowWindow(
  rows: CashflowRow[],
  months: number,
  today: Date = new Date(),
): CashflowMonth[] {
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  const window: CashflowMonth[] = [];
  for (let i = 0; i < months; i += 1) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const row = byMonth.get(key);
    window.push(
      row
        ? {
            month: key,
            income: row.income,
            vatSetAside: row.vatSetAside,
            expenses: row.expenses,
            // 서버가 계산한 그 달 수지를 그대로 쓴다(§34.6).
            balance: row.balance,
            confirmed: true,
          }
        : { month: key, income: null, vatSetAside: null, expenses: null, balance: null, confirmed: false },
    );
  }
  return window;
}
