import { describe, expect, it } from "vitest";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_OPTIONS, LEGACY_EXPENSE_KINDS } from "./expenseCategories";

/**
 * §55.8 — 카테고리 목록은 백엔드 `CategorySeedData` 와 같아야 한다.
 * 한쪽에만 추가하면 자동 분류 결과가 화면에서 선택 불가능한 값이 된다.
 */
describe("expenseCategories (§55.8)", () => {
  it("미용·의류가 기본 카테고리에 포함된다", () => {
    expect(EXPENSE_CATEGORIES).toContain("미용");
    expect(EXPENSE_CATEGORIES).toContain("의류");
    // 기존 11종도 그대로 유지
    for (const name of ["식비", "교통비", "보험료", "경조사비", "주거비", "통신비", "쇼핑", "의료비", "여가/취미", "교육비", "기타"]) {
      expect(EXPENSE_CATEGORIES).toContain(name);
    }
  });

  it("선택지는 13종 카테고리 + legacy 3종으로 구성된다", () => {
    const [primary, legacy] = EXPENSE_CATEGORY_OPTIONS;
    expect(primary?.options.map((o) => o.value)).toEqual([...EXPENSE_CATEGORIES]);
    expect(legacy?.options.map((o) => o.value)).toEqual([...LEGACY_EXPENSE_KINDS]);
  });
});
