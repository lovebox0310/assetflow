import { useSyncExternalStore } from "react";
import { applyAfCssVars, type ResolvedTheme } from "./tokens";

/**
 * §28.4 — 테마 스토어.
 *
 * - 모드: "light" | "dark" | "system" (기본값 "system")
 * - 저장 키: `assetflow.theme`
 * - "system" 해석: `prefers-color-scheme: dark` 가 참일 때만 dark, 그 외 light.
 *   matchMedia 가 없거나 throws 하면 light 로 안전하게 떨어진다(예외 전파 금지).
 * - 적용: `document.documentElement.dataset.theme = resolved` + `--af-*` CSS 변수 주입.
 *
 * 스토어는 단일 진실 원천이다. DOM 을 만지는 곳도 여기 하나뿐이라
 * "한 곳에서만 바꾸면 전부가 따라간다"(§28.4)가 유지된다.
 */

export type ThemeMode = "light" | "dark" | "system";
export type { ResolvedTheme };

export const THEME_STORAGE_KEY = "assetflow.theme";

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
}

export interface ThemeSnapshot {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const listeners = new Set<() => void>();

/** matchMedia 접근 — 없거나 throws 하면 null. 예외를 밖으로 내보내지 않는다. */
function getMediaQueryList(): MediaQueryList | null {
  try {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
    return window.matchMedia("(prefers-color-scheme: dark)");
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  return getMediaQueryList()?.matches === true;
}

function readStoredMode(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // localStorage 접근 불가 환경(시크릿 모드 등) — 기본값으로 진행
  }
  return "system";
}

function resolveFor(mode: ThemeMode): ResolvedTheme {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return systemPrefersDark() ? "dark" : "light";
}

/** DOM 적용 — dataset.theme + `--af-*` 변수. */
function applyToDocument(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolved;
  applyAfCssVars(resolved);
}

const initialMode = readStoredMode();

let state: ThemeState = { mode: initialMode, resolved: resolveFor(initialMode) };
let snapshot: ThemeSnapshot = {
  mode: state.mode,
  resolved: state.resolved,
  setTheme,
  toggleTheme,
};

function updateState(next: ThemeState): void {
  state = next;
  snapshot = { mode: next.mode, resolved: next.resolved, setTheme, toggleTheme };
  applyToDocument(next.resolved);
  for (const listener of listeners) listener();
}

function getSnapshot(): ThemeSnapshot {
  return snapshot;
}

function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 모드를 저장하고 즉시 적용한다. */
export function setTheme(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // 저장 실패해도 메모리 상태로는 반영한다 (UI 는 계속 동작해야 한다)
  }
  updateState({ mode, resolved: resolveFor(mode) });
}

/**
 * 라이트↔다크 2상태 토글 (D1).
 * 현재 적용된 값의 반대로 **명시적** 모드로 전환한다 — 시스템 설정을 추적하는
 * "system" 모드에서 명시 모드로 넘어가는 것은 D1 의 2상태 요건에 따른 의도적 선택이다.
 */
export function toggleTheme(): void {
  setTheme(state.resolved === "dark" ? "light" : "dark");
}

/* ── 시스템 설정 리스너 ───────────────────────────────── */
let attachedMql: MediaQueryList | null = null;

function onSystemPreferenceChange(): void {
  if (state.mode !== "system") return;
  updateState({ mode: "system", resolved: systemPrefersDark() ? "dark" : "light" });
}

function attachSystemListener(): void {
  const mql = getMediaQueryList();
  if (attachedMql === mql) return;
  if (attachedMql) {
    try {
      attachedMql.removeEventListener?.("change", onSystemPreferenceChange);
    } catch {
      // 이전 리스너 해제 실패는 무시 — 새 리스너로 대체된다
    }
  }
  attachedMql = mql;
  if (!mql) return;
  try {
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onSystemPreferenceChange);
    } else {
      mql.addListener?.(onSystemPreferenceChange);
    }
  } catch {
    // 리스너 부착 실패 시에도 저장값 해석은 정상 동작한다
  }
}

/**
 * 스토어 초기화 — 저장값과 시스템 설정을 다시 읽어 DOM 에 반영한다.
 * 앱 시작(main.tsx)과 테스트의 "새로고침 복원" 시뮬레이션에서 쓴다.
 */
export function initThemeStore(): void {
  const mode = readStoredMode();
  attachSystemListener();
  updateState({ mode, resolved: resolveFor(mode) });
}

/** 테스트 초기화 — 메모리 상태만 되돌린다(저장소·DOM 은 건드리지 않는다). */
export function resetThemeStore(): void {
  state = { mode: "system", resolved: "light" };
  snapshot = { mode: state.mode, resolved: state.resolved, setTheme, toggleTheme };
  for (const listener of listeners) listener();
}

export function getThemeMode(): ThemeMode {
  return state.mode;
}

export function getResolvedTheme(): ResolvedTheme {
  return state.resolved;
}

/** 테마 구독 훅 — useSyncExternalStore 기반. */
export function useTheme(): ThemeSnapshot {
  return useSyncExternalStore(subscribeTheme, getSnapshot, getSnapshot);
}
