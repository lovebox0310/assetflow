import type { CardCompanyGroup } from "../api/cardImportApi";

/**
 * 대시보드 "카드별 본인·가족 사용 내역" 차트 데이터 준비.
 * 기존 컴포넌트에 있던 계산을 그대로 옮겼다 — 화면은 결과만 그린다(§34.6).
 */

/** 월별 전체 사용금액 합계 라인의 dataKey. 카드사·관계 키(`회사|관계`)와 겹치지 않는다. */
export const CARD_TOTAL_KEY = "__total";

/** 막대 세그먼트의 관계 구분 — 순서가 스택·범례 순서다. */
export const CARD_RELATIONS = ["본인", "가족"] as const;

export interface CardChartSeries {
  /** 데이터 등장 순서의 카드사. */
  companyOrder: string[];
  /** 막대 dataKey 목록 `${company}|${relation}` (companyOrder × CARD_RELATIONS). */
  relationKeys: string[];
  /** 달마다 모든 키를 0 으로 채운 포인트. 합계는 `CARD_TOTAL_KEY`. */
  points: Array<Record<string, string | number>>;
  /** 범위 전체 금액 합계(기존 컴포넌트와 동일하게 groups 전체). */
  total: number;
  selfTotal: number;
  familyTotal: number;
}

/** 서버 집계 행을 차트 데이터로 바꾼다. `months` 순서로 포인트를 만든다. */
export function cardChartSeries(groups: CardCompanyGroup[], months: string[]): CardChartSeries {
  // 카드사 순서는 데이터가 처음 등장한 순서를 따른다.
  const companyOrder: string[] = [];
  const companySet = new Set<string>();
  for (const g of groups) {
    const company = g.cardCompany || "미확인";
    if (!companySet.has(company)) {
      companySet.add(company);
      companyOrder.push(company);
    }
  }

  // 월 → 카드사 → 관계 → 금액
  const amounts = new Map<string, Map<string, Map<string, number>>>();
  for (const g of groups) {
    const company = g.cardCompany || "미확인";
    const relation = g.memberRelation === "가족" ? "가족" : "본인";
    const monthMap = amounts.get(g.month) ?? new Map<string, Map<string, number>>();
    const companyMap = monthMap.get(company) ?? new Map<string, number>();
    companyMap.set(relation, (companyMap.get(relation) ?? 0) + g.grossAmount);
    monthMap.set(company, companyMap);
    amounts.set(g.month, monthMap);
  }

  const relationKeys: string[] = [];
  for (const company of companyOrder) {
    for (const relation of CARD_RELATIONS) {
      relationKeys.push(`${company}|${relation}`);
    }
  }

  const points = months.map((month) => {
    const point: Record<string, string | number> = { month };
    const monthMap = amounts.get(month) ?? new Map<string, Map<string, number>>();
    let monthTotal = 0;
    for (const company of companyOrder) {
      const companyMap = monthMap.get(company) ?? new Map<string, number>();
      for (const relation of CARD_RELATIONS) {
        const key = `${company}|${relation}`;
        const value = companyMap.get(relation) ?? 0;
        point[key] = value;
        monthTotal += value;
      }
    }
    // 합계는 화면에 그려진 막대 세그먼트의 합과 항상 같게 여기서 만든다.
    point[CARD_TOTAL_KEY] = monthTotal;
    return point;
  });

  const total = groups.reduce((acc, g) => acc + g.grossAmount, 0);
  const selfTotal = groups
    .filter((g) => g.memberRelation === "본인")
    .reduce((acc, g) => acc + g.grossAmount, 0);
  const familyTotal = groups
    .filter((g) => g.memberRelation === "가족")
    .reduce((acc, g) => acc + g.grossAmount, 0);

  return { companyOrder, relationKeys, points, total, selfTotal, familyTotal };
}
