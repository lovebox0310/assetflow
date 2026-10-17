import { useState } from "react";
import { DashboardPage } from "../pages/DashboardPage";
import { LoginPage } from "../pages/LoginPage";
import { isAuthenticated } from "../auth/authStore";

/**
 * §21 보호 라우트 접근 제어: 토큰이 없거나 만료되면 로그인 화면을 렌더한다.
 * 스프린트 1 화면은 두 개뿐이라 라우터 없이 조건부 렌더로 막는다 —
 * 대시보드는 isAuthenticated() 가 false 인 한 절대 마운트되지 않는다.
 * (화면이 늘어나면 Issue 7 FE-BE 연동 때 라우터 도입을 검토한다.)
 */
export function App() {
  const [authed, setAuthed] = useState(() => isAuthenticated());

  if (authed && isAuthenticated()) {
    return <DashboardPage onLogout={() => setAuthed(false)} />;
  }
  return <LoginPage onSuccess={() => setAuthed(true)} />;
}
