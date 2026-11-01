import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CashAccountCards } from "./CashAccountCards";
import { dashboardMock } from "../data/dashboardMock";

afterEach(cleanup);

const cashRows = dashboardMock.assets.filter((a) => a.type === "cash");

describe("CashAccountCards — 현금 계좌 카드형 목록", () => {
  it("계좌마다 카드를 만들고 이름·금액·현금 대비 비중을 보여 준다", () => {
    render(<CashAccountCards rows={cashRows} />);

    // 18,500,000 + 6,200,000 = 24,700,000
    expect(screen.getByText("우리 파킹통장")).toBeDefined();
    expect(screen.getByText("18,500,000원")).toBeDefined();
    // 18,500,000 / 24,700,000 = 74.89… → 74.9%
    expect(screen.getByText("현금의 74.9%")).toBeDefined();
    expect(screen.getByText("씨티 요구불")).toBeDefined();
    expect(screen.getByText("6,200,000원")).toBeDefined();
    expect(screen.getByText("현금의 25.1%")).toBeDefined();
    expect(document.querySelectorAll(".af-cash-item")).toHaveLength(2);
    // 합계와 비상금 지정 계좌 수를 한 줄로 요약한다.
    expect(screen.getByText(/현금 합계 24,700,000원/)).toBeDefined();
  });

  it("비상금으로 지정된 계좌에만 태그와 강조 표시를 준다", () => {
    render(<CashAccountCards rows={cashRows} emergencyAccountIds={["c2"]} />);

    const tagged = document.querySelectorAll(".af-cash-item--emergency");
    expect(tagged).toHaveLength(1);
    const card = tagged[0] as HTMLElement;
    expect(card.textContent).toContain("씨티 요구불");
    expect(card.textContent).toContain("비상금");
    // 지정되지 않은 계좌에는 태그가 없다.
    expect(document.querySelectorAll(".af-cash-item__tag")).toHaveLength(1);
    expect(screen.getByText(/비상금으로 지정된 계좌 1개/)).toBeDefined();
  });

  it("현금 계좌가 없으면 빈 상태 문구를 보여 준다", () => {
    render(<CashAccountCards rows={[]} />);
    expect(screen.getByText("현금성 계좌가 없습니다")).toBeDefined();
    expect(document.querySelectorAll(".af-cash-item")).toHaveLength(0);
  });

  it("합계가 0이어도 비중을 0.0%로 두고 NaN 을 만들지 않는다 (§34.6)", () => {
    render(<CashAccountCards rows={[{ id: "z1", type: "cash", name: "빈 통장", value: 0 }]} />);
    expect(screen.getByText("현금의 0.0%")).toBeDefined();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
});
