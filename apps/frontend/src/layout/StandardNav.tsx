import { Button, Grid, Space } from "antd";

/**
 * §53 헤더 내비게이션 일관화: 모든 화면에서 동일 구성·순서(대시보드·자산·지출).
 * 현재 화면은 비활성(클릭 불가)으로 식별한다 — 위치 감각을 유지하기 위함.
 */
export type AppNavPage = "dashboard" | "assets" | "expenses" | "settings";

export function StandardNav({
  current,
  onOpenDashboard = undefined,
  onOpenAssets = undefined,
  onOpenExpenses = undefined,
  onOpenSettings = undefined,
}: {
  current: AppNavPage;
  onOpenDashboard?: (() => void) | undefined;
  onOpenAssets?: (() => void) | undefined;
  onOpenExpenses?: (() => void) | undefined;
  onOpenSettings?: (() => void) | undefined;
}) {
  const screens = Grid.useBreakpoint();
  const compact = !screens.sm;
  const item = (label: string, page: AppNavPage, onClick?: () => void) =>
    current === page ? (
      <Button key={page} type="link" disabled style={{ fontWeight: 700, fontSize: compact ? 13 : undefined, paddingInline: compact ? "4px 6px" : undefined, whiteSpace: "nowrap" }}>{label}</Button>
    ) : (
      <Button key={page} type="link" onClick={onClick} style={{ fontSize: compact ? 13 : undefined, paddingInline: compact ? "4px 6px" : undefined, whiteSpace: "nowrap" }}>{label}</Button>
    );
  return (
    <Space size={compact ? 0 : 4} style={{ minWidth: 0, flexWrap: "nowrap" }}>
      {item("대시보드", "dashboard", onOpenDashboard)}
      {item("자산", "assets", onOpenAssets)}
      {item("지출", "expenses", onOpenExpenses)}
      {item("설정", "settings", onOpenSettings)}
    </Space>
  );
}
