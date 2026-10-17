import { Typography } from "antd";
import type { CompositionSlice } from "../dashboard/metrics";
import { formatKrwAbbr, formatPercent } from "../utils/formatters";

/**
 * 자산 구성비 목록 (카드 본문 · §28.3 "금액 + 비중 동시 표기" 규칙).
 * DashboardPage 의 구성비 카드와 Storybook 이 같은 출처를 쓴다.
 */
export function AssetCompositionList({ slices }: { slices: CompositionSlice[] }) {
  if (slices.length === 0) {
    return <Typography.Text type="secondary">표시할 자산이 없습니다</Typography.Text>;
  }
  return (
    <ul className="af-composition">
      {slices.map((s) => (
        <li key={s.type}>
          <span>{s.label}</span>
          <span className="af-num">{`${formatPercent(s.percent)} · ${formatKrwAbbr(s.value)}`}</span>
        </li>
      ))}
    </ul>
  );
}
