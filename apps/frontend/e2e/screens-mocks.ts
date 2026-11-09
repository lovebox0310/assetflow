import type { Page } from "@playwright/test";
import { mockDashboardApi } from "./dashboard-mocks";

/**
 * §80 a11y 화면 감사용 API 목.
 *
 * 화면별 실제 호출(브라우저 실측)을 그대로 채운다. 빈 배열을 주면 표·목록이
 * 렌더되지 않아 접근성 감사 대상이 사라지므로, 모든 목록은 가명 픽스처 행을 준다.
 *
 * 라우트 등록은 화면당 **한 번**이다. Playwright 는 나중에 등록한 핸들러를 먼저
 * 매칭하므로, 여기서는 핸들러 하나 안에서 pathname 으로 분기하고 마지막에
 * catch-all 404 를 둔다 — 이중 등록으로 응답이 가려질 여지를 만들지 않는다.
 * 대시보드는 기존 `mockDashboardApi` 를 그대로 재사용한다(같은 픽스처로 다른
 * 스펙과 화면이 일치해야 한다).
 */
export type ScreenKey =
  | "dashboard"
  | "assets"
  | "investments"
  | "expenses"
  | "expenseCards"
  | "settings";

const pad = (value: number) => String(value).padStart(2, "0");
const now = new Date();
const THIS_MONTH = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
const LAST_MONTH_DATE = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const LAST_MONTH = `${LAST_MONTH_DATE.getFullYear()}-${pad(LAST_MONTH_DATE.getMonth() + 1)}`;
const yearAgo = `${now.getFullYear() - 1}-01`;
const day = (dom: number, month = THIS_MONTH) => `${month}-${pad(dom)}`;
const stamp = (dom: number, month = THIS_MONTH) => `${day(dom, month)}T12:34:00`;

/* ── 자산 ───────────────────────────────────────────────────── */

const ACCOUNTS = [
  { id: 1, accountType: "cash", name: "파킹통장", institutionName: "우리은행", balance: 8_500_000, isDebt: false, openedAt: "2024-03-02" },
  { id: 2, accountType: "cash", name: "생활비 통장", institutionName: "신한은행", balance: 2_300_000, isDebt: false, openedAt: "2023-11-20" },
  { id: 3, accountType: "deposit", name: "정기예금", institutionName: "국민은행", balance: 30_000_000, isDebt: false, openedAt: "2025-01-05" },
  { id: 4, accountType: "invest", name: "주식 계좌", institutionName: "한국투자증권", balance: 1_200_000, isDebt: false, openedAt: "2024-08-14" },
  { id: 5, accountType: "realty", name: "전세 보증금", institutionName: "—", balance: 20_000_000, isDebt: false, openedAt: null },
  { id: 6, accountType: "cash", name: "주택담보대출", institutionName: "우리은행", balance: 120_000_000, isDebt: true, openedAt: "2022-06-01" },
];

const BANK_LINKS = [
  {
    accountId: 1,
    bankCode: "WR",
    bankLabel: "우리은행",
    accountNumberMasked: "1002-***-123456",
    accountType: "personal",
    lastSyncedAt: stamp(6),
    lastBalance: 8_500_000,
  },
  {
    accountId: 2,
    bankCode: "KB",
    bankLabel: "국민은행",
    accountNumberMasked: "0123-***-987654",
    accountType: "personal",
    lastSyncedAt: stamp(5),
    lastBalance: 2_300_000,
  },
];

const BANKS = [
  { code: "NH", label: "농협은행" },
  { code: "KB", label: "국민은행" },
  { code: "WR", label: "우리은행" },
  { code: "IBK", label: "기업은행" },
];

/* ── 투자 ───────────────────────────────────────────────────── */

const HOLDINGS = [
  { id: 1, accountId: 4, assetClass: "stock", symbol: "005930", name: "삼성전자", currency: "KRW", quantity: 120, avgPrice: 68_000, marketPrice: 75_000, fxRate: 1, priceAsOf: stamp(6) },
  { id: 2, accountId: 4, assetClass: "etf", symbol: "069500", name: "KODEX 200", currency: "KRW", quantity: 40, avgPrice: 32_000, marketPrice: 35_500, fxRate: 1, priceAsOf: stamp(6) },
  { id: 3, accountId: 4, assetClass: "stock", symbol: "AAPL", name: "애플", currency: "USD", quantity: 6, avgPrice: 180, marketPrice: 210, fxRate: 1_350, priceAsOf: stamp(5) },
  { id: 4, accountId: 4, assetClass: "fund", symbol: null, name: "글로벌 채권형 펀드", currency: "KRW", quantity: 1_000, avgPrice: 10_000, marketPrice: 10_400, fxRate: 1, priceAsOf: null },
];

const PORTFOLIO = {
  holdings: HOLDINGS,
  accounts: [
    {
      accountId: 4,
      accountName: "주식 계좌",
      institutionName: "한국투자증권",
      cashBalance: 1_200_000,
      holdingsValue: 16_411_000,
      totalValue: 17_611_000,
    },
  ],
  warning: null,
};

/* ── 지출 / 카드내역 ────────────────────────────────────────── */

const EXPENSE_ITEMS = [
  { id: 1, month: THIS_MONTH, label: "주말 장보기", amount: 120_000, isEssential: true, purchaseVat: 0, recurringId: 1, category: "식비" },
  { id: 2, month: THIS_MONTH, label: "전기요금", amount: 68_000, isEssential: true, purchaseVat: 0, recurringId: null, category: "주거/통신" },
  { id: 3, month: THIS_MONTH, label: "지하철 정기권", amount: 55_000, isEssential: true, purchaseVat: 0, recurringId: null, category: "교통/차량" },
  { id: 4, month: THIS_MONTH, label: "가족 외식", amount: 96_000, isEssential: false, purchaseVat: 0, recurringId: null, category: "식비" },
];

const RECURRING = [
  { id: 1, label: "월세", amount: 900_000, isEssential: true, purchaseVat: 0, startMonth: yearAgo, endMonth: null, category: "주거/통신" },
  { id: 2, label: "휴대폰 요금", amount: 55_000, isEssential: true, purchaseVat: 0, startMonth: yearAgo, endMonth: null, category: "주거/통신" },
];

const SNAPSHOT = {
  month: THIS_MONTH,
  totalAssets: 62_000_000,
  totalDebts: 120_000_000,
  income: 4_200_000,
  vatSetAside: 0,
  expenses: 1_940_000,
  essentialExpenses: 1_290_000,
  essentialComplete: true,
  balance: 2_260_000,
};

const CARD_ROWS = [
  { rowKey: "qa-row-1", approvedAt: day(2), merchantName: "한마음식당", supplyExVat: 27_273, vat: 2_727, grossAmount: 30_000, cardMasked: "1234-****-5678", expenseKind: "식비", subCategory: "외식", businessNo: "123-45-67890", businessCategory: "음식점", memberRelation: "본인", cardCompany: "현대카드" },
  { rowKey: "qa-row-2", approvedAt: day(3), merchantName: "동네마트", supplyExVat: 45_455, vat: 4_545, grossAmount: 50_000, cardMasked: "1234-****-5678", expenseKind: "식비", subCategory: "장보기", businessNo: "234-56-78901", businessCategory: "소매", memberRelation: "가족", cardCompany: "현대카드" },
  { rowKey: "qa-row-3", approvedAt: day(5), merchantName: "서울교통", supplyExVat: 1_273, vat: 127, grossAmount: 1_400, cardMasked: "9876-****-4321", expenseKind: "교통/차량", subCategory: "대중교통", businessNo: "345-67-89012", businessCategory: "운수", memberRelation: "본인", cardCompany: "삼성카드" },
  { rowKey: "qa-row-4", approvedAt: day(6), merchantName: "미분류상점", supplyExVat: 40_909, vat: 4_091, grossAmount: 45_000, cardMasked: "9876-****-4321", expenseKind: "", subCategory: "", businessNo: null, businessCategory: "편의점", memberRelation: "본인", cardCompany: "삼성카드" },
];

const STATEMENTS = [
  { id: 1, cardCompany: "현대카드", kind: "billing", usageMonth: THIS_MONTH, periodStart: `${LAST_MONTH}-15`, periodEnd: `${THIS_MONTH}-14`, totalAmount: 412_300 },
  { id: 2, cardCompany: "삼성카드", kind: "detail", usageMonth: THIS_MONTH, periodStart: `${LAST_MONTH}-01`, periodEnd: `${LAST_MONTH}-30`, totalAmount: 128_000 },
];

const UNCLASSIFIED = [
  { merchantName: "미분류상점", count: 2, grossTotal: 45_000, firstApprovedAt: day(6), lastApprovedAt: day(7), businessCategory: "편의점", businessNo: "987-65-43210" },
  { merchantName: "동네세탁", count: 1, grossTotal: 12_000, firstApprovedAt: day(4), lastApprovedAt: day(4), businessCategory: "세탁", businessNo: "876-54-32109" },
];

const CARD_EMAIL_SETTINGS = {
  id: 1,
  enabled: false,
  cardCompany: "hyundaicard",
  emailProvider: "gmail",
  emailAddress: "qa.user@example.com",
  lastImportStatus: "success",
};

/* ── 설정 ───────────────────────────────────────────────────── */

const SETTINGS = {
  id: 1,
  email: "qa.user@example.com",
  displayName: "김가명",
  targetMonths: 6,
  emergencyAccountIds: ["1", "2"],
  emergencyAvgMonths: 3,
  emergencyCategories: ["식비", "주거/통신", "교통/차량"],
};

/**
 * 화면 하나가 호출하는 API 를 모두 채운다.
 * 대시보드는 기존 목을 재사용하고, 나머지는 단일 핸들러에서 분기한다.
 */
export async function mockScreenApi(page: Page, screen: ScreenKey) {
  if (screen === "dashboard") {
    await mockDashboardApi(page);
    return;
  }

  await page.route(/\/api\/v1\/.*/, (route) => {
    const url = new URL(route.request().url());
    const { pathname } = url;
    const ok = (data: unknown) => route.fulfill({ json: { code: "OK", message: "ok", data } });

    if (pathname === "/api/v1/assets/accounts") return ok(ACCOUNTS);
    if (pathname === "/api/v1/assets/bank-links") return ok(BANK_LINKS);
    if (pathname === "/api/v1/assets/bank/banks") return ok(BANKS);
    if (pathname === "/api/v1/investments/holdings") return ok(PORTFOLIO);
    if (pathname === "/api/v1/investments/quotes/refresh") return ok(PORTFOLIO);

    if (pathname === "/api/v1/expenses/items") return ok(EXPENSE_ITEMS);
    if (pathname === "/api/v1/expenses/recurring") return ok(RECURRING);
    if (pathname === "/api/v1/expenses/snapshots") return ok(SNAPSHOT);

    if (pathname === "/api/v1/assets/card-imports") return ok(CARD_ROWS);
    if (pathname === "/api/v1/assets/card-imports/row-keys") return ok(CARD_ROWS.map((row) => row.rowKey));
    if (pathname === "/api/v1/assets/card-imports/statements") return ok(STATEMENTS);
    if (pathname === "/api/v1/assets/card-imports/unclassified") return ok(UNCLASSIFIED);
    if (pathname === "/api/v1/card-email-import-settings/hyundaicard") return ok(CARD_EMAIL_SETTINGS);
    if (pathname === "/api/v1/card-email-import-settings/samsungcard") {
      return ok({ ...CARD_EMAIL_SETTINGS, id: 2, cardCompany: "samsungcard" });
    }

    if (pathname === "/api/v1/settings") return ok(SETTINGS);

    // catch-all — 위에서 처리하지 않은 호출만 남는다.
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: `not mocked: ${route.request().method()} ${pathname}`, data: null },
    });
  });
}
