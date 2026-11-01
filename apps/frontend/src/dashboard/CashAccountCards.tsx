import { Typography } from "antd";
import type { AssetRow } from "../data/dashboardMock";
import { formatKrwExact, formatPercent } from "../utils/formatters";

/**
 * 현금 계좌 카드 목록 — 프로토타입 design/prototype/dashboard.html 의
 * `.cash-grid` / `.cash-item` 을 따른다.
 *
 * - 좁은 화면 1열 → 넓은 화면 다열 (`.af-cash-grid` 의 auto-fit).
 * - 계좌 성격은 비상금 통장 지정 여부만 데이터로 알 수 있으므로, 지정된 계좌에
 *   "비상금" 태그와 강조 테두리를 준다. 나머지는 일반 현금성 계좌로 둔다.
 * - 비중은 현금 합계 대비 — 0으로 나누지 않는다.
 */
export function CashAccountCards({
  rows,
  emergencyAccountIds = [],
}: {
  rows: AssetRow[];
  emergencyAccountIds?: string[];
}) {
  if (rows.length === 0) {
    return <Typography.Text type="secondary">현금성 계좌가 없습니다</Typography.Text>;
  }

  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const emergency = new Set(emergencyAccountIds);

  return (
    <ul className="af-cash-grid">
      {rows.map((row) => {
        const isEmergency = emergency.has(row.id);
        return (
          <li
            key={row.id}
            className={`af-cash-item${isEmergency ? " af-cash-item--emergency" : ""}`}
          >
            <div className="af-cash-item__top">
              <span className="af-cash-item__label">{row.name}</span>
              {isEmergency ? <span className="af-cash-item__tag">비상금</span> : null}
            </div>
            <p className="af-cash-item__amount af-num">{formatKrwExact(row.value)}</p>
            <p className="af-cash-item__pct af-num">
              현금의 {formatPercent(total > 0 ? (row.value / total) * 100 : 0)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
