import type { AssetType, DashboardData } from "../data/dashboardMock";
import type { CashflowRow } from "../api/dashboardApi";

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

/** 월 수지 = 월 총수입 - 월 총지출 */
export function monthlyBalance(data: DashboardData): number {
  return data.monthly.income - data.monthly.expenses;
}

/**
 * 비상금 유지 개월 = 투자금 잔액 / 월 필수지출 (§28.7)
 *  - 분자: type=invest 합계만. 총 현금·자동이체·부가세 잔액 금지
 *  - 분모: 지출 화면 단일 출처 값. 미확정(essentialComplete=false)이면 값과
 *    별개로 화면이 경고를 띄운다 — 0원 투입으로 메우지 않는다
 *  - 분모 0 이하 → 계산 불가(null)
 */
export function emergencyMonths(data: DashboardData): number | null {
  const investTotal = sum(data.assets.filter((a) => a.type === "invest").map((a) => a.value));
  const essential = data.monthly.essentialExpenses;
  if (essential <= 0) return null;
  return investTotal / essential;
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
  expenses: number | null;
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
        ? { month: key, income: row.income, expenses: row.expenses, confirmed: true }
        : { month: key, income: null, expenses: null, confirmed: false },
    );
  }
  return window;
}
