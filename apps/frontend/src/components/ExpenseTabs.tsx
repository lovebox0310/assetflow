import { Button, Space } from "antd";

export type ExpenseTab = "expenses" | "cards";

/**
 * 지출 영역의 하위 탭 (§54.1 자산 | 투자 패턴).
 * - 전역 헤더 내비는 4개를 유지하고, 두 탭 모두 `current="expenses"` 를 쓴다.
 * - 현재 탭은 `aria-current="page"` 로만 구분한다(disabled 미사용 — §28.5 대비).
 */
export function ExpenseTabs({
  current,
  onOpenExpenses = undefined,
  onOpenCards = undefined,
}: {
  current: ExpenseTab;
  onOpenExpenses?: (() => void) | undefined;
  onOpenCards?: (() => void) | undefined;
}) {
  const tab = (
    key: ExpenseTab,
    label: string,
    ariaLabel: string,
    onClick?: (() => void) | undefined,
  ) => {
    const isCurrent = current === key;
    return (
      <Button
        key={key}
        type="link"
        aria-label={ariaLabel}
        {...(isCurrent ? { "aria-current": "page" as const } : {})}
        {...(!isCurrent && onClick ? { onClick } : {})}
        style={
          isCurrent
            ? { paddingInline: 8, fontWeight: 700, color: "var(--af-foreground)" }
            : { paddingInline: 8 }
        }
      >
        {label}
      </Button>
    );
  };

  return (
    <nav aria-label="지출 하위 화면" style={{ marginBottom: 16 }}>
      <Space size={4}>
        {tab("expenses", "지출", "지출 탭", onOpenExpenses)}
        {tab("cards", "카드내역", "카드내역 탭", onOpenCards)}
      </Space>
    </nav>
  );
}
