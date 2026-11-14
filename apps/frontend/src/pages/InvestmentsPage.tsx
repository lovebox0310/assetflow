import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Typography,
  type FormInstance,
  type MenuProps,
} from "antd";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AppLayout } from "../layout/AppLayout";
import { StandardNav } from "../layout/StandardNav";
import { StateBlock, type SurfaceStatus } from "../components/StateBlock";
import { SubNav } from "../components/SubNav";
import { AfListTable, type AfListColumn, type AfRowAction } from "../components/AfListTable";
import { KisCredentialsModal } from "../components/KisCredentialsModal";
import { KisBondPreviewModal } from "../components/KisBondPreviewModal";
import { UpbitCredentialsModal } from "../components/UpbitCredentialsModal";
import {
  clearKisBalance,
  createHolding,
  deleteHolding,
  fetchFxRate,
  fetchQuote,
  getPortfolio,
  getUpbitStatus,
  refreshHoldingPrices,
  syncKisBalance,
  syncUpbit,
  updateHolding,
  type AssetClass,
  type HoldingPayload,
  type HoldingRow,
  type InvestmentAccountValue,
  type Portfolio,
} from "../api/investmentsApi";
import { deleteAccount, updateAccount, type UpsertPayload } from "../api/assetsApi";
import { ApiError, clearInflight } from "../api/client";
import { clearToken } from "../auth/authStore";
import { formatKrwExact, formatPercent, formatSignedKrw } from "../utils/formatters";

interface InvestmentsPageProps {
  onOpenDashboard?: () => void;
  onOpenAssets?: () => void;
  onOpenExpenses?: () => void;
  onOpenSettings?: () => void;
}

/**
 * §25 실패 응답의 실제 사유는 ErrorResponse.details 에 들어온다.
 * ApiError.detail 을 먼저 보여 줘야 KIS·은행이 준 원인 문구가 일반 문구에 묻히지 않는다.
 */
function describeError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.detail ?? e.message;
  return e instanceof Error ? e.message : fallback;
}

/** §54.2 자산군 표기. 서버 enum 과 1:1. */
const CLASS_LABELS: Record<AssetClass, string> = {
  stock: "주식",
  etf: "ETF",
  bond: "채권",
  fund: "펀드",
  crypto: "코인",
};

const CLASS_ORDER: AssetClass[] = ["stock", "etf", "bond", "fund", "crypto"];

/**
 * §54.4 통화 선택지 — 지금은 원화·미국달러 2가지만. 환율 입력란은 USD 일 때만
 * 노출한다(원화 종목의 환율은 항상 1이라 사용자가 채울 이유가 없다).
 */
const CURRENCIES = [
  { value: "KRW", label: "원화 (KRW)" },
  { value: "USD", label: "미국달러 (USD)" },
] as const;

const CLASS_COLORS: Record<AssetClass, string> = {
  stock: "var(--af-signal)",
  etf: "var(--af-grove)",
  bond: "var(--af-slate)",
  fund: "var(--af-neutral)",
  crypto: "#b06ab3",
};

const won = (v: number) => Math.round(v);

/**
 * §54.3: 투자 계좌의 `balance` 는 총액이 아니라 **예수금**이다. 그래서 계좌 편집
 * 폼의 잔액 칸도 "예수금"이다 — 총액은 서버가 예수금 + Σ평가액으로 계산한다.
 */
interface AccountFormValues {
  name: string;
  institutionName: string;
  cashBalance: number;
}

/** §54.4: 원금 = 수량 × 평단가 × 환율. 반올림은 합계에서 1회. */
function costOf(h: HoldingRow): number {
  return h.quantity * h.avgPrice * h.fxRate;
}

/** §54.4: 평가액 = 수량 × 현재가 × 환율. */
function valueOf(h: HoldingRow): number {
  return h.quantity * h.marketPrice * h.fxRate;
}

/**
 * 채권 폼 전용 값 — 사용자는 평가금액/매수금액을 입력하고, 저장 시 수량으로 나눠
 * marketPrice/avgPrice 로 환산한다. 다른 자산군은 이 두 필드를 쓰지 않는다.
 */
type HoldingFormValues = Omit<HoldingPayload, "issueDate" | "maturityDate"> & {
  issueDate?: string | null | undefined;
  maturityDate?: string | null | undefined;
  bondEvaluatedAmount?: number | undefined;
  bondPurchaseAmount?: number | undefined;
};

function returnText(cost: number, value: number): string {
  // 원금 0은 "본전(0%)"이 아니라 계산 불가다 (§54.4).
  if (cost <= 0) return "—";
  return formatPercent(((value - cost) / cost) * 100);
}

/** 단가 표기: 원화는 원 단위, 외화는 통화 코드를 붙인다 (USD 150.5). */
function priceText(value: number, currency: string): string {
  if (currency === "KRW") return formatKrwExact(won(value));
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 4 })} ${currency}`;
}

/**
 * Sprint 5 E2 — §54 투자 포트폴리오 화면.
 * - 총액 = 예수금 + Σ평가액 (§54.3). 저장하지 않고 서버·화면이 같은 정의로 계산한다.
 * - 전역 nav 는 "자산"을 현재 항목으로 유지한다(투자는 자산의 하위 화면, §54.1).
 */
export function InvestmentsPage({
  onOpenDashboard,
  onOpenAssets,
  onOpenExpenses,
  onOpenSettings,
}: InvestmentsPageProps) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [status, setStatus] = useState<SurfaceStatus>("loading");
  const [errorText, setErrorText] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionWarning, setActionWarning] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  // UPBIT-3 업비트 연동: 설정 여부(null=아직 모름)와 모달/동기화 상태.
  const [upbitOpen, setUpbitOpen] = useState(false);
  const [upbitSyncing, setUpbitSyncing] = useState(false);
  const [upbitConfigured, setUpbitConfigured] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<AssetClass | "all">("all");
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [priceMode, setPriceMode] = useState(false);
  const [priceDrafts, setPriceDrafts] = useState<Record<number, number>>({});
  const [savingPrices, setSavingPrices] = useState(false);
  /** §54.4 시세: 자동 갱신은 조용히, 수동 새로고침·시세 가져오기는 실패를 화면에 알린다. */
  const [refreshingQuotes, setRefreshingQuotes] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [form] = Form.useForm<HoldingFormValues>();
  /** §54.3: 계좌(예수금·이름·기관) 편집 상태. 종목 편집과 동시에 열지 않는다. */
  const [accountEditId, setAccountEditId] = useState<number | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountForm] = Form.useForm<AccountFormValues>();
  /** §62 한국투자증권 잔고 동기화 상태. */
  const [kisSyncingAccountId, setKisSyncingAccountId] = useState<number | null>(null);
  const [kisCredentialsAccount, setKisCredentialsAccount] = useState<{ id: number; name: string } | null>(null);
  /** KIS-BOND-2 읽기 전용 채권 원본 진단 모달. */
  const [bondPreviewAccount, setBondPreviewAccount] = useState<{ id: number; name: string } | null>(null);
  /** 계좌 헤더의 `⋯` 메뉴는 한 번에 하나만 열린다 — aria-expanded 도 이 값으로 동기화한다. */
  const [openAccountMenu, setOpenAccountMenu] = useState<number | null>(null);
  /**
   * 확인이 필요한 계좌 동작(Popconfirm)의 대상. 메뉴 항목을 누르면 메뉴가 닫히며
   * 그 안의 앵커가 사라지므로, 헤더에 1×1 앵커를 따로 두고 `open` 을 제어한다
   * (AfListTable 의 confirmTarget 과 같은 방식).
   */
  const [accountConfirm, setAccountConfirm] = useState<{
    accountId: number;
    action: "clear" | "delete";
  } | null>(null);
  const mountedRef = useRef(false);

  const load = useCallback(async () => {
    clearInflight();
    setStatus("loading");
    setErrorText("");
    try {
      const data = await getPortfolio();
      setPortfolio(data);
      setStatus(data.holdings.length === 0 && data.accounts.length === 0 ? "empty" : "ready");
    } catch (e) {
      setStatus("error");
      setErrorText(describeError(e, "불러오지 못했습니다"));
    }
  }, []);

  /**
   * §54.4: 로그인·화면 진입 시 네이버 시세로 현재가를 갱신한다. 시세가 없는
   * 종목은 서버가 건너뛰므로 저장된 현재가가 유지된다. 자동 갱신은 조용히
   * 실패하고(입력값을 방해하지 않는다), 수동 새로고침만 오류를 보여 준다.
   */
  const refreshPrices = useCallback(async (silent = false) => {
    if (!silent) {
      setRefreshingQuotes(true);
      setActionError("");
    }
    try {
      const data = await refreshHoldingPrices();
      setPortfolio(data);
      setStatus(data.holdings.length === 0 && data.accounts.length === 0 ? "empty" : "ready");
    } catch (e) {
      if (!silent) setActionError(describeError(e, "시세를 가져오지 못했습니다"));
    } finally {
      if (!silent) setRefreshingQuotes(false);
    }
  }, []);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    void load().then(() => refreshPrices(true));
  }, [load, refreshPrices]);

  // 업비트 설정 여부는 화면을 막지 않는다 — 실패해도 '미설정'으로 두고 조용히 넘어간다.
  useEffect(() => {
    let cancelled = false;
    getUpbitStatus()
      .then((status) => {
        if (!cancelled) setUpbitConfigured(status.configured);
      })
      .catch(() => {
        if (!cancelled) setUpbitConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpbitSync = async () => {
    if (upbitConfigured === false) {
      setActionError("업비트 연동을 먼저 설정해 주세요.");
      setUpbitOpen(true);
      return;
    }
    setUpbitSyncing(true);
    setActionError("");
    setActionMessage("");
    try {
      const result = await syncUpbit();
      setPortfolio(result.portfolio);
      setStatus(result.portfolio.holdings.length === 0 && result.portfolio.accounts.length === 0
        ? "empty"
        : "ready");
      setUpbitConfigured(true);
      setActionMessage(
        `업비트에서 가져왔습니다 — 새로 ${result.created}개, 갱신 ${result.updated}개` +
          (result.skipped ? `, 건너뜀 ${result.skipped}개` : ""),
      );
    } catch (e) {
      setActionError(describeError(e, "업비트 잔고를 가져오지 못했습니다"));
    } finally {
      setUpbitSyncing(false);
    }
  };

  const holdings = portfolio?.holdings ?? [];
  const accounts = portfolio?.accounts ?? [];
  /** '업비트' 계좌가 생기면 상단 부트스트랩 버튼 대신 계좌 ⋯ 메뉴로 진입한다(KIS 와 동일). */
  const hasUpbitAccount = accounts.some(
    (account) => account.institutionName === "업비트" || account.accountName === "업비트",
  );

  const visible = filter === "all" ? holdings : holdings.filter((h) => h.assetClass === filter);

  const totals = useMemo(() => {
    const cost = won(holdings.reduce((acc, h) => acc + costOf(h), 0));
    const value = won(holdings.reduce((acc, h) => acc + valueOf(h), 0));
    const cash = accounts.reduce((acc, a) => acc + a.cashBalance, 0);
    return { cost, value, cash, pnl: value - cost, rate: cost > 0 ? ((value - cost) / cost) * 100 : null };
  }, [holdings, accounts]);

  const slices = useMemo(
    () =>
      CLASS_ORDER.map((cls) => {
        const value = won(
          holdings.filter((h) => h.assetClass === cls).reduce((acc, h) => acc + valueOf(h), 0),
        );
        return { cls, label: CLASS_LABELS[cls], value };
      }).filter((s) => s.value > 0),
    [holdings],
  );
  const sliceTotal = slices.reduce((acc, s) => acc + s.value, 0);

  const asOf = holdings
    .map((h) => h.priceAsOf)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);

  const beginCreate = () => {
    setActionError("");
    setAccountEditId(null);
    form.resetFields();
    setEditingId("new");
    const first = accounts[0];
    // §54.4: 수량·평단가·현재가·환율은 비워 둔다. 0 을 미리 채우면 붙여넣기가
    // 기존 값 뒤에 이어 붙어(예: "0" + "100") 사용자가 먼저 지워야 한다.
    form.setFieldsValue({
      ...(first ? { accountId: first.accountId } : {}),
      assetClass: "stock",
      symbol: "",
      name: "",
      currency: "KRW",
      priceAsOf: new Date().toISOString().slice(0, 10),
      issueDate: undefined,
      maturityDate: undefined,
      bondEvaluatedAmount: undefined,
      bondPurchaseAmount: undefined,
    });
  };

  const beginEdit = (row: HoldingRow) => {
    setActionError("");
    setAccountEditId(null);
    setEditingId(row.id);
    form.setFieldsValue({
      accountId: row.accountId,
      assetClass: row.assetClass,
      symbol: row.symbol ?? "",
      name: row.name,
      currency: row.currency,
      quantity: row.quantity,
      avgPrice: row.avgPrice,
      marketPrice: row.marketPrice,
      fxRate: row.fxRate,
      priceAsOf: row.priceAsOf ?? "",
      issueDate: row.issueDate ?? undefined,
      maturityDate: row.maturityDate ?? undefined,
      // 채권은 금액 입력으로 보여 준다 — 수량 × 저장 단가.
      bondEvaluatedAmount: row.assetClass === "bond" ? row.quantity * row.marketPrice : undefined,
      bondPurchaseAmount: row.assetClass === "bond" ? row.quantity * row.avgPrice : undefined,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    form.resetFields();
  };

  /**
   * §54.4 E4: 현재가는 자주 바뀌고 원금·수량은 거의 안 바뀐다. 표에서 현재가만
   * 고쳐 한 번에 저장한다 — 종목마다 편집 폼을 여는 왕복을 줄인다.
   * 저장 시 기준일을 오늘로 둔다(시세 API 가 없으므로 수동 갱신 시점이 기준).
   */
  const beginPriceMode = () => {
    setActionError("");
    setAccountEditId(null);
    setPriceDrafts(Object.fromEntries(holdings.map((h) => [h.id, h.marketPrice])));
    setPriceMode(true);
  };

  const cancelPriceMode = () => {
    setPriceMode(false);
    setPriceDrafts({});
  };

  const savePrices = async () => {
    const changed = holdings.filter(
      (h) => priceDrafts[h.id] !== undefined && priceDrafts[h.id] !== h.marketPrice,
    );
    if (changed.length === 0) {
      cancelPriceMode();
      return;
    }
    setSavingPrices(true);
    setActionError("");
    const today = new Date().toISOString().slice(0, 10);
    try {
      await Promise.all(
        changed.map((h) =>
          updateHolding(h.id, {
            accountId: h.accountId,
            assetClass: h.assetClass,
            symbol: h.symbol,
            name: h.name,
            currency: h.currency,
            quantity: h.quantity,
            avgPrice: h.avgPrice,
            marketPrice: priceDrafts[h.id] ?? h.marketPrice,
            fxRate: h.fxRate,
            priceAsOf: today,
            // 채권 날짜는 가격 갱신에서 건드리지 않는다.
            issueDate: h.issueDate ?? null,
            maturityDate: h.maturityDate ?? null,
          }),
        ),
      );
      cancelPriceMode();
      load();
    } catch (e) {
      setActionError(describeError(e, "가격을 저장하지 못했습니다"));
    } finally {
      setSavingPrices(false);
    }
  };

  const save = async () => {
    let values: HoldingFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return; // 폼 검증 실패 — 필드 오류가 화면에 남는다
    }
    setBusy(true);
    setActionError("");
    const symbol = values.symbol?.trim() ? values.symbol.trim() : null;
    const round4 = (value: number) => Math.round(value * 10000) / 10000;

    let payload: HoldingPayload;
    if (values.assetClass === "bond") {
      // BOND-FORM-1: 사용자는 평가금액/매수금액을 입력하고, 저장 단가는 수량으로 나눠 환산한다.
      const quantity = Number(values.quantity);
      const evaluated = Number(values.bondEvaluatedAmount);
      if (!Number.isFinite(quantity) || quantity <= 0
          || !Number.isFinite(evaluated) || evaluated <= 0) {
        setBusy(false);
        setActionError("보유수량과 평가금액을 입력하세요");
        return;
      }
      const purchase = Number(values.bondPurchaseAmount);
      payload = {
        accountId: values.accountId,
        assetClass: "bond",
        symbol,
        name:
          values.name?.trim()
          || String(form.getFieldValue("name") ?? "").trim()
          || symbol
          || "채권",
        currency: "KRW",
        quantity,
        avgPrice: Number.isFinite(purchase) && purchase > 0 ? round4(purchase / quantity) : 0,
        marketPrice: round4(evaluated / quantity),
        fxRate: 1,
        priceAsOf: null,
        issueDate: values.issueDate?.trim() ? values.issueDate.trim() : null,
        maturityDate: values.maturityDate?.trim() ? values.maturityDate.trim() : null,
      };
    } else {
      const currency = (values.currency || "KRW").toUpperCase();
      payload = {
        accountId: values.accountId,
        assetClass: values.assetClass,
        symbol,
        name: values.name,
        currency,
        quantity: values.quantity,
        avgPrice: values.avgPrice,
        marketPrice: values.marketPrice,
        // §54.4: 원화 종목의 환율은 항상 1이다 — 숨긴 입력란의 잔여값을 쓰지 않는다.
        fxRate: currency === "USD" ? values.fxRate : 1,
        priceAsOf: values.priceAsOf?.trim() ? values.priceAsOf.trim() : null,
        issueDate: null,
        maturityDate: null,
      };
    }
    try {
      if (editingId === "new") await createHolding(payload);
      else if (typeof editingId === "number") await updateHolding(editingId, payload);
      cancelEdit();
      load();
    } catch (e) {
      setActionError(describeError(e, "저장하지 못했습니다"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setActionError("");
    try {
      await deleteHolding(id);
      load();
    } catch (e) {
      setActionError(describeError(e, "삭제하지 못했습니다"));
    }
  };

  /**
   * §54.4: 심볼만 넣으면 네이버 시세로 현재가·통화를 채운다. 종목명이 비어 있으면
   * 함께 채워 오타를 줄인다. 실패해도 저장을 막지 않는다 — 직접 입력 경로가 남는다.
   */
  const fetchQuoteForForm = async () => {
    const symbol = String(form.getFieldValue("symbol") ?? "").trim();
    if (!symbol) {
      setActionError("심볼을 입력하면 현재가를 가져올 수 있습니다");
      return;
    }
    setQuoteBusy(true);
    setActionError("");
    try {
      const quote = await fetchQuote(symbol);
      const currency = quote.currency?.toUpperCase() === "USD" ? "USD" : "KRW";
      const patch: Partial<HoldingPayload> = {
        currency,
        marketPrice: quote.price,
        priceAsOf: quote.priceAsOf ?? new Date().toISOString().slice(0, 10),
      };
      if (!String(form.getFieldValue("name") ?? "").trim() && quote.name) {
        patch.name = quote.name;
      }
      if (currency === "USD" && !(Number(form.getFieldValue("fxRate")) > 0)) {
        // 환율을 아직 넣지 않았다면 네이버 기준 환율로 한 번만 채운다.
        const fx = await fetchFxRate("USD").catch(() => null);
        if (fx) patch.fxRate = fx.rate;
      }
      form.setFieldsValue(patch);
    } catch {
      setActionError("시세를 찾지 못했습니다 — 심볼을 확인하거나 현재가를 직접 입력하세요");
    } finally {
      setQuoteBusy(false);
    }
  };

  /**
   * §54.3: 투자 계좌(balance = 예수금)는 자산 화면에서 편집이 막혀 있다 — 총액 칸에
   * 총액을 입력하면 예수금 자리에 저장돼 이중 계상되기 때문이다. 그 대체 경로가
   * 이 화면의 계좌 편집이다. 계좌 이름·기관·예수금만 다룬다.
   */
  const beginAccountEdit = (account: InvestmentAccountValue) => {
    setActionError("");
    setEditingId(null);
    form.resetFields();
    if (priceMode) cancelPriceMode();
    setAccountEditId(account.accountId);
    accountForm.setFieldsValue({
      name: account.accountName,
      institutionName: account.institutionName,
      cashBalance: account.cashBalance,
    });
  };

  const cancelAccountEdit = () => {
    setAccountEditId(null);
    accountForm.resetFields();
  };

  const saveAccount = async (account: InvestmentAccountValue) => {
    let values: AccountFormValues;
    try {
      values = await accountForm.validateFields();
    } catch {
      return; // 폼 검증 실패 — 필드 오류가 화면에 남는다
    }
    setAccountBusy(true);
    setActionError("");
    try {
      // 계좌 유형은 invest 로 고정한다 — 이 화면은 투자 계좌만 다룬다(§54.2).
      const payload: UpsertPayload = {
        accountType: "invest",
        name: values.name,
        institutionName: values.institutionName ?? "",
        balance: values.cashBalance,
        isDebt: false,
      };
      await updateAccount(account.accountId, payload);
      setAccountEditId(null);
      load();
    } catch (e) {
      setActionError(describeError(e, "계좌를 저장하지 못했습니다"));
    } finally {
      setAccountBusy(false);
    }
  };

  /** 계좌 삭제는 보유종목까지 함께 지운다 — 서버가 cascade 한다(§54.2). */
  const removeAccount = async (account: InvestmentAccountValue) => {
    setAccountBusy(true);
    setActionError("");
    try {
      await deleteAccount(account.accountId);
      setAccountEditId(null);
      setEditingId(null);
      form.resetFields();
      if (priceMode) cancelPriceMode();
      load();
    } catch (e) {
      setActionError(describeError(e, "계좌를 삭제하지 못했습니다"));
    } finally {
      setAccountBusy(false);
    }
  };

  const handleLogout = () => {
    clearToken();
    onOpenDashboard?.();
  };

  /** §62 한국투자증권 잔고 동기화. */
  const doKisSync = async (accountId: number) => {
    setKisSyncingAccountId(accountId);
    setActionError("");
    setActionWarning("");
    try {
      const data = await syncKisBalance(accountId);
      setPortfolio(data);
      setStatus(data.holdings.length === 0 && data.accounts.length === 0 ? "empty" : "ready");
      // 잔액을 못 읽으면 서버가 기존 값을 유지하고 경고를 준다 — 조용히 성공으로 넘기지 않는다.
      setActionWarning(data.warning ?? "");
    } catch (e) {
      setActionError(describeError(e, "한국투자증권 동기화에 실패했습니다"));
    } finally {
      setKisSyncingAccountId(null);
    }
  };

  const clearKisSync = async (accountId: number) => {
    setActionError("");
    try {
      const data = await clearKisBalance(accountId);
      setPortfolio(data);
      setStatus(data.holdings.length === 0 && data.accounts.length === 0 ? "empty" : "ready");
    } catch (e) {
      setActionError(describeError(e, "동기화 해제에 실패했습니다"));
    }
  };

  const filterButton = (key: AssetClass | "all", label: string) => (
    <Button
      key={key}
      size="small"
      className="af-tap-sm"
      type={filter === key ? "primary" : "default"}
      aria-pressed={filter === key}
      onClick={() => setFilter(key)}
    >
      {label}
    </Button>
  );

  /**
   * 보유종목 목록 — 데스크톱 표·모바일 행이 같은 DOM 이다(A안).
   * 값 계산은 기존 함수(costOf·valueOf·priceText·returnText)를 그대로 쓴다.
   */
  const holdingColumns: AfListColumn<HoldingRow>[] = [
    { key: "name", header: "종목", mobile: "primary", render: (row) => row.name },
    {
      key: "quantity",
      header: "수량",
      numeric: true,
      render: (row) => row.quantity.toLocaleString("ko-KR"),
    },
    {
      key: "avgPrice",
      header: "평단가",
      numeric: true,
      render: (row) => priceText(row.avgPrice, row.currency),
    },
    {
      key: "marketPrice",
      header: "현재가",
      numeric: true,
      render: (row) =>
        priceMode ? (
          <InputNumber
            size="small"
            min={0}
            precision={4}
            aria-label={`${row.name} 현재가`}
            value={priceDrafts[row.id] ?? row.marketPrice}
            onChange={(v) => setPriceDrafts((prev) => ({ ...prev, [row.id]: v ?? 0 }))}
            style={{ width: 110 }}
          />
        ) : (
          priceText(row.marketPrice, row.currency)
        ),
    },
    {
      key: "value",
      header: "평가액",
      numeric: true,
      mobile: "value",
      render: (row) => {
        const cost = costOf(row);
        const value = valueOf(row);
        return (
          <>
            {formatKrwExact(won(value))}
            {/* 모바일에서만 보인다 — 데스크톱은 옆의 "손익" 열이 같은 값을 이미 보여 준다. */}
            <div className="af-list__value-sub">
              {formatSignedKrw(won(value - cost))} ({returnText(cost, value)})
            </div>
          </>
        );
      },
    },
    {
      key: "pnl",
      header: "손익",
      numeric: true,
      render: (row) => {
        const cost = costOf(row);
        const value = valueOf(row);
        return (
          <>
            {formatSignedKrw(won(value - cost))}
            <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
              {returnText(cost, value)}
            </Typography.Text>
          </>
        );
      },
    },
  ];

  /** 가격 갱신 모드에서는 행 편집·삭제를 주지 않는다(현재가만 고친다). */
  const holdingActions = (row: HoldingRow): AfRowAction[] =>
    priceMode
      ? []
      : [
          {
            key: "delete",
            label: "삭제",
            danger: true,
            confirm: "이 종목을 삭제할까요?",
            onSelect: () => void remove(row.id),
          },
        ];

  /**
   * 모바일 2행은 짧게 — 손익은 평가액 아래(`.af-list__value-sub`)에 두어
   * 좁은 폭에서도 잘리지 않고 항상 보이게 한다.
   */
  const holdingSubtitle = (row: HoldingRow) =>
    row.assetClass === "bond"
      // 채권은 '주'가 아니라 만기일을 보여 준다 (BOND-FORM-1).
      ? `채권 · ${row.maturityDate ? `${row.maturityDate} 만기` : "만기 미입력"}`
      : `${CLASS_LABELS[row.assetClass]} · ${row.quantity.toLocaleString("ko-KR")}주`;

  return (
    <AppLayout
      onLogout={handleLogout}
      nav={
        <StandardNav
          current="assets"
          onOpenDashboard={onOpenDashboard}
          onOpenAssets={onOpenAssets}
          onOpenExpenses={onOpenExpenses}
          onOpenSettings={onOpenSettings}
        />
      }
    >
      <Typography.Title level={1} id="h-investments-page" style={{ fontSize: 24, margin: 0, marginBottom: 16 }}>
        투자
      </Typography.Title>
      {/* §54.1: 자산의 하위 화면 탭 */}
      <SubNav
        ariaLabel="자산 하위 화면"
        current="investments"
        items={[
          { key: "assets", label: "자산", ariaLabel: "자산 탭", onClick: onOpenAssets },
          { key: "investments", label: "투자", ariaLabel: "투자 탭" },
        ]}
      />

      {actionError ? (
        <Typography.Paragraph role="alert" type="danger" style={{ marginBottom: 16 }}>
          {actionError}
        </Typography.Paragraph>
      ) : null}

      {actionWarning ? (
        <Typography.Paragraph role="status" type="warning" style={{ marginBottom: 16 }}>
          {actionWarning}
        </Typography.Paragraph>
      ) : null}

      {actionMessage ? (
        <Typography.Paragraph role="status" type="success" style={{ marginBottom: 16 }}>
          {actionMessage}
        </Typography.Paragraph>
      ) : null}

      <section aria-labelledby="h-portfolio-summary" style={{ marginBottom: 24 }}>
        <Typography.Title level={2} id="h-portfolio-summary" style={{ fontSize: 16, margin: 0, marginBottom: 12 }}>
          포트폴리오 요약
        </Typography.Title>
        <Card>
          {portfolio ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
              <Summary label="총 평가액" value={formatKrwExact(totals.value)} />
              <Summary label="총 원금" value={formatKrwExact(totals.cost)} />
              <Summary
                label="평가손익"
                value={`${formatSignedKrw(totals.pnl)} (${totals.rate === null ? "—" : formatPercent(totals.rate)})`}
                {...(totals.pnl < 0 ? { tone: "danger" as const } : {})}
              />
              <Summary label="예수금" value={formatKrwExact(totals.cash)} />
            </div>
          ) : (
            <Typography.Text type="secondary">불러오는 중…</Typography.Text>
          )}
        </Card>
      </section>

      <section aria-labelledby="h-holdings">
        <div className="af-section-head">
          <Typography.Title level={2} id="h-holdings" className="af-section-head__title" style={{ fontSize: 16, margin: 0 }}>
            보유종목
          </Typography.Title>
          <Space wrap className="af-section-head__actions">
            {asOf ? <Typography.Text type="secondary">기준일 {asOf}</Typography.Text> : null}
            {priceMode ? (
              <>
                <Button type="primary" onClick={() => void savePrices()} loading={savingPrices}>
                  가격 저장
                </Button>
                <Button onClick={cancelPriceMode} disabled={savingPrices}>
                  취소
                </Button>
              </>
            ) : (
              <>
                {/* 부트스트랩: '업비트' 계좌가 없을 때만 상단 버튼. 계좌가 생기면 ⋯ 메뉴를 쓴다. */}
                {!hasUpbitAccount ? (
                  <>
                    <Button onClick={() => setUpbitOpen(true)}>업비트 연동</Button>
                    <Button
                      onClick={() => void handleUpbitSync()}
                      loading={upbitSyncing}
                      disabled={editingId !== null || priceMode || accountEditId !== null}
                    >
                      업비트에서 가져오기
                    </Button>
                  </>
                ) : null}
                <Button
                  onClick={() => void refreshPrices()}
                  loading={refreshingQuotes}
                  disabled={editingId !== null || priceMode || accountEditId !== null}
                >
                  시세 새로고침
                </Button>
                <Button onClick={beginPriceMode} disabled={editingId !== null || holdings.length === 0}>
                  가격 갱신
                </Button>
                <Button onClick={beginCreate} disabled={editingId !== null || accounts.length === 0}>
                  + 종목 추가
                </Button>
              </>
            )}
          </Space>
        </div>
        {accounts.length === 0 && status === "ready" ? (
          <Typography.Paragraph type="secondary">
            투자 계좌가 없습니다 — 자산 화면에서 유형을 "투자"로 계좌를 먼저 추가하세요.
          </Typography.Paragraph>
        ) : null}

        <div className="af-portfolio-grid">
          <Card>
            <StateBlock
              status={editingId !== null ? "ready" : status}
              onRetry={load}
              errorText={errorText}
              emptyText="보유종목이 없습니다 — '+ 종목 추가'로 시작하세요"
            >
              {/* 행 편집은 표의 편집 행(renderEditor)이 맡는다 — 여기는 새 종목 폼만. */}
              {editingId === "new" ? (
                <div style={{ marginBottom: 16 }}>
                  <HoldingForm
                    form={form}
                    accounts={accounts}
                    wide
                    onFetchQuote={() => void fetchQuoteForForm()}
                    fetchingQuote={quoteBusy}
                  />
                  <Space style={{ marginTop: 8 }}>
                    <Button type="primary" onClick={() => void save()} loading={busy}>
                      저장
                    </Button>
                    <Button onClick={cancelEdit} disabled={busy}>
                      취소
                    </Button>
                  </Space>
                </div>
              ) : null}

              <Space size={[8, 16]} wrap style={{ marginBottom: 12 }} aria-label="자산군 필터">
                {filterButton("all", "전체")}
                {CLASS_ORDER.map((cls) => filterButton(cls, CLASS_LABELS[cls]))}
              </Space>

              <div>
                {accounts.map((account) => {
                  const rows = visible.filter((h) => h.accountId === account.accountId);
                  const accountHoldings = holdings.filter((h) => h.accountId === account.accountId);
                  const isKisAccount = account.institutionName === "한국투자";
                  const isUpbitAccount =
                    account.institutionName === "업비트" || account.accountName === "업비트";
                  /**
                   * 계좌 헤더의 동작은 `⋯` 메뉴 하나로 모은다 — 320px 에서 버튼 5개가
                   * 3+2 로 흩어지던 문제(UI-2a). 확인이 필요한 동작은 메뉴가 닫힌 뒤
                   * 아래 1×1 앵커의 Popconfirm 으로 이어진다.
                   */
                  const accountActionDisabled =
                    editingId !== null || priceMode || accountBusy
                    || kisSyncingAccountId !== null || upbitSyncing;
                  const kisMenuItems: NonNullable<MenuProps["items"]> = isKisAccount
                    ? [
                        { key: "kis", label: "KIS 설정", disabled: accountActionDisabled },
                        { key: "sync", label: "한투 동기화", disabled: accountActionDisabled },
                        { key: "bond-preview", label: "채권 진단", disabled: accountActionDisabled },
                        { type: "divider" },
                        { key: "clear", label: "동기화 해제", danger: true, disabled: accountActionDisabled },
                      ]
                    : [];
                  const upbitMenuItems: NonNullable<MenuProps["items"]> = isUpbitAccount
                    ? [
                        { key: "upbit-settings", label: "업비트 설정", disabled: accountActionDisabled },
                        {
                          key: "upbit-sync",
                          label: "업비트 동기화",
                          disabled: accountActionDisabled || upbitSyncing,
                        },
                      ]
                    : [];
                  const accountMenuItems: NonNullable<MenuProps["items"]> = [
                    { key: "edit", label: "계좌 편집", disabled: accountActionDisabled },
                    ...kisMenuItems,
                    ...upbitMenuItems,
                    {
                      key: "delete",
                      label: "계좌 삭제",
                      danger: true,
                      disabled: accountBusy || kisSyncingAccountId !== null || upbitSyncing,
                    },
                  ];
                  const onAccountMenuClick: MenuProps["onClick"] = ({ key }) => {
                    if (key === "edit") beginAccountEdit(account);
                    else if (key === "kis")
                      setKisCredentialsAccount({ id: account.accountId, name: account.accountName });
                    else if (key === "sync") void doKisSync(account.accountId);
                    else if (key === "bond-preview")
                      setBondPreviewAccount({ id: account.accountId, name: account.accountName });
                    else if (key === "upbit-settings") setUpbitOpen(true);
                    else if (key === "upbit-sync") void handleUpbitSync();
                    // 확인이 필요한 동작은 앵커 Popconfirm 을 연다(메뉴는 antd 가 닫는다).
                    else if (key === "clear" || key === "delete")
                      setAccountConfirm({ accountId: account.accountId, action: key });
                  };
                  return (
                    <div key={account.accountId} className="af-account">
                      <div className="af-account-head">
                        <Typography.Text strong className="af-account-head__title">
                          {account.accountName}
                          {account.institutionName ? ` · ${account.institutionName}` : ""}
                        </Typography.Text>
                        <div
                          className="af-account-head__amounts"
                          role="group"
                          aria-label={`${account.accountName} 계좌 금액`}
                        >
                          <span className="af-account-amount">
                            <span className="af-account-amount__label">예수금</span>
                            <span className="af-account-amount__value">{formatKrwExact(account.cashBalance)}</span>
                          </span>
                          <span className="af-account-amount">
                            <span className="af-account-amount__label">총액</span>
                            <span className="af-account-amount__value">{formatKrwExact(account.totalValue)}</span>
                          </span>
                        </div>
                        <div className="af-account-head__menu">
                          <Dropdown
                            trigger={["click"]}
                            open={openAccountMenu === account.accountId}
                            onOpenChange={(open) => setOpenAccountMenu(open ? account.accountId : null)}
                            menu={{ items: accountMenuItems, onClick: onAccountMenuClick }}
                          >
                            <Button
                              type="text"
                              size="small"
                              className="af-icon-btn"
                              aria-haspopup="menu"
                              aria-expanded={openAccountMenu === account.accountId}
                              aria-label={`${account.accountName} 계좌 메뉴`}
                              disabled={accountEditId === account.accountId}
                            >
                              <span aria-hidden="true">⋯</span>
                            </Button>
                          </Dropdown>
                          {/* Popconfirm 앵커: 메뉴가 닫혀도 살아 있는 1×1 지점 (AfListTable 과 동일) */}
                          {isKisAccount ? (
                            <Popconfirm
                              title="동기화를 해제할까요?"
                              description="이 계좌의 보유종목과 예수금이 모두 초기화됩니다."
                              open={
                                accountConfirm?.accountId === account.accountId &&
                                accountConfirm.action === "clear"
                              }
                              onConfirm={() => {
                                setAccountConfirm(null);
                                void clearKisSync(account.accountId);
                              }}
                              onCancel={() => setAccountConfirm(null)}
                              onOpenChange={(open) => {
                                if (!open) setAccountConfirm(null);
                              }}
                            >
                              <span
                                style={{ position: "absolute", right: 0, top: "50%", width: 1, height: 1 }}
                              />
                            </Popconfirm>
                          ) : null}
                          <Popconfirm
                            title="이 투자 계좌를 삭제할까요?"
                            description={
                              accountHoldings.length > 0
                                ? `보유종목 ${accountHoldings.length}건도 함께 삭제됩니다`
                                : undefined
                            }
                            open={
                              accountConfirm?.accountId === account.accountId &&
                              accountConfirm.action === "delete"
                            }
                            onConfirm={() => {
                              setAccountConfirm(null);
                              void removeAccount(account);
                            }}
                            onCancel={() => setAccountConfirm(null)}
                            onOpenChange={(open) => {
                              if (!open) setAccountConfirm(null);
                            }}
                          >
                            <span style={{ position: "absolute", right: 0, top: "50%", width: 1, height: 1 }} />
                          </Popconfirm>
                        </div>
                      </div>
                      {accountEditId === account.accountId ? (
                        <div style={{ marginBottom: 12 }}>
                          <Form form={accountForm} layout="inline" style={{ rowGap: 8 }}>
                            <Form.Item
                              name="name"
                              label="계좌 이름"
                              rules={[{ required: true, message: "계좌 이름을 입력하세요" }]}
                            >
                              <Input style={{ width: 160 }} />
                            </Form.Item>
                            <Form.Item name="institutionName" label="기관">
                              <Input style={{ width: 160 }} />
                            </Form.Item>
                            <Form.Item
                              name="cashBalance"
                              label="예수금"
                              rules={[{ required: true, message: "예수금을 입력하세요" }]}
                            >
                              <InputNumber min={0} style={{ width: 160 }} />
                            </Form.Item>
                          </Form>
                          <Space style={{ marginTop: 8 }}>
                            <Button type="primary" onClick={() => void saveAccount(account)} loading={accountBusy}>
                              저장
                            </Button>
                            <Button onClick={cancelAccountEdit} disabled={accountBusy}>
                              취소
                            </Button>
                          </Space>
                        </div>
                      ) : null}
                      {kisSyncingAccountId === account.accountId ? (
                        <div style={{ marginBottom: 12, padding: 12, background: "var(--af-secondary)", borderRadius: 8 }}>
                          <Typography.Text type="secondary">한국투자증권 잔고를 가져오는 중...</Typography.Text>
                        </div>
                      ) : null}
                      {rows.length === 0 ? (
                        <Typography.Text type="secondary">
                          {filter === "all"
                            ? "보유종목이 없습니다 — '+ 종목 추가'로 시작하세요"
                            : "이 계좌에 해당 자산군 종목이 없습니다."}
                        </Typography.Text>
                      ) : (
                        <AfListTable
                          ariaLabel={`${account.accountName} 보유종목`}
                          rows={rows}
                          rowKey={(row) => row.id}
                          columns={holdingColumns}
                          /* 가격 갱신 모드에서는 행 탭 편집을 막는다 — 현재가만 고친다. */
                          {...(priceMode ? {} : { onActivate: beginEdit })}
                          activateLabel={(row) => `${row.name} 편집`}
                          rowSubtitle={holdingSubtitle}
                          actions={holdingActions}
                          actionsLabel={(row) => `${row.name} 행 메뉴`}
                          editingKey={editingId}
                          density="dense"
                          renderEditor={() => (
                            <div>
                              <HoldingForm
                                form={form}
                                accounts={accounts}
                                wide
                                onFetchQuote={() => void fetchQuoteForForm()}
                                fetchingQuote={quoteBusy}
                              />
                              <Space style={{ marginTop: 8 }}>
                                <Button type="primary" onClick={() => void save()} loading={busy}>
                                  저장
                                </Button>
                                <Button onClick={cancelEdit} disabled={busy}>
                                  취소
                                </Button>
                              </Space>
                            </div>
                          )}
                          editorLabel={(row) => `${row.name} 편집`}
                          onCancelEdit={cancelEdit}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </StateBlock>
          </Card>

          {status === "ready" && slices.length > 0 && sliceTotal > 0 ? (
            <Card>
              <Typography.Title level={3} style={{ fontSize: 14, margin: "0 0 8px" }}>
                자산군 비중
              </Typography.Title>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={slices.map((s) => ({ name: s.label, value: s.value }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={2}
                      isAnimationActive={false}
                    >
                      {slices.map((s) => (
                        <Cell key={s.cls} fill={CLASS_COLORS[s.cls]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatKrwExact(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul aria-label="자산군 비중 범례" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {slices.map((s) => (
                  <li key={s.cls} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: CLASS_COLORS[s.cls] }} />
                    <span>{s.label}</span>
                    <span style={{ marginLeft: "auto", fontWeight: 600 }}>
                      {(s.value / sliceTotal * 100).toFixed(1)}%
                    </span>
                    <span style={{ color: "var(--af-muted-foreground)" }}>{formatKrwExact(s.value)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </section>
      {kisCredentialsAccount && (
        <KisCredentialsModal
          accountId={kisCredentialsAccount.id}
          accountName={kisCredentialsAccount.name}
          open={kisCredentialsAccount !== null}
          onClose={() => setKisCredentialsAccount(null)}
          onSaved={() => void load()}
        />
      )}

      {bondPreviewAccount && (
        <KisBondPreviewModal
          accountId={bondPreviewAccount.id}
          accountName={bondPreviewAccount.name}
          open={bondPreviewAccount !== null}
          onClose={() => setBondPreviewAccount(null)}
        />
      )}

      <UpbitCredentialsModal
        open={upbitOpen}
        onClose={() => setUpbitOpen(false)}
        onSaved={() => {
          setUpbitConfigured(true);
          void load();
        }}
      />
    </AppLayout>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div>
      <div style={{ color: "var(--af-muted-foreground)", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: tone === "danger" ? "var(--af-danger, #c0392b)" : undefined }}>
        {value}
      </div>
    </div>
  );
}

function HoldingForm({
  form,
  accounts,
  wide,
  onFetchQuote,
  fetchingQuote,
}: {
  form: FormInstance<HoldingFormValues>;
  accounts: Portfolio["accounts"];
  wide: boolean;
  onFetchQuote: () => void;
  fetchingQuote: boolean;
}) {
  const currency = (Form.useWatch("currency", form) as string | undefined) ?? "KRW";
  const assetClass = (Form.useWatch("assetClass", form) as HoldingPayload["assetClass"] | undefined)
    ?? "stock";
  const isBond = assetClass === "bond";
  // 좁은 화면에서는 Form.Item 폭을 채우고, 넓은 인라인 폼에서는 고정 폭을 쓴다.
  const numberWidth = wide ? 140 : "100%";
  const dateRule = {
    validator: (_: unknown, value: string | undefined) =>
      !value || /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? Promise.resolve()
        : Promise.reject(new Error("YYYY-MM-DD")),
  };

  /**
   * §54.4: 달러 종목을 고르면 환율 입력란을 채워 준다. 실패하면 빈 칸으로 두고
   * 사용자가 직접 입력한다 — 환율을 모른다고 저장이 막히면 안 된다.
   */
  const fillUsdKrw = async () => {
    if (Number(form.getFieldValue("fxRate")) > 0) return;
    try {
      const fx = await fetchFxRate("USD");
      form.setFieldsValue({ fxRate: fx.rate });
    } catch {
      // 직접 입력 경로를 남긴다.
    }
  };

  return (
    <Form form={form} layout={wide ? "inline" : "vertical"} style={{ rowGap: 8 }}>
      <Form.Item name="accountId" label="계좌" rules={[{ required: true, message: "계좌를 선택하세요" }]}>
        {/* §54.2: 계좌가 둘 이상이면 이름만으로 구분되지 않는다 — 기관을 함께 보여 준다. */}
        <Select
          style={{ minWidth: 190 }}
          options={accounts.map((a) => ({
            value: a.accountId,
            label: a.institutionName ? `${a.accountName} · ${a.institutionName}` : a.accountName,
          }))}
        />
      </Form.Item>
      <Form.Item name="assetClass" label="자산군" rules={[{ required: true }]}>
        <Select
          style={{ minWidth: 110 }}
          options={CLASS_ORDER.map((cls) => ({ value: cls, label: CLASS_LABELS[cls] }))}
        />
      </Form.Item>
      {isBond ? (
        <>
          {/* BOND-FORM-1: 채권은 종목번호·수량·평가금액·매수금액·발행일·만기일만 받는다.
              종목명/평단가/현재가/통화/환율/기준일은 숨기고 저장 시 환산한다. */}
          <Form.Item name="symbol" label="종목번호" rules={[{ required: true, message: "종목번호를 입력하세요" }]}>
            <Input style={{ width: wide ? 160 : "100%" }} placeholder="예: KR103502GA34" />
          </Form.Item>
          <Form.Item name="quantity" label="보유수량" rules={[{ required: true, message: "보유수량을 입력하세요" }]}>
            <InputNumber min={0} precision={8} style={{ width: numberWidth }} placeholder="예: 10" />
          </Form.Item>
          <Form.Item
            name="bondEvaluatedAmount"
            label="평가금액"
            rules={[{ required: true, message: "평가금액을 입력하세요" }]}
          >
            <InputNumber min={0} precision={4} style={{ width: numberWidth }} placeholder="예: 880050" />
          </Form.Item>
          <Form.Item name="bondPurchaseAmount" label="매수금액">
            <InputNumber min={0} precision={4} style={{ width: numberWidth }} placeholder="예: 881196" />
          </Form.Item>
          <Form.Item name="issueDate" label="발행일" rules={[dateRule]}>
            <Input style={{ width: wide ? 150 : "100%" }} placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="maturityDate" label="만기일" rules={[dateRule]}>
            <Input style={{ width: wide ? 150 : "100%" }} placeholder="YYYY-MM-DD" />
          </Form.Item>
        </>
      ) : (
        <>
          <Form.Item name="name" label="종목명" rules={[{ required: true, message: "종목명을 입력하세요" }]}>
            <Input style={{ width: 150 }} />
          </Form.Item>
          <Form.Item name="symbol" label="심볼">
            <Input style={{ width: 110 }} placeholder="005930" />
          </Form.Item>
          <Form.Item label=" " colon={false}>
            <Button onClick={onFetchQuote} loading={fetchingQuote}>
              현재가 가져오기
            </Button>
          </Form.Item>
          <Form.Item name="currency" label="통화" rules={[{ required: true }]}>
            <Select
              style={{ minWidth: 140 }}
              options={[...CURRENCIES]}
              onChange={(value: string) => {
                if (value === "USD") void fillUsdKrw();
              }}
            />
          </Form.Item>
          <Form.Item name="quantity" label="수량" rules={[{ required: true, message: "수량을 입력하세요" }]}>
            <InputNumber min={0} precision={8} style={{ width: 120 }} placeholder="예: 200" />
          </Form.Item>
          <Form.Item name="avgPrice" label="평단가" rules={[{ required: true, message: "평단가를 입력하세요" }]}>
            <InputNumber min={0} precision={4} style={{ width: 120 }} placeholder="예: 70000" />
          </Form.Item>
          <Form.Item name="marketPrice" label="현재가" rules={[{ required: true, message: "현재가를 입력하세요" }]}>
            <InputNumber min={0} precision={4} style={{ width: 120 }} placeholder="직접 입력 또는 시세" />
          </Form.Item>
          {/* §54.4: 원화는 환율이 항상 1이라 입력란을 숨긴다. 달러일 때만 노출. */}
          {currency === "USD" ? (
            <Form.Item name="fxRate" label="환율" rules={[{ required: true, message: "환율을 입력하세요" }]}>
              <InputNumber min={0.000001} precision={6} style={{ width: 110 }} placeholder="예: 1339" />
            </Form.Item>
          ) : null}
          <Form.Item name="priceAsOf" label="기준일">
            <Input style={{ width: 140 }} placeholder="YYYY-MM-DD" />
          </Form.Item>
        </>
      )}
    </Form>
  );
}

/** recharts Cell 은 자식으로만 인식되므로 map 안에서 직접 렌더한다. */
