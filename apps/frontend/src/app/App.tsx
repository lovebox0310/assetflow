import { useCallback, useEffect, useState } from "react";
import { DashboardPage } from "../pages/DashboardPage";
import { AssetsPage } from "../pages/AssetsPage";
import { ExpensesPage } from "../pages/ExpensesPage";
import { SettingsPage } from "../pages/SettingsPage";
import { LoginPage } from "../pages/LoginPage";
import { isAuthenticated } from "../auth/authStore";
import {
  LOGIN_TITLE,
  PAGE_TITLES,
  pageFromHash,
  pathForPage,
  type AppPage,
} from "./routes";

export type { AppPage } from "./routes";

/**
 * §21 보호 라우트 접근 제어: 토큰이 없거나 만료되면 로그인 화면을 렌더한다.
 * 이슈 #72: 화면 상태를 해시(`#/assets`)와 동기화한다 — 라우터 의존성 없이
 * 뒤로가기·새로고침·딥링크가 동작하고, 내비의 `aria-current` 도 같은 출처를 본다.
 */
export function App() {
  const [authed, setAuthed] = useState(() => isAuthenticated());
  // 최초 렌더에서 현재 해시를 읽는다(새로고침·딥링크). 미지의 해시는 대시보드로
  // 떨어뜨리되, 주소창에는 표준 경로를 남겨 새로고침해도 같은 화면이 유지되게 한다.
  const [page, setPage] = useState<AppPage>(() => {
    const initial = pageFromHash(window.location.hash);
    if (window.location.hash !== pathForPage(initial)) {
      window.history.replaceState(null, "", pathForPage(initial));
    }
    return initial;
  });

  const navigate = useCallback((next: AppPage) => {
    setPage(next);
    if (window.location.hash !== pathForPage(next)) {
      window.history.pushState(null, "", pathForPage(next));
    }
  }, []);

  // 뒤로가기/앞으로가기(popstate)와 주소창 직접 편집(hashchange)을 같은 경로로 처리한다.
  useEffect(() => {
    const sync = () => setPage(pageFromHash(window.location.hash));
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  // 탭 제목 — 뒤로가기 히스토리에서 화면을 식별한다 (#72 AC).
  useEffect(() => {
    document.title = authed && isAuthenticated() ? PAGE_TITLES[page] : LOGIN_TITLE;
  }, [authed, page]);

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
          onBack={() => navigate("dashboard")}
          onOpenExpenses={() => navigate("expenses")}
          onOpenSettings={() => navigate("settings")}
        />
      );
    }
    if (page === "expenses") {
      return (
        <ExpensesPage
          onOpenDashboard={() => navigate("dashboard")}
          onOpenAssets={() => navigate("assets")}
          onOpenSettings={() => navigate("settings")}
        />
      );
    }
    if (page === "settings") {
      return (
        <SettingsPage
          onOpenDashboard={() => navigate("dashboard")}
          onOpenAssets={() => navigate("assets")}
          onOpenExpenses={() => navigate("expenses")}
        />
      );
    }
    return (
      <DashboardPage
        onLogout={() => setAuthed(false)}
        onOpenAssets={() => navigate("assets")}
        onOpenExpenses={() => navigate("expenses")}
        onOpenSettings={() => navigate("settings")}
      />
    );
  }
  // 로그인 성공 시 화면을 새로 고르지 않는다 — 딥링크로 들어왔다면 그 화면으로 복귀한다.
  return <LoginPage onSuccess={() => setAuthed(true)} />;
}
