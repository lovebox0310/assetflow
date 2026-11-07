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
import type { CardCompanyGroup, CardStatement } from "../api/cardImportApi";
import { formatKrwAbbr, formatKrwExact } from "../utils/formatters";
import { formatMonthTick, monthsBetween } from "../dashboard/expenseTrend";

interface CardCompanyChartProps {
  groups: CardCompanyGroup[];
  /** §72 명세서 요약 — 있으면 그 달 카드사 금액을 명세서 총액으로 대체한다. */
  statements?: CardStatement[];
  from: string;
  to: string;
}

const RELATIONS = ["본인", "가족"] as const;
const STATEMENT_SERIES = "전체";

const SERIES_COLORS: Record<string, string> = {
  [STATEMENT_SERIES]: "var(--af-cat-food)",
  본인: "var(--af-slate)",
  가족: "var(--af-cat-leisure)",
};

/**
 * 대시보드 카드사·소유 구분 월별 누적 막대 차트.
 *
 * <p>§72: 정기 청구서가 있는 달은 승인일 합계 대신 **명세서 총 결제금액**을
 * 하나의 막대(전체)로 보여 준다. 명세서가 없는 달만 본인/가족으로 나눈다.</p>
 */
export function CardCompanyChart({ groups, statements = [], from, to }: CardCompanyChartProps) {
  if (groups.length === 0 && statements.length === 0) {
    return <Typography.Text type="secondary">표시할 카드 데이터가 없습니다</Typography.Text>;
  }

  const months = monthsBetween(from, to);
  if (months.length === 0) {
    return <Typography.Text type="secondary">조회 범위가 올바르지 않습니다.</Typography.Text>;
  }

  const billingByMonthCompany = new Map<string, CardStatement>();
  for (const s of statements) {
    if (s.kind !== "billing") continue;
    billingByMonthCompany.set(`${s.usageMonth}|${s.cardCompany || "미확인"}`, s);
  }

  // 카드사 순서는 거래 → 명세서 순으로 처음 등장한 순서를 따른다.
  const companyOrder: string[] = [];
  const companySet = new Set<string>();
  const remember = (company: string) => {
    if (!companySet.has(company)) {
      companySet.add(company);
      companyOrder.push(company);
    }
  };
  for (const g of groups) remember(g.cardCompany || "미확인");
  for (const s of billingByMonthCompany.values()) remember(s.cardCompany || "미확인");

  // 월 → 카드사 → 시리즈(전체/본인/가족) → 금액
  const amounts = new Map<string, Map<string, Map<string, number>>>();
  const put = (month: string, company: string, series: string, amount: number) => {
    const monthMap = amounts.get(month) ?? new Map<string, Map<string, number>>();
    const companyMap = monthMap.get(company) ?? new Map<string, number>();
    companyMap.set(series, (companyMap.get(series) ?? 0) + amount);
    monthMap.set(company, companyMap);
    amounts.set(month, monthMap);
  };

  for (const g of groups) {
    const company = g.cardCompany || "미확인";
    const statement = billingByMonthCompany.get(`${g.month}|${company}`);
    if (statement) continue; // 명세서가 그 달의 기준이다 — 거래 합계는 쓰지 않는다.
    const relation = g.memberRelation === "가족" ? "가족" : "본인";
    put(g.month, company, relation, g.grossAmount);
  }
  for (const [key, statement] of billingByMonthCompany) {
    const [month, company] = key.split("|") as [string, string];
    if (!months.includes(month)) continue;
    put(month, company, STATEMENT_SERIES, statement.totalAmount);
  }

  const seriesByCompany = new Map<string, string[]>();
  for (const month of months) {
    const monthMap = amounts.get(month);
    if (!monthMap) continue;
    for (const company of companyOrder) {
      const companyMap = monthMap.get(company);
      if (!companyMap) continue;
      const list = seriesByCompany.get(company) ?? [];
      for (const [series, value] of companyMap) {
        if (value === 0) continue;
        if (!list.includes(series)) list.push(series);
      }
      if (list.length > 0) seriesByCompany.set(company, list);
    }
  }
  // 시리즈 순서를 전체 → 본인 → 가족으로 고정한다.
  for (const company of companyOrder) {
    const list = seriesByCompany.get(company);
    if (list) list.sort((a, b) => seriesRank(a) - seriesRank(b));
  }

  const points = months.map((month) => {
    const point: Record<string, string | number> = { month };
    const monthMap = amounts.get(month) ?? new Map<string, Map<string, number>>();
    for (const company of companyOrder) {
      const companyMap = monthMap.get(company) ?? new Map<string, number>();
      for (const series of seriesByCompany.get(company) ?? []) {
        point[`${company}|${series}`] = companyMap.get(series) ?? 0;
      }
    }
    return point;
  });

  let total = 0;
  for (const month of months) {
    const monthMap = amounts.get(month);
    if (!monthMap) continue;
    for (const company of companyOrder) {
      const companyMap = monthMap.get(company);
      if (!companyMap) continue;
      for (const value of companyMap.values()) total += value;
    }
  }
  const selfTotal = groups
    .filter((g) => g.memberRelation === "본인")
    .reduce((acc, g) => acc + g.grossAmount, 0);
  const familyTotal = groups
    .filter((g) => g.memberRelation === "가족")
    .reduce((acc, g) => acc + g.grossAmount, 0);

  const labelFor = (series: string) => (series === STATEMENT_SERIES ? "명세서" : series);

  return (
    <div style={{ width: "100%" }}>
      <figure style={{ margin: 0 }}>
        <figcaption className="sr-only" style={{ marginBottom: 8 }}>
          {`카드별 본인·가족 사용 내역 — 총 ${formatKrwExact(total)}, 본인 ${formatKrwExact(selfTotal)}, 가족 ${formatKrwExact(familyTotal)}`}
        </figcaption>
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
                  const [company, series] = String(name).split("|") as [string, string];
                  return [formatKrwExact(Number(value)), `${company} · ${labelFor(series)}`];
                }}
                labelFormatter={(label) => {
                  const month = String(label);
                  const notes: string[] = [];
                  for (const s of billingByMonthCompany.values()) {
                    if (s.usageMonth === month) {
                      notes.push(`${s.cardCompany} ${s.periodStart}~${s.periodEnd}`);
                    }
                  }
                  return notes.length > 0 ? `${month} (${notes.join(", ")})` : month;
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
                formatter={(value) => {
                  const [company, series] = String(value).split("|") as [string, string];
                  return `${company} · ${labelFor(series)}`;
                }}
                wrapperStyle={{ color: "var(--af-foreground)" }}
              />
              {companyOrder.flatMap((company) =>
                (seriesByCompany.get(company) ?? []).map((series) => (
                  <Bar
                    key={`${company}|${series}`}
                    dataKey={`${company}|${series}`}
                    name={`${company}|${series}`}
                    stackId={company}
                    fill={SERIES_COLORS[series] ?? "var(--af-slate)"}
                    isAnimationActive={false}
                  />
                )),
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>

      {/* 스크린리더용 데이터 테이블 (Sprint 1.1 접근성) */}
      <table
        className="sr-only"
        style={{
          borderCollapse: "collapse",
          width: "100%",
          marginTop: 12,
        }}
      >
        <caption style={{ textAlign: "left", marginBottom: 8, fontWeight: 600 }}>
          카드별 사용 내역 데이터 ({from} ~ {to})
        </caption>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "8px 8px 8px 0", borderBottom: "1px solid currentColor" }}>
              월
            </th>
            {companyOrder.map((company) => (
              <th
                key={company}
                colSpan={Math.max((seriesByCompany.get(company) ?? []).length, 1)}
                style={{ textAlign: "center", padding: "8px 8px 8px 0", borderBottom: "1px solid currentColor" }}
              >
                {company}
              </th>
            ))}
          </tr>
          <tr>
            <th style={{ textAlign: "left", padding: "8px 8px 8px 0", borderBottom: "1px solid currentColor" }}>
              구분
            </th>
            {companyOrder.map((company) => {
              const seriesList = seriesByCompany.get(company) ?? [];
              return (seriesList.length > 0 ? seriesList : ["-"]).map((series) => (
                <th
                  key={`${company}|${series}`}
                  style={{ textAlign: "right", padding: "8px 8px 8px 0", borderBottom: "1px solid currentColor" }}
                >
                  {series === "-" ? "-" : labelFor(series)}
                </th>
              ));
            })}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.month}>
              <td style={{ textAlign: "left", padding: "8px 8px 8px 0" }}>{point.month}</td>
              {companyOrder.map((company) => {
                const seriesList = seriesByCompany.get(company) ?? [];
                return (seriesList.length > 0 ? seriesList : ["-"]).map((series) => (
                  <td
                    key={`${company}|${series}`}
                    style={{ textAlign: "right", padding: "8px 8px 8px 0" }}
                  >
                    {series === "-"
                      ? "-"
                      : formatKrwExact(Number((point as Record<string, number>)[`${company}|${series}`] ?? 0))}
                  </td>
                ));
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function seriesRank(series: string): number {
  if (series === STATEMENT_SERIES) return 0;
  if (series === "본인") return 1;
  return 2;
}
