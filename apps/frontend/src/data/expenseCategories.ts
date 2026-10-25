/**
 * §55.8 기본 지출 카테고리.
 * 백엔드 `CategorySeedData` 와 같은 목록을 유지한다 — 한쪽만 바꾸면 자동 분류 결과가
 * 화면에서 "미분류"로 보이므로 함께 수정한다.
 */
export const EXPENSE_CATEGORIES = [
  "식비",
  "교통비",
  "보험료",
  "경조사비",
  "주거비",
  "통신비",
  "쇼핑",
  "미용",
  "의류",
  "의료비",
  "여가/취미",
  "교육비",
  "기타",
] as const;

/** §49 legacy 용도구분 — 기존 저장 값 호환용. */
export const LEGACY_EXPENSE_KINDS = ["사업비용", "개인지출", "자산취득"] as const;

/** 카드 내역 미리보기의 카테고리 선택지. */
export const EXPENSE_CATEGORY_OPTIONS = [
  { label: "지출 카테고리", options: EXPENSE_CATEGORIES.map((name) => ({ value: name, label: name })) },
  { label: "기존 구분", options: LEGACY_EXPENSE_KINDS.map((name) => ({ value: name, label: name })) },
];
