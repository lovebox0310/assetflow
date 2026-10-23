import type { ReactNode } from "react";
import { Button, Grid, Layout, Space, Typography } from "antd";
import { useTheme } from "../theme/themeStore";

const { Header, Content } = Layout;

interface AppLayoutProps {
  /** 우측 상단 로그아웃. 미인증 화면에서는 넘기지 않는다. */
  onLogout?: () => void;
  /** 헤더 좌측 내비게이션 — 브랜드 옆. 화면 전환 버튼이 여기 렌더된다. */
  nav?: ReactNode;
  children: ReactNode;
}

/** D7 — 아이콘 패키지 없음. 인라인 SVG 로 직접 그린다. */
function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

/**
 * Issue 3 공통 레이아웃 (§22 작업: 헤더/컨테이너).
 * 헤더 = 브랜드 + 내비게이션 + 계정 액션. 콘텐츠는 .af-container (§35: max 1200px,
 * 모바일 거터 16px / 데스크톱 24px).
 * §35 모바일: 좁은 폭에서 브랜드·내비·로그아웃이 한 줄에 들어가도록 축약한다(늘어짐 방지).
 * §28.4(D1): 다크 토글 버튼이 로그아웃 옆에 있다.
 */
export function AppLayout({ onLogout, nav, children }: AppLayoutProps) {
  const screens = Grid.useBreakpoint();
  const mobile = !screens.sm;
  const { resolved, toggleTheme } = useTheme();
  const dark = resolved === "dark";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          /* 모바일: 좁은 폭에서 두 번째 줄로 넘어가도록 허용한다(화면 밖 잘림 방지). */
          flexWrap: mobile ? "wrap" : "nowrap",
          rowGap: mobile ? 4 : 0,
          overflow: "visible",
          background: "var(--af-card)",
          paddingInline: mobile ? 10 : 16,
          paddingBlock: mobile ? 8 : 0,
          borderBottom: "1px solid var(--af-border)",
          height: mobile ? "auto" : 64,
          minHeight: mobile ? 48 : 64,
        }}
      >
        <Space size={mobile ? 6 : 16} style={{ minWidth: 0 }}>
          <Typography.Text strong style={{ fontSize: mobile ? 14 : 18, whiteSpace: "nowrap" }}>
            AssetFlow
          </Typography.Text>
          {nav}
        </Space>
        <Space size={mobile ? 4 : 8}>
          <Button
            type="text"
            size="small"
            onClick={toggleTheme}
            aria-label={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
            aria-pressed={dark}
            style={{
              width: mobile ? 28 : 32,
              height: mobile ? 28 : 32,
              minWidth: mobile ? 28 : 32,
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </Button>
          {onLogout ? (
            <Button type="text" size={mobile ? "small" : "middle"} onClick={onLogout}>
              로그아웃
            </Button>
          ) : null}
        </Space>
      </Header>
      <Content className="af-container">{children}</Content>
    </Layout>
  );
}
