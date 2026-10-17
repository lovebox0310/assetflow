import { clearToken } from "../auth/authStore";

interface DashboardPageProps {
  /** 로그아웃 후 로그인 화면으로 전환한다 (§21 작업: 로그아웃 처리). */
  onLogout: () => void;
}

export function DashboardPage({ onLogout }: DashboardPageProps) {
  const handleLogout = () => {
    clearToken();
    onLogout();
  };

  return (
    <main className="auth-page">
      <h1>Dashboard</h1>
      <p>Sprint 1 placeholder</p>
      <button type="button" onClick={handleLogout}>
        Logout
      </button>
    </main>
  );
}
