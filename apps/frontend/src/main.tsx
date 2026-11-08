import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import koKR from "antd/locale/ko_KR";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import { App } from "./app/App";
import { createAfTheme } from "./theme/tokens";
import { initThemeStore, useTheme } from "./theme/themeStore";
import "./app/app.css";

// antd 기본 문구(Popconfirm/Modal 버튼, DatePicker·Pagination 등)를 한국어로.
// dayjs 는 antd 의 날짜 기본 로케일이므로 함께 맞춘다(직접 의존성).
dayjs.locale("ko");

// 첫 렌더 전에 저장값을 읽어 dataset.theme 과 --af-* 변수를 먼저 심는다 —
// 테마 플리커를 막는다 (CSR 전용, SSR 없음).
initThemeStore();

/** 테마 스토어의 resolved 를 구독해 ConfigProvider 를 다시 그린다. */
function Root() {
  const { resolved } = useTheme();
  return (
    <ConfigProvider locale={koKR} theme={createAfTheme(resolved)}>
      <App />
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
