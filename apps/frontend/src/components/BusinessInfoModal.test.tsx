import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BusinessInfoModal } from "./BusinessInfoModal";
import { clearToken } from "../auth/authStore";

/** 사업자 정보 모달 — 조회 성공/혼잡(503) 두 경로만 확인한다. */

function apiResponse(data: unknown, ok = true, status = 200, code = "OK"): Response {
  const body = ok
    ? { code, message: "loaded", data }
    : { code, message: "error", details: "", timestamp: "" };
  return { ok, status, json: async () => body } as Response;
}

describe("BusinessInfoModal", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    clearToken();
  });

  it("shows the fetched business info", async () => {
    clearToken();
    const fetchMock = vi.fn(async () =>
      apiResponse({
        businessNo: "2208155597",
        companyName: "(주)케이지이니시스",
        ceoName: "이선재",
        bizType: "정보통신업",
        bizItem: "기타 정보 기술 및 컴퓨터 운영 관련 서비스업",
        businessStatus: "계속사업자",
        employees: 242,
        fiscalMonth: 12,
        source: "bizno.net",
        fetchedAt: "2026-10-26T13:46:48Z",
        cached: true,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<BusinessInfoModal open businessNo="2208155597" merchantName="이니시스" onClose={() => {}} />);

    expect(await screen.findByText("(주)케이지이니시스")).toBeTruthy();
    expect(screen.getByText("정보통신업")).toBeTruthy();
    expect(screen.getByText("220-81-55597")).toBeTruthy();
    expect(screen.getByText(/저장된 정보/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("explains congestion when bizno.net is busy and retries on demand", async () => {
    clearToken();
    const fetchMock = vi.fn(async () =>
      apiResponse(null, false, 503, "BIZNO_BUSY"),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<BusinessInfoModal open businessNo="2208155597" onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/bizno\.net 접속이 지연/)).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /다시\s*조회/ }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
