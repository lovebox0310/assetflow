import { useEffect, useState } from "react";
import { DashboardPage } from "../pages/DashboardPage";
import { AssetsPage } from "../pages/AssetsPage";
import { ExpensesPage } from "../pages/ExpensesPage";
import { SettingsPage } from "../pages/SettingsPage";
import { LoginPage } from "../pages/LoginPage";
import { isAuthenticated } from "../auth/authStore";

export type AppPage = "dashboard" | "assets" | "expenses" | "settings";

/**
 * §21 보호 라우트 접근 제어: 토큰이 없거나 만료되면 로그인 화면을 렌더한다.
 * 라우터 없이 상태 전환 (§42 화면 범위: 대시보드/자산/지출).
 */
export function App() {
  const [authed, setAuthed] = useState(() => isAuthenticated());
  const [page, setPage] = useState<AppPage>("dashboard");

  // 이슈 #38: 어떤 화면에서든 API 가 401 을 돌려주면 토큰이 이미 정리되고
  // 이 이벤트가 온다 — 로그인 화면으로 즉시 전환한다.
  useEffect(() => {
    const onUnauthorized = () => setAuthed(false);
    window.addEventListener("assetflow:unauthorized", onUnauthorized);
    return () => window.removeEventListener("assetflow:unauthorized", onUnauthorized);
  }, []);

  if (authed && isAuthenticated()) {
    if (page === "assets") {
      return (
        <AssetsPage
          onBack={() => setPage("dashboard")}
          onOpenExpenses={() => setPage("expenses")}
          onOpenSettings={() => setPage("settings")}
        />
      );
    }
    if (page === "expenses") {
      return (
        <ExpensesPage
          onOpenDashboard={() => setPage("dashboard")}
          onOpenAssets={() => setPage("assets")}
          onOpenSettings={() => setPage("settings")}
        />
      );
    }
    if (page === "settings") {
      return (
        <SettingsPage
          onOpenDashboard={() => setPage("dashboard")}
          onOpenAssets={() => setPage("assets")}
          onOpenExpenses={() => setPage("expenses")}
        />
      );
    }
    return (
      <DashboardPage
        onLogout={() => setAuthed(false)}
        onOpenAssets={() => setPage("assets")}
        onOpenExpenses={() => setPage("expenses")}
        onOpenSettings={() => setPage("settings")}
      />
    );
  }
  return <LoginPage onSuccess={() => setAuthed(true)} />;
}
