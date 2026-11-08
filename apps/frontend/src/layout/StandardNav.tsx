import { Button, Grid, Space } from "antd";

/**
 * §53 헤더 내비게이션 일관화: 모든 화면에서 동일 구성·순서(대시보드·자산·지출).
 * 현재 화면은 `aria-current="page"` 로 식별한다 (이슈 #70):
 * - `disabled` 를 쓰지 않는다 — antd disabled 텍스트(#8a857b)는 헤더 배경 위
 *   3.49:1 로 §28.5 AA 4.5:1 을 못 넘는다. 현재 항목만 잉크색(--af-foreground,
 *   라이트 16:1 / 다크 14.5:1) + 굵기로 구분하고 클릭 대상은 그대로 둔다.
 * - 링크 버튼 색(slate)은 카드 배경 위 5.62:1 로 원래 AA 를 만족한다.
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

  /*
   * §75 모바일: 전역 내비 4개를 엄지 접근 가능한 하단 탭으로 내린다.
   * 헤더 안에서 그대로 렌더한다(portal/이중 렌더 금지) — 스크린리더의 내비
   * 랜드마크가 하나로 유지되고, `navigation.spec` 의 header 스코프도 그대로 산다.
   * 네이티브 button 을 쓴다 — antd Button 은 모바일에서 min-width/padding 을
   * 끌고 와 44px 터치 타깃과 탭 분할(flex:1)이 어긋난다.
   * 현재 항목 굵기는 inline 으로도 준다 — 단위 테스트(jsdom)가
   * `style.fontWeight === "700"` 을 읽고, jsdom 은 CSS 클래스 계산값을 모른다.
   */
  if (!screens.sm) {
    const tab = (label: string, page: AppNavPage, onClick?: () => void) => {
      const isCurrent = current === page;
      return (
        <button
          key={page}
          type="button"
          className="af-tabbar__item"
          {...(isCurrent ? { "aria-current": "page" as const } : {})}
          {...(!isCurrent && onClick ? { onClick } : {})}
          style={isCurrent ? { fontWeight: 700 } : undefined}
        >
          {label}
        </button>
      );
    };
    return (
      <nav className="af-tabbar" aria-label="주 메뉴">
        {tab("대시보드", "dashboard", onOpenDashboard)}
        {tab("자산", "assets", onOpenAssets)}
        {tab("지출", "expenses", onOpenExpenses)}
        {tab("설정", "settings", onOpenSettings)}
      </nav>
    );
  }

  const item = (label: string, page: AppNavPage, onClick?: () => void) => {
    const isCurrent = current === page;
    return (
      <Button
        key={page}
        type="link"
        {...(isCurrent ? { "aria-current": "page" as const } : {})}
        {...(onClick ? { onClick } : {})}
        style={{
          fontWeight: isCurrent ? 700 : undefined,
          ...(isCurrent ? { color: "var(--af-foreground)" } : {}),
          fontSize: compact ? 13 : undefined,
          paddingInline: compact ? "4px 6px" : undefined,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </Button>
    );
  };
  return (
    <Space size={compact ? 0 : 4} style={{ minWidth: 0, flexWrap: "nowrap" }}>
      {item("대시보드", "dashboard", onOpenDashboard)}
      {item("자산", "assets", onOpenAssets)}
      {item("지출", "expenses", onOpenExpenses)}
      {item("설정", "settings", onOpenSettings)}
    </Space>
  );
}
