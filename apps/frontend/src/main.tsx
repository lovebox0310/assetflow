import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import { App } from "./app/App";
import { afTheme } from "./theme/tokens";
import "./app/app.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ConfigProvider theme={afTheme}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
