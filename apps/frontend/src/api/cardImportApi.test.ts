import { afterEach, describe, expect, it, vi } from "vitest";
import { reclassifyCardImports, updateCardImportCategory } from "./cardImportApi";
import { clearToken, saveToken } from "../auth/authStore";
import { clearInflight } from "./client";

/**
 * §55.8 — 카드 내역 카테고리 API 계약.
 * 화면(antd Select) 조작 대신 요청 자체를 검증한다: 경로·메서드·본문이 틀리면 기능이 조용히 죽는다.
 */

function stubFetch(data: unknown) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ code: "OK", message: "ok", data }),
    } as Response),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("cardImportApi (§55.8)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearToken();
    clearInflight();
  });

  it("재분류는 POST /card-imports/reclassify 로 호출한다", async () => {
    saveToken("tok", Date.now() + 60_000);
    const fetchMock = stubFetch({ total: 12, updated: 7 });

    const result = await reclassifyCardImports();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("/api/v1/assets/card-imports/reclassify");
    expect(init.method).toBe("POST");
    expect(result).toEqual({ total: 12, updated: 7 });
  });

  it("카테고리 수정은 rowKey 와 category 를 본문에 실어 PATCH 로 보낸다", async () => {
    saveToken("tok", Date.now() + 60_000);
    const fetchMock = stubFetch({ rowKey: "k 1", merchantName: "가맹점", category: "식비", updatedRows: 2 });

    const result = await updateCardImportCategory("k 1", "식비");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("/api/v1/assets/card-imports/category");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ rowKey: "k 1", category: "식비" });
    expect(result.updatedRows).toBe(2);
  });
});
