import type { ReactNode } from "react";
import { Button, Layout, Space, Typography } from "antd";

const { Header, Content } = Layout;

interface AppLayoutProps {
  /** 우측 상단 로그아웃. 미인증 화면에서는 넘기지 않는다. */
  onLogout?: () => void;
  children: ReactNode;
}

/**
 * Issue 3 공통 레이아웃 (§22 작업: 헤더/컨테이너).
 * 헤더 = 브랜드 + 계정 액션. 콘텐츠는 .af-container (§35: max 1200px,
 * 모바일 거터 16px / 데스크톱 24px). 화면 전환이 아니라 페이지 안에 상수를 둔다.
 */
export function AppLayout({ onLogout, children }: AppLayoutProps) {
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#fff",
          paddingInline: 16,
          borderBottom: "1px solid rgba(5,5,5,0.06)",
        }}
      >
        <Typography.Text strong style={{ fontSize: 18 }}>
          AssetFlow
        </Typography.Text>
        <Space>
          {onLogout ? (
            <Button type="text" onClick={onLogout}>
              로그아웃
            </Button>
          ) : null}
        </Space>
      </Header>
      <Content className="af-container">{children}</Content>
    </Layout>
  );
}
