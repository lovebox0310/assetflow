import { useState, type FormEvent } from "react";
import { Button, Card } from "antd";
import { loginWithEmail } from "../api/authApi";
import { saveToken } from "../auth/authStore";
import { validateLoginInput, hasErrors, type FieldErrors } from "../auth/validate";
import { MoonIcon, SunIcon } from "../layout/AppLayout";
import { useTheme } from "../theme/themeStore";

interface LoginPageProps {
  /** 로그인 성공 시 대시보드로 전환한다 (§21 작업: 성공 시 대시보드 라우팅). */
  onSuccess: () => void;
}

/**
 * 이슈 #74: 화면 문구를 전부 한국어로 맞춘다. 카피는 프로토타입
 * `design/prototype/login.html` 을 그대로 따른다 — 구현과 목업이 갈라지지 않게.
 * 필드 오류는 `aria-describedby` 로 입력과 연결해 스크린리더가 라벨·도움말·오류를
 * 한 번에 읽게 한다(이슈 #3 접근성 기준).
 *
 * S-04/S-05(디자인 감사): 셸을 "인증 헤더 + 카드" 2단으로 재구성한다.
 * - 헤더는 카드 밖 상단 — 브랜드 + 테마 토글(AppLayout 과 같은 아이콘·문구·44px 히트).
 * - 카드는 세로 중앙을 `margin-block:auto` 로 잡는다. `justify-content:center` 를 쓰면
 *   모바일 소프트 키보드로 높이가 줄 때 카드 위쪽이 잘린다.
 * - 필드 id·aria-describedby·role=alert 계약은 LoginPage.test.tsx 그대로 유지한다.
 */
export function LoginPage({ onSuccess }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const { resolved, toggleTheme } = useTheme();
  const dark = resolved === "dark";

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
      {/* S-05: 인증 헤더 — 브랜드 + 테마 토글. AppLayout 헤더와 같은 규칙(높이 44, space-between). */}
      <header className="auth-header">
        <span className="auth-brand">AssetFlow</span>
        <Button
          type="text"
          onClick={toggleTheme}
          aria-label={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
          aria-pressed={dark}
          style={{
            width: 44,
            height: 44,
            minWidth: 44,
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </Button>
      </header>

      <Card className="auth-card">
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
            {/* S-08: 오류 슬롯은 항상 자리를 예약한다 — 오류가 떠도 아래 요소가 밀리지 않는다. */}
            <div style={{ minHeight: 18 }}>
              {fieldErrors.email ? (
                <p className="field-error" id="login-email-error" role="alert">
                  {fieldErrors.email}
                </p>
              ) : null}
            </div>
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
            <div style={{ minHeight: 18 }}>
              {fieldErrors.password ? (
                <p className="field-error" id="login-password-error" role="alert">
                  {fieldErrors.password}
                </p>
              ) : null}
            </div>
          </div>
          <button type="submit">로그인</button>
          {/* S-08 후속(#38-2/#38-3): 전역 오류는 제출 버튼 **아래** 카드 안에 둔다.
              - 앞 요소(입력·버튼) 뒤에 오므로 오류가 떠도 버튼/입력 y 가 변하지 않는다.
                (원래 문제는 오류가 버튼 위에 있어 버튼이 28px 밀리던 것)
              - 슬롯 높이 41px 을 항상 예약해 카드 높이도 두 상태에서 같다.
                41 = 오류 문구 2줄 × 줄 높이 20.4286px(실측 320~1280)의 올림.
              - `marginTop:-8` 은 폼 grid gap(16px) 중 8px 만 상쇄한다 —
                8px = 버튼과 오류 문구의 최소 숨 쉴 공간(가독성), 나머지 8px gap 은 상쇄.
                슬롯 총 점유 = 8 + 41 = 49px (폼 gap 이 16px 이 아니게 바뀌면 이 값도 고친다). */}
          <div style={{ minHeight: 41, marginTop: -8 }}>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </form>
      </Card>
    </main>
  );
}
