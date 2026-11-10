import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CompositionBasisModal } from "./CompositionBasisModal";
import type { DashboardData } from "../data/dashboardMock";
import type { UserSettings } from "../api/settingsApi";

const { updateSettings } = vi.hoisted(() => ({ updateSettings: vi.fn() }));

vi.mock("../api/settingsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/settingsApi")>();
  return { ...actual, updateSettings };
});

const data: DashboardData = {
  asOf: "2026-11-10",
  assets: [
    { id: "c1", type: "cash", name: "파킹통장", value: 10_000_000 },
    { id: "d1", type: "deposit", name: "정기예금", value: 10_000_000 },
    { id: "i1", type: "invest", name: "주식계좌", value: 30_000_000, balance: 10_000_000 },
  ],
  liabilities: [],
  monthly: {
    income: 8_200_000,
    vatSetAside: 0,
    expenses: 4_960_000,
    essentialExpenses: 2_000_000,
    essentialComplete: true,
    balance: 3_240_000,
  },
};

const settings: UserSettings = {
  id: 1,
  email: "user@example.com",
  displayName: "사용자",
  targetMonths: 6,
  emergencyAccountIds: ["c1"],
  emergencyAvgMonths: 3,
  emergencyCategories: [],
  compositionCashAccountIds: [],
};

function renderModal(overrides: Partial<Parameters<typeof CompositionBasisModal>[0]> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <CompositionBasisModal
      open
      settings={settings}
      data={data}
      onClose={onClose}
      onSaved={onSaved}
      {...overrides}
    />,
  );
  return { onClose, onSaved };
}

describe("CompositionBasisModal (§89)", () => {
  beforeEach(() => {
    updateSettings.mockReset();
    updateSettings.mockResolvedValue({ ...settings, compositionCashAccountIds: ["d1"] });
  });

  afterEach(() => {
    cleanup();
  });

  it("저장 시 compositionCashAccountIds 한 필드만 보낸다(cash id 제외)", async () => {
    const { onSaved, onClose } = renderModal();

    fireEvent.click(screen.getByRole("checkbox", { name: /정기예금/ }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
    expect(updateSettings).toHaveBeenCalledWith({ compositionCashAccountIds: ["d1"] });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("설정을 불러오지 못했으면 저장을 막는다", () => {
    renderModal({ settings: null });

    const save = screen.getByRole("button", { name: "저장" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText("설정을 아직 불러오지 못했습니다")).toBeDefined();
  });

  it("cash 유형은 항상 체크·비활성으로 보여 준다", () => {
    renderModal();

    const cash = screen.getByRole("checkbox", { name: /파킹통장/ }) as HTMLInputElement;
    expect(cash.checked).toBe(true);
    expect(cash.disabled).toBe(true);
    expect(screen.getByText("항상 현금성")).toBeDefined();
  });

  it("체크를 바꾸면 미리보기의 현금성 금액이 갱신된다", () => {
    render(
      <CompositionBasisModal
        open
        settings={settings}
        data={data}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    const preview = () => document.querySelector(".af-composition")?.textContent ?? "";
    // 초기: 현금성 20,000,000 (40.0%), 예적금 10,000,000 (20.0%), 투자 20,000,000 (40.0%)
    expect(preview()).toContain("40.0%");
    expect(preview()).toContain("20.0%");

    fireEvent.click(screen.getByRole("checkbox", { name: /정기예금/ }));

    // 예적금이 현금성으로 이동: 현금성 30,000,000 (60.0%), 투자 40.0%
    expect(preview()).toContain("60.0%");
    expect(preview()).not.toContain("20.0%");
  });
});
