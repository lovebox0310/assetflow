import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CardEmailImportSettingsSection } from "./CardEmailImportSettingsSection";
import { clearInflight } from "../api/client";

afterEach(() => {
  cleanup();
  clearInflight();
  vi.unstubAllGlobals();
});

function envelope(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ code: "OK", message: "ok", data }),
  } as Response;
}

function errorEnvelope(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({ code: "NOT_FOUND", message: "not found", details: "", timestamp: "" }),
  } as Response;
}

function stub(handler: (path: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("CardEmailImportSettingsSection", () => {
  it("설정이 없으면 빈 폼을 보여 준다", async () => {
    stub((path) => (path.includes("/card-email-import-settings/hyundaicard") ? errorEnvelope(404) : new Response()));
    render(<CardEmailImportSettingsSection />);

    await waitFor(() => expect(screen.getByLabelText("Gmail 주소")).toBeDefined());
    expect((screen.getByLabelText("Gmail 주소") as HTMLInputElement).value).toBe("");
  });

  it("저장 시 입력값이 PUT BODY로 전송된다", async () => {
    const fetchMock = stub((path, init) => {
      if (path.includes("/card-email-import-settings/hyundaicard") && init?.method === "PUT") {
        return envelope({
          id: 1,
          enabled: true,
          cardCompany: "hyundaicard",
          emailProvider: "gmail",
          emailAddress: "user@example.com",
          lastImportStatus: null,
        });
      }
      return errorEnvelope(404);
    });

    render(<CardEmailImportSettingsSection />);
    await waitFor(() => expect(screen.getByLabelText("Gmail 주소")).toBeDefined());

    fireEvent.change(screen.getByLabelText("Gmail 주소"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Gmail 앱 비밀번호"), { target: { value: "app-pass" } });
    fireEvent.change(screen.getByLabelText("현대카드 명세서 비밀번호"), { target: { value: "760211" } });
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(screen.getByText("현대카드 자동 수집 설정을 저장했습니다.")).toBeDefined());

    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(putCall).toBeDefined();
    const init = putCall![1];
    expect(init).toBeDefined();
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({
      enabled: true,
      emailProvider: "gmail",
      emailAddress: "user@example.com",
      emailPassword: "app-pass",
      vestmailPassword: "760211",
    });
  });

  it("삼성카드를 선택하면 삼성카드 설정을 따로 불러오고 저장한다 (§68)", async () => {
    const fetchMock = stub((path, init) => {
      if (path.includes("/card-email-import-settings/samsungcard") && init?.method === "PUT") {
        return envelope({
          id: 2,
          enabled: true,
          cardCompany: "samsungcard",
          emailProvider: "gmail",
          emailAddress: "user@example.com",
          lastImportStatus: null,
        });
      }
      return errorEnvelope(404);
    });

    render(<CardEmailImportSettingsSection />);
    await waitFor(() => expect(screen.getByLabelText("Gmail 주소")).toBeDefined());

    fireEvent.click(screen.getByRole("radio", { name: "삼성카드" }));

    await waitFor(() => expect(screen.getByLabelText("삼성카드 명세서 비밀번호")).toBeDefined());
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/card-email-import-settings/samsungcard"),
      ),
    ).toBe(true);

    fireEvent.change(screen.getByLabelText("Gmail 주소"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Gmail 앱 비밀번호"), { target: { value: "app-pass" } });
    fireEvent.change(screen.getByLabelText("삼성카드 명세서 비밀번호"), { target: { value: "760211" } });
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(screen.getByText("삼성카드 자동 수집 설정을 저장했습니다.")).toBeDefined());
    const putCall = fetchMock.mock.calls.find(
      ([input, init]) => init?.method === "PUT"
        && String(input).includes("/card-email-import-settings/samsungcard"),
    );
    expect(putCall).toBeDefined();
  });
});
