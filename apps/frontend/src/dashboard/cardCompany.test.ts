import { describe, expect, it } from "vitest";
import { CARD_TOTAL_KEY, cardChartSeries } from "./cardCompany";
import type { CardCompanyGroup } from "../api/cardImportApi";

const group = (
  month: string,
  cardCompany: string,
  memberRelation: string,
  grossAmount: number,
): CardCompanyGroup => ({ month, cardCompany, memberRelation, count: 1, grossAmount });

describe("cardCompany — 카드사·관계 월별 시리즈", () => {
  it("월 합계는 그 달 모든 카드사·관계 조합의 합과 같다", () => {
    const series = cardChartSeries(
      [
        group("2026-01", "삼성카드", "본인", 100_000),
        group("2026-01", "삼성카드", "가족", 40_000),
        group("2026-01", "현대카드", "본인", 25_000),
        group("2026-01", "현대카드", "가족", 5_000),
      ],
      ["2026-01"],
    );
    const point = series.points[0] as Record<string, number>;
    expect(point["삼성카드|본인"]).toBe(100_000);
    expect(point["삼성카드|가족"]).toBe(40_000);
    expect(point["현대카드|본인"]).toBe(25_000);
    expect(point["현대카드|가족"]).toBe(5_000);
    expect(point[CARD_TOTAL_KEY]).toBe(100_000 + 40_000 + 25_000 + 5_000);
  });

  it("데이터 없는 달도 포인트를 만들고 합계는 0, 다른 달 값은 유지한다", () => {
    const series = cardChartSeries(
      [group("2026-01", "삼성카드", "본인", 10_000), group("2026-03", "삼성카드", "본인", 30_000)],
      ["2026-01", "2026-02", "2026-03"],
    );
    expect(series.points.map((p) => p.month)).toEqual(["2026-01", "2026-02", "2026-03"]);

    const [jan, feb, mar] = series.points as Array<Record<string, number>>;
    expect(feb?.[CARD_TOTAL_KEY]).toBe(0);
    expect(feb?.["삼성카드|본인"]).toBe(0);
    expect(feb?.["삼성카드|가족"]).toBe(0);
    expect(jan?.[CARD_TOTAL_KEY]).toBe(10_000);
    expect(mar?.[CARD_TOTAL_KEY]).toBe(30_000);
  });

  it("카드사 순서는 등장 순서, 본인/가족/전체 합계가 맞는다", () => {
    const series = cardChartSeries(
      [
        group("2026-01", "현대카드", "가족", 20_000),
        group("2026-02", "삼성카드", "본인", 70_000),
        group("2026-02", "현대카드", "본인", 10_000),
      ],
      ["2026-01", "2026-02"],
    );
    expect(series.companyOrder).toEqual(["현대카드", "삼성카드"]);
    expect(series.relationKeys).toEqual([
      "현대카드|본인",
      "현대카드|가족",
      "삼성카드|본인",
      "삼성카드|가족",
    ]);
    expect(series.selfTotal).toBe(80_000);
    expect(series.familyTotal).toBe(20_000);
    expect(series.total).toBe(100_000);
    expect(series.selfTotal + series.familyTotal).toBe(series.total);
  });

  it("cardCompany 가 비어 있으면 미확인으로 묶는다", () => {
    const series = cardChartSeries(
      [group("2026-01", "", "본인", 1_000), group("2026-01", "", "가족", 2_000)],
      ["2026-01"],
    );
    expect(series.companyOrder).toEqual(["미확인"]);
    const point = series.points[0] as Record<string, number>;
    expect(point["미확인|본인"]).toBe(1_000);
    expect(point["미확인|가족"]).toBe(2_000);
    expect(point[CARD_TOTAL_KEY]).toBe(3_000);
  });
});
