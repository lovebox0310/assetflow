/**
 * §55.10 지출 카테고리 기준.
 * 백엔드 `CategoryTaxonomy` 와 같은 9개 대분류/세부를 유지한다 — 한쪽만 바꾸면
 * 자동 분류 결과를 화면에서 고를 수 없게 된다.
 */

export type CategoryGroup = typeof CATEGORY_GROUPS[number];

export const CATEGORY_GROUPS = [
  "식비",
  "주거/통신",
  "교통/차량",
  "쇼핑/생활",
  "건강/의료",
  "문화/여가",
  "금융/세금",
  "기타/경조사",
  "교육",
] as const;

export const CATEGORY_SUBS: Record<CategoryGroup, string[]> = {
  식비: ["장보기", "외식", "카페/간식", "배달"],
  "주거/통신": ["주거비", "통신비"],
  "교통/차량": ["대중교통", "차량유지비"],
  "쇼핑/생활": ["생활용품", "의류/잡화", "가전/가구", "미용/뷰티"],
  "건강/의료": ["병원비", "약국", "건강기능식품"],
  "문화/여가": ["취미/여가", "여행/숙박"],
  "금융/세금": ["보험료", "세금/공과금", "저축/투자"],
  "기타/경조사": ["경조사비", "기타"],
  교육: ["학원/교육", "학교/등록금"],
};

/** 매달 반복되고 금액이 예측되는 세부 분류. 장보기는 변동비로 본다. */
export const FIXED_SUB_CATEGORIES = new Set([
  "주거비",
  "통신비",
  "보험료",
  "세금/공과금",
  "학원/교육",
]);

/** 지출이 아니라 자산 이동 — 지출 합계에서 제외한다. */
export const ASSET_TRANSFER_SUB_CATEGORY = "저축/투자";

export function isFixedSubCategory(subCategory: string | undefined): boolean {
  return subCategory != null && subCategory !== "" && FIXED_SUB_CATEGORIES.has(subCategory);
}

export function isAssetTransferSubCategory(subCategory: string | undefined): boolean {
  return subCategory === ASSET_TRANSFER_SUB_CATEGORY;
}

export function isUnclassified(category: string | undefined): boolean {
  return category == null || category === "" || category === "unclassified";
}

/** 대분류 선택지(antd Select options). */
export const CATEGORY_GROUP_OPTIONS = CATEGORY_GROUPS.map((name) => ({
  value: name,
  label: name,
}));

/** 대분류별 세부 선택지(antd Select option group). */
export function subCategoryOptions(group: string | undefined) {
  if (group == null || !(group in CATEGORY_SUBS)) return [];
  return CATEGORY_SUBS[group as CategoryGroup].map((name) => ({ value: name, label: name }));
}

// --- Legacy compatibility: old flat category names used before §55.10 ---

/** §55.10 이전의 13종 단일 카테고리(마이그레이션/표시 호환용). */
export const LEGACY_EXPENSE_KINDS = [
  "사업비용",
  "개인지출",
  "자산취득",
] as const;

/** 카드 내역 미리보기의 카테고리 선택지 — 더 이상 legacy 는 노출하지 않는다. */
export const EXPENSE_CATEGORY_OPTIONS = CATEGORY_GROUP_OPTIONS.map((o) => ({ ...o }));
