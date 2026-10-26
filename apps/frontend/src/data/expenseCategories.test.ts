import { describe, expect, it } from "vitest";
import {
  CATEGORY_GROUPS,
  CATEGORY_SUBS,
  isFixedSubCategory,
  isAssetTransferSubCategory,
  subCategoryOptions,
} from "./expenseCategories";

/**
 * §55.10 — 카테고리 대분류/세부는 백엔드 `CategoryTaxonomy` 와 같아야 한다.
 */
describe("expenseCategories (§55.10)", () => {
  it("9개 대분류가 정의돼 있다", () => {
    expect(CATEGORY_GROUPS).toEqual([
      "식비",
      "주거/통신",
      "교통/차량",
      "쇼핑/생활",
      "건강/의료",
      "문화/여가",
      "금융/세금",
      "기타/경조사",
      "교육",
    ]);
  });

  it("각 대분류마다 세부 분류가 있다", () => {
    expect(CATEGORY_SUBS["식비"]).toEqual(["장보기", "외식", "카페/간식", "배달"]);
    expect(CATEGORY_SUBS["주거/통신"]).toEqual(["주거비", "통신비"]);
    expect(CATEGORY_SUBS["교통/차량"]).toEqual(["대중교통", "차량유지비"]);
    expect(CATEGORY_SUBS["쇼핑/생활"]).toEqual(["생활용품", "의류/잡화", "가전/가구", "미용/뷰티"]);
    expect(CATEGORY_SUBS["건강/의료"]).toEqual(["병원비", "약국", "건강기능식품"]);
    expect(CATEGORY_SUBS["문화/여가"]).toEqual(["취미/여가", "여행/숙박"]);
    expect(CATEGORY_SUBS["금융/세금"]).toEqual(["보험료", "세금/공과금", "저축/투자"]);
    expect(CATEGORY_SUBS["기타/경조사"]).toEqual(["경조사비", "기타"]);
    expect(CATEGORY_SUBS["교육"]).toEqual(["학원/교육", "학교/등록금"]);
  });

  it("고정비/변동비/자산 이동을 판정한다", () => {
    expect(isFixedSubCategory("주거비")).toBe(true);
    expect(isFixedSubCategory("통신비")).toBe(true);
    expect(isFixedSubCategory("보험료")).toBe(true);
    expect(isFixedSubCategory("세금/공과금")).toBe(true);
    expect(isFixedSubCategory("학원/교육")).toBe(true);
    expect(isFixedSubCategory("장보기")).toBe(false);
    expect(isFixedSubCategory("")).toBe(false);
    expect(isAssetTransferSubCategory("저축/투자")).toBe(true);
    expect(isAssetTransferSubCategory("보험료")).toBe(false);
  });

  it("세부 선택지를 조회한다", () => {
    expect(subCategoryOptions("식비").map((o) => o.value)).toEqual(["장보기", "외식", "카페/간식", "배달"]);
    expect(subCategoryOptions("알 수 없음")).toEqual([]);
  });
});
