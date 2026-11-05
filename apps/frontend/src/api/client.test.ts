import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, clearInflight } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  clearInflight();
});

function errorResponse(body: Record<string, unknown>, status = 502): Response {
  return {
    ok: false,
    status,
    json: async () => body,
  } as Response;
}

describe("apiFetch 오류 상세 (§25)", () => {
  it("details 에 외부 API 사유가 있으면 그대로 담는다 (KIS)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => errorResponse({
      code: "KIS_API_ERROR",
      message: "KIS API request failed",
      details: "실전투자 도메인은 모의투자 앱키로 호출하실 수 없습니다.",
      timestamp: "",
    })));

    await expect(apiFetch("/api/v1/investments/holdings/sync-kis", { method: "POST" }))
      .rejects.toMatchObject({
        code: "KIS_API_ERROR",
        detail: "실전투자 도메인은 모의투자 앱키로 호출하실 수 없습니다.",
      } satisfies Partial<ApiError>);
  });

  it("details 가 빈 문자열이면 message 의 사유를 쓴다 (은행)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => errorResponse({
      code: "BANK_REJECTED",
      message: "계좌번호 오류입니다. 계좌번호를 다시 확인해 주세요.",
      details: "",
      timestamp: "",
    }, 400)));

    await expect(apiFetch("/api/v1/assets/bank-link", { method: "PUT" }))
      .rejects.toMatchObject({
        code: "BANK_REJECTED",
        detail: "계좌번호 오류입니다. 계좌번호를 다시 확인해 주세요.",
      } satisfies Partial<ApiError>);
  });
});
