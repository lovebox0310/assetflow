import { describe, expect, it } from "vitest";
import { LOGIN_TITLE, PAGE_PATHS, PAGE_TITLES, pageFromHash, pathForPage } from "./routes";

describe("routes — URL 상태 동기화 (이슈 #72)", () => {
  it("해시를 화면으로 읽는다", () => {
    expect(pageFromHash("")).toBe("dashboard");
    expect(pageFromHash("#")).toBe("dashboard");
    expect(pageFromHash("#/")).toBe("dashboard");
    expect(pageFromHash("#/assets")).toBe("assets");
    expect(pageFromHash("#/investments")).toBe("investments");
    expect(pageFromHash("#/expenses")).toBe("expenses");
    expect(pageFromHash("#/settings")).toBe("settings");
  });

  it("끝 슬래시·대문자는 같은 화면으로 정규화한다", () => {
    expect(pageFromHash("#/assets/")).toBe("assets");
    expect(pageFromHash("#/ASSETS")).toBe("assets");
    expect(pageFromHash("#/settings//")).toBe("settings");
  });

  it("알 수 없는 경로는 대시보드로 떨어뜨린다", () => {
    expect(pageFromHash("#/unknown")).toBe("dashboard");
    expect(pageFromHash("#/assets/1")).toBe("dashboard");
  });

  it("화면마다 고유한 경로와 제목을 가진다", () => {
    const pages = ["dashboard", "assets", "investments", "expenses", "settings"] as const;
    expect(new Set(pages.map((p) => PAGE_PATHS[p])).size).toBe(5);
    expect(new Set(pages.map((p) => PAGE_TITLES[p])).size).toBe(5);
    for (const page of pages) {
      expect(pathForPage(page)).toBe(PAGE_PATHS[page]);
      expect(pageFromHash(pathForPage(page))).toBe(page);
    }
    expect(LOGIN_TITLE).not.toBe(PAGE_TITLES.dashboard);
  });
});
