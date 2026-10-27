import { describe, expect, it } from "vitest";
import {
  buildExpenseTrend,
  colorForCategory,
  formatMonthTick,
  lastMonthsRange,
  monthsBetween,
} from "./expenseTrend";
import type { MonthlyCategoryTotal } from "../api/cardImportApi";

const row = (month: string, category: string, gross: number): MonthlyCategoryTotal => ({
  month,
  category,
  gross,
});

describe("expenseTrend — 월별 지출 추이 계산", () => {
  it("monthsBetween: 연 경계를 넘어가도 연속 월을 만든다", () => {
    expect(monthsBetween("2025-11", "2026-02")).toEqual([
      "2025-11", "2025-12", "2026-01", "2026-02",
    ]);
  });

  it("monthsBetween: from > to 면 빈 배열", () => {
    expect(monthsBetween("2026-03", "2026-01")).toEqual([]);
  });

  it("monthsBetween: 같은 달이면 그 달 하나", () => {
    expect(monthsBetween("2026-06", "2026-06")).toEqual(["2026-06"]);
  });

  it("lastMonthsRange: 오늘 기준 최근 N개월, 이번 달 포함", () => {
    const today = new Date(2026, 9, 23); // 2026-10-23
    const { from, to } = lastMonthsRange(12, today);
    expect(to).toBe("2026-10");
    expect(from).toBe("2025-11");
    expect(monthsBetween(from, to)).toHaveLength(12);
  });

  it("buildExpenseTrend: 없는 달은 0 으로 채운다", () => {
    const series = buildExpenseTrend(
      [row("2026-01", "식비", 10000), row("2026-03", "식비", 30000)],
      "2026-01",
      "2026-03",
    );
    expect(series.points.map((p) => p.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(Number(series.points[0]?.["식비"] ?? 0)).toBe(10000);
    expect(Number(series.points[1]?.["식비"] ?? 0)).toBe(0);
    expect(Number(series.points[2]?.["식비"] ?? 0)).toBe(30000);
  });

  it("buildExpenseTrend: 카테고리별 totals 합산", () => {
    const series = buildExpenseTrend(
      [row("2026-01", "식비", 10000), row("2026-01", "쇼핑/생활", 5000)],
      "2026-01",
      "2026-01",
    );
    expect(series.totals["식비"]).toBe(10000);
    expect(series.totals["쇼핑/생활"]).toBe(5000);
  });

  it("buildExpenseTrend: 대분류 순서가 우선, 미분류는 마지막", () => {
    const series = buildExpenseTrend(
      [row("2026-01", "미분류", 1000), row("2026-01", "쇼핑/생활", 5000), row("2026-01", "식비", 10000)],
      "2026-01",
      "2026-01",
    );
    const foodIdx = series.categories.indexOf("식비");
    const shopIdx = series.categories.indexOf("쇼핑/생활");
    const unclIdx = series.categories.indexOf("미분류");
    expect(foodIdx).toBeLessThan(shopIdx);
    expect(shopIdx).toBeLessThan(unclIdx);
    expect(unclIdx).toBe(series.categories.length - 1);
  });

  it("buildExpenseTrend: 행이 없으면 빈 포인트·범례", () => {
    const series = buildExpenseTrend([], "2026-01", "2026-03");
    expect(series.points).toEqual([
      { month: "2026-01" },
      { month: "2026-02" },
      { month: "2026-03" },
    ]);
    expect(series.categories).toEqual([]);
  });

  it("formatMonthTick: YYYY-MM → YY.MM", () => {
    expect(formatMonthTick("2026-03")).toBe("26.03");
    expect(formatMonthTick("2025-12")).toBe("25.12");
  });

  it("colorForCategory: 대분류마다 --af-cat-* 변수, 미분류도 매핑", () => {
    expect(colorForCategory("식비")).toBe("var(--af-cat-food)");
    expect(colorForCategory("미분류")).toBe("var(--af-cat-unclassified)");
    expect(colorForCategory("알수없는분류")).toBe("var(--af-chart-3)");
  });
});
