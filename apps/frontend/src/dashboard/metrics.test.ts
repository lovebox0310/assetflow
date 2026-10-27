import { describe, expect, it } from "vitest";
import { assetComposition, cashAccountCount, cashflowWindow, emergencyMonths, monthlyBalance, netWorth } from "./metrics";
import type { DashboardData } from "../data/dashboardMock";

const base: DashboardData = {
  asOf: "2026년 10월",
  assets: [
    { id: "c1", type: "cash", name: "파킹", value: 10_000_000 },
    { id: "d1", type: "deposit", name: "예적금", value: 20_000_000 },
    { id: "i1", type: "invest", name: "투자", value: 30_000_000 },
  ],
  liabilities: [{ id: "l1", name: "대출", balance: 5_000_000 }],
  monthly: { income: 8_200_000, vatSetAside: 0, expenses: 4_960_000, essentialExpenses: 2_000_000, essentialComplete: true, balance: 3_240_000 },
};

describe("metrics (§23 표시 규칙)", () => {
  it("순자산 = 총자산 - 총부채", () => {
    expect(netWorth(base)).toBe(55_000_000);
  });

  it("월 수지 = 총수입 - 부가세통장 이체 - 총지출 (필수+선택 모두) (§57.9)", () => {
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

describe("cashflowWindow — 최근 6개월 창 (#73, §35.1)", () => {
  const today = new Date(2026, 9, 23); // 2026-10-23

  it("당월부터 내림차순으로 요청한 개월 수만큼 만든다", () => {
    const window = cashflowWindow([], 6, today);
    expect(window.map((m) => m.month)).toEqual([
      "2026-10", "2026-09", "2026-08", "2026-07", "2026-06", "2026-05",
    ]);
  });

  it("스냅샷이 없는 월은 0원으로 메우지 않고 미확정(null)으로 남긴다", () => {
    const window = cashflowWindow(
      [
        { month: "2026-10", income: 8_200_000, vatSetAside: 0, expenses: 4_960_000, balance: 3_240_000 },
        { month: "2026-08", income: 8_200_000, vatSetAside: 0, expenses: 4_720_000, balance: 3_480_000 },
      ],
      6,
      today,
    );
    expect(window[0]).toEqual({
      month: "2026-10",
      income: 8_200_000,
      vatSetAside: 0,
      expenses: 4_960_000,
      balance: 3_240_000,
      confirmed: true,
    });
    expect(window[1]).toEqual({
      month: "2026-09",
      income: null,
      vatSetAside: null,
      expenses: null,
      balance: null,
      confirmed: false,
    });
    expect(window[2]).toEqual({
      month: "2026-08",
      income: 8_200_000,
      vatSetAside: 0,
      expenses: 4_720_000,
      balance: 3_480_000,
      confirmed: true,
    });
    expect(window.filter((m) => !m.confirmed)).toHaveLength(4);
  });

  it("수지는 그 달 수입 − 부가세통장 이체 − 그 달 지출이다 — 이전 달 값을 더하지 않는다 (§57.9)", () => {
    const window = cashflowWindow(
      [
        { month: "2026-10", income: 8_949_960, vatSetAside: 0, expenses: 4_413_363, balance: 4_536_597 },
        { month: "2026-09", income: 8_949_960, vatSetAside: 0, expenses: 5_565_670, balance: 3_384_290 },
        { month: "2026-08", income: 8_949_960, vatSetAside: 0, expenses: 6_441_193, balance: 2_508_767 },
      ],
      3,
      today,
    );

    // 운영 데이터와 같은 모양: 각 달 수지가 서버가 계산한 그 달 balance 그대로다.
    expect(window.map((m) => m.balance)).toEqual([4_536_597, 3_384_290, 2_508_767]);
    // 누적이면 4,536,597 / 7,920,887 / 10,429,654 가 된다 — 그 값이 나오면 실패다.
    expect(window[1]?.balance).not.toBe(7_920_887);
    expect(window[2]?.balance).not.toBe(10_429_654);
  });

  it("연 경계를 넘어가도 월 키가 정확하다", () => {
    const window = cashflowWindow([], 6, new Date(2026, 0, 15)); // 2026-01
    expect(window.map((m) => m.month)).toEqual([
      "2026-01", "2025-12", "2025-11", "2025-10", "2025-09", "2025-08",
    ]);
  });
});

describe("cashAccountCount (#73 — '현금 N계좌' 제목)", () => {
  it("현금성(cash) 행만 센다", () => {
    expect(cashAccountCount(base)).toBe(1);
    expect(
      cashAccountCount({
        ...base,
        assets: [
          { id: "c1", type: "cash", name: "파킹", value: 1 },
          { id: "c2", type: "cash", name: "요구불", value: 2 },
          { id: "d1", type: "deposit", name: "예적금", value: 3 },
        ],
      }),
    ).toBe(2);
  });
});
