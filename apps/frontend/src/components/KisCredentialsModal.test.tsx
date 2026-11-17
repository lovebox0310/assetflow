import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { KisCredentialsModal } from "./KisCredentialsModal";

const { getKisCredentials, saveKisCredentials, testKisCredentials, deleteKisCredentials } = vi.hoisted(
  () => ({
    getKisCredentials: vi.fn(),
    saveKisCredentials: vi.fn(),
    testKisCredentials: vi.fn(),
    deleteKisCredentials: vi.fn(),
  }),
);

vi.mock("../api/investmentsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/investmentsApi")>();
  return { ...actual, getKisCredentials, saveKisCredentials, testKisCredentials, deleteKisCredentials };
});

const REAL_URL = "https://openapi.koreainvestment.com:9443";

function renderModal() {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <KisCredentialsModal accountId={4} accountName="비상금" open onClose={onClose} onSaved={onSaved} />,
  );
  return { onClose, onSaved };
}

/**
 * §93 셸 이후 버튼 4개는 본문이 아니라 footer 에 있다. 저장은 `form.submit()` 으로
 * 같은 저장 경로(onFinish)를 그대로 탄다 — 이 테스트가 그 경로를 고정한다.
 */
describe("KisCredentialsModal (§62.2 · §93 셸)", () => {
  beforeEach(() => {
    getKisCredentials.mockReset();
    saveKisCredentials.mockReset();
    testKisCredentials.mockReset();
    deleteKisCredentials.mockReset();
    // 신규 입력 경로 — 저장된 자격증명이 없다.
    getKisCredentials.mockRejectedValue(new Error("not found"));
    saveKisCredentials.mockResolvedValue({});
    testKisCredentials.mockResolvedValue({ ok: true, cash: 1_200_000, message: "연결되었습니다" });
    deleteKisCredentials.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
  });

  it("저장 → 연결 테스트 성공 → 닫힘 순서로 진행한다", async () => {
    const { onClose, onSaved } = renderModal();
    await waitFor(() => expect(getKisCredentials).toHaveBeenCalledWith(4));

    fireEvent.change(await screen.findByLabelText("App Key"), { target: { value: "psa-key" } });
    fireEvent.change(screen.getByLabelText("App Secret"), { target: { value: "psa-secret" } });
    fireEvent.change(screen.getByLabelText("CANO"), { target: { value: "12345678" } });

    // footer 의 저장 버튼은 폼 밖에 있다 — form.submit() 으로 onFinish 를 탄다.
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(saveKisCredentials).toHaveBeenCalledWith(4, {
        appKey: "psa-key",
        appSecret: "psa-secret",
        baseUrl: REAL_URL,
        cano: "12345678",
        acntPrdtCd: "01",
      });
    });
    await waitFor(() => expect(testKisCredentials).toHaveBeenCalledWith(4));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    // 테스트가 성공해야 닫는다 — 저장만으로는 닫지 않는다.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("연결 테스트가 실패하면 사유를 남기고 열린 채로 둔다", async () => {
    testKisCredentials.mockResolvedValue({
      ok: false,
      cash: null,
      message: "KIS 오류: EGW00002",
    });
    const { onClose } = renderModal();
    await waitFor(() => expect(getKisCredentials).toHaveBeenCalledTimes(1));

    fireEvent.change(await screen.findByLabelText("App Key"), { target: { value: "psa-key" } });
    fireEvent.change(screen.getByLabelText("App Secret"), { target: { value: "psa-secret" } });
    fireEvent.change(screen.getByLabelText("CANO"), { target: { value: "12345678" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText(/EGW00002/)).toBeDefined();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("필수값이 비면 저장 요청을 보내지 않는다", async () => {
    renderModal();
    await waitFor(() => expect(getKisCredentials).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole("button", { name: "저장" }));

    expect(await screen.findByText("App Key를 입력하세요")).toBeDefined();
    expect(saveKisCredentials).not.toHaveBeenCalled();
  });
});
