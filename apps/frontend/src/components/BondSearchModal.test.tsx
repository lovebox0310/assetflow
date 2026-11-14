import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BondSearchModal } from "./BondSearchModal";
import type { BondItem } from "../api/investmentsApi";

const { searchBonds } = vi.hoisted(() => ({ searchBonds: vi.fn() }));

vi.mock("../api/investmentsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/investmentsApi")>();
  return { ...actual, searchBonds };
});

const treasury: BondItem = {
  code: "KR103502GEC4",
  name: "국고03000-3412(24-13)",
  issueDate: "2024-12-10",
  maturityDate: "2034-12-10",
  bondType: "C0",
  bondClass: "GA",
};

function renderModal() {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(<BondSearchModal open onClose={onClose} onSelect={onSelect} />);
  return { onSelect, onClose };
}

describe("BondSearchModal (BOND-SEARCH-1)", () => {
  beforeEach(() => {
    searchBonds.mockReset();
    searchBonds.mockResolvedValue({ items: [treasury], warning: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("검색 결과를 선택하면 onSelect 로 넘기고 닫는다", async () => {
    const { onSelect, onClose } = renderModal();

    fireEvent.change(screen.getByLabelText("채권 검색"), { target: { value: "국고03000" } });
    expect(await screen.findByText(treasury.name)).toBeDefined();
    expect(searchBonds).toHaveBeenCalledWith("국고03000", 20);
    expect(screen.getByText(/발행 2024-12-10 ~ 만기 2034-12-10/)).toBeDefined();

    fireEvent.click(screen.getByText(treasury.name));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(treasury));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("결과가 없으면 빈 상태 문구를 보여 준다", async () => {
    searchBonds.mockResolvedValue({ items: [], warning: null });
    renderModal();

    fireEvent.change(screen.getByLabelText("채권 검색"), { target: { value: "없는채권" } });

    expect(await screen.findByText(/검색 결과가 없습니다/)).toBeDefined();
  });

  it("검색 실패는 Alert 로 사유를 보여 준다", async () => {
    searchBonds.mockRejectedValue(new Error("master down"));
    renderModal();

    fireEvent.change(screen.getByLabelText("채권 검색"), { target: { value: "국고" } });

    expect(await screen.findByText("채권 검색 오류")).toBeDefined();
    expect(screen.getByText("master down")).toBeDefined();
  });
});
