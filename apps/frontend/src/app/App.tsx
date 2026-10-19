import { useState } from "react";
import { DashboardPage } from "../pages/DashboardPage";
import { AssetsPage } from "../pages/AssetsPage";
import { ExpensesPage } from "../pages/ExpensesPage";
import { LoginPage } from "../pages/LoginPage";
import { isAuthenticated } from "../auth/authStore";

export type AppPage = "dashboard" | "assets" | "expenses";

/**
 * §21 보호 라우트 접근 제어: 토큰이 없거나 만료되면 로그인 화면을 렌더한다.
 * 라우터 없이 상태 전환 (§42 화면 범위: 대시보드/자산/지출).
 */
export function App() {
  const [authed, setAuthed] = useState(() => isAuthenticated());
  const [page, setPage] = useState<AppPage>("dashboard");

  if (authed && isAuthenticated()) {
    if (page === "assets") {
      return (
        <AssetsPage
          onBack={() => setPage("dashboard")}
          onOpenExpenses={() => setPage("expenses")}
        />
      );
    }
    if (page === "expenses") {
      return (
        <ExpensesPage
          onOpenDashboard={() => setPage("dashboard")}
          onOpenAssets={() => setPage("assets")}
        />
      );
    }
    return (
      <DashboardPage
        onLogout={() => setAuthed(false)}
        onOpenAssets={() => setPage("assets")}
        onOpenExpenses={() => setPage("expenses")}
      />
    );
  }
  return <LoginPage onSuccess={() => setAuthed(true)} />;
}
