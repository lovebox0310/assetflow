import { Grid } from "antd";
import { Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CompositionSlice } from "../dashboard/metrics";
import { formatKrwExact } from "../utils/formatters";

/**
 * §23 구성비 도넛. 값은 assetComposition() 산출물을 그대로 — 계산 중복 없음 (§36.1).
 *
 * §28.4(D3): 4색 = signal / grove / slate / 뉴트럴.
 * CSS 변수(`var(--af-*)`) 로 지정해 라이트/다크가 자동으로 따라간다 —
 * 도넛 SVG fill 은 CSS var() 를 그대로 받는다.
 */
const COLORS = [
  "var(--af-signal)",
  "var(--af-grove)",
  "var(--af-slate)",
  "var(--af-neutral)",
];

const colorFor = (i: number): string => COLORS[i % COLORS.length] as string;

export type CompositionLegendVariant = "inline" | "table" | "chips";

const dotStyle = (color: string): React.CSSProperties => ({
  width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0,
});

function LegendInline({ slices, wide }: { slices: CompositionSlice[]; wide: boolean }) {
  // wide: 금액을 이름 옆에 붙여 왼쪽으로 모은다. 좁은 화면(상하 스택)은 행 전체 폭에서 우측 정렬
  const amountStyle: React.CSSProperties = wide
    ? { color: "var(--af-muted-foreground)", fontSize: 13 }
    : { marginLeft: "auto", color: "var(--af-muted-foreground)", fontSize: 13 };
  return (
    <ul
      aria-label="자산 구성비 범례"
      style={{
        listStyle: "none", margin: 0, padding: 0, flex: "1 1 200px", minWidth: 200,
        display: "flex", flexDirection: "column", justifyContent: "center", gap: 12,
      }}
    >
      {slices.map((s, i) => (
        <li
          key={s.type}
          style={{ display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: 2, gap: 10 }}
        >
          <span aria-hidden style={dotStyle(colorFor(i))} />
          <span style={{ fontWeight: 600, minWidth: 0 }}>{s.label}</span>
          <span style={amountStyle}>{formatKrwExact(s.value)}</span>
          <span style={{ fontWeight: 600, marginLeft: wide ? "auto" : undefined }}>
            {s.percent.toFixed(1)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

function LegendTable({ slices }: { slices: CompositionSlice[] }) {
  return (
    <table
      aria-label="자산 구성비 범례"
      style={{ flex: 1, minWidth: 240, borderCollapse: "collapse", width: "100%" }}
    >
      <thead>
        <tr>
          {["유형", "금액", "비중"].map((h, i) => (
            <th
              key={h}
              style={{
                textAlign: i === 0 ? "left" : "right",
                fontSize: 12, fontWeight: 500, color: "var(--af-muted-foreground)",
                padding: "0 8px 6px 0", borderBottom: "1px solid var(--af-border)",
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {slices.map((s, i) => (
          <tr key={s.type}>
            <td style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, padding: "9px 8px 9px 0" }}>
              <span aria-hidden style={dotStyle(colorFor(i))} />
              {s.label}
            </td>
            <td style={{ textAlign: "right", padding: "9px 8px 9px 0", borderBottom: "1px solid var(--af-border)" }}>{formatKrwExact(s.value)}</td>
            <td style={{ textAlign: "right", fontWeight: 600, padding: "9px 0 9px 0", borderBottom: "1px solid var(--af-border)" }}>{s.percent.toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LegendChips({ slices }: { slices: CompositionSlice[] }) {
  return (
    <div
      aria-label="자산 구성비 범례"
      style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
    >
      {slices.map((s, i) => (
        <div
          key={s.type}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "var(--af-secondary)",
            border: "1px solid var(--af-border)",
            borderRadius: 8, padding: "8px 12px",
          }}
        >
          <span aria-hidden style={dotStyle(colorFor(i))} />
          <span style={{ fontWeight: 600 }}>{s.label}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600 }}>{s.percent.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

export function CompositionDonut({
  slices,
  variant = "inline",
}: {
  slices: CompositionSlice[];
  variant?: CompositionLegendVariant;
}) {
  const screens = Grid.useBreakpoint();
  // §35 중단점: md(768px) 이상은 폭이 넓은 카드 — 도넛 좌측·범례 우측 세로 목록, 미만은 상하 스택
  const wide = Boolean(screens.md);

  // 스크린리더용 데이터 테이블 (aria-label 로 차트 설명)
  const dataTable = (
    <table
      className="sr-only"
      style={{
        borderCollapse: "collapse",
        width: "100%",
        marginTop: 12,
      }}
    >
      <caption style={{ textAlign: "left", marginBottom: 8, fontWeight: 600 }}>
        자산 구성비 데이터
      </caption>
      <thead>
        <tr>
          <th style={{ textAlign: "left", padding: "8px 8px 8px 0", borderBottom: "1px solid currentColor" }}>
            유형
          </th>
          <th style={{ textAlign: "right", padding: "8px 8px 8px 0", borderBottom: "1px solid currentColor" }}>
            금액
          </th>
          <th style={{ textAlign: "right", padding: "8px 0 8px 0", borderBottom: "1px solid currentColor" }}>
            비중
          </th>
        </tr>
      </thead>
      <tbody>
        {slices.map((s) => (
          <tr key={s.type}>
            <td style={{ textAlign: "left", padding: "8px 8px 8px 0" }}>{s.label}</td>
            <td style={{ textAlign: "right", padding: "8px 8px 8px 0" }}>{formatKrwExact(s.value)}</td>
            <td style={{ textAlign: "right", padding: "8px 0 8px 0" }}>{s.percent.toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const chart = (
    <figure
      style={{
        margin: "0 auto",
        flex: "0 1 240px",
        minWidth: 0,
        maxWidth: "100%",
        // width:"auto" 는 margin auto 와 만나면 stretch 가 꺼져(shrink-to-fit)
        // 내부 width:100% 가 순환해 차트 폭이 0 이 된다. 도넛 지름을 240px 로
        // 고정해 320~1280 에서 같은 크기를 유지한다(maxWidth 로 좁은 화면에서만 줄어든다).
        width: 240,
      }}
    >
      <figcaption className="sr-only" style={{ marginBottom: 8 }}>
        자산 구성 도넛 차트 — {slices.map((s) => `${s.label} ${s.percent.toFixed(1)}%`).join(", ")}
      </figcaption>
      <div style={{ width: "100%", height: 240, margin: "0 auto" }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              formatter={(value, name) => [
                formatKrwExact(Number(value)),
                String(name),
              ]}
            />
            <Pie
              data={slices.map((s, i) => ({ name: s.label, value: s.value, fill: colorFor(i) }))}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
              stroke="var(--af-card)"
              strokeWidth={2}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );

  const legend =
    variant === "table" ? <LegendTable slices={slices} />
    : variant === "chips" ? <LegendChips slices={slices} />
    : <LegendInline slices={slices} wide={wide} />;

  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: wide ? "row" : "column",
          flexWrap: "wrap",
          alignItems: wide ? "center" : "stretch",
          gap: wide ? 24 : 16,
          width: "100%",
          minWidth: 0,
        }}
      >
        {chart}
        {legend}
      </div>
      {dataTable}
    </>
  );
}
