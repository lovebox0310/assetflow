import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UpbitCredentialsModal } from "./UpbitCredentialsModal";

const { getUpbitStatus, saveUpbitKeys, deleteUpbitKeys, testUpbit } = vi.hoisted(() => ({
  getUpbitStatus: vi.fn(),
  saveUpbitKeys: vi.fn(),
  deleteUpbitKeys: vi.fn(),
  testUpbit: vi.fn(),
}));

vi.mock("../api/investmentsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/investmentsApi")>();
  return { ...actual, getUpbitStatus, saveUpbitKeys, deleteUpbitKeys, testUpbit };
});

function renderModal() {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(<UpbitCredentialsModal open onClose={onClose} onSaved={onSaved} />);
  return { onClose, onSaved };
}

describe("UpbitCredentialsModal (UPBIT-3)", () => {
  beforeEach(() => {
    getUpbitStatus.mockReset();
    saveUpbitKeys.mockReset();
    deleteUpbitKeys.mockReset();
    testUpbit.mockReset();
    getUpbitStatus.mockResolvedValue({ configured: false, accessKeyMasked: null });
    saveUpbitKeys.mockResolvedValue({ configured: true, accessKeyMasked: "abcd****efgh" });
    deleteUpbitKeys.mockResolvedValue({ configured: false, accessKeyMasked: null });
    testUpbit.mockResolvedValue({ ok: true, accounts: 3 });
  });

  afterEach(() => {
    cleanup();
  });

  it("미설정 상태에서 키를 저장하고 연결 테스트 성공 시 닫는다", async () => {
    const { onClose, onSaved } = renderModal();
    await waitFor(() => expect(getUpbitStatus).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Access Key"), { target: { value: "abcd1234efgh" } });
    fireEvent.change(screen.getByLabelText("Secret Key"), { target: { value: "secret-key-9999" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(saveUpbitKeys).toHaveBeenCalledWith({
        accessKey: "abcd1234efgh",
        secretKey: "secret-key-9999",
      });
    });
    await waitFor(() => expect(testUpbit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("설정된 키는 마스킹만 보여 주고 입력은 비어 있다", async () => {
    getUpbitStatus.mockResolvedValue({ configured: true, accessKeyMasked: "abcd****efgh" });
    renderModal();

    expect(await screen.findByText("abcd****efgh")).toBeDefined();
    expect(screen.getByText(/키가 저장돼 있습니다/)).toBeDefined();
    expect((screen.getByLabelText("Access Key") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Secret Key") as HTMLInputElement).value).toBe("");
  });

  it("연동 해제는 deleteUpbitKeys 를 호출하고 폼/마스킹을 비운다", async () => {
    getUpbitStatus.mockResolvedValue({ configured: true, accessKeyMasked: "abcd****efgh" });
    const { onSaved } = renderModal();
    await screen.findByText("abcd****efgh");

    fireEvent.click(screen.getByRole("button", { name: "연동 해제" }));

    await waitFor(() => expect(deleteUpbitKeys).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("abcd****efgh")).toBeNull();
    expect((screen.getByLabelText("Access Key") as HTMLInputElement).value).toBe("");
  });

  it("연결 테스트 실패 시 사유를 Alert 에 보여 주고 모달을 유지한다", async () => {
    getUpbitStatus.mockResolvedValue({ configured: true, accessKeyMasked: "abcd****efgh" });
    testUpbit.mockRejectedValue(new Error("no_authorization_ip: 허용 IP에 서버 IP를 등록하세요"));
    const { onClose } = renderModal();
    await screen.findByText("abcd****efgh");

    fireEvent.click(screen.getByRole("button", { name: "연결 테스트" }));

    expect(await screen.findByText(/no_authorization_ip/)).toBeDefined();
    expect(screen.getByText("업비트 연동 설정")).toBeDefined();
    expect(onClose).not.toHaveBeenCalled();
  });
});
