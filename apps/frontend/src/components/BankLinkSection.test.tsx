import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BankLinkSection } from "./BankLinkSection";
import { clearInflight } from "../api/client";
import type { AssetAccountRow } from "../api/assetsApi";

/**
 * §61 은행 잔액 가져오기 섹션.
 *
 * 검증 대상:
 * - 연결 안 된 계좌만 "계좌 연결" 버튼을 준다.
 * - 연결 시 계좌번호/비밀번호/생년월일이 PUT 으로 실리고, 성공하면 잔액 요약이 보인다.
 * - 은행 거절 사유(ApiError.detail)를 숨기지 않고 보여 준다.
 * - 모달을 닫으면 비밀번호 입력값이 남지 않는다.
 */

const accounts: AssetAccountRow[] = [
  {
    id: 1,
    accountType: "cash",
    name: "생활비",
    institutionName: "우리은행",
    balance: 1_000_000,
    isDebt: false,
    openedAt: null,
  },
];

const link = {
  accountId: 1,
  bankCode: "WR",
  bankLabel: "우리은행",
  accountNumberMasked: "****6789",
  accountType: "personal" as const,
  lastSyncedAt: "2026-11-03T01:00:00Z",
  lastBalance: 12_345_678,
};

function envelope(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ code: "OK", message: "ok", data }),
  } as Response;
}

function errorEnvelope(status: number, code: string, message: string): Response {
  return {
    ok: false,
    status,
    json: async () => ({ code, message, details: "", timestamp: "" }),
  } as Response;
}

function stub(handler: (path: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function syncResult() {
  return {
    accountId: 1,
    bankCode: "WR",
    balance: 12_345_678,
    transactionCount: 2,
    latest: {
      date: "2026-11-03",
      time: "10:00:00",
      description: "스마트출금",
      displayName: "스타벅스",
      counterparty: "스타벅스코리아",
      amount: 5_000,
      balance: 12_345_678,
      type: "withdrawal",
      branch: "강남",
      memo: "",
    },
    syncedAt: "2026-11-03T01:00:00Z",
  };
}

async function fillCredentials(password: string, resident: string) {
  fireEvent.change(await screen.findByLabelText("계좌 비밀번호 (4자리)"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("생년월일 6자리"), { target: { value: resident } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearInflight();
});

describe("BankLinkSection (§61)", () => {
  it("연결 안 된 계좌를 연결하면 PUT 후 잔액 요약을 보여 준다", async () => {
    const onSynced = vi.fn();
    const fetchMock = stub((path, init) => {
      if (path.includes("/assets/bank/banks")) {
        return envelope([
          { code: "NH", label: "농협은행" },
          { code: "KB", label: "국민은행" },
          { code: "WR", label: "우리은행" },
          { code: "IBK", label: "기업은행" },
        ]);
      }
      if (path.includes("/assets/bank-links")) return envelope([]);
      if (path.endsWith("/bank-link") && init?.method === "PUT") {
        return envelope({ link, sync: syncResult() });
      }
      return envelope([]);
    });

    render(<BankLinkSection accounts={accounts} onSynced={onSynced} />);
    await screen.findByText(/연결 안 됨/);

    fireEvent.click(screen.getByRole("button", { name: "계좌 연결" }));
    await screen.findByText("생활비 은행 연결");

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "은행" }));
    fireEvent.click(await screen.findByTitle("우리은행"));
    fireEvent.change(screen.getByLabelText("계좌번호"), {
      target: { value: "1002-345-678901" },
    });
    await fillCredentials("1234", "900101");
    fireEvent.click(screen.getByRole("button", { name: "연결하고 잔액 가져오기" }));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        (call) => String(call[0]).endsWith("/accounts/1/bank-link") && call[1]?.method === "PUT",
      );
      expect(put).toBeDefined();
      const body = JSON.parse(String(put?.[1]?.body));
      // 하이픈은 서버가 아니라 화면에서 먼저 제거해 보낸다.
      expect(body.accountNumber).toBe("1002345678901");
      expect(body.accountPassword).toBe("1234");
      expect(body.residentNumber).toBe("900101");
      expect(body.bankCode).toBe("WR");
      expect(body.accountType).toBe("personal");
    });

    expect(await screen.findByText("12,345,678원")).toBeDefined();
    expect(onSynced).toHaveBeenCalled();
    expect(screen.getByText(/마지막 동기화/)).toBeDefined();
    // 연결된 계좌에는 다시 "계좌 연결" 대신 잔액/해제 동작이 보인다.
    expect(screen.getByRole("button", { name: "잔액 가져오기" })).toBeDefined();
  });

  it("연결된 계좌는 비밀번호·생년월일만 받아 POST 로 잔액을 다시 가져온다", async () => {
    const onSynced = vi.fn();
    const fetchMock = stub((path, init) => {
      if (path.includes("/assets/bank/banks")) return envelope([{ code: "WR", label: "우리은행" }]);
      if (path.includes("/assets/bank-links")) return envelope([link]);
      if (path.endsWith("/bank-sync") && init?.method === "POST") return envelope(syncResult());
      return envelope([]);
    });

    render(<BankLinkSection accounts={accounts} onSynced={onSynced} />);
    expect(await screen.findByText(/우리은행 \*\*\*\*6789/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "잔액 가져오기" }));
    await screen.findByText("생활비 잔액 가져오기");
    await fillCredentials("1234", "900101");
    fireEvent.click(screen.getByRole("button", { name: "가져오기" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (call) => String(call[0]).endsWith("/accounts/1/bank-sync") && call[1]?.method === "POST",
      );
      expect(post).toBeDefined();
      // 계좌번호는 다시 보내지 않는다 — 서버가 저장된 암호문을 복호화해 쓴다.
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({
        accountPassword: "1234",
        residentNumber: "900101",
      });
    });

    expect(await screen.findByText("12,345,678원")).toBeDefined();
    expect(onSynced).toHaveBeenCalled();
  });

  it("은행 거절 사유를 숨기지 않고 모달에 보여 준다", async () => {
    stub((path, init) => {
      if (path.includes("/assets/bank/banks")) return envelope([{ code: "KB", label: "국민은행" }]);
      if (path.includes("/assets/bank-links")) return envelope([]);
      if (path.endsWith("/bank-link") && init?.method === "PUT") {
        return errorEnvelope(400, "BANK_REJECTED", "계좌번호 오류입니다. 계좌번호를 다시 확인해 주세요. (안내코드 01506)");
      }
      return envelope([]);
    });

    render(<BankLinkSection accounts={accounts} onSynced={() => {}} />);
    await screen.findByText(/연결 안 됨/);
    fireEvent.click(screen.getByRole("button", { name: "계좌 연결" }));
    await screen.findByText("생활비 은행 연결");

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "은행" }));
    fireEvent.click(await screen.findByTitle("국민은행"));
    fireEvent.change(screen.getByLabelText("계좌번호"), { target: { value: "123456789012" } });
    await fillCredentials("1234", "900101");
    fireEvent.click(screen.getByRole("button", { name: "연결하고 잔액 가져오기" }));

    // 고정 문구가 아니라 은행이 준 문장이 그대로 보여야 한다.
    expect(
      await screen.findByText("계좌번호 오류입니다. 계좌번호를 다시 확인해 주세요. (안내코드 01506)"),
    ).toBeDefined();
  });

  it("모달을 닫으면 비밀번호 입력값을 남기지 않는다", async () => {
    stub((path) => {
      if (path.includes("/assets/bank/banks")) return envelope([{ code: "WR", label: "우리은행" }]);
      if (path.includes("/assets/bank-links")) return envelope([]);
      return envelope([]);
    });

    render(<BankLinkSection accounts={accounts} onSynced={() => {}} />);
    await screen.findByText(/연결 안 됨/);

    fireEvent.click(screen.getByRole("button", { name: "계좌 연결" }));
    await screen.findByText("생활비 은행 연결");
    const passwordInput = (await screen.findByLabelText("계좌 비밀번호 (4자리)")) as HTMLInputElement;
    fireEvent.change(passwordInput, { target: { value: "1234" } });
    expect(passwordInput.value).toBe("1234");

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    // 닫힘 애니메이션 중에도 폼 값은 즉시 비워야 한다 — 다시 열었을 때 남아 있으면 안 된다.
    fireEvent.click(screen.getByRole("button", { name: "계좌 연결" }));
    const reopened = screen.getAllByLabelText("계좌 비밀번호 (4자리)") as HTMLInputElement[];
    expect(reopened.length).toBeGreaterThan(0);
    reopened.forEach((input) => expect(input.value).toBe(""));
  });
});
