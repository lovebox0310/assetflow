import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage";
import { clearInflight } from "../api/client";
import { clearToken, saveToken } from "../auth/authStore";

/**
 * #37 AC: 설정 화면 — 프로필(me 실검증)·비상금 목표 개월 저장·계정 요약·401.
 */

type Handler = (path: string, init?: RequestInit) => Response | Promise<Response>;

function stubFetch(handler: Handler) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function apiResponse(data: unknown, ok = true, status = 200): Response {
  const body = ok
    ? { code: "OK", message: "loaded", data }
    : { code: "INVALID_REQUEST", message: "Invalid request", details: "", timestamp: "" };
  return { ok, status, json: async () => body } as Response;
}

describe("SettingsPage (스프린트 3 #37)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    clearInflight();
  });

  beforeEach(() => {
    clearToken();
    saveToken("tok", Date.now() + 60_000);
  });

  it("프로필과 목표 개월이 me 실검증 값으로 렌더된다", async () => {
    stubFetch((path) => {
      if (path.includes("/settings")) return apiResponse({ id: 1, email: "user@example.com", displayName: "AssetFlow", targetMonths: 6 });
      if (path.includes("/dashboard/summary")) return apiResponse({
        asOf: "2026-10",
        assets: [{ id: "1", type: "cash", name: "현금", value: 24_700_000 }],
        liabilities: [{ id: "9", name: "대출", balance: 69_355_560 }],
        monthly: { income: 8_200_000, expenses: 1_303_300, essentialExpenses: 1_200_000, essentialComplete: true },
      });
      if (path.includes("/dashboard/cashflow")) return apiResponse([]);
      return apiResponse({}, false, 500);
    });
    render(<SettingsPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenExpenses={() => {}} />);

    expect(await screen.findByText("AssetFlow")).toBeDefined();
    expect(await screen.findByText("user@example.com")).toBeDefined();
    const target = await screen.findByLabelText("비상금 목표 개월") as HTMLInputElement;
    expect(target.value).toBe("6");
    // 계정 요약: 순자산 24,700,000 - 69,355,560 = -44,655,560
    expect(await screen.findByText("-44,655,560원")).toBeDefined();
  });

  it("목표 개월 저장은 PUT settings로 반영된다", async () => {
    const fetchMock = stubFetch((path, init) => {
      if (path.includes("/settings") && init?.method === "PUT") {
        return apiResponse({ id: 1, email: "user@example.com", displayName: "AssetFlow", targetMonths: 12 });
      }
      if (path.includes("/settings")) return apiResponse({ id: 1, email: "user@example.com", displayName: "AssetFlow", targetMonths: 6 });
      if (path.includes("/dashboard/summary")) return apiResponse({ asOf: "2026-10", assets: [], liabilities: [], monthly: { income: 0, expenses: 0, essentialExpenses: 0, essentialComplete: false } });
      if (path.includes("/dashboard/cashflow")) return apiResponse([]);
      return apiResponse({}, false, 500);
    });
    render(<SettingsPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenExpenses={() => {}} />);

    await screen.findByText("AssetFlow");
    const target = screen.getByLabelText("비상금 목표 개월") as HTMLInputElement;
    fireEvent.change(target, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/settings", expect.objectContaining({ method: "PUT" })));
  });

  it("미인증 401은 인증 오류 문구로 구분된다", async () => {
    stubFetch((path) => {
      if (path.includes("/settings")) {
        return { ok: false, status: 401, json: async () => ({ code: "AUTH_REQUIRED", message: "Authentication required", details: "", timestamp: "" }) } as Response;
      }
      if (path.includes("/dashboard")) return apiResponse([]);
      return apiResponse({}, false, 500);
    });
    render(<SettingsPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenExpenses={() => {}} />);

    await screen.findAllByText(/인증|로그인/i);
  });

  it("비밀번호 변경은 PUT /api/v1/auth/password 로 전송된다", async () => {
    const fetchMock = stubFetch((path, init) => {
      if (path.includes("/auth/password") && init?.method === "PUT") {
        return apiResponse(null);
      }
      if (path.includes("/settings")) return apiResponse({ id: 1, email: "user@example.com", displayName: "AssetFlow", targetMonths: 6 });
      if (path.includes("/dashboard/summary")) return apiResponse({ asOf: "2026-10", assets: [], liabilities: [], monthly: { income: 0, expenses: 0, essentialExpenses: 0, essentialComplete: false } });
      if (path.includes("/dashboard/cashflow")) return apiResponse([]);
      return apiResponse({}, false, 500);
    });
    render(<SettingsPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenExpenses={() => {}} />);

    await screen.findByText("AssetFlow");
    fireEvent.change(screen.getByLabelText("현재 비밀번호"), { target: { value: "oldpass123" } });
    fireEvent.change(screen.getByLabelText("새 비밀번호"), { target: { value: "newpass123" } });
    fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), { target: { value: "newpass123" } });
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 변경" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/password", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ currentPassword: "oldpass123", newPassword: "newpass123" }),
    })));
    expect(await screen.findByText("비밀번호가 변경되었습니다.")).toBeDefined();
  });

  it("비밀번호 변경 시 새 비밀번호와 확인이 일치하지 않으면 검증 에러가 표시된다", async () => {
    stubFetch((path) => {
      if (path.includes("/settings")) return apiResponse({ id: 1, email: "user@example.com", displayName: "AssetFlow", targetMonths: 6 });
      if (path.includes("/dashboard")) return apiResponse([]);
      return apiResponse({}, false, 500);
    });
    render(<SettingsPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenExpenses={() => {}} />);

    await screen.findByText("AssetFlow");
    fireEvent.change(screen.getByLabelText("현재 비밀번호"), { target: { value: "oldpass123" } });
    fireEvent.change(screen.getByLabelText("새 비밀번호"), { target: { value: "newpass123" } });
    fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), { target: { value: "different123" } });
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 변경" }));

    expect(await screen.findByText("비밀번호가 일치하지 않습니다")).toBeDefined();
  });
});
