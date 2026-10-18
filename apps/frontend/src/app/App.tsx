import { useState } from "react";
import { DashboardPage } from "../pages/DashboardPage";
import { AssetsPage } from "../pages/AssetsPage";
import { LoginPage } from "../pages/LoginPage";
import { isAuthenticated } from "../auth/authStore";

export type AppPage = "dashboard" | "assets";

/**
 * §21 보호 라우트 접근 제어: 토큰이 없거나 만료되면 로그인 화면을 렌더한다.
 * 라우터 없이 상태 전환 (§39 화면 범위: 대시보드/자산 2개).
 */
export function App() {
  const [authed, setAuthed] = useState(() => isAuthenticated());
  const [page, setPage] = useState<AppPage>("dashboard");

  if (authed && isAuthenticated()) {
    return page === "assets" ? (
      <AssetsPage onBack={() => setPage("dashboard")} />
    ) : (
      <DashboardPage
        onLogout={() => setAuthed(false)}
        onOpenAssets={() => setPage("assets")}
      />
    );
  }
  return <LoginPage onSuccess={() => setAuthed(true)} />;
}
