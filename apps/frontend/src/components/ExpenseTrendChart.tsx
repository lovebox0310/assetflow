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
import { useMinWidth } from "../hooks/useMinWidth";
import { formatKrwAbbr, formatKrwExact } from "../utils/formatters";

/**
 * §55.10 / §57.9 대시보드 지출 추이 — 월별 `(실수입 | 부가세통장) | 지출(대분류 스택)` 막대.
 *
 * 값은 buildExpenseTrend() 산출물을 그대로 쓴다 (§34.6/§36.1) — 여기서 다시 합산하지 않는다.
 * 색은 `--af-*` CSS 변수라 라이트/다크가 자동으로 따라간다 (§28.4).
 * 수입은 확정된 달만 값이 있고, 미확정 달은 `null` 이라 막대가 비어 있다.
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
  // A-03: 좁은 폭에서는 눈금을 전부 보여 주고(interval 0) "10월" 로 줄인다.
  // 넓은 폭은 기존 "26.10" 표기를 유지한다. matchMedia 미지원 환경은 false(좁은 쪽).
  const wideTicks = useMinWidth(768);
  const { points, categories, totals, incomeMonths, disposableIncomeTotal, vatSetAsideTotal } = series;

  if (points.length === 0) {
    return <Typography.Text type="secondary">표시할 지출 데이터가 없습니다</Typography.Text>;
  }

  const grandTotal = categories.reduce((acc, c) => acc + (totals[c] ?? 0), 0);
  const activeCategories = categories.filter((c) => (totals[c] ?? 0) !== 0);
  const hasIncome = incomeMonths > 0;
  const unconfirmedMonths = points.length - incomeMonths;

  /**
   * 좁은 폭의 눈금은 **개월 수**로 정한다(하드코딩 금지 — 조회 범위를 바꿀 수 있다).
   * - 6개 이하: 모든 달을 가로로 (기본값 6개월 = 전부 표시)
   * - 7개 이상: 끝(최신 달)부터 격월로 줄인다 — 최신 달은 항상 포함된다.
   *   320의 밴드(≈21.7px)가 라벨(≈22.3px)보다 좁아지는 7개월부터 격월이 필요하다.
   * 회전은 쓰지 않는다(가로 라벨만).
   */
  const monthKeys = points.map((p) => String(p.month));
  const sparseTicks =
    !wideTicks && monthKeys.length > 6
      ? monthKeys.filter((_, i) => (monthKeys.length - 1 - i) % 2 === 0)
      : null;

  return (
    <div style={{ width: "100%" }}>
      <figure style={{ margin: 0 }}>
        {/* A-07 후속: 캡션 요소를 두지 않는다. figcaption 은 aria-hidden 이어도
            HTML-AAM 이 figure 의 이름으로 쓰기 때문에 같은 요약이 두 번 노출된다
            (실측 ariaSnapshot). 이름은 아래 차트 래퍼(role="img")가 단독으로 갖는다. */}
        <div
          role="img"
          aria-label={`수입·지출 추이 — ${from}부터 ${to}까지 월별 실수입·부가세통장 스택 막대와 대분류 스택 지출 막대, 지출 총 ${formatKrwExact(grandTotal)}${
            hasIncome
              ? `, 확정 실수입 총 ${formatKrwExact(disposableIncomeTotal)}, 부가세통장 총 ${formatKrwExact(vatSetAsideTotal)}`
              : ""
          }`}
          style={{ width: "100%", height: wide ? 340 : 280 }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
              <CartesianGrid stroke="var(--af-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="month"
                // A-03/A-10: <768px 는 "10월" 로 줄이고, 9개월 이상이면 격월 눈금만
                // 보여 준다(최신 달 포함). minTickGap 대신 ticks 로 직접 고른다.
                tickFormatter={wideTicks ? formatMonthTick : (month: string) => `${month.slice(5)}월`}
                tick={{ fill: "var(--af-muted-foreground)", fontSize: wideTicks ? 12 : 11 }}
                stroke="var(--af-border)"
                interval={wideTicks ? "preserveStartEnd" : 0}
                {...(wideTicks ? { minTickGap: 8 } : sparseTicks ? { ticks: sparseTicks } : {})}
              />
              <YAxis
                tickFormatter={(value) => formatKrwAbbr(Number(value))}
                tick={{ fill: "var(--af-muted-foreground)", fontSize: 12 }}
                stroke="var(--af-border)"
                width={56}
              />
              <Tooltip
                labelFormatter={(label) => String(label)}
                formatter={(value, name) => [
                  value === null || value === undefined ? "미확정" : formatKrwExact(Number(value)),
                  String(name),
                ]}
                cursor={{ fill: "var(--af-secondary)" }}
                contentStyle={{
                  background: "var(--af-card)",
                  border: "1px solid var(--af-border)",
                  borderRadius: 8,
                  color: "var(--af-foreground)",
                }}
              />
              {/* §57.8: 같은 X축에 `수입 | 지출` 두 막대를 그룹으로 둔다.
                 stackId 가 다르면 recharts 가 카테고리 안에서 나란히 배치한다.
                 미확정 달의 수입은 null 이라 막대가 그려지지 않는다(0 원 막대 금지). */}
              {/* §57.9: 수입 막대를 `실수입 | 부가세통장` 두 세그먼트로 쌓는다. */}
              {hasIncome ? (
                <>
                  <Bar
                    dataKey="income"
                    name="실수입"
                    stackId="income"
                    fill="var(--af-grove)"
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="vatSetAside"
                    name="부가세통장"
                    stackId="income"
                    fill="var(--af-slate)"
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />
                </>
              ) : null}
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
      </figure>

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
        {hasIncome ? (
          <>
            <li key="__income" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: "var(--af-grove)",
                  flexShrink: 0,
                }}
              />
              <span>실수입</span>
              <span style={{ color: "var(--af-muted-foreground)" }}>{formatKrwAbbr(disposableIncomeTotal)}</span>
            </li>
            <li key="__vat" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: "var(--af-slate)",
                  flexShrink: 0,
                }}
              />
              <span>부가세통장</span>
              <span style={{ color: "var(--af-muted-foreground)" }}>{formatKrwAbbr(vatSetAsideTotal)}</span>
            </li>
          </>
        ) : null}
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

      {hasIncome && unconfirmedMonths > 0 ? (
        <Typography.Text type="secondary" style={{ display: "block", marginTop: 4, fontSize: 13 }}>
          수입 막대(실수입+부가세통장)는 확정된 {incomeMonths}개월만 표시합니다 (미확정{" "}
          {unconfirmedMonths}개월 · 0원으로 채우지 않음).
        </Typography.Text>
      ) : null}

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
          수입·지출 추이 데이터 ({from} ~ {to})
        </caption>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "8px 8px 8px 0", borderBottom: "1px solid currentColor" }}>
              월
            </th>
            {hasIncome ? (
              <>
                <th style={{ textAlign: "right", padding: "8px 8px 8px 0", borderBottom: "1px solid currentColor" }}>
                  실수입
                </th>
                <th style={{ textAlign: "right", padding: "8px 8px 8px 0", borderBottom: "1px solid currentColor" }}>
                  부가세통장
                </th>
              </>
            ) : null}
            {activeCategories.map((category) => (
              <th
                key={category}
                style={{ textAlign: "right", padding: "8px 8px 8px 0", borderBottom: "1px solid currentColor" }}
              >
                {category}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.month}>
              <td style={{ textAlign: "left", padding: "8px 8px 8px 0" }}>{point.month}</td>
              {hasIncome ? (
                <>
                  <td style={{ textAlign: "right", padding: "8px 8px 8px 0" }}>
                    {(point as Record<string, number | null | undefined>).income === null || (point as Record<string, number | null | undefined>).income === undefined ? "미확정" : formatKrwExact(Number((point as Record<string, number>).income))}
                  </td>
                  <td style={{ textAlign: "right", padding: "8px 8px 8px 0" }}>
                    {(point as Record<string, number | null | undefined>).vatSetAside === null || (point as Record<string, number | null | undefined>).vatSetAside === undefined
                      ? "미확정"
                      : formatKrwExact(Number((point as Record<string, number>).vatSetAside))}
                  </td>
                </>
              ) : null}
              {activeCategories.map((category) => (
                <td key={category} style={{ textAlign: "right", padding: "8px 8px 8px 0" }}>
                  {formatKrwExact((point as Record<string, number>)[category] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
