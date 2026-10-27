import { CATEGORY_GROUPS } from "../data/expenseCategories";
import type { MonthlyCategoryTotal } from "../api/cardImportApi";
import type { MonthlyIncome } from "../api/dashboardApi";

/**
 * 대시보드 지출 추이(스택 막대) 데이터 준비.
 * 계산은 여기 한 곳에서만 한다 — 화면은 결과만 그린다(§34.6).
 */

export const UNCLASSIFIED_LABEL = "미분류";

/** 카테고리별 색 — tokens.ts 의 `--af-cat-*` 변수. */
export const CATEGORY_COLORS: Record<string, string> = {
  식비: "var(--af-cat-food)",
  "주거/통신": "var(--af-cat-housing)",
  "교통/차량": "var(--af-cat-transport)",
  "쇼핑/생활": "var(--af-cat-shopping)",
  "건강/의료": "var(--af-cat-health)",
  "문화/여가": "var(--af-cat-leisure)",
  "금융/세금": "var(--af-cat-finance)",
  "기타/경조사": "var(--af-cat-etc)",
  교육: "var(--af-cat-education)",
  [UNCLASSIFIED_LABEL]: "var(--af-cat-unclassified)",
};

const FALLBACK_COLORS = [
  "var(--af-chart-3)",
  "var(--af-chart-4)",
  "var(--af-chart-2)",
  "var(--af-chart-5)",
];

export function colorForCategory(category: string): string {
  return CATEGORY_COLORS[category] ?? FALLBACK_COLORS[0] as string;
}

/** "2026-01" ~ "2026-12" → 12개월 배열. from > to 면 빈 배열. */
export function monthsBetween(from: string, to: string): string[] {
  if (!isMonth(from) || !isMonth(to) || from > to) return [];
  const out: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4));
  const endMonth = Number(to.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

function isMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** 오늘 기준 최근 N개월 범위(이번 달 포함). */
export function lastMonthsRange(months: number, today = new Date()): { from: string; to: string } {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const to = `${year}-${String(month).padStart(2, "0")}`;
  const startIndex = year * 12 + (month - 1) - (months - 1);
  const fromYear = Math.floor(startIndex / 12);
  const fromMonth = (startIndex % 12) + 1;
  return { from: `${fromYear}-${String(fromMonth).padStart(2, "0")}`, to };
}

export interface TrendSeries {
  /** 빈 달까지 채운 월별 행. 값은 카테고리 이름 키 + `income`. */
  points: Array<Record<string, string | number | null>>;
  /** 범례/막대 순서 — 기준 분류 9개 먼저, 그다음 미분류·기타. */
  categories: string[];
  /** 범위 전체의 카테고리별 합계(범례 표시용). */
  totals: Record<string, number>;
  /** 수입이 확정된 달 수 — points.length 보다 작으면 미확정 달이 섞여 있다. */
  incomeMonths: number;
  /** 범위 전체 수입 합계(확정 달만). */
  incomeTotal: number;
}

/**
 * 서버 집계 행을 차트 데이터로 바꾼다.
 * 행이 없는 달은 0 으로 채워 X축이 끊기지 않게 한다.
 *
 * §57.8: 수입은 확정된 달만 값이 있고, 미확정 달은 `null` 이다 —
 * 0 으로 채우면 "그 달 수입이 없었다"는 잘못된 인상을 준다(§34.6).
 */
export function buildExpenseTrend(
  rows: MonthlyCategoryTotal[],
  from: string,
  to: string,
  incomeRows: MonthlyIncome[] = [],
): TrendSeries {
  const months = monthsBetween(from, to);
  const sums = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const month = row.month;
    if (!months.includes(month)) continue;
    const amount = Number(row.gross) || 0;
    const perMonth = sums.get(month) ?? new Map<string, number>();
    perMonth.set(row.category, (perMonth.get(row.category) ?? 0) + amount);
    sums.set(month, perMonth);
  }

  const incomeByMonth = new Map<string, number>();
  for (const row of incomeRows) {
    if (!months.includes(row.month)) continue;
    incomeByMonth.set(row.month, Number(row.income) || 0);
  }

  const seen = new Set<string>();
  for (const perMonth of sums.values()) {
    for (const category of perMonth.keys()) seen.add(category);
  }

  const known = CATEGORY_GROUPS.filter((c) => seen.has(c)) as string[];
  const rest = [...seen]
    .filter((c) => !known.includes(c))
    .sort((a, b) => {
      if (a === UNCLASSIFIED_LABEL) return 1;
      if (b === UNCLASSIFIED_LABEL) return -1;
      return a.localeCompare(b);
    });
  const categories = [...known, ...rest];

  const totals: Record<string, number> = {};
  for (const category of categories) totals[category] = 0;

  const points = months.map((month) => {
    const point: Record<string, string | number | null> = {
      month,
      // 확정된 달만 숫자, 미확정 달은 null — 차트가 수입 막대를 그리지 않는다.
      income: incomeByMonth.get(month) ?? null,
    };
    const perMonth = sums.get(month);
    for (const category of categories) {
      const value = perMonth?.get(category) ?? 0;
      point[category] = value;
      totals[category] = (totals[category] ?? 0) + value;
    }
    return point;
  });

  const incomeTotal = [...incomeByMonth.values()].reduce((acc, v) => acc + v, 0);

  return {
    points,
    categories,
    totals,
    incomeMonths: incomeByMonth.size,
    incomeTotal,
  };
}

/** "2026-03" → "26.03" (X축 라벨). */
export function formatMonthTick(month: string): string {
  return month.length === 7 ? `${month.slice(2, 4)}.${month.slice(5, 7)}` : month;
}
