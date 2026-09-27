import { DashboardPage } from "../pages/DashboardPage";
import { LoginPage } from "../pages/LoginPage";
import { isAuthenticated } from "../auth/authStore";

export function App() {
  return isAuthenticated() ? <DashboardPage /> : <LoginPage />;
}
