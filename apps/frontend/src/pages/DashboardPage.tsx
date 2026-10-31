import { useCallback, Suspense, lazy, useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { Alert, Button, Card, DatePicker, Grid, Skeleton, Space, Switch, Typography } from "antd";
import {
  MobileListCardHeader,
  MobileListCardItem,
  MobileListCardMeta,
} from "../components/MobileListCard";
import { AppLayout } from "../layout/AppLayout";
import { ResponsiveGrid } from "../layout/ResponsiveGrid";
import { StandardNav } from "../layout/StandardNav";
import { StateBlock, type SurfaceStatus } from "../components/StateBlock";
import { MetricCard } from "../components/MetricCard";
import { EmergencyFundSettingsModal } from "../components/EmergencyFundSettingsModal";
import type { DashboardData } from "../data/dashboardMock";
import {
  fetchCashflow,
  fetchDashboardSummary,
  fetchMonthlyIncome,
  type CashflowRow,
  type MonthlyIncome,
} from "../api/dashboardApi";
import {
  assetComposition,
  cashAccountCount,
  cashflowWindow,
  emergencyRunway,
  investMonths,
  investTotal,
  monthlyBalance,
  netWorth,
} from "../dashboard/metrics";
import { AssetCompositionList } from "../dashboard/AssetCompositionList";
import { buildExpenseTrend, lastMonthsRange, monthsBetween } from "../dashboard/expenseTrend";
import { listCardCompanyGroups, listMonthlyCategoryTotals, type CardCompanyGroup, type MonthlyCategoryTotal } from "../api/cardImportApi";
import { CardCompanyChart } from "../components/CardCompanyChart";
import { getSettings, type UserSettings } from "../api/settingsApi";
import { DEFAULT_EMERGENCY_CATEGORIES } from "../data/expenseCategories";
import {
  formatKrwAbbr,
  formatKrwExact,
  formatMonths,
  formatSignedKrw,
} from "../utils/formatters";
import { clearToken } from "../auth/authStore";

const CompositionDonut = lazy(() => import("../components/CompositionDonut").then(m => ({ default: m.CompositionDonut })));
const ExpenseTrendChart = lazy(() => import("../components/ExpenseTrendChart").then(m => ({ default: m.ExpenseTrendChart })));

/** §57: 지출 추이 기본 조회 범위 — 최근 12개월. 모듈 로드 시 한 번만 계산한다. */
const DEFAULT_TREND_RANGE = lastMonthsRange(12);

/** 카드별 본인·가족 사용 내역 기본 조회 범위 — 최근 6개월. */
const DEFAULT_CARD_GROUPS_RANGE = lastMonthsRange(6);

/**
 * §59: 비상금 변동지출 평균은 당월 제외 이전 최대 12개월을 본다.
 * 당월 폴백까지 한 번에 받기 위해 13개월(이전 12 + 당월)을 조회한다.
 */
const EMERGENCY_CARD_RANGE = lastMonthsRange(13);

/** §35.1: 월별 현금흐름은 최근 6개월. 서버는 months 1..12 만 받는다. */
const CASHFLOW_MONTHS = 6;

interface DashboardPageProps {
  /** 로그아웃 후 로그인 화면으로 전환한다 (§21 로그아웃 처리). */
  onLogout: () => void;
  /** 헤더에서 자산 화면으로 이동한다 (§39 화면 범위). */
  onOpenAssets?: () => void;
  /** 헤더에서 지출 화면으로 이동한다 (§42 스프린트 3). */
  onOpenExpenses?: () => void;
  /** 헤더에서 설정 화면으로 이동한다 (§46). */
  onOpenSettings?: () => void;
}

/**
 * Issue 7: 실제 API(§38 summary + cashflow)와 연동한다.
 * - 상태는 더 이상 수동 스위치가 아니라 요청 결과에서 나온다: loading → ready/empty/error.
 * - §26 연동 기준 "카드 단위 복구 우선": summary(핵심 지표·구성비·현금)와 cashflow(월별
 *   현금흐름)가 각각의 상태·재시도를 갖는다 — 한쪽 실패가 다른쪽 화면을 중단시키지 않는다.
 * - 오류 문구는 ApiError 의 사용자 친화 메시지(네트워크/인증 구분)를 그대로 보여 준다.
 * - 계산은 여전히 metrics.ts 단일 출처(§34.6). 여기선 데이터를 씌우는 것만 한다.
 */
export function DashboardPage({ onLogout, onOpenAssets, onOpenExpenses, onOpenSettings }: DashboardPageProps) {
  const screens = Grid.useBreakpoint();
  // §35 중단점: md 미만은 표 대신 카드형 리스트
  const wide = Boolean(screens.md);

  const [summary, setSummary] = useState<DashboardData | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<SurfaceStatus>("loading");
  const [summaryError, setSummaryError] = useState("");
  // §28.7: 비상금/투자금 유지 개월을 한 카드에서 토글로 전환해서 본다.
  const [showInvestMonths, setShowInvestMonths] = useState(false);
  // §59: 비상금 통장·카드지출 평균 기준. 설정 실패 시에도 카드는 기본값으로 동작한다.
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<SurfaceStatus>("loading");
  const [cardTotals, setCardTotals] = useState<MonthlyCategoryTotal[] | null>(null);
  const [cardTotalsFailed, setCardTotalsFailed] = useState(false);
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);

  const [cashflow, setCashflow] = useState<CashflowRow[] | null>(null);
  const [cashflowStatus, setCashflowStatus] = useState<SurfaceStatus>("loading");
  const [cardGroups, setCardGroups] = useState<CardCompanyGroup[] | null>(null);
  const [cardGroupsStatus, setCardGroupsStatus] = useState<SurfaceStatus>("loading");
  const [cardGroupsRange, setCardGroupsRange] = useState<{ from: string; to: string }>(DEFAULT_CARD_GROUPS_RANGE);
  const [cardGroupsRangeNotice, setCardGroupsRangeNotice] = useState("");

  // §57: 지출 추이 — 년월 범위로 조회. 기본은 최근 12개월.
  const [trendRange, setTrendRange] = useState<{ from: string; to: string }>(DEFAULT_TREND_RANGE);
  const [trend, setTrend] = useState<MonthlyCategoryTotal[] | null>(null);
  // §57.8: 수입 막대용 확정 월 수입. 실패해도 지출 차트는 그대로 그린다(막대만 빠진다).
  const [income, setIncome] = useState<MonthlyIncome[]>([]);
  const [trendStatus, setTrendStatus] = useState<SurfaceStatus>("loading");
  const [trendError, setTrendError] = useState("");
  const [trendRangeNotice, setTrendRangeNotice] = useState("");

  // React 18 StrictMode 더블 마운트 + 리마운트에서도 중복 호출이 없어야 한다.
  // dedupe 가 네트워크 중복을 막지만, 마운트마다 재요청 자체도 마운트 플래그로 막는다.
  const mountedRef = useRef(false);

  const loadTrend = useCallback((from: string, to: string) => {
    setTrendStatus("loading");
    setTrendError("");
    // §57.8: 수입 조회 실패는 지출 추이를 막지 않는다 — 막대 하나가 빠질 뿐이다.
    const incomeRequest = fetchMonthlyIncome(from, to).catch(() => [] as MonthlyIncome[]);
    Promise.all([listMonthlyCategoryTotals(from, to), incomeRequest])
      .then(([rows, incomeRows]) => {
        setTrend(rows);
        setIncome(incomeRows);
        // 지출도 수입도 없는 달만 있으면 빈 상태 — 수입만 있는 달도 차트에 그린다.
        setTrendStatus(rows.length === 0 && incomeRows.length === 0 ? "empty" : "ready");
      })
      .catch((e: Error) => {
        setTrendStatus("error");
        setTrendError(e.message);
      });
  }, []);

  /**
   * §59: 비상금 카드의 기준(비상금 통장·평균 개월·카테고리)과 카드지출만의
   * 월별 합계를 함께 읽는다. 설정/카드 조회가 실패해도 대시보드의 다른 카드는
   * 그대로 동작해야 하므로 각각 독립적으로 폴백한다.
   */
  const loadEmergencyBasis = useCallback(() => {
    setSettingsStatus("loading");
    setCardTotalsFailed(false);
    getSettings()
      .then((data) => {
        setSettings(data);
        setSettingsStatus("ready");
      })
      .catch(() => {
        setSettings(null);
        // 설정 조회 실패는 카드 전체 오류가 아니다 — 기본값으로 계산하고 안내만 남긴다.
        setSettingsStatus("error");
      });
    listMonthlyCategoryTotals(EMERGENCY_CARD_RANGE.from, EMERGENCY_CARD_RANGE.to, { source: "card" })
      .then((rows) => {
        setCardTotals(rows);
        setCardTotalsFailed(false);
      })
      .catch(() => {
        // 카드지출 없이 필수지출만으로 계산하면 개월 수가 실제보다 크게 보인다.
        // 값을 보여 주지 않고 오류 + 재시도로 남긴다(§34.6).
        setCardTotals([]);
        setCardTotalsFailed(true);
      });
  }, []);

  const loadCardGroups = useCallback((from: string, to: string) => {
    setCardGroupsStatus("loading");
    listCardCompanyGroups(from, to)
      .then((rows) => {
        setCardGroups(rows);
        setCardGroupsStatus(rows.length === 0 ? "empty" : "ready");
      })
      .catch(() => {
        setCardGroupsStatus("error");
      });
  }, []);

  const load = useCallback(() => {
    setSummaryStatus("loading");
    setSummaryError("");
    setCashflowStatus("loading");

    fetchDashboardSummary()
      .then((data) => {
        setSummary(data);
        const blank = data.assets.length === 0 && data.liabilities.length === 0;
        setSummaryStatus(blank ? "empty" : "ready");
      })
      .catch((e: Error) => {
        setSummaryStatus("error");
        setSummaryError(e.message);
      });

    fetchCashflow(CASHFLOW_MONTHS)
      .then((rows) => {
        setCashflow(rows);
        setCashflowStatus(rows.length === 0 ? "empty" : "ready");
      })
      .catch(() => {
        setCashflowStatus("error");
      });
  }, []);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    void load();
    loadTrend(DEFAULT_TREND_RANGE.from, DEFAULT_TREND_RANGE.to);
    loadEmergencyBasis();
    loadCardGroups(DEFAULT_CARD_GROUPS_RANGE.from, DEFAULT_CARD_GROUPS_RANGE.to);
  }, [load, loadTrend, loadEmergencyBasis, loadCardGroups]);

  const trendSeries = trend ? buildExpenseTrend(trend, trendRange.from, trendRange.to, income) : null;

  const handleLogout = () => {
    clearToken();
    onLogout();
  };

  const dataReady = summaryStatus === "ready" && summary !== null;
  const avgMonths = settings?.emergencyAvgMonths ?? 3;
  const targetMonths = settings?.targetMonths ?? 6;
  const emergencyCategories = settings?.emergencyCategories ?? DEFAULT_EMERGENCY_CATEGORIES;
  // §59: 카드지출(평균)과 설정이 도착하기 전에는 개월 수를 확정하지 않는다 —
  // 필수지출만으로 계산한 값을 잠깐 보여 주면 실제보다 크게 보인다.
  const basisLoading = settingsStatus === "loading" || cardTotals === null;
  const monthsStatus: SurfaceStatus =
    summaryStatus === "ready" && basisLoading
      ? "loading"
      : summaryStatus === "ready" && cardTotalsFailed
        ? "error"
        : summaryStatus;
  const runway = dataReady
    ? emergencyRunway({
        assets: summary.assets,
        essentialExpenses: summary.monthly.essentialExpenses,
        targetMonths,
        emergencyAccountIds: settings?.emergencyAccountIds ?? [],
        selectedCategories: emergencyCategories,
        avgMonths,
        cardTotals: cardTotals ?? [],
      })
    : null;
  const retryMonths = () => {
    load();
    loadEmergencyBasis();
  };
  const monthlySpendLabel = runway ? formatKrwExact(Math.round(runway.monthlySpend)) : "—";
  const composition = dataReady ? assetComposition(summary) : [];
  const cashRows = dataReady ? summary.assets.filter((a) => a.type === "cash") : [];
  // #73: "현금 3계좌" 하드코딩 제거 — 실제 현금성 계좌 수를 센다.
  const cashCount = dataReady ? cashAccountCount(summary) : 0;
  const cashHeading = cashCount === 0 ? "현금 계좌" : `현금 ${cashCount}계좌`;
  // #73: 3개월 → 6개월. 행이 없는 월은 0원이 아니라 "미확정"으로 남긴다(§34.6).
  const cashflowRows = cashflow ? cashflowWindow(cashflow, CASHFLOW_MONTHS) : [];
  const confirmedMonths = cashflowRows.filter((row) => row.confirmed).length;
  const unconfirmedMonths = cashflowRows.length - confirmedMonths;

  return (
    <AppLayout
      onLogout={handleLogout}
      nav={<StandardNav current="dashboard" onOpenAssets={onOpenAssets} onOpenExpenses={onOpenExpenses} onOpenSettings={onOpenSettings} />}
    >
      {/* 이슈 #70: 페이지 h1 은 정확히 1개 (§28.5 제목 체계). 섹션은 h2. */}
      <Typography.Title level={1} id="h-dashboard" style={{ fontSize: 24, margin: 0, marginBottom: 16 }}>
        대시보드
      </Typography.Title>
      <section aria-labelledby="h-core" style={{ marginBottom: 32 }}>
        <Typography.Title level={2} id="h-core" style={{ fontSize: 16, margin: 0, marginBottom: 16 }}>
          핵심 지표
        </Typography.Title>
        <ResponsiveGrid>
          <MetricCard
            title="순자산"
            status={summaryStatus}
            onRetry={load}
            hint={dataReady ? formatKrwExact(netWorth(summary)) : undefined}
          >
            {dataReady ? formatKrwAbbr(netWorth(summary)) : "—"}
          </MetricCard>
          <MetricCard
            title="월 수지"
            status={summaryStatus}
            onRetry={load}
            hint={dataReady ? `수입 ${formatKrwAbbr(summary.monthly.income)} · 부가세 ${formatKrwAbbr(summary.monthly.vatSetAside)} · 지출 ${formatKrwAbbr(summary.monthly.expenses)}` : undefined}
          >
            {dataReady ? formatSignedKrw(monthlyBalance(summary)) : "—"}
          </MetricCard>
          <MetricCard
            title={showInvestMonths ? "투자금 유지 개월" : "비상금 유지 개월"}
            status={monthsStatus}
            onRetry={retryMonths}
            extra={
              <Space size={4}>
                <Switch
                  size="small"
                  checkedChildren="투자금"
                  unCheckedChildren="비상금"
                  checked={showInvestMonths}
                  onChange={setShowInvestMonths}
                  aria-label="유지 개월 모드 전환"
                />
                <Button size="small" onClick={() => setEmergencyModalOpen(true)}>
                  기준 설정
                </Button>
              </Space>
            }
            hint={
              dataReady && runway ? (
                showInvestMonths ? (
                  <>
                    {formatKrwExact(investTotal(summary))} ÷ {monthlySpendLabel}
                    <br />
                    월 사용액 = 필수 {formatKrwExact(runway.fixedMonthly)} + 카드{" "}
                    {formatKrwExact(Math.round(runway.variableMonthly))}
                  </>
                ) : (
                  <>
                    예측 비상금 {formatKrwExact(runway.predictedFund)} · 목표 {targetMonths}개월
                    <br />
                    월 사용액 {monthlySpendLabel} = 필수 {formatKrwExact(runway.fixedMonthly)} + 카드{" "}
                    {formatKrwExact(Math.round(runway.variableMonthly))}
                    <br />
                    {!runway.accountSelected
                      ? "비상금 통장을 지정해 주세요"
                      : `비상금 통장 ${runway.accountCount}개 합계 ${formatKrwExact(runway.accountBalance)}`}
                    <br />
                    {runway.usedCurrentMonthFallback
                      ? "이전 카드 데이터 없음 · 이번 달(진행 중) 기준"
                      : `카드 데이터 ${runway.monthsWithCardData}/${avgMonths}개월 집계`}
                    {summary.monthly.essentialComplete ? "" : " · 필수지출 미확정"}
                    {runway.unclassifiedTotal > 0
                      ? ` · 미분류 ${formatKrwExact(runway.unclassifiedTotal)} 제외`
                      : ""}
                  </>
                )
              ) : undefined
            }
          >
            {dataReady && runway
              ? formatMonths(showInvestMonths ? investMonths(summary, runway.monthlySpend) : runway.runwayMonths)
              : "—"}
          </MetricCard>
          <MetricCard title="자산 구성비" status={summaryStatus} onRetry={load}>
            <AssetCompositionList slices={composition} />
          </MetricCard>
        </ResponsiveGrid>
      </section>

<section aria-labelledby="h-card-groups" style={{ marginBottom: 32 }}>
        <Typography.Title level={2} id="h-card-groups" style={{ fontSize: 16 }}>
          카드별 본인·가족 사용 내역
        </Typography.Title>
        <Card>
          <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Typography.Text style={{ fontWeight: 600, whiteSpace: "nowrap" }}>조회 범위</Typography.Text>
            <DatePicker.RangePicker
              picker="month"
              format="YYYY-MM"
              value={[dayjs(cardGroupsRange.from), dayjs(cardGroupsRange.to)]}
              onChange={(dates, _dateStrings) => {
                if (!dates) return;
                const [start, end] = dates;
                if (!start || !end) return;
                const from = start.format("YYYY-MM");
                const to = end.format("YYYY-MM");
                const span = monthsBetween(from, to).length;
                if (span === 0 || span > 36) {
                  setCardGroupsRangeNotice("조회 범위는 최대 36개월입니다. 범위를 줄여 주세요.");
                  return;
                }
                setCardGroupsRangeNotice("");
                setCardGroupsRange({ from, to });
                loadCardGroups(from, to);
              }}
              placeholder={["시작", "종료"]}
              style={{ minWidth: 320 }}
            />
          </div>
          {cardGroupsRangeNotice ? (
            <Alert
              type="warning"
              showIcon
              title={cardGroupsRangeNotice}
              role="status"
              aria-live="polite"
              style={{ marginBottom: 16 }}
            />
          ) : null}
          <StateBlock status={cardGroupsStatus} onRetry={() => loadCardGroups(cardGroupsRange.from, cardGroupsRange.to)}>
            {cardGroups && cardGroups.length > 0 ? (
              <CardCompanyChart groups={cardGroups} from={cardGroupsRange.from} to={cardGroupsRange.to} />
            ) : (
              <Typography.Text type="secondary">표시할 카드 내역이 없습니다</Typography.Text>
            )}
          </StateBlock>
        </Card>
      </section>

<section aria-labelledby="h-trend" style={{ marginBottom: 32 }}>
        <Typography.Title level={2} id="h-trend" style={{ fontSize: 16 }}>
          지출 추이
        </Typography.Title>
        <Typography.Text type="secondary" style={{ display: "block", marginTop: -8, marginBottom: 16, fontSize: 13 }}>
          카드내역 + 고정/정기 항목 · 자산 이동(저축/투자) 제외 · 수입은 확정된 달만
        </Typography.Text>
        <Card>
          <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Typography.Text style={{ fontWeight: 600, whiteSpace: "nowrap" }}>조회 범위</Typography.Text>
            <DatePicker.RangePicker
              picker="month"
              format="YYYY-MM"
              value={[dayjs(trendRange.from), dayjs(trendRange.to)]}
              onChange={(dates, _dateStrings) => {
                if (!dates) return;
                const [start, end] = dates;
                if (!start || !end) return;
                const from = start.format("YYYY-MM");
                const to = end.format("YYYY-MM");
                const span = monthsBetween(from, to).length;
                // §57.4: 서버 상한(36개월)과 같은 규칙을 화면에서도 먼저 막는다.
                if (span === 0 || span > 36) {
                  setTrendRangeNotice("조회 범위는 최대 36개월입니다. 범위를 줄여 주세요.");
                  return;
                }
                setTrendRangeNotice("");
                setTrendRange({ from, to });
                void loadTrend(from, to);
              }}
              placeholder={["시작", "종료"]}
              style={{ minWidth: 320 }}
            />
          </div>
          {trendRangeNotice ? (
            <Alert
              type="warning"
              showIcon
              title={trendRangeNotice}
              role="status"
              aria-live="polite"
              style={{ marginBottom: 16 }}
            />
          ) : null}
          <StateBlock status={trendStatus} onRetry={() => void loadTrend(trendRange.from, trendRange.to)} errorText={trendError}>
            {trendSeries ? (
              <Suspense fallback={<Skeleton active paragraph={{ rows: 3 }} />}>
                <ExpenseTrendChart series={trendSeries} from={trendRange.from} to={trendRange.to} />
              </Suspense>
            ) : null}
          </StateBlock>
        </Card>
      </section>

<section aria-labelledby="h-cashflow">
        <Typography.Title level={2} id="h-cashflow" style={{ fontSize: 16 }}>
          월별 현금흐름
        </Typography.Title>
        <Card>
          <StateBlock status={cashflowStatus} onRetry={load}>
            {cashflowRows.length > 0 ? (
              <>
                {unconfirmedMonths > 0 ? (
                  <Typography.Paragraph
                    type="secondary"
                    role="status"
                    style={{ marginTop: 0, marginBottom: 12 }}
                  >
                    확정 {confirmedMonths}개월 · 미확정 {unconfirmedMonths}개월 — 미확정 월은
                    스냅샷이 확정되지 않아 금액을 표시하지 않습니다 (§34.6).
                  </Typography.Paragraph>
                ) : null}
                <Typography.Paragraph
                  type="secondary"
                  style={{ marginTop: 0, marginBottom: 12 }}
                >
                  수지 = 그 달 수입 − 부가세통장 이체 − 그 달 지출입니다. 이전 달 수지를 더하지 않습니다.
                </Typography.Paragraph>
                {wide ? (
                  <table aria-labelledby="h-cashflow" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th scope="col" style={{ textAlign: "left", paddingBottom: 8 }}>월</th>
                        <th scope="col" style={{ textAlign: "right", paddingBottom: 8 }}>수입</th>
                        <th scope="col" style={{ textAlign: "right", paddingBottom: 8 }}>부가세통장</th>
                        <th scope="col" style={{ textAlign: "right", paddingBottom: 8 }}>지출</th>
                        <th scope="col" style={{ textAlign: "right", paddingBottom: 8 }}>수지</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashflowRows.map((row) =>
                        row.confirmed && row.income !== null && row.vatSetAside !== null && row.expenses !== null && row.balance !== null ? (
                          <tr key={row.month}>
                            <td style={{ paddingBottom: 6 }}>{row.month}</td>
                            <td style={{ textAlign: "right" }}>{formatKrwAbbr(row.income)}</td>
                            <td style={{ textAlign: "right" }}>{formatKrwAbbr(row.vatSetAside)}</td>
                            <td style={{ textAlign: "right" }}>{formatKrwAbbr(row.expenses)}</td>
                            <td style={{ textAlign: "right" }}>{formatSignedKrw(row.balance)}</td>
                          </tr>
                        ) : (
                          <tr key={row.month}>
                            <td style={{ paddingBottom: 6 }}>{row.month}</td>
                            <td
                              colSpan={4}
                              style={{ textAlign: "right", color: "var(--af-muted-foreground)" }}
                            >
                              미확정
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                ) : (
                  <div>
                    {cashflowRows.map((row) => (
                      <MobileListCardItem key={row.month}>
                        {row.confirmed && row.income !== null && row.vatSetAside !== null && row.expenses !== null && row.balance !== null ? (
                          <>
                            <MobileListCardHeader
                              title={row.month}
                              value={formatSignedKrw(row.balance)}
                            />
                            <MobileListCardMeta
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                              }}
                            >
                              <span>수입 {formatKrwAbbr(row.income)}</span>
                              <span>부가세 {formatKrwAbbr(row.vatSetAside)}</span>
                              <span>지출 {formatKrwAbbr(row.expenses)}</span>
                            </MobileListCardMeta>
                          </>
                        ) : (
                          <MobileListCardHeader title={row.month} value="미확정" />
                        )}
                      </MobileListCardItem>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <Typography.Text type="secondary">표시할 월 데이터가 없습니다</Typography.Text>
            )}
          </StateBlock>
        </Card>
      </section>

<ResponsiveGrid spans={{ xs: 24, md: 12 }}>
        <section aria-labelledby="h-composition" style={{ marginBottom: 32 }}>
          <Typography.Title level={2} id="h-composition" style={{ fontSize: 16 }}>
            자산 구성비
          </Typography.Title>
          <Card>
            <StateBlock status={summaryStatus} onRetry={load} errorText={summaryError}>
              {dataReady ? (
                <Suspense fallback={<Skeleton active paragraph={{ rows: 3 }} />}>
                  {/* 번들 분리: recharts 를 대시보드 본체에서 떼어 lazy 로딩한다 (§39 리스크 3) */}
                  <CompositionDonut slices={composition} />
                </Suspense>
              ) : null}
            </StateBlock>
          </Card>
        </section>

        <section aria-labelledby="h-cash" style={{ marginBottom: 32 }}>
          <Typography.Title level={2} id="h-cash" style={{ fontSize: 16 }}>
            {cashHeading}
          </Typography.Title>
          <Card>
            <StateBlock status={summaryStatus} onRetry={load} errorText={summaryError}>
              {cashRows.length === 0 ? (
                <Typography.Text type="secondary">현금성 계좌가 없습니다</Typography.Text>
              ) : (
                <ul className="af-composition">
                  {cashRows.map((row) => (
                    <li key={row.id}>
                      <span>{row.name}</span>
                      <span className="af-num">{formatKrwExact(row.value)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </StateBlock>
          </Card>
        </section>
      </ResponsiveGrid>

      <EmergencyFundSettingsModal
        open={emergencyModalOpen}
        settings={settings}
        assets={summary?.assets ?? []}
        cardTotals={cardTotals}
        cardTotalsError={cardTotalsFailed}
        essentialExpenses={summary?.monthly.essentialExpenses ?? 0}
        onClose={() => setEmergencyModalOpen(false)}
        onSaved={(updated) => setSettings(updated)}
      />
    </AppLayout>
  );
}
