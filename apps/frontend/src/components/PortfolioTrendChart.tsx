import { useMemo } from "react";
import { Typography } from "antd";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PortfolioSnapshot } from "../api/investmentsApi";
import { formatKrwAbbr, formatKrwExact } from "../utils/formatters";

interface PortfolioTrendChartProps {
  snapshots: PortfolioSnapshot[];
}

/** `2026-11-25` → `11/25`. 축 라벨은 짧게, 툴팁은 원문 그대로. */
function shortDay(takenOn: string): string {
  const parts = takenOn.split("-");
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : takenOn;
}

/**
 * 투자 추이 차트 (이슈 #52).
 *
 * 총 원금은 **Area**, 총 평가금은 **Line** 으로 겹쳐 그린다. 원금은 매매 시에만
 * 변하고 평가금이 수익에 따라 움직이므로, 두 선의 간격이 곧 평가손익이다.
 *
 * 계산은 서버(`PortfolioSnapshotService`)가 한다 — 여기서는 점만 그린다.
 * 빈/단일 상태를 따로 안내한다: 점이 1개면 "선"이 아니라 "점"이라 추세로 읽히지 않는다.
 */
export function PortfolioTrendChart({ snapshots }: PortfolioTrendChartProps) {
  const points = useMemo(
    () => snapshots.map((s) => ({ ...s, day: shortDay(s.takenOn) })),
    [snapshots],
  );

  if (points.length === 0) {
    return (
      <Typography.Text type="secondary">
        동기화가 쌓이면 이곳에 투자 추이가 표시됩니다. 투자 화면에서 잔고를 동기화하거나
        장 시작·마감 자동 동기화를 기다려 주세요.
      </Typography.Text>
    );
  }

  const latest = points[points.length - 1]!;
  const first = points[0]!;
  const diff = latest.totalValue - first.totalValue;
  const summary =
    `총 원금 ${formatKrwExact(latest.totalCost)}, 총 평가금 ${formatKrwExact(latest.totalValue)}`
    + (points.length > 1 ? `, 기간 변화 ${formatKrwExact(diff)}` : "");

  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="sr-only">{summary}</figcaption>
      {points.length === 1 ? (
        <Typography.Paragraph type="secondary" style={{ margin: "0 0 8px", fontSize: 12 }}>
          데이터가 1개입니다 — 다음 동기화부터 추이가 보입니다.
        </Typography.Paragraph>
      ) : null}
      <div
        role="img"
        aria-label={summary}
        style={{ width: "100%", height: 240, margin: "0 auto" }}
      >
        <ResponsiveContainer width="100%" height="100%">
          {/* A-07: accessibilityLayer 는 탭 스톱(무명 application)을 만든다. 끈다. */}
          <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid stroke="var(--af-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fill: "var(--af-muted-foreground)", fontSize: 11 }}
              stroke="var(--af-border)"
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={(value) => formatKrwAbbr(Number(value))}
              tick={{ fill: "var(--af-muted-foreground)", fontSize: 11 }}
              stroke="var(--af-border)"
              width={56}
            />
            <Tooltip
              contentStyle={{
                background: "var(--af-card)",
                border: "1px solid var(--af-border)",
                borderRadius: 8,
                color: "var(--af-foreground)",
              }}
              formatter={(value, name) => [formatKrwExact(Number(value)), String(name)]}
            />
            {/* 총 원금 — 매매 시에만 변하는 기준선이라 면으로 채운다. */}
            <Area
              type="monotone"
              dataKey="totalCost"
              name="총 원금"
              stroke="var(--af-slate)"
              fill="var(--af-slate-soft)"
              fillOpacity={0.5}
              strokeWidth={2}
              dot={false}
            />
            {/* 총 평가금 — 수익에 따라 움직이는 선. */}
            <Line
              type="monotone"
              dataKey="totalValue"
              name="총 평가금"
              stroke="var(--af-grove)"
              strokeWidth={2}
              dot={points.length <= 30}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ul
        aria-label="투자 추이 범례"
        style={{ listStyle: "none", display: "flex", gap: 16, margin: "8px 0 0", padding: 0, fontSize: 12 }}
      >
        <li style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, background: "var(--af-slate)", borderRadius: 2 }} />
          총 원금
        </li>
        <li style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, background: "var(--af-grove)", borderRadius: 2 }} />
          총 평가금
        </li>
      </ul>
    </figure>
  );
}
