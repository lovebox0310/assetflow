import { getToken, clearToken } from "../auth/authStore";
import { apiUrl } from "./base";

/**
 * §26 연동 기준의 공통 API 클라이언트.
 * - Authorization: Bearer <token> 자동 부착 (만료 토큰은 싣지 않는다, §21)
 * - 백엔드 표준 포맷(§38): 성공 ApiResponse{code,message,data}, 실패 ErrorResponse{code,message,details,timestamp}
 * - 오류를 종류별로 분류한다: auth(재로그인 유도) / network(연결 확인) / server / client
 *   — §26 연동 기준 "네트워크 오류/인증 오류 메시지 구분"의 단일 구현체.
 */

export type ApiErrorKind = "auth" | "network" | "server" | "client";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly code: string;

  constructor(kind: ApiErrorKind, message: string, code: string) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.code = code;
  }
}

const AUTH_MESSAGE = "로그인이 만료되었습니다. 다시 로그인해 주세요.";
const NETWORK_MESSAGE = "네트워크에 연결할 수 없습니다. 연결 상태를 확인해 주세요.";
const SERVER_MESSAGE = "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
const CLIENT_MESSAGE = "요청을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const token = getToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), { ...init, headers });
  } catch {
    throw new ApiError("network", NETWORK_MESSAGE, "NETWORK_ERROR");
  }

  const body = (await response.json().catch(() => null)) as
    | { code?: string; message?: string; data?: unknown }
    | null;

  if (!response.ok) {
    if (response.status === 401) {
      // Known Issues 5 (이슈 #38): 401 이면 토큰을 정리하고 앱에 로그인 전환을 알린다.
      // LoginPage 의 로그인 실패도 이 경로를 타지만, 로그인 화면에서는 영향이 없다.
      clearToken();
      window.dispatchEvent(new Event("assetflow:unauthorized"));
      throw new ApiError("auth", AUTH_MESSAGE, body?.code ?? "AUTH_REQUIRED");
    }
    throw new ApiError(
      response.status < 500 ? "client" : "server",
      response.status < 500 ? CLIENT_MESSAGE : SERVER_MESSAGE,
      body?.code ?? "UNKNOWN",
    );
  }

  if (!body || typeof body.code !== "string" || !("data" in body)) {
    throw new ApiError("server", SERVER_MESSAGE, "MALFORMED_ENVELOPE");
  }
  return body.data as T;
}

/**
 * §26 연동 기준 "재요청 시 중복 호출 방지": 같은 키의 진행 중 요청은
 * 같은 Promise 를 돌려준다. 완료(성공/실패)되면 지워 다시 호출 가능하다.
 * 정지한(hang) 요청은 브라우저 타임아웃이 정리하기 전까지는 재사용된다.
 */
const inflight = new Map<string, Promise<unknown>>();

export function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = run().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

/** 테스트·강제 초기화용: 모듈 단위 in-flight 맵을 비운다. */
export function clearInflight() {
  inflight.clear();
}
