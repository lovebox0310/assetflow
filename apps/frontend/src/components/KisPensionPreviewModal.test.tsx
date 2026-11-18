import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, waitFor, render, screen } from "@testing-library/react";
import { KisPensionPreviewModal } from "./KisPensionPreviewModal";
import { ApiError } from "../api/client";

/** 연금 진단 모달 — 성공/오류/warning/빈 응답 네 경로만 확인한다. */

const { previewKisPensionMock } = vi.hoisted(() => ({
  previewKisPensionMock: vi.fn(),
}));

vi.mock("../api/investmentsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/investmentsApi")>();
  return { ...actual, previewKisPension: previewKisPensionMock };
});

const balanceFixture = {
  output1: [{ pdno: "114260", prdt_name: "국고채 10년" }],
  output2: [{ dnca_tot_amt: "1,000,000" }],
};

function renderModal(open = true) {
  return render(
    <KisPensionPreviewModal
      accountId={7}
      accountName="개인연금"
      open={open}
      onClose={() => {}}
    />,
  );
}

describe("KisPensionPreviewModal", () => {
  beforeEach(() => {
    previewKisPensionMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("성공하면 상품코드·모의투자 여부 요약과 원본 JSON 을 보여 준다", async () => {
    previewKisPensionMock.mockResolvedValue({
      balance: balanceFixture,
      warning: null,
      error: null,
      acntPrdtCd: "22",
      isMock: true,
    });

    renderModal();

    expect(await screen.findByText("연금 진단 · 개인연금")).toBeDefined();
    const summary = await screen.findByLabelText("연금 계좌 요약");
    expect(summary.textContent).toContain("상품코드");
    expect(summary.textContent).toContain("22");
    expect(summary.textContent).toContain("모의투자");
    expect(summary.textContent).not.toContain("실전");

    const json = screen.getByLabelText("연금 진단 원본 JSON");
    expect(json.textContent).toContain('"acntPrdtCd": "22"');
    expect(json.textContent).toContain('"dnca_tot_amt": "1,000,000"');
    expect(previewKisPensionMock).toHaveBeenCalledWith(7);

    // 복사 버튼은 데이터가 온 뒤 활성화된다.
    const copyButton = screen.getByRole("button", { name: "복사" });
    expect(copyButton.hasAttribute("disabled")).toBe(false);
  });

  it("실전 계좌면 요약에 '실전' 을 보여 준다", async () => {
    previewKisPensionMock.mockResolvedValue({
      balance: balanceFixture,
      warning: null,
      error: null,
      acntPrdtCd: "29",
      isMock: false,
    });

    renderModal();

    const summary = await screen.findByLabelText("연금 계좌 요약");
    expect(summary.textContent).toContain("29");
    expect(summary.textContent).toContain("실전");
  });

  it("서버가 준 error 를 Alert 로 보여 준다", async () => {
    previewKisPensionMock.mockResolvedValue({
      balance: null,
      warning: null,
      error: "KIS 조회 실패: 모의투자에서 퇴직연금 TR 이 없습니다",
      acntPrdtCd: "22",
      isMock: true,
    });

    renderModal();

    expect(await screen.findByText("연금 잔고 조회 오류")).toBeDefined();
    expect(
      screen.getByText("KIS 조회 실패: 모의투자에서 퇴직연금 TR 이 없습니다"),
    ).toBeDefined();
    // error 가 있으면 빈 응답 안내는 겹쳐 보이지 않는다.
    expect(screen.queryByText(/KIS 원본 응답이 비어 있습니다/)).toBeNull();
  });

  it("warning 을 Alert 로 보여 주고 JSON 은 그대로 남긴다", async () => {
    previewKisPensionMock.mockResolvedValue({
      balance: { output1: [], output2: [] },
      warning: "output2 가 비어 있습니다 — 동기화는 예수금 '알 수 없음' 으로 처리합니다",
      error: null,
      acntPrdtCd: "22",
      isMock: false,
    });

    renderModal();

    expect(await screen.findByText("연금 잔고 확인 사항")).toBeDefined();
    const alert = screen.getByText("연금 잔고 확인 사항").closest(".ant-alert") as HTMLElement;
    expect(alert.textContent).toContain("output2 가 비어 있습니다");
    expect(screen.getByLabelText("연금 진단 원본 JSON").textContent).toContain('"output2": []');
  });

  it("잔고가 null 이면 빈 응답 안내를 보여 준다", async () => {
    previewKisPensionMock.mockResolvedValue({
      balance: null,
      warning: "상품코드 (없음) 는 연금 계좌(22/29)가 아닙니다",
      error: null,
      acntPrdtCd: null,
      isMock: false,
    });

    renderModal();

    expect(await screen.findByText(/KIS 원본 응답이 비어 있습니다/)).toBeDefined();
    // 상품코드가 null 이면 "null" 대신 — 로 표시한다.
    const summary = screen.getByLabelText("연금 계좌 요약");
    expect(summary.textContent).toContain("—");
    expect(summary.textContent).not.toContain("null");
  });

  it("HTTP 실패는 오류 Alert 로 알리고 복사 버튼을 잠근다", async () => {
    previewKisPensionMock.mockRejectedValue(
      new ApiError("server", "서버 오류가 발생했습니다", "KIS_API_ERROR", "KIS 토큰 발급 실패"),
    );

    renderModal();

    expect(await screen.findByText("연금 진단 오류")).toBeDefined();
    expect(screen.getByText("KIS 토큰 발급 실패")).toBeDefined();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "복사" }).hasAttribute("disabled")).toBe(true);
    });
  });

  it("닫혀 있으면 호출하지 않는다", async () => {
    renderModal(false);
    await waitFor(() => expect(previewKisPensionMock).not.toHaveBeenCalled());
    fireEvent.click(document.body);
    expect(previewKisPensionMock).not.toHaveBeenCalled();
  });
});
