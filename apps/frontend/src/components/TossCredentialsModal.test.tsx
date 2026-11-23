import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TossCredentialsModal } from "./TossCredentialsModal";
import type { TossStatus } from "../api/investmentsApi";
import { ApiError } from "../api/client";

const {
  getTossStatus,
  saveTossCredentials,
  deleteTossCredentials,
  testTossConnection,
  listTossAccounts,
} = vi.hoisted(() => ({
  getTossStatus: vi.fn(),
  saveTossCredentials: vi.fn(),
  deleteTossCredentials: vi.fn(),
  testTossConnection: vi.fn(),
  listTossAccounts: vi.fn(),
}));

vi.mock("../api/investmentsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/investmentsApi")>();
  return {
    ...actual,
    getTossStatus,
    saveTossCredentials,
    deleteTossCredentials,
    testTossConnection,
    listTossAccounts,
  };
});

function renderModal() {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <TossCredentialsModal accountId={7} accountName="토스 주식" open onClose={onClose} onSaved={onSaved} />,
  );
  return { onClose, onSaved };
}

const NOT_CONFIGURED: TossStatus = { configured: false, accountId: null, hasAccountSeq: false };
const CONFIGURED: TossStatus = { configured: true, accountId: 7, hasAccountSeq: false };

/** 상태 조회가 끝나 폼이 활성화될 때까지 기다린다(antd Form disabled 동안 입력이 무시된다). */
async function waitForForm() {
  await waitFor(() => {
    const input = screen.getByLabelText("Client ID") as HTMLInputElement;
    expect(input.disabled).toBe(false);
  });
}

/** 계좌 Select 를 열고 라벨로 옵션을 고른다(antd Select 는 mousedown 으로 열린다). */
async function pickAccount(label: string) {
  fireEvent.mouseDown(screen.getByLabelText("토스 계좌"));
  const option = await waitFor(() => {
    const found = document.querySelector<HTMLElement>(
      `.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="${label}"]`,
    );
    if (!found) throw new Error(`option not found: ${label}`);
    return found;
  });
  fireEvent.click(option);
}

describe("TossCredentialsModal (이슈 #55 Stage 3)", () => {
  beforeEach(() => {
    getTossStatus.mockReset();
    saveTossCredentials.mockReset();
    deleteTossCredentials.mockReset();
    testTossConnection.mockReset();
    listTossAccounts.mockReset();
    getTossStatus.mockResolvedValue(NOT_CONFIGURED);
    listTossAccounts.mockResolvedValue({ accounts: [], error: null });
    saveTossCredentials.mockResolvedValue({ configured: true, accountId: 7, hasAccountSeq: false });
    deleteTossCredentials.mockResolvedValue(NOT_CONFIGURED);
    testTossConnection.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
  });

  it("입력값 그대로 저장하고 부모에 알린 뒤 닫는다", async () => {
    const { onClose, onSaved } = renderModal();
    await waitFor(() => expect(getTossStatus).toHaveBeenCalledTimes(1));
    // 미설정이면 계좌 목록을 부르지 않는다(항상 '자격증명이 없습니다' 만 온다).
    expect(listTossAccounts).not.toHaveBeenCalled();
    await waitForForm();

    fireEvent.change(await screen.findByLabelText("Client ID"), { target: { value: " toss-cid " } });
    fireEvent.change(screen.getByLabelText("Client Secret"), { target: { value: "toss-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(saveTossCredentials).toHaveBeenCalledWith({
        accountId: 7,
        clientId: "toss-cid",
        clientSecret: "toss-secret",
        tossAccountSeq: null,
      });
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("저장된 설정이면 계좌 목록을 불러와 고른 accountSeq 를 함께 저장한다", async () => {
    getTossStatus.mockResolvedValue(CONFIGURED);
    listTossAccounts.mockResolvedValue({
      accounts: [{ accountSeq: 42, accountNo: "12****", accountType: "종합" }],
      error: null,
    });
    renderModal();
    await waitFor(() => expect(listTossAccounts).toHaveBeenCalledTimes(1));
    await waitForForm();

    fireEvent.change(await screen.findByLabelText("Client ID"), { target: { value: "cid" } });
    fireEvent.change(screen.getByLabelText("Client Secret"), { target: { value: "sec" } });
    await pickAccount("12**** (종합)");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(saveTossCredentials).toHaveBeenCalledWith({
        accountId: 7,
        clientId: "cid",
        clientSecret: "sec",
        tossAccountSeq: "42",
      });
    });
  });

  it("계좌 목록이 실패하면 사유를 보여 주고 accountSeq 직접 입력으로 대체한다", async () => {
    getTossStatus.mockResolvedValue(CONFIGURED);
    listTossAccounts.mockResolvedValue({ accounts: [], error: "토스 오류: 403 허용 IP" });
    renderModal();

    // 실패 사유는 폼 도움말에 남고, Select 대신 직접 입력이 열린다.
    expect(await screen.findByText(/403 허용 IP/)).toBeDefined();
    expect(document.querySelector(".af-toss-modal .ant-select")).toBeNull();
    await waitForForm();

    fireEvent.change(await screen.findByLabelText("Client ID"), { target: { value: "cid" } });
    fireEvent.change(screen.getByLabelText("Client Secret"), { target: { value: "sec" } });
    fireEvent.change(screen.getByLabelText("토스 계좌 식별자(accountSeq)"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(saveTossCredentials).toHaveBeenCalledWith({
        accountId: 7,
        clientId: "cid",
        clientSecret: "sec",
        tossAccountSeq: "9",
      });
    });
  });

  it("연결 테스트 성공은 성공 문구를 남기고 닫지 않는다", async () => {
    const { onClose } = renderModal();
    await waitFor(() => expect(getTossStatus).toHaveBeenCalledTimes(1));
    await waitForForm();

    fireEvent.click(screen.getByRole("button", { name: "연결 테스트" }));

    expect(await screen.findByText("연결되었습니다")).toBeDefined();
    expect(testTossConnection).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("연결 테스트 실패는 서버 사유(detail)를 보여 준다", async () => {
    testTossConnection.mockRejectedValue(
      new ApiError("client", "요청을 처리할 수 없습니다", "TOSS_API_ERROR", "403 허용 IP 미등록"),
    );
    renderModal();
    await waitFor(() => expect(getTossStatus).toHaveBeenCalledTimes(1));
    await waitForForm();

    fireEvent.click(screen.getByRole("button", { name: "연결 테스트" }));

    expect(await screen.findByText(/403 허용 IP 미등록/)).toBeDefined();
  });

  it("설정된 경우에만 삭제(Popconfirm)를 노출한다", async () => {
    getTossStatus.mockResolvedValue(CONFIGURED);
    renderModal();
    await waitFor(() => expect(getTossStatus).toHaveBeenCalledTimes(1));
    await waitForForm();

    expect(await screen.findByRole("button", { name: "삭제" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    // Popconfirm 확인을 눌러야 실제 삭제가 나간다.
    fireEvent.click(await screen.findByRole("button", { name: "해제" }));
    await waitFor(() => expect(deleteTossCredentials).toHaveBeenCalledTimes(1));
  });

  it("상태 응답 타입에는 secret 계열 필드가 없다", () => {
    const shape: TossStatus = { configured: false, accountId: null, hasAccountSeq: false };
    // @ts-expect-error TossStatus 에는 clientSecret 이 없다 — 응답으로 secret 이 오지 않는다.
    expect(shape.clientSecret).toBeUndefined();
  });
});
