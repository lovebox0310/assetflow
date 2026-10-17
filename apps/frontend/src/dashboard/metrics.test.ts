import { describe, expect, it } from "vitest";
import { assetComposition, emergencyMonths, monthlyBalance, netWorth } from "./metrics";
import type { DashboardData } from "../data/dashboardMock";

const base: DashboardData = {
  asOf: "2026년 10월",
  assets: [
    { id: "c1", type: "cash", name: "파킹", value: 10_000_000 },
    { id: "d1", type: "deposit", name: "예적금", value: 20_000_000 },
    { id: "i1", type: "invest", name: "투자", value: 30_000_000 },
  ],
  liabilities: [{ id: "l1", name: "대출", balance: 5_000_000 }],
  monthly: { income: 8_200_000, expenses: 4_960_000, essentialExpenses: 2_000_000, essentialComplete: true },
};

describe("metrics (§23 표시 규칙)", () => {
  it("순자산 = 총자산 - 총부채", () => {
    expect(netWorth(base)).toBe(55_000_000);
  });

  it("월 수지 = 총수입 - 총지출 (필수+선택 모두)", () => {
    expect(monthlyBalance(base)).toBe(3_240_000);
  });

  it("비상금 개월은 투자금만 분자 (§28.7: 현금·예적금 섞이면 오답)", () => {
    expect(emergencyMonths(base)).toBe(15);
    // 자동이체성 현금(1천만)이 분자에 들어가면 20개월이 된다 — 그것이 금지선이다.
    const withCash = emergencyMonths({
      ...base,
      assets: base.assets.map((a) => (a.type === "cash" ? { ...a, type: "invest" as const } : a)),
    });
    expect(withCash).toBe(20);
  });

  it("필수지출 0 이하이면 계산 불가(null) — 0원으로 부풀리지 않는다", () => {
    expect(emergencyMonths({ ...base, monthly: { ...base.monthly, essentialExpenses: 0 } })).toBeNull();
  });

  it("구성비는 합계 100.0 반올림 잔차 보정", () => {
    // 1/3 씩 3유형: 각각 33.333 → 반올림 33.3*3=99.9 → 보정 후 합 100.0
    const slices = assetComposition({
      ...base,
      assets: [
        { id: "a", type: "cash", name: "a", value: 10_000_000 },
        { id: "b", type: "deposit", name: "b", value: 10_000_000 },
        { id: "c", type: "invest", name: "c", value: 10_000_000 },
      ],
    });
    expect(slices.map((s) => s.percent)).toEqual([33.4, 33.3, 33.3]);
    const sum = slices.reduce((acc, s) => acc + s.percent, 0);
    expect(Math.round(sum * 10)).toBe(1000);
  });

  it("실제 dashboardMock 기준선 (§23 AC: 기대값 일치)", async () => {
    const { dashboardMock } = await import("../data/dashboardMock");
    expect(netWorth(dashboardMock)).toBe(691_844_440);
    expect(monthlyBalance(dashboardMock)).toBe(3_240_000);
    // 투자금 54,500,000 / 필수 2,317,180 = 23.519... → 화면 표기 23.5개월
    expect(emergencyMonths(dashboardMock)).toBeCloseTo(23.52, 2);
    const comp = assetComposition(dashboardMock);
    expect(comp.map((c) => c.percent)).toEqual([3.2, 5.5, 7.2, 84.1]);
    expect(Math.round(comp.reduce((a, c) => a + c.percent, 0) * 10)).toBe(1000);
  });
});
