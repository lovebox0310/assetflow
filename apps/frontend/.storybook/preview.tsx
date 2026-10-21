import type { Decorator } from "@storybook/react-vite";
import { useLayoutEffect, type ReactNode } from "react";
import { ConfigProvider } from "antd";
import { applyAfCssVars, createAfTheme, type ResolvedTheme } from "../src/theme/tokens";
import "../src/app/app.css";

// 앱과 같은 토큰·배경에서 렌더 — Storybook이 프로토타입과 다른 얼굴이 되면
// §10 "시각 회귀 우선 확인" 기준이 무의미해진다.
//
// §28.4 — 라이트/다크 두 가지. 스토리에서 `parameters: { theme: "dark" }` 로
// 다크를 확인할 수 있다(없으면 라이트).
//
// `dataset.theme` 과 `--af-*` 주입은 레이아웃 이펙트에서 한다 — 페인트 전에
// 값이 적용돼야 첫 화면에 이전 모드의 색이 남지 않는다.

/** --af-* 변수를 문서 루트에 심는다 — 값의 보유처는 tokens.ts (§28.4). */
function ThemeFrame({ mode, children }: { mode: ResolvedTheme; children: ReactNode }) {
  useLayoutEffect(() => {
    applyAfCssVars(mode);
    document.documentElement.dataset.theme = mode;
  }, [mode]);
  return (
    <ConfigProvider theme={createAfTheme(mode)}>
      <div style={{ background: "var(--af-bg)", color: "var(--af-foreground)", padding: 24, minHeight: "100vh" }}>
        {children}
      </div>
    </ConfigProvider>
  );
}

const withTheme: Decorator = (Story, context) => {
  const mode: ResolvedTheme = context.parameters?.theme === "dark" ? "dark" : "light";
  return (
    <ThemeFrame mode={mode}>
      <Story />
    </ThemeFrame>
  );
};

export const decorators = [withTheme];
