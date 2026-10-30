import { useMemo } from "react";
import { Select } from "antd";
import { recentMonths } from "../utils/months";

/**
 * 지출·카드내역 화면이 공유하는 월 선택기.
 * 월 상태는 App 이 소유하므로(탭 전환에도 유지) 이 컴포넌트는 표시와 변경만 맡는다.
 */
export function MonthSelect({
  value,
  onChange,
  label = "조회 월",
}: {
  value: string;
  onChange: (month: string) => void;
  label?: string;
}) {
  const months = useMemo(() => recentMonths(), []);
  return (
    <Select
      aria-label={label}
      value={value}
      options={months.map((m) => ({ value: m, label: m }))}
      onChange={onChange}
      style={{ width: 130 }}
    />
  );
}
