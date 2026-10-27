import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assignMerchantCategory,
  getMerchantRules,
  listUnclassifiedGroups,
  reclassifyCardImports,
  submitCardImports,
  updateCardImportCategory,
} from "./cardImportApi";
import { clearToken, saveToken } from "../auth/authStore";
import { clearInflight } from "./client";

/**
 * §55.10 — 카드 내역 카테고리 API 계약.
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

describe("cardImportApi (§55.10)", () => {
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

  it("가맹점 규칙 조회는 POST body 에 merchants 를 실어 본다", async () => {
    saveToken("tok", Date.now() + 60_000);
    const rule: { category: string; subCategory: string } = { category: "식비", subCategory: "외식" };
    const fetchMock = stubFetch({ 스타벅스: rule });

    const result = await getMerchantRules(["스타벅스"]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("/api/v1/assets/card-imports/merchant-rules");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ merchants: ["스타벅스"] });
    expect(result["스타벅스"]).toEqual(rule);
  });

  it("가맹점 업종을 함께 보내 업종 기반 자동 분류 제안을 받는다 (§55.8.9)", async () => {
    saveToken("tok", Date.now() + 60_000);
    const fetchMock = stubFetch({ 알수없는가맹점: { category: "식비", subCategory: "외식" } });

    await getMerchantRules(["알수없는가맹점"], { 알수없는가맹점: "한식" });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      merchants: ["알수없는가맹점"],
      businessCategories: { 알수없는가맹점: "한식" },
    });
  });

  it("반영 요청에는 행과 merchantRules(대분류+세부)를 실어 본다", async () => {
    saveToken("tok", Date.now() + 60_000);
    const fetchMock = stubFetch({ stored: 1 });

    await submitCardImports(
      [
        {
          rowKey: "k1",
          approvedAt: "2026-10-01",
          merchantName: "가맹점A",
          supplyExVat: 9000,
          vat: 1000,
          grossAmount: 10000,
        },
      ],
      { 가맹점A: { category: "식비", subCategory: "외식" } },
    );

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      rows: [
        {
          rowKey: "k1",
          approvedAt: "2026-10-01",
          merchantName: "가맹점A",
          supplyExVat: 9000,
          vat: 1000,
          grossAmount: 10000,
        },
      ],
      merchantRules: { 가맹점A: { category: "식비", subCategory: "외식" } },
    });
  });

  it("카테고리 수정은 rowKey, category, subCategory 를 본문에 실어 PATCH 로 본낸다", async () => {
    saveToken("tok", Date.now() + 60_000);
    const fetchMock = stubFetch({
      rowKey: "k 1",
      merchantName: "가맹점",
      category: "식비",
      subCategory: "외식",
      updatedRows: 2,
    });

    const result = await updateCardImportCategory("k 1", "식비", "외식");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("/api/v1/assets/card-imports/category");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ rowKey: "k 1", category: "식비", subCategory: "외식" });
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

  it("가맹점 일괄 지정은 merchant-category 로 PATCH 하고 되돌리기는 빈 카테고리를 본낸다", async () => {
    saveToken("tok", Date.now() + 60_000);
    const fetchMock = stubFetch({ merchantName: "네이버페이", category: "쇼핑/생활", subCategory: "생활용품", updatedRows: 37 });

    const result = await assignMerchantCategory("네이버페이", "쇼핑/생활", "생활용품");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("/api/v1/assets/card-imports/merchant-category");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ merchantName: "네이버페이", category: "쇼핑/생활", subCategory: "생활용품" });
    expect(result.updatedRows).toBe(37);

    await assignMerchantCategory("네이버페이", "", "");
    const [, undoInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(String(undoInit.body))).toEqual({ merchantName: "네이버페이", category: "", subCategory: "" });
  });
});
