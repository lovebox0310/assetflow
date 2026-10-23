import { apiFetch, dedupe } from "./client";

/**
 * §54 투자 보유종목 API. 평가액·손익·총액은 서버가 계산해 내려주지만(§54.3),
 * 화면은 같은 정의를 다시 계산해 표시한다 — 저장된 합계가 없으므로 어긋날 수 없다.
 */
export type AssetClass = "stock" | "etf" | "bond" | "fund" | "crypto";

export interface HoldingRow {
  id: number;
  accountId: number;
  assetClass: AssetClass;
  symbol: string | null;
  name: string;
  currency: string;
  quantity: number;
  avgPrice: number;
  marketPrice: number;
  fxRate: number;
  priceAsOf: string | null;
}

export interface InvestmentAccountValue {
  accountId: number;
  accountName: string;
  institutionName: string;
  cashBalance: number;
  holdingsValue: number;
  totalValue: number;
}

export interface Portfolio {
  holdings: HoldingRow[];
  accounts: InvestmentAccountValue[];
}

export interface HoldingPayload {
  accountId: number;
  assetClass: AssetClass;
  symbol?: string | null;
  name: string;
  currency: string;
  quantity: number;
  avgPrice: number;
  marketPrice: number;
  fxRate: number;
  priceAsOf?: string | null;
}

export function getPortfolio(): Promise<Portfolio> {
  return dedupe("investments.portfolio", () =>
    apiFetch<Portfolio>("/api/v1/investments/holdings"),
  );
}

export function createHolding(payload: HoldingPayload): Promise<HoldingRow> {
  return apiFetch<HoldingRow>("/api/v1/investments/holdings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateHolding(id: number, payload: HoldingPayload): Promise<HoldingRow> {
  return apiFetch<HoldingRow>(`/api/v1/investments/holdings/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteHolding(id: number): Promise<number> {
  return apiFetch<number>(`/api/v1/investments/holdings/${id}`, { method: "DELETE" });
}
