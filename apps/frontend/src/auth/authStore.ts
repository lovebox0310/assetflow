const TOKEN_KEY = "assetflow.token";
const EXPIRES_KEY = "assetflow.token.expiresAt";

export function saveToken(token: string, expiresAt?: number) {
  localStorage.setItem(TOKEN_KEY, token);
  if (expiresAt !== undefined) {
    localStorage.setItem(EXPIRES_KEY, String(expiresAt));
  } else {
    localStorage.removeItem(EXPIRES_KEY);
  }
}

/** API 클라이언트가 Authorization 헤더에 쓴다. 없으면 null. */
export function getToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;

  const raw = localStorage.getItem(EXPIRES_KEY);
  if (raw) {
    const expiresAt = Number(raw);
    // 만료 토큰은 없는 토큰과 같다 (§21) — 헤더에 싣지 않는다.
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return null;
  }
  return token;
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}

/**
 * §21 보안 기준의 인증 토큰 만료 처리: 만료된 토큰은 없는 토큰과 같다.
 * 만료를 감지하면 정리해서 이후 화면이 로그인 상태로 넘어가지 않게 한다
 * (만료 시 재로그인 유도).
 */
export function isAuthenticated() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return false;

  const raw = localStorage.getItem(EXPIRES_KEY);
  if (raw) {
    const expiresAt = Number(raw);
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      clearToken();
      return false;
    }
  }
  return true;
}
