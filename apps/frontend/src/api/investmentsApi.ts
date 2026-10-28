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

/** §54.4 시세 — 서버가 네이버 금융을 대신 호출한다(브라우저 직접 호출은 CORS). */
export interface Quote {
  symbol: string;
  quoteSymbol: string;
  name: string;
  currency: string;
  price: number;
  priceAsOf: string | null;
}

/** 통화 1종의 환율. 지금은 USD/KRW 만 지원한다. */
export interface FxRate {
  currency: string;
  rate: number;
  priceAsOf: string | null;
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

/**
 * §54.4 로그인·화면 진입 시 현재가 일괄 갱신.
 * 서버가 네이버 시세를 조회해 보유종목의 market_price 를 갱신하고 포트폴리오를 돌려준다.
 * 시세가 없는 종목(코인·일부 채권)은 저장된 현재가를 그대로 둔다.
 */
export function refreshHoldingPrices(): Promise<Portfolio> {
  return dedupe("investments.refresh", () =>
    apiFetch<Portfolio>("/api/v1/investments/quotes/refresh", { method: "POST" }),
  );
}

/** 종목 1건 시세 — 종목 추가 폼의 "현재가 가져오기". 없으면 404 로 실패한다. */
export function fetchQuote(symbol: string): Promise<Quote> {
  return apiFetch<Quote>(`/api/v1/investments/quotes?symbol=${encodeURIComponent(symbol)}`);
}

export function fetchFxRate(currency = "USD"): Promise<FxRate> {
  return apiFetch<FxRate>(`/api/v1/investments/fx?currency=${encodeURIComponent(currency)}`);
}
