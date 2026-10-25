import { apiFetch } from "./client";

/** §41 — 확정 반영 요청의 행. 파서 산출물에서 필요 필드만 옮긴다. */
export interface CardImportRow {
  rowKey: string;
  approvedAt: string;
  merchantName: string;
  supplyExVat: number;
  vat: number;
  grossAmount: number;
  cardMasked?: string;
  expenseKind?: string;
}

export interface CardImportResult {
  stored: number;
  received: number;
  totalRows: number;
  duplicatesInBatch: number;
  knownRowKeys: number;
  totals: { gross: number; vat: number; supplyExVat: number };
  supplyInconsistentRows: number;
}

/** 미리보기에서 이미 임포트된 행을 걸러 보여 주기 위한 키 목록. */
export function getImportedRowKeys(): Promise<string[]> {
  return apiFetch<string[]>("/api/v1/assets/card-imports/row-keys");
}

/** §49: 저장된 가맹점 용도구분 규칙을 조회한다. 미리보기 자동 분류용. */
export function getMerchantRules(merchants?: string[]): Promise<Record<string, string>> {
  const query = merchants && merchants.length > 0
      ? "?" + new URLSearchParams(merchants.map((m) => ["merchant", m])).toString()
      : "";
  return apiFetch<Record<string, string>>(`/api/v1/assets/card-imports/merchant-rules${query}`);
}

/** §29.2: 확정 시 서버가 재검증하고 저장한다. 요청에는 합계를 싣지 않는다(§29.7). */
export function submitCardImports(
  rows: CardImportRow[],
  merchantRules: Record<string, string>,
): Promise<CardImportResult> {
  return apiFetch<CardImportResult>("/api/v1/assets/card-imports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows, merchantRules }),
  });
}

export interface ReclassifyResult {
  total: number;
  updated: number;
}

/** §55.8: 저장된 기존 카드 내역을 가맹점 규칙·키워드로 일괄 재분류한다. */
export function reclassifyCardImports(): Promise<ReclassifyResult> {
  return apiFetch<ReclassifyResult>("/api/v1/assets/card-imports/reclassify", {
    method: "POST",
  });
}

export interface CategoryUpdateResult {
  rowKey: string;
  merchantName: string;
  category: string;
  updatedRows: number;
}

export interface UnclassifiedGroup {
  merchantName: string;
  count: number;
  grossTotal: number;
  firstApprovedAt: string;
  lastApprovedAt: string;
}

export interface MerchantCategoryResult {
  merchantName: string;
  category: string;
  updatedRows: number;
}

/** §55.8 미분류 작업함 — 가맹점 단위 묶음. 금액 큰 순으로 내려온다. */
export function listUnclassifiedGroups(): Promise<UnclassifiedGroup[]> {
  return apiFetch<UnclassifiedGroup[]>("/api/v1/assets/card-imports/unclassified");
}

/**
 * §55.8: 가맹점 하나의 모든 카드 행을 한 카테고리로 바꾼다.
 * category 를 빈 문자열로 보내면 미분류로 되돌리고 저장된 규칙도 지운다(되돌리기).
 */
export function assignMerchantCategory(
  merchantName: string,
  category: string,
): Promise<MerchantCategoryResult> {
  return apiFetch<MerchantCategoryResult>("/api/v1/assets/card-imports/merchant-category", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merchantName, category }),
  });
}

/**
 * §55.8: 한 카드 행의 카테고리를 직접 바꾼다.
 * 같은 가맹점 행 전체와 향후 임포트 규칙(merchant_rules)에 함께 반영된다.
 */
export function updateCardImportCategory(rowKey: string, category: string): Promise<CategoryUpdateResult> {
  return apiFetch<CategoryUpdateResult>("/api/v1/assets/card-imports/category", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rowKey, category }),
  });
}
