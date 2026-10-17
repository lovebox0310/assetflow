import { useState, type FormEvent } from "react";
import { loginWithEmail } from "../api/authApi";
import { saveToken } from "../auth/authStore";
import { validateLoginInput, hasErrors, type FieldErrors } from "../auth/validate";

interface LoginPageProps {
  /** 로그인 성공 시 대시보드로 전환한다 (§21 작업: 성공 시 대시보드 라우팅). */
  onSuccess: () => void;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    const errors = validateLoginInput({ email, password });
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    try {
      const result = await loginWithEmail({ email, password });
      saveToken(result.token, result.expiresAt);
      onSuccess();
    } catch {
      // §21: 실패 메시지는 공통 문구. 계정 유무를 암시하지 않는다.
      setError("Invalid credentials");
    }
  };

  return (
    <main className="auth-page">
      <h1>AssetFlow Login</h1>
      <form onSubmit={onSubmit} noValidate>
        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
          />
        </label>
        {fieldErrors.email ? (
          <p className="field-error" role="alert">{fieldErrors.email}</p>
        ) : null}
        <label>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
          />
        </label>
        {fieldErrors.password ? (
          <p className="field-error" role="alert">{fieldErrors.password}</p>
        ) : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
