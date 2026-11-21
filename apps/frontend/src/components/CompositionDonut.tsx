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
        // 세로 스택(좁은 화면)에서는 flex-basis 200px 가 "높이"로 해석돼
        // 범례 아래 빈 공간이 생긴다 — 좁을 때는 내용 높이만 차지하게 둔다.
        listStyle: "none", margin: 0, padding: 0, flex: wide ? "1 1 200px" : "0 0 auto", minWidth: 200,
        display: "flex", flexDirection: "column", justifyContent: wide ? "center" : "flex-start", gap: 12,
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

  // A-07: 차트 조각은 스크린리더에 한 덩어리(요약)로만 노출한다 —
  // 접근성 레이어(recharts application)는 끄고 차트 래퍼에 이름을 준다.
  const chartSummary = `자산 구성 도넛 차트 — ${slices
    .map((s) => `${s.label} ${s.percent.toFixed(1)}%`)
    .join(", ")}`;

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
      {/* A-07 후속: 요약 문구는 아래 role="img" 의 이름 하나만 쓴다.
          `<figcaption>` 은 aria-hidden 으로도 낭독에서 빠지지 않는다 —
          HTML-AAM 이 figure 의 이름을 figcaption 에서 가져와(aria-hidden 무시)
          같은 요약이 figure + img 두 번 노출된다(실측: ariaSnapshot).
          그래서 캡션 요소를 두지 않는다. 시각 변화 0(sr-only 텍스트). */}
      {/* figure 에 role="img" 는 ARIA-in-HTML 상 허용되지 않는다(axe aria-allowed-role).
          다른 두 차트처럼 차트 래퍼 div 에 role="img" + 요약 이름을 준다. */}
      <div role="img" aria-label={chartSummary} style={{ width: "100%", height: 240, margin: "0 auto" }}>
        <ResponsiveContainer width="100%" height="100%">
          {/* A-07: accessibilityLayer 는 탭 스톱(무명 application)을 만든다. 끈다. */}
          <PieChart accessibilityLayer={false}>
            <Tooltip
              formatter={(value, name) => [
                formatKrwExact(Number(value)),
                String(name),
              ]}
              // A-01: 다크 카드 위 기본 툴팁(흰 배경/검정 글자 위 흰 글자) 대비 1.15:1.
              // 다른 차트와 같은 세트를 쓴다 — 새 색 없이 `--af-*` 토큰만.
              contentStyle={{
                background: "var(--af-card)",
                border: "1px solid var(--af-border)",
                borderRadius: 8,
                color: "var(--af-foreground)",
              }}
              itemStyle={{ color: "var(--af-foreground)" }}
              labelStyle={{ color: "var(--af-muted-foreground)" }}
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
