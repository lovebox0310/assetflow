import { Typography } from "antd";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CardCompanyGroup } from "../api/cardImportApi";
import { formatKrwAbbr, formatKrwExact } from "../utils/formatters";
import { formatMonthTick, monthsBetween } from "../dashboard/expenseTrend";
import { useMinWidth } from "../hooks/useMinWidth";
import { CARD_RELATIONS, CARD_TOTAL_KEY, cardChartSeries } from "../dashboard/cardCompany";

interface CardCompanyChartProps {
  groups: CardCompanyGroup[];
  from: string;
  to: string;
}

/**
 * A-02: 카드사·관계 조합마다 다른 색을 준다.
 * 카드사 이름은 사용자 데이터라 하드코딩할 수 없으므로 **카드사 순서(index)** 로 고른다.
 * 8색 토큰 = 카드사 4 × [본인, 가족] — 쌍의 첫 색이 본인(어두움), 둘째가 가족(밝음).
 * 라이트/다크 공통 불변식이다. 카드사가 4개를 넘으면 같은 순서를 다시 쓴다.
 */
const CARD_SERIES = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `var(--af-card-series-${n})`);

/** 카드사 인덱스와 관계 인덱스로 색을 고른다. 카드사가 4개를 넘으면 순환한다. */
const seriesColor = (companyIndex: number, relationIndex: number) =>
  CARD_SERIES[(companyIndex % 4) * 2 + (relationIndex % 2)]!;

/**
 * 대시보드 카드사·소유 구분 월별 누적 막대 차트.
 * 월별로 삼성카드/현대카드 등 카드사를 그룹화하고,
 * 각 카드사 막대는 본인/가족으로 누적한다.
 * 월별 전체 사용금액은 막대 위에 꺾은선으로 겹쳐 그린다.
 */
export function CardCompanyChart({ groups, from, to }: CardCompanyChartProps) {
  // A-03/A-10: 좁은 폭은 "10월" + 모든 눈금, 넓은 폭은 기존 "26.10".
  const wideTicks = useMinWidth(768);
  if (groups.length === 0) {
    return <Typography.Text type="secondary">표시할 카드 데이터가 없습니다</Typography.Text>;
  }

  const months = monthsBetween(from, to);
  if (months.length === 0) {
    return <Typography.Text type="secondary">조회 범위가 올바르지 않습니다</Typography.Text>;
  }

  const { companyOrder, points, total, selfTotal, familyTotal } = cardChartSeries(groups, months);
  const summary = `총 ${formatKrwExact(total)}, 본인 ${formatKrwExact(selfTotal)}, 가족 ${formatKrwExact(familyTotal)}`;

  /**
   * 좁은 폭의 눈금은 **개월 수**로 정한다(하드코딩 금지 — 조회 범위를 바꿀 수 있다).
   * - 6개 이하: 모든 달을 가로로 (카드사용 기본 6개월은 항상 전체 표시)
   * - 7개 이상: 끝(최신 달)부터 격월. 320의 밴드가 라벨보다 좁아진다.
   * 회전은 쓰지 않는다.
   */
  const sparseTicks =
    !wideTicks && months.length > 6
      ? months.filter((_, i) => (months.length - 1 - i) % 2 === 0)
      : null;

  return (
    <div style={{ width: "100%" }}>
      <figure style={{ margin: 0 }}>
        {/* A-07 후속: 캡션 요소를 두지 않는다. figcaption 은 aria-hidden 이어도
            HTML-AAM 이 figure 의 이름으로 쓰기 때문에 같은 요약이 두 번 노출된다
            (실측 ariaSnapshot). 이름은 아래 차트 래퍼(role="img")가 단독으로 갖는다. */}
        <div
          role="img"
          aria-label={`카드별 본인·가족 사용 내역 — 월별 합계 선, ${summary}`}
          style={{ width: "100%", height: 320 }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
              <CartesianGrid stroke="var(--af-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="month"
                // A-03/A-10: 좁은 폭은 "10월" 로 줄이고, 9개월 이상이면 격월 눈금만(최신 달 포함).
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
              {companyOrder.map((company, companyIndex) =>
                CARD_RELATIONS.map((relation, relationIndex) => (
                  <Bar
                    key={`${company}|${relation}`}
                    dataKey={`${company}|${relation}`}
                    name={`${company}|${relation}`}
                    stackId={company}
                    fill={seriesColor(companyIndex, relationIndex)}
                    // A-02: 같은 카드사 안의 본인·가족 세그먼트 경계를 카드 배경색으로
                    // 나눈다(도넛과 같은 방식). 색은 토큰 그대로, 새 색 없음.
                    stroke="var(--af-card)"
                    strokeWidth={1}
                    isAnimationActive={false}
                  />
                )),
              )}
              {/* 대비 보강: 막대 위에서도 선이 보이도록 배경색 테두리를 먼저 그린다 */}
              <Line
                type="monotone"
                dataKey={CARD_TOTAL_KEY}
                stroke="var(--af-card)"
                strokeWidth={5}
                dot={false}
                activeDot={false}
                legendType="none"
                tooltipType="none"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey={CARD_TOTAL_KEY}
                name={CARD_TOTAL_KEY}
                stroke="var(--af-destructive)"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </figure>

      {/* A-02: recharts Legend 를 지출 추이와 같은 목록으로 바꾼다.
          색은 카드사·관계마다 다르지만(8색), 범례는 카드사마다 두 색을 함께 붙이고
          "삼성카드 — 본인·가족" 두 줄로 고정한다(줄 수를 카드사 수에 묶어 둔다). */}
      <ul
        aria-label="카드사 범례"
        style={{
          listStyle: "none",
          margin: 0,
          marginTop: 12,
          padding: 0,
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 20px",
        }}
      >
        {companyOrder.map((company, companyIndex) => (
          <li key={company} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span aria-hidden style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
              {CARD_RELATIONS.map((relation, relationIndex) => (
                <span
                  key={relation}
                  // 스와치는 장식이라 aria-hidden 이다. 색만으로 본인/가족을 구분하지 않게
                  // 마우스 툴팁으로 쌍의 의미를 남긴다(텍스트 라벨은 옆 줄이 이미 말한다).
                  title={relation}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: seriesColor(companyIndex, relationIndex),
                    flexShrink: 0,
                  }}
                />
              ))}
            </span>
            <span style={{ whiteSpace: "pre-line" }}>{`${company}\n— ${CARD_RELATIONS.join("·")}`}</span>
          </li>
        ))}
      </ul>

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
