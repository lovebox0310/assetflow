import { useCallback, Suspense, lazy, useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { Alert, Card, DatePicker, Grid, Skeleton, Typography } from "antd";
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
  emergencyFundTotal,
  emergencyMonths,
  monthlyBalance,
  netWorth,
} from "../dashboard/metrics";
import { AssetCompositionList } from "../dashboard/AssetCompositionList";
import { buildExpenseTrend, lastMonthsRange, monthsBetween } from "../dashboard/expenseTrend";
import { listMonthlyCategoryTotals, type MonthlyCategoryTotal } from "../api/cardImportApi";
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

  const [cashflow, setCashflow] = useState<CashflowRow[] | null>(null);
  const [cashflowStatus, setCashflowStatus] = useState<SurfaceStatus>("loading");

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
  }, [load, loadTrend]);

  const trendSeries = trend ? buildExpenseTrend(trend, trendRange.from, trendRange.to, income) : null;

  const handleLogout = () => {
    clearToken();
    onLogout();
  };

  const dataReady = summaryStatus === "ready" && summary !== null;
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
            title="비상금 유지 개월"
            status={summaryStatus}
            onRetry={load}
            hint={
              dataReady
                ? `${formatKrwExact(emergencyFundTotal(summary))} ÷ ${formatKrwExact(summary.monthly.essentialExpenses)}${
                    summary.monthly.essentialComplete ? "" : " · 필수지출 미확정"
                  }`
                : undefined
            }
          >
            {dataReady ? formatMonths(emergencyMonths(summary)) : "—"}
          </MetricCard>
          <MetricCard title="자산 구성비" status={summaryStatus} onRetry={load}>
            <AssetCompositionList slices={composition} />
          </MetricCard>
        </ResponsiveGrid>
      </section>

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
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {cashRows.map((row) => (
                  <li key={row.id}>
                    {row.name} — {formatKrwExact(row.value)}
                  </li>
                ))}
              </ul>
            )}
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
    </AppLayout>
  );
}
