import { Button, Space } from "antd";

/**
 * §53 헤더 내비게이션 일관화: 모든 화면에서 동일 구성·순서(대시보드·자산·지출).
 * 현재 화면은 비활성(클릭 불가)으로 식별한다 — 위치 감각을 유지하기 위함.
 */
export type AppNavPage = "dashboard" | "assets" | "expenses";

export function StandardNav({
  current,
  onOpenDashboard = undefined,
  onOpenAssets = undefined,
  onOpenExpenses = undefined,
}: {
  current: AppNavPage;
  onOpenDashboard?: (() => void) | undefined;
  onOpenAssets?: (() => void) | undefined;
  onOpenExpenses?: (() => void) | undefined;
}) {
  const item = (label: string, page: AppNavPage, onClick?: () => void) =>
    current === page ? (
      <Button key={page} type="link" disabled style={{ fontWeight: 700 }}>{label}</Button>
    ) : (
      <Button key={page} type="link" onClick={onClick}>{label}</Button>
    );
  return (
    <Space size={4}>
      {item("대시보드", "dashboard", onOpenDashboard)}
      {item("자산", "assets", onOpenAssets)}
      {item("지출", "expenses", onOpenExpenses)}
    </Space>
  );
}
