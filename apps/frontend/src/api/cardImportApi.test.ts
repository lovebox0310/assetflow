import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assignMerchantCategory,
  listUnclassifiedGroups,
  reclassifyCardImports,
  updateCardImportCategory,
} from "./cardImportApi";
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

  it("미분류 작업함은 GET /card-imports/unclassified 로 묶음을 읽는다", async () => {
    saveToken("tok", Date.now() + 60_000);
    const groups = [
      { merchantName: "네이버페이", count: 37, grossTotal: 1_658_960, firstApprovedAt: "2026-08-01", lastApprovedAt: "2026-10-20" },
    ];
    const fetchMock = stubFetch(groups);

    const result = await listUnclassifiedGroups();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("/api/v1/assets/card-imports/unclassified");
    expect(init?.method ?? "GET").toBe("GET");
    expect(result).toEqual(groups);
  });

  it("가맹점 일괄 지정은 merchant-category 로 PATCH 하고 되돌리기는 빈 카테고리를 보낸다", async () => {
    saveToken("tok", Date.now() + 60_000);
    const fetchMock = stubFetch({ merchantName: "네이버페이", category: "쇼핑", updatedRows: 37 });

    const result = await assignMerchantCategory("네이버페이", "쇼핑");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("/api/v1/assets/card-imports/merchant-category");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ merchantName: "네이버페이", category: "쇼핑" });
    expect(result.updatedRows).toBe(37);

    await assignMerchantCategory("네이버페이", "");
    const [, undoInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(String(undoInit.body))).toEqual({ merchantName: "네이버페이", category: "" });
  });
});
