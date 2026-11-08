import { Button, Space } from "antd";

export interface SubNavItem {
  key: string;
  label: string;
  ariaLabel: string;
  onClick?: (() => void) | undefined;
}

/**
 * 하위 화면 탭 공통 내비 (§54.1 자산 | 투자 패턴).
 * - 전역 헤더 내비는 4개를 유지하고, 하위 화면만 이 nav 로 이동한다.
 * - 현재 탭은 `aria-current="page"` + 굵기로만 구분한다(disabled 미사용 — §28.5 대비).
 * - 현재 탭에는 onClick 을 붙이지 않는다.
 */
export function SubNav({
  current,
  items,
  ariaLabel,
}: {
  current: string;
  items: SubNavItem[];
  ariaLabel: string;
}) {
  return (
    <nav aria-label={ariaLabel} style={{ marginBottom: 16 }}>
      <Space size={4}>
        {items.map((item) => {
          const isCurrent = item.key === current;
          return (
            <Button
              key={item.key}
              type="link"
              aria-label={item.ariaLabel}
              {...(isCurrent ? { "aria-current": "page" as const } : {})}
              {...(!isCurrent && item.onClick ? { onClick: item.onClick } : {})}
              style={{
                paddingInline: 8,
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
                ...(isCurrent ? { fontWeight: 700, color: "var(--af-foreground)" } : {}),
              }}
            >
              {item.label}
            </Button>
          );
        })}
      </Space>
    </nav>
  );
}
