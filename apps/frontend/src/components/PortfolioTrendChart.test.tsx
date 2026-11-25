import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PortfolioTrendChart } from "./PortfolioTrendChart";

afterEach(cleanup);

const point = (takenOn: string, cost: number, value: number) => ({
  takenOn,
  totalCost: cost,
  totalValue: value,
  cash: 0,
  source: "schedule",
});

describe("PortfolioTrendChart (#52)", () => {
  it("점이 없으면 쌓이면 표시된다고 안내한다", () => {
    render(<PortfolioTrendChart snapshots={[]} />);
    expect(screen.getByText(/동기화가 쌓이면/)).toBeDefined();
    // 빈 상태에서는 차트를 그리지 않는다.
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("점이 1개면 추이가 아니라고 알려 준다", () => {
    render(<PortfolioTrendChart snapshots={[point("2026-11-25", 1_000_000, 1_100_000)]} />);
    expect(screen.getByText(/데이터가 1개입니다/)).toBeDefined();
    // 차트는 그린다 — 값 자체는 의미가 있다.
    expect(screen.getByRole("img")).toBeDefined();
  });

  it("요약 이름에 원금·평가금·기간 변화가 정확 표기로 들어간다", () => {
    render(
      <PortfolioTrendChart
        snapshots={[point("2026-11-24", 1_000_000, 1_050_000), point("2026-11-25", 1_000_000, 1_100_000)]}
      />,
    );
    const chart = screen.getByRole("img");
    const label = chart.getAttribute("aria-label") ?? "";
    expect(label).toContain("총 원금 1,000,000원");
    expect(label).toContain("총 평가금 1,100,000원");
    expect(label).toContain("기간 변화 50,000원");
  });

  it("범례에 두 계열이 있다", () => {
    render(<PortfolioTrendChart snapshots={[point("2026-11-24", 1, 2), point("2026-11-25", 1, 3)]} />);
    const legend = screen.getByRole("list", { name: "투자 추이 범례" });
    expect(legend.textContent).toContain("총 원금");
    expect(legend.textContent).toContain("총 평가금");
  });
});
