import { Typography } from "antd";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CardCompanyGroup } from "../api/cardImportApi";
import { formatKrwAbbr, formatKrwExact } from "../utils/formatters";
import { formatMonthTick, monthsBetween } from "../dashboard/expenseTrend";

interface CardCompanyChartProps {
  groups: CardCompanyGroup[];
  from: string;
  to: string;
}

const RELATIONS = ["본인", "가족"] as const;

const RELATION_COLORS: Record<string, string> = {
  본인: "var(--af-slate)",
  가족: "var(--af-cat-leisure)",
};

/**
 * 대시보드 카드사·소유 구분 월별 누적 막대 차트.
 * 월별로 삼성카드/현대카드 등 카드사를 그룹화하고,
 * 각 카드사 막대는 본인/가족으로 누적한다.
 */
export function CardCompanyChart({ groups, from, to }: CardCompanyChartProps) {
  if (groups.length === 0) {
    return <Typography.Text type="secondary">표시할 카드 데이터가 없습니다</Typography.Text>;
  }

  const months = monthsBetween(from, to);
  if (months.length === 0) {
    return <Typography.Text type="secondary">조회 범위가 올바르지 않습니다</Typography.Text>;
  }

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

  const dataKeys: string[] = [];
  const points = months.map((month) => {
    const point: Record<string, string | number> = { month };
    const monthMap = amounts.get(month) ?? new Map<string, Map<string, number>>();
    for (const company of companyOrder) {
      const companyMap = monthMap.get(company) ?? new Map<string, number>();
      for (const relation of RELATIONS) {
        const key = `${company}|${relation}`;
        if (!dataKeys.includes(key)) dataKeys.push(key);
        point[key] = companyMap.get(relation) ?? 0;
      }
    }
    return point;
  });

  const total = groups.reduce((acc, g) => acc + g.grossAmount, 0);
  const selfTotal = groups
    .filter((g) => g.memberRelation === "본인")
    .reduce((acc, g) => acc + g.grossAmount, 0);
  const familyTotal = groups
    .filter((g) => g.memberRelation === "가족")
    .reduce((acc, g) => acc + g.grossAmount, 0);

  return (
    <div style={{ width: "100%" }}>
      <div
        role="img"
        aria-label={`카드별 본인·가족 사용 내역 — 총 ${formatKrwExact(total)}, 본인 ${formatKrwExact(selfTotal)}, 가족 ${formatKrwExact(familyTotal)}`}
        style={{ width: "100%", height: 320 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--af-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthTick}
              tick={{ fill: "var(--af-muted-foreground)", fontSize: 12 }}
              stroke="var(--af-border)"
            />
            <YAxis
              tickFormatter={(value) => formatKrwAbbr(Number(value))}
              tick={{ fill: "var(--af-muted-foreground)", fontSize: 12 }}
              stroke="var(--af-border)"
              width={56}
            />
            <Tooltip
              formatter={(value, name) => {
                const [company, relation] = String(name).split("|");
                return [formatKrwExact(Number(value)), `${company} · ${relation}`];
              }}
              cursor={{ fill: "var(--af-secondary)" }}
              contentStyle={{
                background: "var(--af-card)",
                border: "1px solid var(--af-border)",
                borderRadius: 8,
                color: "var(--af-foreground)",
              }}
            />
            <Legend
              formatter={(value) => String(value).replace("|", " · ")}
              wrapperStyle={{ color: "var(--af-foreground)" }}
            />
            {companyOrder.map((company) =>
              RELATIONS.map((relation) => (
                <Bar
                  key={`${company}|${relation}`}
                  dataKey={`${company}|${relation}`}
                  name={`${company}|${relation}`}
                  stackId={company}
                  fill={RELATION_COLORS[relation]}
                  isAnimationActive={false}
                />
              )),
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
