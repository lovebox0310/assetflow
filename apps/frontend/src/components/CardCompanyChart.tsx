import { Typography } from "antd";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CardCompanyGroup } from "../api/cardImportApi";
import { formatKrwAbbr, formatKrwExact } from "../utils/formatters";
import { formatMonthTick, monthsBetween } from "../dashboard/expenseTrend";
import { CARD_RELATIONS, CARD_TOTAL_KEY, cardChartSeries } from "../dashboard/cardCompany";

interface CardCompanyChartProps {
  groups: CardCompanyGroup[];
  from: string;
  to: string;
}

const RELATION_COLORS: Record<string, string> = {
  본인: "var(--af-slate)",
  가족: "var(--af-cat-leisure)",
};

/**
 * 대시보드 카드사·소유 구분 월별 누적 막대 차트.
 * 월별로 삼성카드/현대카드 등 카드사를 그룹화하고,
 * 각 카드사 막대는 본인/가족으로 누적한다.
 * 월별 전체 사용금액은 막대 위에 꺾은선으로 겹쳐 그린다.
 */
export function CardCompanyChart({ groups, from, to }: CardCompanyChartProps) {
  if (groups.length === 0) {
    return <Typography.Text type="secondary">표시할 카드 데이터가 없습니다</Typography.Text>;
  }

  const months = monthsBetween(from, to);
  if (months.length === 0) {
    return <Typography.Text type="secondary">조회 범위가 올바르지 않습니다</Typography.Text>;
  }

  const { companyOrder, points, total, selfTotal, familyTotal } = cardChartSeries(groups, months);
  const summary = `총 ${formatKrwExact(total)}, 본인 ${formatKrwExact(selfTotal)}, 가족 ${formatKrwExact(familyTotal)}`;

  return (
    <div style={{ width: "100%" }}>
      <figure style={{ margin: 0 }}>
        <figcaption className="sr-only" style={{ marginBottom: 8 }}>
          {`카드별 본인·가족 사용 내역 — 월별 합계 선, ${summary}`}
        </figcaption>
        <div
          role="img"
          aria-label={`카드별 본인·가족 사용 내역 — 월별 합계 선, ${summary}`}
          style={{ width: "100%", height: 320 }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
                  if (name === CARD_TOTAL_KEY) {
                    return [formatKrwExact(Number(value)), "월 합계"];
                  }
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
                formatter={(value) =>
                  value === CARD_TOTAL_KEY ? "월 합계" : String(value).replace("|", " · ")
                }
                wrapperStyle={{ color: "var(--af-foreground)" }}
              />
              {companyOrder.map((company) =>
                CARD_RELATIONS.map((relation) => (
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
              <Line
                type="monotone"
                dataKey={CARD_TOTAL_KEY}
                name={CARD_TOTAL_KEY}
                stroke="var(--af-primary)"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </ComposedChart>
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
          카드별 본인·가족 사용 내역 데이터 ({from} ~ {to})
        </caption>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "8px 8px 8px 0", borderBottom: "1px solid currentColor" }}>
              월
            </th>
            {companyOrder.map((company) => (
              <th
                key={company}
                colSpan={CARD_RELATIONS.length}
                style={{ textAlign: "center", padding: "8px 8px 8px 0", borderBottom: "1px solid currentColor" }}
              >
                {company}
              </th>
            ))}
            <th
              rowSpan={2}
              style={{ textAlign: "right", padding: "8px 8px 8px 0", borderBottom: "1px solid currentColor" }}
            >
              합계
            </th>
          </tr>
          <tr>
            <th style={{ textAlign: "left", padding: "8px 8px 8px 0", borderBottom: "1px solid currentColor" }}>
              구분
            </th>
            {companyOrder.map((company) =>
              CARD_RELATIONS.map((relation) => (
                <th
                  key={`${company}|${relation}`}
                  style={{ textAlign: "right", padding: "8px 8px 8px 0", borderBottom: "1px solid currentColor" }}
                >
                  {relation}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.month}>
              <td style={{ textAlign: "left", padding: "8px 8px 8px 0" }}>{point.month}</td>
              {companyOrder.map((company) =>
                CARD_RELATIONS.map((relation) => (
                  <td
                    key={`${company}|${relation}`}
                    style={{ textAlign: "right", padding: "8px 8px 8px 0" }}
                  >
                    {formatKrwExact((point as Record<string, number>)[`${company}|${relation}`] ?? 0)}
                  </td>
                )),
              )}
              <td style={{ textAlign: "right", padding: "8px 8px 8px 0" }}>
                {formatKrwExact((point as Record<string, number>)[CARD_TOTAL_KEY] ?? 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
