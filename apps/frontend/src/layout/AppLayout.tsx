import type { ReactNode } from "react";
import { Button, Grid, Layout, Space } from "antd";
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
 * §75: 헤더는 sticky — 긴 화면에서도 내비게이션이 보인다. 모바일에서는 내비가
 * 하단 탭(StandardNav)으로 빠지므로 헤더는 브랜드·테마·로그아웃만 남는다.
 * 주의: Header 에 transform/filter/backdrop-filter/contain 을 주면 fixed 인
 * 하단 탭의 containing block 이 되어 탭이 뷰포트 아래에 붙지 않는다.
 */
export function AppLayout({ onLogout, nav, children }: AppLayoutProps) {
  const screens = Grid.useBreakpoint();
  const mobile = !screens.sm;
  const { resolved, toggleTheme } = useTheme();
  const dark = resolved === "dark";

  return (
    <Layout style={{ minHeight: "100dvh" }}>
      {/*
        이슈 #70: 스킵 링크 — 첫 Tab 으로 헤더 내비를 건너뛰고 본문(#main)으로
        직행한다. 포커스 전에는 화면 밖(-9999px)에 있다가 포커스 시 좌상단에
        나타난다(스타일은 app.css .af-skip-link).
      */}
      <a href="#main" className="af-skip-link">
        본문으로 건너뛰기
      </a>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          /* §75 sticky: 문서 스크롤에도 헤더가 상단에 남는다.
             transform/filter/backdrop-filter/contain 은 넣지 않는다(fixed 탭이 깨진다). */
          position: "sticky",
          top: 0,
          zIndex: 100,
          /* 모바일: 좁은 폭에서 두 번째 줄로 넘어가도록 허용한다(화면 밖 잘림 방지). */
          flexWrap: mobile ? "wrap" : "nowrap",
          rowGap: mobile ? 4 : 0,
          /* antd Header 의 line-height:64 를 물려받으면 Space 아이템이 64px 이 되어
             모바일 헤더가 77px 로 부푼다. 모바일만 line-height 를 풀어 56px 을 지킨다. */
          lineHeight: mobile ? 1 : undefined,
          overflow: "visible",
          background: "var(--af-card)",
          paddingInline: mobile ? 12 : 16,
          paddingBlock: mobile ? 6 : 0,
          borderBottom: "1px solid var(--af-border)",
          height: mobile ? "auto" : 64,
          minHeight: mobile ? 56 : 64,
        }}
      >
        <Space size={mobile ? 6 : 16} style={{ minWidth: 0 }}>
          {/* §74: 브랜드는 대시보드 홈 링크다(해시 라우팅과 그대로 맞물린다). */}
          <a
            href="#/"
            aria-label="AssetFlow 홈 — 대시보드"
            style={{
              color: "var(--af-foreground)",
              fontWeight: 700,
              fontSize: mobile ? 14 : 18,
              whiteSpace: "nowrap",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              minHeight: 44,
              minWidth: 44,
              justifyContent: "center",
              paddingInline: 8,
            }}
          >
            AssetFlow
          </a>
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
              width: mobile ? 44 : 32,
              height: mobile ? 44 : 32,
              minWidth: mobile ? 44 : 32,
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </Button>
          {onLogout ? (
            <Button
              type="text"
              size={mobile ? "small" : "middle"}
              onClick={onLogout}
              style={mobile ? { minHeight: 44, paddingInline: 12 } : undefined}
            >
              로그아웃
            </Button>
          ) : null}
        </Space>
      </Header>
      <Content className="af-container">
        {/* 이슈 #70: main 랜드마크 — 스킵 링크의 이동 대상. tabIndex=-1 로 선택
            시 포커스가 들어오지만 탭 순서에는 참여하지 않는다. */}
        <main id="main" tabIndex={-1}>
          {children}
        </main>
      </Content>
    </Layout>
  );
}
