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
  getPortfolio,
  updateHolding,
  type AssetClass,
  type HoldingPayload,
  type HoldingRow,
  type Portfolio,
} from "../api/investmentsApi";
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
const CLASS_COLORS: Record<AssetClass, string> = {
  stock: "var(--af-signal)",
  etf: "var(--af-grove)",
  bond: "var(--af-slate)",
  fund: "var(--af-neutral)",
  crypto: "#b06ab3",
};

const won = (v: number) => Math.round(v);

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
  const [form] = Form.useForm<HoldingPayload>();
  const mountedRef = useRef(false);

  const load = useCallback(() => {
    clearInflight();
    setStatus("loading");
    setErrorText("");
    getPortfolio()
      .then((data) => {
        setPortfolio(data);
        setStatus(data.holdings.length === 0 ? "empty" : "ready");
      })
      .catch((e: Error) => {
        setStatus("error");
        setErrorText(e.message);
      });
  }, []);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    void load();
  }, [load]);

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
    setEditingId("new");
    const first = accounts[0];
    form.setFieldsValue({
      ...(first ? { accountId: first.accountId } : {}),
      assetClass: "stock",
      symbol: "",
      name: "",
      currency: "KRW",
      quantity: 0,
      avgPrice: 0,
      marketPrice: 0,
      fxRate: 1,
      priceAsOf: new Date().toISOString().slice(0, 10),
    });
  };

  const beginEdit = (row: HoldingRow) => {
    setActionError("");
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

  const save = async () => {
    let values: HoldingPayload;
    try {
      values = await form.validateFields();
    } catch {
      return; // 폼 검증 실패 — 필드 오류가 화면에 남는다
    }
    setBusy(true);
    setActionError("");
    const payload: HoldingPayload = {
      ...values,
      symbol: values.symbol?.trim() ? values.symbol.trim() : null,
      priceAsOf: values.priceAsOf?.trim() ? values.priceAsOf.trim() : null,
      currency: (values.currency || "KRW").toUpperCase(),
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
          <Space>
            {asOf ? <Typography.Text type="secondary">기준일 {asOf}</Typography.Text> : null}
            <Button onClick={beginCreate} disabled={editingId !== null || accounts.length === 0}>
              + 종목 추가
            </Button>
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
                <HoldingForm form={form} accounts={accounts} wide={wide} />
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
                  if (visible.length > 0 && rows.length === 0) return null;
                  return (
                    <div key={account.accountId} style={{ marginBottom: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                        <Typography.Text strong>
                          {account.accountName}
                          {account.institutionName ? ` · ${account.institutionName}` : ""}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          예수금 {formatKrwExact(account.cashBalance)} · 총액 {formatKrwExact(account.totalValue)}
                        </Typography.Text>
                      </div>
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
                                  <td style={{ textAlign: "right" }}>{priceText(row.marketPrice, row.currency)}</td>
                                  <td style={{ textAlign: "right" }}>{formatKrwExact(won(value))}</td>
                                  <td style={{ textAlign: "right" }}>
                                    {formatSignedKrw(won(value - cost))}
                                    <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                                      {returnText(cost, value)}
                                    </Typography.Text>
                                  </td>
                                  <td>
                                    <Space>
                                      <Button size="small" type="text" onClick={() => beginEdit(row)}>편집</Button>
                                      <Popconfirm title="이 종목을 삭제할까요?" onConfirm={() => void remove(row.id)}>
                                        <Button size="small" type="text" danger>삭제</Button>
                                      </Popconfirm>
                                    </Space>
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
                                  <Button size="small" type="text" onClick={() => beginEdit(row)}>편집</Button>
                                  <Popconfirm title="이 종목을 삭제할까요?" onConfirm={() => void remove(row.id)}>
                                    <Button size="small" type="text" danger>삭제</Button>
                                  </Popconfirm>
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
}: {
  form: FormInstance<HoldingPayload>;
  accounts: Portfolio["accounts"];
  wide: boolean;
}) {
  return (
    <Form form={form} layout={wide ? "inline" : "vertical"} style={{ rowGap: 8 }}>
      <Form.Item name="accountId" label="계좌" rules={[{ required: true, message: "계좌를 선택하세요" }]}>
        <Select
          style={{ minWidth: 150 }}
          options={accounts.map((a) => ({ value: a.accountId, label: a.accountName }))}
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
        <Input style={{ width: 100 }} placeholder="005930" />
      </Form.Item>
      <Form.Item name="currency" label="통화">
        <Input style={{ width: 80 }} maxLength={3} />
      </Form.Item>
      <Form.Item name="quantity" label="수량" rules={[{ required: true }]}>
        <InputNumber min={0} precision={8} style={{ width: 120 }} />
      </Form.Item>
      <Form.Item name="avgPrice" label="평단가" rules={[{ required: true }]}>
        <InputNumber min={0} precision={4} style={{ width: 120 }} />
      </Form.Item>
      <Form.Item name="marketPrice" label="현재가" rules={[{ required: true }]}>
        <InputNumber min={0} precision={4} style={{ width: 120 }} />
      </Form.Item>
      <Form.Item name="fxRate" label="환율" rules={[{ required: true }]}>
        <InputNumber min={0.000001} precision={6} style={{ width: 100 }} />
      </Form.Item>
      <Form.Item name="priceAsOf" label="기준일">
        <Input style={{ width: 140 }} placeholder="YYYY-MM-DD" />
      </Form.Item>
    </Form>
  );
}

/** recharts Cell 은 자식으로만 인식되므로 map 안에서 직접 렌더한다. */
