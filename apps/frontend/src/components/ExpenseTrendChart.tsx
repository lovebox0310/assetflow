import { Grid, Typography } from "antd";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  colorForCategory,
  formatMonthTick,
  type TrendSeries,
} from "../dashboard/expenseTrend";
import { formatKrwAbbr, formatKrwExact } from "../utils/formatters";

/**
 * §55.10 대시보드 지출 추이 — 월별 대분류 스택 막대.
 *
 * 값은 buildExpenseTrend() 산출물을 그대로 쓴다 (§34.6/§36.1) — 여기서 다시 합산하지 않는다.
 * 색은 `--af-cat-*` CSS 변수라 라이트/다크가 자동으로 따라간다 (§28.4).
 */
export function ExpenseTrendChart({
  series,
  from,
  to,
}: {
  series: TrendSeries;
  /** YYYY-MM, 표시용 범위 */
  from: string;
  to: string;
}) {
  const screens = Grid.useBreakpoint();
  const wide = Boolean(screens.md);

  const { points, categories, totals } = series;

  if (points.length === 0) {
    return <Typography.Text type="secondary">표시할 지출 데이터가 없습니다</Typography.Text>;
  }

  const grandTotal = categories.reduce((acc, c) => acc + (totals[c] ?? 0), 0);
  const activeCategories = categories.filter((c) => (totals[c] ?? 0) !== 0);

  return (
    <div style={{ width: "100%" }}>
      <div
        role="img"
        aria-label={`지출 추이 — ${from}부터 ${to}까지 월별 대분류 스택 막대, 총 ${formatKrwExact(grandTotal)}`}
        style={{ width: "100%", height: wide ? 340 : 280 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--af-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthTick}
              tick={{ fill: "var(--af-muted-foreground)", fontSize: 12 }}
              stroke="var(--af-border)"
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              tickFormatter={(value) => formatKrwAbbr(Number(value))}
              tick={{ fill: "var(--af-muted-foreground)", fontSize: 12 }}
              stroke="var(--af-border)"
              width={56}
            />
            <Tooltip
              labelFormatter={(label) => String(label)}
              formatter={(value, name) => [formatKrwExact(Number(value)), String(name)]}
              cursor={{ fill: "var(--af-secondary)" }}
              contentStyle={{
                background: "var(--af-card)",
                border: "1px solid var(--af-border)",
                borderRadius: 8,
                color: "var(--af-foreground)",
              }}
            />
            {activeCategories.map((category) => (
              <Bar
                key={category}
                dataKey={category}
                name={category}
                stackId="expense"
                fill={colorForCategory(category)}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul
        aria-label="지출 추이 범례"
        style={{
          listStyle: "none",
          margin: 0,
          marginTop: 12,
          padding: 0,
          display: "flex",
          flexWrap: "wrap",
          gap: wide ? "8px 20px" : "8px 16px",
        }}
      >
        {categories.map((category) => (
          <li key={category} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: colorForCategory(category),
                flexShrink: 0,
              }}
            />
            <span>{category}</span>
            <span style={{ color: "var(--af-muted-foreground)" }}>{formatKrwAbbr(totals[category] ?? 0)}</span>
          </li>
        ))}
      </ul>

      <Typography.Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 13 }}>
        {from} ~ {to} 합계 {formatKrwExact(grandTotal)}
      </Typography.Text>
    </div>
  );
}
