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
  /** 채권 발행일/만기일(YYYY-MM-DD). 다른 자산군은 null. */
  issueDate?: string | null;
  maturityDate?: string | null;
  /** 채권 발행기관·표면이율(%). 다른 자산군은 null. */
  issuerName?: string | null;
  couponRate?: number | null;
  /** 채권 액면(원). 다른 자산군·미입력은 null. */
  faceAmount?: number | null;
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
  /** KIS 동기화가 예수금을 못 읽었을 때만 내려오는 경고. 일반 조회에는 없다. */
  warning?: string | null;
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
  /** 채권 발행일/만기일(YYYY-MM-DD). bond 가 아니면 무시된다. */
  issueDate?: string | null;
  maturityDate?: string | null;
  /** 채권 발행기관·표면이율(%). bond 가 아니면 무시된다. */
  issuerName?: string | null;
  couponRate?: number | null;
  /** 채권 액면(원). bond 가 아니면 무시된다. */
  faceAmount?: number | null;
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
 * 시세가 없는 종목(일부 채권)은 저장된 현재가를 그대로 둔다. 코인은 업비트 공개
 * 시세로 별도 갱신한다(UPBIT-1).
 */
export function refreshHoldingPrices(): Promise<Portfolio> {
  return dedupe("investments.refresh", () =>
    apiFetch<Portfolio>("/api/v1/investments/quotes/refresh", { method: "POST" }),
  );
}

/** UPBIT-2 업비트 연동 상태. accessKeyMasked 만 노출되고 secret 은 내려오지 않는다. */
export interface UpbitStatus {
  configured: boolean;
  accessKeyMasked: string | null;
}

export interface UpbitKeysInput {
  accessKey: string;
  secretKey: string;
}

export interface UpbitTestResult {
  ok: boolean;
  accounts: number;
}

export interface UpbitSyncResult {
  portfolio: Portfolio;
  accountId: number;
  created: number;
  updated: number;
  skipped: number;
}

export function getUpbitStatus(): Promise<UpbitStatus> {
  return apiFetch<UpbitStatus>("/api/v1/integrations/upbit");
}

export function saveUpbitKeys(input: UpbitKeysInput): Promise<UpbitStatus> {
  return apiFetch<UpbitStatus>("/api/v1/integrations/upbit", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteUpbitKeys(): Promise<UpbitStatus> {
  return apiFetch<UpbitStatus>("/api/v1/integrations/upbit", { method: "DELETE" });
}

/** 저장된 키로 실제 /v1/accounts 를 호출해 본다. 실패는 502/503 ApiError. */
export function testUpbit(): Promise<UpbitTestResult> {
  return apiFetch<UpbitTestResult>("/api/v1/integrations/upbit/test", { method: "POST" });
}

/** 업비트 보유 코인을 '업비트' 계좌로 동기화한다. */
export function syncUpbit(): Promise<UpbitSyncResult> {
  return apiFetch<UpbitSyncResult>("/api/v1/investments/upbit/sync", { method: "POST" });
}

/** KIS-BOND-2 진단용 채권 원본 — 변환하지 않은 KIS JSON. */
export interface KisBondPricePreview {
  pdno: string;
  price: unknown | null;
  error: string | null;
}

export interface KisBondPreview {
  balance: unknown | null;
  prices: KisBondPricePreview[];
  error: string | null;
  /** TTTC2202R(퇴직연금 체결기준잔고) 원본 — 보험·국민주택·국고채 포함 여부 진단용. */
  pensionPresent?: unknown | null;
}

export function previewKisBonds(accountId: number): Promise<KisBondPreview> {
  return apiFetch<KisBondPreview>(
    `/api/v1/investments/accounts/${accountId}/kis-bond-preview`,
    { method: "POST" },
  );
}

/** BOND-SEARCH-1 채권 마스터 종목. */
export interface BondItem {
  code: string;
  name: string;
  issueDate: string | null;
  maturityDate: string | null;
  bondType: string;
  bondClass: string;
}

export interface BondSearchResult {
  items: BondItem[];
  warning: string | null;
}

/** 이름/코드 부분일치 검색. 다운로드 실패도 200 + 빈 목록 + warning 이다. */
export function searchBonds(q: string, limit = 20): Promise<BondSearchResult> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return apiFetch<BondSearchResult>(`/api/v1/investments/bonds?${params.toString()}`);
}

/** BOND-INFO-1 KIS 발행정보 (실패도 200 + error). */
export interface BondIssueInfo {
  issuerName: string | null;
  couponRate: number | null;
  issueDate: string | null;
  maturityDate: string | null;
  bondClass: string | null;
  creditRating: string | null;
  error: string | null;
}

export function fetchBondIssueInfo(accountId: number, pdno: string): Promise<BondIssueInfo> {
  const params = new URLSearchParams({ pdno });
  return apiFetch<BondIssueInfo>(
    `/api/v1/investments/accounts/${accountId}/bond-issue-info?${params.toString()}`,
  );
}

/** BOND-VALUE-1 KIS 평가단가 조회 결과 (실패도 200 + error). */
export interface BondValuation {
  pdno: string | null;
  name: string | null;
  asOf: string | null;
  unitPrice: number | null;
  evaluated: number;
  avgYieldRate: number | null;
  kisUnitPrice: number | null;
  kbpUnitPrice: number | null;
  niceUnitPrice: number | null;
  fnpUnitPrice: number | null;
  error: string | null;
}

export function fetchBondValuation(
  accountId: number,
  pdno: string,
  face: number,
): Promise<BondValuation> {
  const params = new URLSearchParams({ pdno, face: String(face) });
  return apiFetch<BondValuation>(
    `/api/v1/investments/accounts/${accountId}/bond-valuation?${params.toString()}`,
  );
}

/** 종목 1건 시세 — 종목 추가 폼의 "현재가 가져오기". 없으면 404 로 실패한다. */
export function fetchQuote(symbol: string): Promise<Quote> {
  return apiFetch<Quote>(`/api/v1/investments/quotes?symbol=${encodeURIComponent(symbol)}`);
}

export function fetchFxRate(currency = "USD"): Promise<FxRate> {
  return apiFetch<FxRate>(`/api/v1/investments/fx?currency=${encodeURIComponent(currency)}`);
}

/** §62.1 계좌명으로 등록된 KIS 계좌번호(CANO/상품코드) 매핑. */
export interface KisAccountMapping {
  cano: string;
  acntPrdtCd: string;
}

/** §62.2 계좌별 KIS API 자격증명. */
export interface KisCredentials {
  accountId: number;
  appKey: string;
  appSecret: string;
  baseUrl: string;
  cano: string;
  acntPrdtCd: string;
}

export function getKisMapping(accountName: string): Promise<KisAccountMapping> {
  return apiFetch<KisAccountMapping>(
    `/api/v1/investments/holdings/kis-mapping/${encodeURIComponent(accountName)}`,
  );
}

export function getKisCredentials(accountId: number): Promise<KisCredentials> {
  return apiFetch<KisCredentials>(`/api/v1/investments/accounts/${accountId}/kis-credentials`);
}

export function saveKisCredentials(
  accountId: number,
  credentials: Omit<KisCredentials, "accountId">,
): Promise<KisCredentials> {
  return apiFetch<KisCredentials>(`/api/v1/investments/accounts/${accountId}/kis-credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
}

export function deleteKisCredentials(accountId: number): Promise<void> {
  return apiFetch<void>(`/api/v1/investments/accounts/${accountId}/kis-credentials`, {
    method: "DELETE",
  });
}

/** §69 연결 테스트 결과. ok=false 여도 사유를 보여 주기 위해 200 으로 내려온다. */
export interface KisConnectionTest {
  ok: boolean;
  cash: number | null;
  message: string;
}

export function testKisCredentials(accountId: number): Promise<KisConnectionTest> {
  return apiFetch<KisConnectionTest>(
    `/api/v1/investments/accounts/${accountId}/kis-credentials/test`,
    { method: "POST" },
  );
}

/**
 * §62 한국투자증권 국내주식 잔고를 가져와 보유종목을 동기화한다.
 * KIS 자격증명은 서버 DB에서 계좌별로 조회한다.
 */
export function syncKisBalance(accountId: number): Promise<Portfolio> {
  return apiFetch<Portfolio>("/api/v1/investments/holdings/sync-kis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId }),
  });
}

/**
 * §62 한국투자증권 동기화를 해제한다.
 * 해당 계좌의 모든 보유종목을 삭제하고 예수금을 0으로 초기화한다.
 */
export function clearKisBalance(accountId: number): Promise<Portfolio> {
  return apiFetch<Portfolio>("/api/v1/investments/holdings/clear-kis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId }),
  });
}
