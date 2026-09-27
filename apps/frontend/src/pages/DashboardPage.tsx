import { clearToken } from "../auth/authStore";

export function DashboardPage() {
  return (
    <main>
      <h1>Dashboard</h1>
      <p>Sprint 1 placeholder</p>
      <button
        type="button"
        onClick={() => {
          clearToken();
          window.location.reload();
        }}
      >
        Logout
      </button>
    </main>
  );
}
