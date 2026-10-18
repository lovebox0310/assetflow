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
