import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  Form,
  Grid,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Typography,
  type FormInstance,
} from "antd";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AppLayout } from "../layout/AppLayout";
import { StandardNav } from "../layout/StandardNav";
import { StateBlock, type SurfaceStatus } from "../components/StateBlock";
import {
  MobileListCardActions,
  MobileListCardHeader,
  MobileListCardItem,
  MobileListCardMeta,
} from "../components/MobileListCard";
import {
  createHolding,
  deleteHolding,
  fetchFxRate,
  fetchQuote,
  getPortfolio,
  refreshHoldingPrices,
  updateHolding,
  type AssetClass,
  type HoldingPayload,
  type HoldingRow,
  type InvestmentAccountValue,
  type Portfolio,
} from "../api/investmentsApi";
import { deleteAccount, updateAccount, type UpsertPayload } from "../api/assetsApi";
import { clearInflight } from "../api/client";
import { clearToken } from "../auth/authStore";
import { formatKrwExact, formatPercent, formatSignedKrw } from "../utils/formatters";

interface InvestmentsPageProps {
  onOpenDashboard?: () => void;
  onOpenAssets?: () => void;
  onOpenExpenses?: () => void;
  onOpenSettings?: () => void;
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
  const screens = Grid.useBreakpoint();
  const wide = Boolean(screens.md);

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [status, setStatus] = useState<SurfaceStatus>("loading");
  const [errorText, setErrorText] = useState("");
  const [actionError, setActionError] = useState("");
  const [filter, setFilter] = useState<AssetClass | "all">("all");
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [priceMode, setPriceMode] = useState(false);
  const [priceDrafts, setPriceDrafts] = useState<Record<number, number>>({});
  const [savingPrices, setSavingPrices] = useState(false);
  /** §54.4 시세: 자동 갱신은 조용히, 수동 새로고침·시세 가져오기는 실패를 화면에 알린다. */
  const [refreshingQuotes, setRefreshingQuotes] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [form] = Form.useForm<HoldingPayload>();
  /** §54.3: 계좌(예수금·이름·기관) 편집 상태. 종목 편집과 동시에 열지 않는다. */
  const [accountEditId, setAccountEditId] = useState<number | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountForm] = Form.useForm<AccountFormValues>();
  const mountedRef = useRef(false);

  const load = useCallback(async () => {
    clearInflight();
    setStatus("loading");
    setErrorText("");
    try {
      const data = await getPortfolio();
      setPortfolio(data);
      setStatus(data.holdings.length === 0 ? "empty" : "ready");
    } catch (e) {
      setStatus("error");
      setErrorText(e instanceof Error ? e.message : "불러오지 못했습니다");
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
      setStatus(data.holdings.length === 0 ? "empty" : "ready");
    } catch (e) {
      if (!silent) setActionError(e instanceof Error ? e.message : "시세를 가져오지 못했습니다");
    } finally {
      if (!silent) setRefreshingQuotes(false);
    }
  }, []);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    void load().then(() => refreshPrices(true));
  }, [load, refreshPrices]);

  const holdings = portfolio?.holdings ?? [];
  const accounts = portfolio?.accounts ?? [];

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
          }),
        ),
      );
      cancelPriceMode();
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "가격을 저장하지 못했습니다");
    } finally {
      setSavingPrices(false);
    }
  };

  const save = async () => {
    let values: HoldingPayload;
    try {
      values = await form.validateFields();
    } catch {
      return; // 폼 검증 실패 — 필드 오류가 화면에 남는다
    }
    setBusy(true);
    setActionError("");
    const currency = (values.currency || "KRW").toUpperCase();
    const payload: HoldingPayload = {
      ...values,
      symbol: values.symbol?.trim() ? values.symbol.trim() : null,
      priceAsOf: values.priceAsOf?.trim() ? values.priceAsOf.trim() : null,
      currency,
      // §54.4: 원화 종목의 환율은 항상 1이다 — 숨긴 입력란의 잔여값을 쓰지 않는다.
      fxRate: currency === "USD" ? values.fxRate : 1,
    };
    try {
      if (editingId === "new") await createHolding(payload);
      else if (typeof editingId === "number") await updateHolding(editingId, payload);
      cancelEdit();
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "저장하지 못했습니다");
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
      setActionError(e instanceof Error ? e.message : "삭제하지 못했습니다");
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
      setActionError(e instanceof Error ? e.message : "계좌를 저장하지 못했습니다");
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
      setActionError(e instanceof Error ? e.message : "계좌를 삭제하지 못했습니다");
    } finally {
      setAccountBusy(false);
    }
  };

  const handleLogout = () => {
    clearToken();
    onOpenDashboard?.();
  };

  const filterButton = (key: AssetClass | "all", label: string) => (
    <Button
      key={key}
      size="small"
      type={filter === key ? "primary" : "default"}
      aria-pressed={filter === key}
      onClick={() => setFilter(key)}
    >
      {label}
    </Button>
  );

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
      <nav aria-label="자산 하위 화면" style={{ marginBottom: 16 }}>
        <Space size={4}>
          <Button type="link" aria-label="자산 탭" onClick={onOpenAssets} style={{ paddingInline: 8 }}>
            자산
          </Button>
          <Button
            type="link"
            aria-label="투자 탭"
            aria-current="page"
            style={{ paddingInline: 8, fontWeight: 700, color: "var(--af-foreground)" }}
          >
            투자
          </Button>
        </Space>
      </nav>

      {actionError ? (
        <Typography.Paragraph role="alert" type="danger" style={{ marginBottom: 16 }}>
          {actionError}
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <Typography.Title level={2} id="h-holdings" style={{ fontSize: 16, margin: 0 }}>
            보유종목
          </Typography.Title>
          <Space wrap>
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

        <Card>
          <StateBlock
            status={editingId !== null ? "ready" : status}
            onRetry={load}
            errorText={errorText}
            emptyText="보유종목이 없습니다 — '+ 종목 추가'로 시작하세요"
          >
            {editingId !== null ? (
              <div style={{ marginBottom: 16 }}>
                <HoldingForm
                  form={form}
                  accounts={accounts}
                  wide={wide}
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

            <Space wrap style={{ marginBottom: 12 }} aria-label="자산군 필터">
              {filterButton("all", "전체")}
              {CLASS_ORDER.map((cls) => filterButton(cls, CLASS_LABELS[cls]))}
            </Space>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: wide ? "minmax(0, 1fr) 300px" : "1fr",
                gap: 24,
                alignItems: "start",
              }}
            >
              <div>
                {accounts.map((account) => {
                  const rows = visible.filter((h) => h.accountId === account.accountId);
                  const accountHoldings = holdings.filter((h) => h.accountId === account.accountId);
                  if (visible.length > 0 && rows.length === 0) return null;
                  return (
                    <div key={account.accountId} style={{ marginBottom: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8, alignItems: "baseline" }}>
                        <Typography.Text strong>
                          {account.accountName}
                          {account.institutionName ? ` · ${account.institutionName}` : ""}
                        </Typography.Text>
                        {accountEditId === account.accountId ? null : (
                          <Space size={4} wrap>
                            <Typography.Text type="secondary">
                              예수금 {formatKrwExact(account.cashBalance)} · 총액 {formatKrwExact(account.totalValue)}
                            </Typography.Text>
                            <Button
                              size="small"
                              type="text"
                              aria-label={`${account.accountName} 계좌 편집`}
                              onClick={() => beginAccountEdit(account)}
                              disabled={editingId !== null || priceMode || accountBusy}
                            >
                              계좌 편집
                            </Button>
                            <Popconfirm
                              title="이 투자 계좌를 삭제할까요?"
                              description={
                                accountHoldings.length > 0
                                  ? `보유종목 ${accountHoldings.length}건도 함께 삭제됩니다`
                                  : undefined
                              }
                              onConfirm={() => void removeAccount(account)}
                            >
                              <Button
                                size="small"
                                type="text"
                                danger
                                aria-label={`${account.accountName} 계좌 삭제`}
                                disabled={accountBusy}
                              >
                                계좌 삭제
                              </Button>
                            </Popconfirm>
                          </Space>
                        )}
                      </div>
                      {accountEditId === account.accountId ? (
                        <div style={{ marginBottom: 12 }}>
                          <Form form={accountForm} layout={wide ? "inline" : "vertical"} style={{ rowGap: 8 }}>
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
                      {rows.length === 0 ? (
                        <Typography.Text type="secondary">이 계좌에 해당 자산군 종목이 없습니다.</Typography.Text>
                      ) : wide ? (
                        <table aria-label={`${account.accountName} 보유종목`} style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              <th scope="col" style={{ textAlign: "left", paddingBottom: 8 }}>종목</th>
                              <th scope="col" style={{ textAlign: "right", paddingBottom: 8 }}>수량</th>
                              <th scope="col" style={{ textAlign: "right", paddingBottom: 8 }}>평단가</th>
                              <th scope="col" style={{ textAlign: "right", paddingBottom: 8 }}>현재가</th>
                              <th scope="col" style={{ textAlign: "right", paddingBottom: 8 }}>평가액</th>
                              <th scope="col" style={{ textAlign: "right", paddingBottom: 8 }}>손익</th>
                              <th scope="col" style={{ width: 110 }} />
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row) => {
                              const cost = costOf(row);
                              const value = valueOf(row);
                              return (
                                <tr key={row.id}>
                                  <td style={{ padding: "6px 0" }}>
                                    <div style={{ fontWeight: 600 }}>{row.name}</div>
                                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                      {CLASS_LABELS[row.assetClass]}
                                      {row.symbol ? ` · ${row.symbol}` : ""}
                                      {row.currency !== "KRW" ? ` · ${row.currency}` : ""}
                                    </Typography.Text>
                                  </td>
                                  <td style={{ textAlign: "right" }}>{row.quantity.toLocaleString("ko-KR")}</td>
                                  <td style={{ textAlign: "right" }}>{priceText(row.avgPrice, row.currency)}</td>
                                  <td style={{ textAlign: "right" }}>
                                    {priceMode ? (
                                      <InputNumber
                                        size="small"
                                        min={0}
                                        precision={4}
                                        aria-label={`${row.name} 현재가`}
                                        value={priceDrafts[row.id] ?? row.marketPrice}
                                        onChange={(v) =>
                                          setPriceDrafts((prev) => ({ ...prev, [row.id]: v ?? 0 }))
                                        }
                                        style={{ width: 110 }}
                                      />
                                    ) : (
                                      priceText(row.marketPrice, row.currency)
                                    )}
                                  </td>
                                  <td style={{ textAlign: "right" }}>{formatKrwExact(won(value))}</td>
                                  <td style={{ textAlign: "right" }}>
                                    {formatSignedKrw(won(value - cost))}
                                    <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                                      {returnText(cost, value)}
                                    </Typography.Text>
                                  </td>
                                  <td>
                                    {priceMode ? null : (
                                      <Space>
                                        <Button size="small" type="text" onClick={() => beginEdit(row)}>편집</Button>
                                        <Popconfirm title="이 종목을 삭제할까요?" onConfirm={() => void remove(row.id)}>
                                          <Button size="small" type="text" danger>삭제</Button>
                                        </Popconfirm>
                                      </Space>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <div>
                          {rows.map((row) => {
                            const cost = costOf(row);
                            const value = valueOf(row);
                            return (
                              <MobileListCardItem key={row.id}>
                                <MobileListCardHeader title={row.name} value={formatKrwExact(won(value))} />
                                <MobileListCardMeta>
                                  {CLASS_LABELS[row.assetClass]} · {row.quantity.toLocaleString("ko-KR")}주 ·
                                  {" "}손익 {formatSignedKrw(won(value - cost))} ({returnText(cost, value)})
                                </MobileListCardMeta>
                                <MobileListCardActions>
                                  {priceMode ? (
                                    <InputNumber
                                      size="small"
                                      min={0}
                                      precision={4}
                                      aria-label={`${row.name} 현재가`}
                                      value={priceDrafts[row.id] ?? row.marketPrice}
                                      onChange={(v) =>
                                        setPriceDrafts((prev) => ({ ...prev, [row.id]: v ?? 0 }))
                                      }
                                      style={{ width: 130 }}
                                    />
                                  ) : (
                                    <Space>
                                      <Button size="small" type="text" onClick={() => beginEdit(row)}>편집</Button>
                                      <Popconfirm title="이 종목을 삭제할까요?" onConfirm={() => void remove(row.id)}>
                                        <Button size="small" type="text" danger>삭제</Button>
                                      </Popconfirm>
                                    </Space>
                                  )}
                                </MobileListCardActions>
                              </MobileListCardItem>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {slices.length > 0 && sliceTotal > 0 ? (
                <div>
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
                </div>
              ) : null}
            </div>
          </StateBlock>
        </Card>
      </section>
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
  form: FormInstance<HoldingPayload>;
  accounts: Portfolio["accounts"];
  wide: boolean;
  onFetchQuote: () => void;
  fetchingQuote: boolean;
}) {
  const currency = (Form.useWatch("currency", form) as string | undefined) ?? "KRW";

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
      <Form.Item name="name" label="종목명" rules={[{ required: true, message: "종목명을 입력하세요" }]}>
        <Input style={{ width: 150 }} />
      </Form.Item>
      <Form.Item name="symbol" label="심볼">
        <Input style={{ width: 110 }} placeholder="005930" />
      </Form.Item>
      <Form.Item label=" " colon={false}>
        <Button size="small" onClick={onFetchQuote} loading={fetchingQuote}>
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
    </Form>
  );
}

/** recharts Cell 은 자식으로만 인식되므로 map 안에서 직접 렌더한다. */
