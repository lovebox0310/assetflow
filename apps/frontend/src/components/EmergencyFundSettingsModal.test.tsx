import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EmergencyFundSettingsModal } from "./EmergencyFundSettingsModal";
import { clearInflight } from "../api/client";
import { clearToken, saveToken } from "../auth/authStore";
import type { AssetRow } from "../data/dashboardMock";

function monthKey(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function apiResponse(data: unknown, ok = true, status = 200): Response {
  const body = ok
    ? { code: "OK", message: "loaded", data }
    : { code: "INVALID_REQUEST", message: "Invalid request", details: "", timestamp: "" };
  return { ok, status, json: async () => body } as Response;
}

const assets: AssetRow[] = [
  { id: "c1", type: "cash", name: "파킹통장", value: 10_000_000 },
  { id: "c2", type: "cash", name: "비상금통장", value: 5_000_000 },
  { id: "d1", type: "deposit", name: "예적금", value: 20_000_000 },
];

describe("EmergencyFundSettingsModal (§59)", () => {
  beforeEach(() => {
    clearToken();
    saveToken("tok", Date.now() + 60_000);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    clearInflight();
  });

  it("저장된 기준으로 예측 비상금과 실제 개월 수를 미리 보여 준다", () => {
    render(
      <EmergencyFundSettingsModal
        open
        settings={{
          id: 1,
          email: "user@example.com",
          displayName: "사용자",
          targetMonths: 6,
          emergencyAccountIds: ["c1"],
          emergencyAvgMonths: 3,
          emergencyCategories: ["식비"],
        }}
        assets={assets}
        cardTotals={[
          { month: monthKey(1), category: "식비", gross: 900_000 },
          { month: monthKey(2), category: "식비", gross: 600_000 },
        ]}
        essentialExpenses={2_000_000}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    expect(screen.getByText("16,500,000원")).toBeDefined();
    expect(screen.getByText("목표 6개월 기준")).toBeDefined();
    expect(screen.getByText("3.63개월")).toBeDefined();
    expect(screen.getByText("카드 데이터 2/3개월 집계")).toBeDefined();
  });

  it("이전 카드 데이터가 없으면 이번 달(진행 중) 기준임을 알린다", () => {
    render(
      <EmergencyFundSettingsModal
        open
        settings={{
          id: 1,
          email: "user@example.com",
          displayName: "사용자",
          targetMonths: 6,
          emergencyAccountIds: ["c1"],
          emergencyAvgMonths: 3,
          emergencyCategories: ["식비"],
        }}
        assets={assets}
        cardTotals={[{ month: monthKey(0), category: "식비", gross: 300_000 }]}
        essentialExpenses={1_000_000}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    expect(screen.getByText(/이번 달\(진행 중\) 기준으로 계산했습니다/)).toBeDefined();
    // (1,000,000 + 300,000) × 6
    expect(screen.getByText("7,800,000원")).toBeDefined();
  });

  it("선택한 현금성 통장 여러 개의 잔액을 합산해 보여 준다 (§59.6)", () => {
    render(
      <EmergencyFundSettingsModal
        open
        settings={{
          id: 1,
          email: "user@example.com",
          displayName: "사용자",
          targetMonths: 6,
          emergencyAccountIds: ["c1", "c2"],
          emergencyAvgMonths: 3,
          emergencyCategories: ["식비"],
        }}
        assets={assets}
        cardTotals={[]}
        essentialExpenses={1_000_000}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    expect(screen.getByText("선택한 비상금 통장 2개 합계 15,000,000원")).toBeDefined();
    expect(screen.getByText("15.00개월")).toBeDefined();
  });

  it("비상금 통장이 없으면 개월 수 대신 지정 안내를 보여 준다", () => {
    render(
      <EmergencyFundSettingsModal
        open
        settings={{
          id: 1,
          email: "user@example.com",
          displayName: "사용자",
          targetMonths: 6,
          emergencyAccountIds: [],
          emergencyAvgMonths: 3,
          emergencyCategories: ["식비"],
        }}
        assets={assets}
        cardTotals={[]}
        essentialExpenses={1_000_000}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    expect(screen.getByText(/비상금 통장을 지정하면 실제 버틸 수 있는 개월을 계산합니다/)).toBeDefined();
  });

  it("목표 개월을 바꾸면 예측 비상금이 즉시 다시 계산된다", () => {
    render(
      <EmergencyFundSettingsModal
        open
        settings={{
          id: 1,
          email: "user@example.com",
          displayName: "사용자",
          targetMonths: 6,
          emergencyAccountIds: ["c1"],
          emergencyAvgMonths: 3,
          emergencyCategories: ["식비"],
        }}
        assets={assets}
        cardTotals={[]}
        essentialExpenses={2_000_000}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    expect(screen.getByText("12,000,000원")).toBeDefined();
    fireEvent.change(screen.getByLabelText("비상금 목표 개월"), { target: { value: "12" } });
    expect(screen.getByText("24,000,000원")).toBeDefined();
  });

  it("저장은 바뀐 기준 전체를 PUT /api/v1/settings 로 보낸다", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        apiResponse({
          id: 1,
          email: "user@example.com",
          displayName: "사용자",
          targetMonths: 12,
          emergencyAccountIds: ["c1"],
          emergencyAvgMonths: 3,
          emergencyCategories: ["식비"],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();

    render(
      <EmergencyFundSettingsModal
        open
        settings={{
          id: 1,
          email: "user@example.com",
          displayName: "사용자",
          targetMonths: 6,
          emergencyAccountIds: ["c1"],
          emergencyAvgMonths: 3,
          emergencyCategories: ["식비"],
        }}
        assets={assets}
        cardTotals={[]}
        essentialExpenses={2_000_000}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText("비상금 목표 개월"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/settings",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            targetMonths: 12,
            emergencyAccountIds: ["c1"],
            emergencyAvgMonths: 3,
            emergencyCategories: ["식비"],
          }),
        }),
      ),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
