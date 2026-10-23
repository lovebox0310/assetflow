import { useState, type FormEvent } from "react";
import { loginWithEmail } from "../api/authApi";
import { saveToken } from "../auth/authStore";
import { validateLoginInput, hasErrors, type FieldErrors } from "../auth/validate";

interface LoginPageProps {
  /** 로그인 성공 시 대시보드로 전환한다 (§21 작업: 성공 시 대시보드 라우팅). */
  onSuccess: () => void;
}

/**
 * 이슈 #74: 화면 문구를 전부 한국어로 맞춘다. 카피는 프로토타입
 * `design/prototype/login.html` 을 그대로 따른다 — 구현과 목업이 갈라지지 않게.
 * 필드 오류는 `aria-describedby` 로 입력과 연결해 스크린리더가 라벨·도움말·오류를
 * 한 번에 읽게 한다(이슈 #3 접근성 기준).
 */
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
      setError("이메일 또는 비밀번호를 확인해 주세요. 입력하신 정보가 맞지 않습니다.");
    }
  };

  return (
    <main className="auth-page">
      <h1>로그인</h1>
      <p className="auth-desc">이메일과 비밀번호로 접속합니다.</p>
      <form onSubmit={onSubmit} noValidate>
        <div className="auth-field">
          <label htmlFor="login-email">이메일</label>
          <input
            id="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={
              fieldErrors.email ? "login-email-help login-email-error" : "login-email-help"
            }
          />
          <p className="field-help" id="login-email-help">
            비밀번호 재설정에 사용할 주소입니다.
          </p>
          {fieldErrors.email ? (
            <p className="field-error" id="login-email-error" role="alert">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>
        <div className="auth-field">
          <label htmlFor="login-password">비밀번호</label>
          <input
            id="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            minLength={8}
            required
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={
              fieldErrors.password
                ? "login-password-help login-password-error"
                : "login-password-help"
            }
          />
          <p className="field-help" id="login-password-help">
            8자 이상 입력합니다.
          </p>
          {fieldErrors.password ? (
            <p className="field-error" id="login-password-error" role="alert">
              {fieldErrors.password}
            </p>
          ) : null}
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit">로그인</button>
      </form>
    </main>
  );
}
