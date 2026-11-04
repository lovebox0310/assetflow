import { Typography } from "antd";
import type { AssetRow } from "../data/dashboardMock";
import { formatKrwExact, formatPercent } from "../utils/formatters";

/**
 * 비상금 계좌 카드 목록 — 프로토타입 design/prototype/dashboard.html 의
 * `.cash-grid` / `.cash-item` 을 따른다.
 *
 * - 좁은 화면 1열 → 넓은 화면 다열 (`.af-cash-grid` 의 auto-fit).
 * - 여기에 들어오는 행은 이미 비상금으로 지정된 계좌이므로 모두 "비상금" 태그와
 *   강조 테두리를 준다.
 * - §62: 금액은 `balance`(예수금)를 우선. invest 라도 평가액은 제외한다.
 * - 비중은 비상금 합계 대비 — 0으로 나누지 않는다.
 */
export function CashAccountCards({
  rows,
  emergencyAccountIds = [],
}: {
  rows: AssetRow[];
  emergencyAccountIds?: string[];
}) {
  if (rows.length === 0) {
    return (
      <Typography.Text type="secondary">
        비상금 계좌를 지정하면 여기에 표시됩니다 — "비상금 유지 개월" 카드의 기준 설정
      </Typography.Text>
    );
  }

  // §62: 비상금 분자와 동일한 금액(balance)을 보여 준다.
  const displayedValue = (row: AssetRow) => row.balance ?? row.value;
  const total = rows.reduce((sum, row) => sum + displayedValue(row), 0);
  const emergency = new Set(emergencyAccountIds);

  return (
    <>
      <ul className="af-cash-grid">
        {rows.map((row) => {
          const isEmergency = emergency.has(row.id);
          const value = displayedValue(row);
          return (
            <li
              key={row.id}
              className={`af-cash-item${isEmergency ? " af-cash-item--emergency" : ""}`}
            >
              <div className="af-cash-item__top">
                <span className="af-cash-item__label">{row.name}</span>
                {isEmergency ? <span className="af-cash-item__tag">비상금</span> : null}
              </div>
              <p className="af-cash-item__amount af-num">{formatKrwExact(value)}</p>
              <p className="af-cash-item__pct af-num">
                비상금의 {formatPercent(total > 0 ? (value / total) * 100 : 0)}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="af-cash-note">
        비상금 합계 {formatKrwExact(total)}
        {" · "}비상금 계좌 {emergencyAccountIds.length}개
      </p>
    </>
  );
}
