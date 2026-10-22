import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  initThemeStore,
  resetThemeStore,
  setTheme,
  getResolvedTheme,
  getThemeMode,
  useTheme,
  THEME_STORAGE_KEY,
} from "./themeStore";

/**
 * §28.4 — 테마 스토어 테스트.
 *
 * 검증 대상:
 * 1. 저장값 없으면 mode="system", resolved 는 시스템 설정을 따른다
 * 2. setTheme("dark") → 저장 + dataset.theme 반영
 * 3. toggleTheme() → dark ↔ light
 * 4. matchMedia 가 없을 때 예외 없이 light 폴백
 * 5. system 모드에서 시스템 설정이 dark 면 resolved = dark
 * 6. 새로고침 복원 — 저장값을 다시 읽어 light/dark 를 복원한다
 */

const originalMatchMedia = window.matchMedia;

/** 테스트 환경 matchMedia 조작 — matches 를 강제로 지정한다. */
function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }),
  });
}

function removeMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: undefined,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  resetThemeStore();
  stubMatchMedia(false);
  initThemeStore();
});

afterEach(() => {
  // 이 저장소 테스트는 `globals: true` 가 꺼져 있어 RTL 자동 cleanup 이 없다 —
  // 다른 RTL 테스트와 동일하게 수동으로 해제한다.
  cleanup();
  window.localStorage.clear();
  resetThemeStore();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  });
});

describe("테마 스토어 (§28.4)", () => {
  it("1. 저장값이 없으면 mode=system 이고 resolved 는 시스템 설정을 따른다", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe("system");
    // 테스트 환경 matchMedia 는 항상 matches:false → light
    expect(result.current.resolved).toBe("light");
    expect(getThemeMode()).toBe("system");
    expect(getResolvedTheme()).toBe("light");
  });

  it("2. setTheme('dark') 는 저장하고 dataset.theme 에 반영한다", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("dark");
    });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(result.current.mode).toBe("dark");
    expect(result.current.resolved).toBe("dark");
  });

  it("3. toggleTheme() 은 dark ↔ light 로 전환한다", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolved).toBe("light");

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.resolved).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.resolved).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("4. matchMedia 가 없어도 예외 없이 light 로 떨어진다", () => {
    removeMatchMedia();
    expect(() => initThemeStore()).not.toThrow();
    expect(getResolvedTheme()).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("5. system 모드에서 시스템 설정이 dark 면 resolved 가 dark 다", () => {
    stubMatchMedia(true);
    initThemeStore();
    expect(getThemeMode()).toBe("system");
    expect(getResolvedTheme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("6. 새로고침 복원 — 저장값을 다시 읽어 light/dark 를 복원한다", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    initThemeStore();
    expect(getThemeMode()).toBe("dark");
    expect(getResolvedTheme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    initThemeStore();
    expect(getThemeMode()).toBe("light");
    expect(getResolvedTheme()).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("7. setTheme('system') 으로 돌아오면 시스템 설정을 다시 따른다", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("light");
    });
    expect(result.current.resolved).toBe("light");

    act(() => {
      result.current.setTheme("system");
    });
    expect(result.current.mode).toBe("system");
    expect(result.current.resolved).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  });

  it("8. store 밖에서 호출한 setTheme 도 구독자에게 반영된다", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      setTheme("dark");
    });
    expect(result.current.resolved).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
