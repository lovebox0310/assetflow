import type { AssetType, DashboardData } from "../data/dashboardMock";

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
