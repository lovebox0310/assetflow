import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CashAccountCards } from "./CashAccountCards";
import { dashboardMock } from "../data/dashboardMock";

afterEach(cleanup);

const emergencyRows = dashboardMock.assets.filter((a) => ["c1", "c2"].includes(a.id));

describe("CashAccountCards — 비상금 계좌 카드형 목록", () => {
  it("계좌마다 카드를 만들고 이름·예수금·비상금 대비 비중을 보여 준다", () => {
    render(<CashAccountCards rows={emergencyRows} emergencyAccountIds={["c1", "c2"]} />);

    // 18,500,000 + 6,200,000 = 24,700,000
    expect(screen.getByText("우리 파킹통장")).toBeDefined();
    expect(screen.getByText("18,500,000원")).toBeDefined();
    expect(screen.getByText("비상금의 74.9%")).toBeDefined();
    expect(screen.getByText("씨티 요구불")).toBeDefined();
    expect(screen.getByText("비상금의 25.1%")).toBeDefined();
    expect(document.querySelectorAll(".af-cash-item")).toHaveLength(2);
    // 합계와 비상금 계좌 수를 한 줄로 요약한다.
    expect(screen.getByText(/비상금 합계 24,700,000원/)).toBeDefined();
    expect(screen.getByText(/비상금 계좌 2개/)).toBeDefined();
  });

  it("모든 행에 비상금 태그와 강조 표시를 준다", () => {
    render(<CashAccountCards rows={emergencyRows} emergencyAccountIds={["c1", "c2"]} />);

    const tagged = document.querySelectorAll(".af-cash-item--emergency");
    expect(tagged).toHaveLength(2);
    expect(document.querySelectorAll(".af-cash-item__tag")).toHaveLength(2);
  });

  it("비상금 계좌가 없으면 지정 안내 문구를 보여 준다", () => {
    render(<CashAccountCards rows={[]} />);
    expect(screen.getByText(/비상금 계좌를 지정하면 여기에 표시됩니다/)).toBeDefined();
    expect(document.querySelectorAll(".af-cash-item")).toHaveLength(0);
  });

  it("합계가 0이어도 비중을 0.0%로 두고 NaN 을 만들지 않는다 (§34.6)", () => {
    render(
      <CashAccountCards
        rows={[{ id: "z1", type: "cash", name: "빈 통장", value: 0 }]}
        emergencyAccountIds={["z1"]}
      />,
    );
    expect(screen.getByText("비상금의 0.0%")).toBeDefined();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it("§62: invest 는 value(평가액)가 아니라 balance(예수금)를 보여 준다", () => {
    render(
      <CashAccountCards
        rows={[
          { id: "i1", type: "invest", name: "CMA", value: 30_000_000, balance: 2_421_729 },
        ]}
        emergencyAccountIds={["i1"]}
      />,
    );
    expect(screen.getByText("CMA")).toBeDefined();
    expect(screen.getByText("2,421,729원")).toBeDefined();
    expect(screen.queryByText("30,000,000원")).toBeNull();
  });
});
