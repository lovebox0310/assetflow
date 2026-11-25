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

/**
 * 진단용 경로 1건 — 어느 엔드포인트(tr_id)를 불렀고 원본 JSON 또는 실패 사유가 무엇인지.
 * 응답이 null 이면 error 에 조회 사유가 들어 있다.
 */
export interface KisPathPreview {
  path: string | null;
  trId: string | null;
  response: unknown | null;
  error: string | null;
}

/** 동기화가 실제로 고른 경로 요약 — cash 가 null 이면 예수금을 읽지 못한 것이다(0 과 구분). */
export interface KisBalancePreview {
  path: string | null;
  cash: number | null;
  holdingCount: number;
  warning: string | null;
  error: string | null;
}

/**
 * 개인연금(22)/IRP(29) 연금 잔고 원본 진단 — KIS JSON 을 변환하지 않는다.
 * 세 경로(주식잔고·계좌자산현황·퇴직연금)를 각각 담고, usedPath 로 sync 가 쓸 경로를 알려 준다.
 * 조회 실패·자격증명 누락도 200 + error/warning 으로 내려온다(진단 목적).
 */
export interface KisPensionPreview {
  balance: unknown | null;
  warning: string | null;
  error: string | null;
  acntPrdtCd: string | null;
  isMock: boolean;
  stock: KisPathPreview | null;
  account: KisPathPreview | null;
  pension: KisPathPreview | null;
  usedPath: string | null;
  balancePreview: KisBalancePreview | null;
  /** 서버가 유량 제한·일시 장애 문구(`MCI전송 오류` 등)를 감지했는가. */
  transient?: boolean;
}

export function previewKisPension(accountId: number): Promise<KisPensionPreview> {
  return apiFetch<KisPensionPreview>(
    `/api/v1/investments/accounts/${accountId}/kis-pension-preview`,
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

/* ── 이슈 #55 토스증권 연동 (Stage 3 UI) ────────────────────────────────
 * 서버는 clientSecret 평문을 어떤 응답에도 담지 않는다(TossIntegrationController).
 * 그래서 아래 타입에는 secret 계열 필드가 없다 — 저장 후에는 마스킹조차 오지 않고
 * "설정됨/안 됨" 만 온다. 저장 API 는 두 키를 항상 다시 받는다(서버 계약). */

/** 토스 연동 상태. secret·clientId 는 내려오지 않는다. */
export interface TossStatus {
  configured: boolean;
  accountId: number | null;
  hasAccountSeq: boolean;
}

/** 토스 계좌 1건 — accountNo 는 서버가 마스킹한 값만 온다. */
export interface TossAccountView {
  accountSeq: number;
  accountNo: string;
  accountType: string;
}

/** 계좌 목록. 실패도 200 이므로 사유는 error 에 담긴다(성공이면 null). */
export interface TossAccountsResult {
  accounts: TossAccountView[];
  error: string | null;
}

/** 동기화 결과. warning 은 일부 값만 갱신했을 때(예: 환율 실패)의 사유다. */
export interface TossSyncResult {
  accountId: number;
  created: number;
  updated: number;
  skipped: number;
  warning: string | null;
}

export interface TossCredentialsInput {
  accountId?: number | null;
  clientId: string;
  clientSecret: string;
  /** 백엔드는 String 으로 받는다(Select·직접 입력 모두 문자열로 보낸다). */
  tossAccountSeq?: string | null;
}

export function getTossStatus(): Promise<TossStatus> {
  return apiFetch<TossStatus>("/api/v1/integrations/toss");
}

/** 서버는 두 키를 항상 새로 받는다(기존 키와 병합하지 않는다). */
export function saveTossCredentials(body: TossCredentialsInput): Promise<TossStatus> {
  return apiFetch<TossStatus>("/api/v1/integrations/toss", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function deleteTossCredentials(): Promise<TossStatus> {
  return apiFetch<TossStatus>("/api/v1/integrations/toss", { method: "DELETE" });
}

/** 저장된 키로 토스 API 를 한 번 호출한다. 실패는 502/503 ApiError 로 온다. */
export function testTossConnection(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/api/v1/integrations/toss/test", { method: "POST" });
}

/** 토스 계좌 목록(마스킹). 실패해도 200 이고 error 에 사유가 들어온다. */
export function listTossAccounts(): Promise<TossAccountsResult> {
  return apiFetch<TossAccountsResult>("/api/v1/integrations/toss/accounts");
}

/** 보유자산 원본 진단(읽기 전용). 실패도 200 + error. */
/** 투자 추이 스냅샷 한 점(#52) — 총액만 저장한다. */
export interface PortfolioSnapshot {
  takenOn: string;
  totalCost: number;
  totalValue: number;
  cash: number;
  source: string;
}

/** from~to (YYYY-MM-DD, 양끝 포함). 최대 731일. */
export function getPortfolioSnapshots(from: string, to: string): Promise<PortfolioSnapshot[]> {
  const q = new URLSearchParams({ from, to });
  return apiFetch<PortfolioSnapshot[]>(`/api/v1/investments/snapshots?${q.toString()}`);
}

/** 접속 시 자동 동기화(#58) — 대상 1건. */
export interface SyncDue {
  provider: "kis" | "toss" | "upbit";
  accountId: number | null;
  accountName: string | null;
  lastStatus: "ok" | "error" | "unknown";
  lastSyncedAt: string | null;
  stale: boolean;
}

export interface SyncStatus {
  due: number;
  providers: SyncDue[];
}

export interface SyncOutcome {
  provider: string;
  accountId: number | null;
  ok: boolean;
  error: string | null;
}

export interface SyncDueResult {
  due: number;
  outcomes: SyncOutcome[];
}

/** 지금 동기화해야 하는 계좌가 있는지. 0 이면 호출하지 않는다. */
export function getSyncStatus(): Promise<SyncStatus> {
  return apiFetch<SyncStatus>("/api/v1/investments/sync-status");
}

/** 오래된 계좌만 동기화한다(서버가 10분 stale 을 판정). */
export function syncDue(): Promise<SyncDueResult> {
  return apiFetch<SyncDueResult>("/api/v1/investments/sync-due", { method: "POST" });
}

/** 토큰 발급 진단(이슈 #55). 403 사유를 화면에서 볼 수 있게 상태·코드·본문을 돌려준다. */
export interface TossTokenDiagnosis {
  status: number;
  code: string | null;
  error: string | null;
  /** 토스 응답 본문(자격증명 문자열은 서버가 *** 로 지운다). 성공이면 null. */
  body: string | null;
}

export function diagnoseTossToken(): Promise<TossTokenDiagnosis> {
  return apiFetch<TossTokenDiagnosis>("/api/v1/integrations/toss/token-preview");
}

export function previewToss(
  accountId: number,
): Promise<{ holdings: unknown | null; warning: string | null; error: string | null }> {
  return apiFetch<{ holdings: unknown | null; warning: string | null; error: string | null }>(
    `/api/v1/accounts/${accountId}/toss-preview`,
    { method: "POST" },
  );
}

/**
 * 토스증권 보유자산을 연동 계좌로 동기화한다.
 * 빈 보유 목록은 "보유 0"일 뿐 삭제 신호가 아니다 — 서버도 기존 행을 지우지 않는다(§31.4).
 */
export function syncToss(): Promise<TossSyncResult> {
  return apiFetch<TossSyncResult>("/api/v1/investments/toss/sync", { method: "POST" });
}
