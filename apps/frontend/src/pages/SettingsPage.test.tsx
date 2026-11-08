import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage";
import { clearInflight } from "../api/client";
import { clearToken, saveToken } from "../auth/authStore";

/**
 * #37 AC: 설정 화면 — 프로필(me 실검증)·비밀번호 변경·401.
 * 기능 설정(비상금 기준·카드 명세서 자동 수집)은 기능 화면으로 이동했다(UI-IA-2).
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

  it("프로필이 me 실검증 값으로 렌더된다", async () => {
    stubFetch((path) => {
      if (path.includes("/settings")) return apiResponse({ id: 1, email: "user@example.com", displayName: "AssetFlow", targetMonths: 6 });
      return apiResponse({}, false, 500);
    });
    render(<SettingsPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenExpenses={() => {}} />);

    expect(await screen.findByText("AssetFlow")).toBeDefined();
    expect(await screen.findByText("user@example.com")).toBeDefined();
  });

  it("계정·보안 섹션만 남는다 — 비상금 기준·계정 요약·카드메일 폼이 없다", async () => {
    stubFetch((path) => {
      if (path.includes("/settings")) return apiResponse({ id: 1, email: "user@example.com", displayName: "AssetFlow", targetMonths: 6 });
      return apiResponse({}, false, 500);
    });
    render(<SettingsPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenExpenses={() => {}} />);

    await screen.findByText("AssetFlow");
    expect(screen.getByRole("heading", { level: 2, name: "프로필" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 2, name: "비밀번호 변경" })).toBeDefined();
    expect(screen.queryByRole("heading", { level: 2, name: "비상금 기준" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "계정 요약" })).toBeNull();
    expect(screen.queryByLabelText("비상금 목표 개월")).toBeNull();
    expect(screen.queryByRole("table", { name: "계정 요약" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "카드 명세서 자동 수집" })).toBeNull();
  });

  it("미인증 401은 인증 오류 문구로 구분된다", async () => {
    stubFetch((path) => {
      if (path.includes("/settings")) {
        return { ok: false, status: 401, json: async () => ({ code: "AUTH_REQUIRED", message: "Authentication required", details: "", timestamp: "" }) } as Response;
      }
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
