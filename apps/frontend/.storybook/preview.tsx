import type { Decorator } from "@storybook/react-vite";
import { ConfigProvider } from "antd";
import { afTheme } from "../src/theme/tokens";
import "../src/app/app.css";

// 앱과 같은 토큰·배경에서 렌더 — Storybook이 프로토타입과 다른 얼굴이 되면
// §10 "시각 회귀 우선 확인" 기준이 무의미해진다.
const withTheme: Decorator = (Story) => (
  <ConfigProvider theme={afTheme}>
    <div style={{ background: "#f5f5f5", padding: 24, minHeight: "100vh" }}>
      <Story />
    </div>
  </ConfigProvider>
);

export const decorators = [withTheme];
