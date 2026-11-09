import { useCallback, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import dayjs from "dayjs";
import { Alert, Button, Card, DatePicker, Skeleton, Switch, Typography } from "antd";
import { AfListTable, type AfListColumn } from "../components/AfListTable";
import { AppLayout } from "../layout/AppLayout";
import { ResponsiveGrid } from "../layout/ResponsiveGrid";
import { StandardNav } from "../layout/StandardNav";
import { StateBlock, type SurfaceStatus } from "../components/StateBlock";
import { MetricCard } from "../components/MetricCard";
import { EmergencyFundSettingsModal } from "../components/EmergencyFundSettingsModal";
import { CompositionBasisModal } from "../components/CompositionBasisModal";
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
  cashflowWindow,
  emergencyRunway,
  investMonths,
  investTotal,
  monthlyBalance,
  netWorth,
  type CashflowMonth,
} from "../dashboard/metrics";
import { CashAccountCards } from "../dashboard/CashAccountCards";
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

interface SectionHeaderLink {
  label: string;
  ariaLabel: string;
  onClick: () => void;
}

/**
 * 비상금 카드의 "기준 설정" 진입 아이콘(톱니). `@ant-design/icons` 를 쓰지 않고
 * 인라인 SVG 로 둔다 — 아이콘 패키지를 새 의존성으로 들이지 않는다.
 */
function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.14.35.46.6.84.66H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/**
 * §74: 섹션 제목 행 — h2 와 그 화면으로 가는 링크를 한 줄에 둔다.
 * h2 의 id 는 바꾸지 않는다(영역 순서·aria-labelledby 계약, §35.1).
 * 링크는 `<a href>` 가 아니라 Button + navigate 콜백이다(pushState 일관성).
 */
function SectionHeader({
  id,
  title,
  link,
  actions,
}: {
  id: string;
  title: string;
  link?: SectionHeaderLink;
  /** 제목 오른쪽 보조 액션(설정 진입 등). h2 id/aria 계약은 그대로다. */
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 16,
        flexWrap: "wrap",
      }}
    >
      <Typography.Title level={2} id={id} style={{ fontSize: 16, margin: 0 }}>
        {title}
      </Typography.Title>
      {actions || link ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {actions}
          {link ? (
            <Button
              type="link"
              size="small"
              aria-label={link.ariaLabel}
              onClick={link.onClick}
              style={{ paddingInline: 8, minHeight: 44 }}
            >
              {link.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface DashboardPageProps {
  /** 로그아웃 후 로그인 화면으로 전환한다 (§21 로그아웃 처리). */
  onLogout: () => void;
  /** 헤더에서 자산 화면으로 이동한다 (§39 화면 범위). */
  onOpenAssets?: () => void;
  /** 헤더에서 지출 화면으로 이동한다 (§42 스프린트 3). */
  onOpenExpenses?: () => void;
  /** 헤더에서 설정 화면으로 이동한다 (§46). */
  onOpenSettings?: () => void;
  /** §74: 카드내역 화면으로 이동한다(자식 탭 — 카드별 사용 내역). */
  onOpenCards?: () => void;
}

/**
 * Issue 7: 실제 API(§38 summary + cashflow)와 연동한다.
 * - 상태는 더 이상 수동 스위치가 아니라 요청 결과에서 나온다: loading → ready/empty/error.
 * - §26 연동 기준 "카드 단위 복구 우선": summary(핵심 지표·구성비·현금)와 cashflow(월별
 *   현금흐름)가 각각의 상태·재시도를 갖는다 — 한쪽 실패가 다른쪽 화면을 중단시키지 않는다.
 * - 오류 문구는 ApiError 의 사용자 친화 메시지(네트워크/인증 구분)를 그대로 보여 준다.
 * - 계산은 여전히 metrics.ts 단일 출처(§34.6). 여기선 데이터를 씌우는 것만 한다.
 */
export function DashboardPage({ onLogout, onOpenAssets, onOpenExpenses, onOpenSettings, onOpenCards }: DashboardPageProps) {
  const [summary, setSummary] = useState<DashboardData | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<SurfaceStatus>("loading");
  const [summaryError, setSummaryError] = useState("");
  // §28.7: 비상금/투자금 유지 개월을 한 카드에서 토글로 전환해서 본다.
  const [showInvestMonths, setShowInvestMonths] = useState(false);
  // §59: 비상금 계좌·카드지출 평균 기준. 설정 실패 시에도 카드는 기본값으로 동작한다.
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<SurfaceStatus>("loading");
  const [cardTotals, setCardTotals] = useState<MonthlyCategoryTotal[] | null>(null);
  const [cardTotalsFailed, setCardTotalsFailed] = useState(false);
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  // §89 구성비에서 전액 현금성으로 볼 계좌 지정 모달.
  const [compositionModalOpen, setCompositionModalOpen] = useState(false);
  // 비상금 카드 상세(월 사용액·계좌·집계 근거) 펼침 — 기본은 1줄 요약만 보여 준다.
  const [runwayDetailOpen, setRunwayDetailOpen] = useState(false);

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
   * §59: 비상금 카드의 기준(비상금 계좌·평균 개월·카테고리)과 카드지출만의
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
  /*
   * 비상금/투자금 카드 문구: 접힘 = 항상 1줄 요약, 펼침 = 기존 상세 전부.
   * 요약에 이미 나온 문장은 상세에서 뺀다(중복 제거). 투자금 모드의 상세는
   * 기존과 같이 월 사용액 한 줄만 둔다 — 없던 정보를 새로 만들지 않는다.
   */
  const summaryLine =
    dataReady && runway
      ? showInvestMonths
        ? `${formatKrwExact(investTotal(summary))} ÷ ${monthlySpendLabel}`
        : !runway.accountSelected
          ? "비상금 계좌를 지정해 주세요"
          : `예측 비상금 ${formatKrwExact(runway.predictedFund)} · 목표 ${targetMonths}개월`
      : "";
  const detailLines: string[] =
    dataReady && runway
      ? [
          showInvestMonths
            ? `월 사용액 = 필수 ${formatKrwExact(runway.fixedMonthly)} + 카드 ${formatKrwExact(Math.round(runway.variableMonthly))}`
            : `월 사용액 ${monthlySpendLabel} = 필수 ${formatKrwExact(runway.fixedMonthly)} + 카드 ${formatKrwExact(Math.round(runway.variableMonthly))}`,
          !showInvestMonths && runway.accountSelected
            ? `비상금 계좌 ${runway.accountCount}개 합계 ${formatKrwExact(runway.accountBalance)}`
            : "",
          showInvestMonths
            ? ""
            : runway.usedCurrentMonthFallback
              ? "이전 카드 데이터 없음 · 이번 달(진행 중) 기준"
              : `카드 데이터 ${runway.monthsWithCardData}/${avgMonths}개월 집계`,
          showInvestMonths || summary.monthly.essentialComplete ? "" : "필수지출 미확정",
          !showInvestMonths && runway.unclassifiedTotal > 0
            ? `미분류 ${formatKrwExact(runway.unclassifiedTotal)} 제외`
            : "",
        ].filter((line) => line !== "")
      : [];
  // §89: 체크한 계좌는 전액 현금성. 비어 있으면 §88 기본 규칙 그대로다.
  const compositionIds = settings?.compositionCashAccountIds ?? [];
  const composition = dataReady
    ? assetComposition(summary, { cashAccountIds: compositionIds })
    : [];
  // §62: 대시보드에서는 현금 전체가 아니라 사용자가 지정한 비상금 계좌만 한눈에 본다.
  const emergencyIds = settings?.emergencyAccountIds ?? [];
  const emergencyRows = dataReady
    ? summary.assets.filter((a) => emergencyIds.includes(a.id))
    : [];
  // #73: 3개월 → 6개월. 행이 없는 월은 0원이 아니라 "미확정"으로 남긴다(§34.6).
  const cashflowRows = cashflow ? cashflowWindow(cashflow, CASHFLOW_MONTHS) : [];
  const confirmedMonths = cashflowRows.filter((row) => row.confirmed).length;
  const unconfirmedMonths = cashflowRows.length - confirmedMonths;

  /** 확정 월만 금액을 보여 준다 — 없는 값을 0 으로 메우지 않는다 (§34.6). */
  type ConfirmedCashflow = CashflowMonth & {
    income: number;
    vatSetAside: number;
    expenses: number;
    balance: number;
  };
  const isConfirmed = (row: CashflowMonth): row is ConfirmedCashflow =>
    row.confirmed &&
    row.income !== null &&
    row.vatSetAside !== null &&
    row.expenses !== null &&
    row.balance !== null;

  const cashflowColumns: AfListColumn<CashflowMonth>[] = [
    { key: "month", header: "월", mobile: "primary", render: (r) => r.month },
    { key: "income", header: "수입", numeric: true, render: (r) => (isConfirmed(r) ? formatKrwAbbr(r.income) : "—") },
    {
      key: "vat",
      header: "부가세통장",
      numeric: true,
      render: (r) => (isConfirmed(r) ? formatKrwAbbr(r.vatSetAside) : "—"),
    },
    { key: "expenses", header: "지출", numeric: true, render: (r) => (isConfirmed(r) ? formatKrwAbbr(r.expenses) : "—") },
    {
      key: "balance",
      header: "수지",
      numeric: true,
      mobile: "value",
      render: (r) => (isConfirmed(r) ? formatSignedKrw(r.balance) : "미확정"),
    },
  ];

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
        {/* §74: 핵심 지표는 3종. lg 에서 3열(span 8)로 균등 배치한다.
            align="stretch" — 카드 높이는 가장 큰 내용에 맞춰 세 카드가 같아진다
            (보조 문구 줄 수가 달라도 높이 차 0). */}
        <ResponsiveGrid spans={{ xs: 24, md: 12, lg: 8 }} align="stretch">
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
              <div className="af-runway-extra">
                <Switch
                  size="small"
                  checkedChildren="투자금"
                  unCheckedChildren="비상금"
                  checked={showInvestMonths}
                  onChange={setShowInvestMonths}
                  aria-label="유지 개월 모드 전환"
                />
                <Button
                  type="text"
                  size="small"
                  className="af-icon-btn"
                  aria-label="기준 설정"
                  title="기준 설정"
                  onClick={() => setEmergencyModalOpen(true)}
                >
                  <GearIcon />
                </Button>
              </div>
            }
            hint={
              dataReady && runway ? (
                <>
                  <div className="af-runway-line">
                    <span className="af-runway-summary">{summaryLine}</span>
                    <Button
                      type="text"
                      size="small"
                      className="af-tap-sm af-runway-more"
                      aria-expanded={runwayDetailOpen}
                      aria-controls="runway-detail"
                      onClick={() => setRunwayDetailOpen((v) => !v)}
                    >
                      {runwayDetailOpen ? "접기" : "자세히"}
                    </Button>
                  </div>
                  {runwayDetailOpen ? (
                    <div id="runway-detail" className="af-runway-detail">
                      {detailLines.map((line) => (
                        <span key={line}>{line}</span>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : undefined
            }
          >
            {dataReady && runway
              ? formatMonths(showInvestMonths ? investMonths(summary, runway.monthlySpend) : runway.runwayMonths)
              : "—"}
          </MetricCard>
        </ResponsiveGrid>
      </section>

      <ResponsiveGrid spans={{ xs: 24, md: 24, xl: 12 }} align="stretch">
        <section
          aria-labelledby="h-composition"
          style={{ marginBottom: 32, height: "100%", display: "flex", flexDirection: "column" }}
        >
          <SectionHeader
            id="h-composition"
            title="자산 구성비"
            actions={
              <Button
                type="text"
                aria-label="자산 구성비 기준 설정"
                title="자산 구성비 기준 설정"
                onClick={() => setCompositionModalOpen(true)}
                style={{ minHeight: 44 }}
              >
                <GearIcon />
              </Button>
            }
            link={{ label: "자산 화면 보기", ariaLabel: "자산 화면 보기 — 자산 구성비", onClick: () => onOpenAssets?.() }}
          />
          <Card
            style={{ flex: 1, display: "flex", flexDirection: "column" }}
            styles={{ body: { flex: 1, display: "flex", flexDirection: "column" } }}
          >
            <StateBlock status={summaryStatus} onRetry={load} errorText={summaryError}>
              {dataReady ? (
                <Suspense fallback={<Skeleton active paragraph={{ rows: 3 }} />}>
                  {/* 번들 분리: recharts 를 대시보드 본체에서 떼어 lazy 로딩한다 (§39 리스크 3) */}
                  <CompositionDonut slices={composition} />
                </Suspense>
              ) : null}
              {dataReady ? (
                <Typography.Paragraph className="af-comp-caption">
                  {compositionIds.length > 0
                    ? `현금성 = 통장 + 증권 예수금 + 체크한 계좌 ${compositionIds.length}개`
                    : "현금성 = 통장 + 증권 예수금"}
                </Typography.Paragraph>
              ) : null}
            </StateBlock>
          </Card>
        </section>

        <section
          aria-labelledby="h-emergency-accounts"
          style={{ marginBottom: 32, height: "100%", display: "flex", flexDirection: "column" }}
        >
          <SectionHeader
            id="h-emergency-accounts"
            title="비상금 계좌"
            link={{ label: "자산 화면 보기", ariaLabel: "자산 화면 보기 — 비상금 계좌", onClick: () => onOpenAssets?.() }}
          />
          <Card
            style={{ flex: 1, display: "flex", flexDirection: "column" }}
            styles={{ body: { flex: 1, display: "flex", flexDirection: "column" } }}
          >
            <StateBlock status={summaryStatus} onRetry={load} errorText={summaryError}>
              {dataReady ? (
                <CashAccountCards
                  rows={emergencyRows}
                  emergencyAccountIds={emergencyIds}
                />
              ) : null}
            </StateBlock>
          </Card>
        </section>
      </ResponsiveGrid>

<section aria-labelledby="h-card-groups" style={{ marginBottom: 32 }}>
        <SectionHeader
          id="h-card-groups"
          title="카드별 본인·가족 사용 내역"
          link={{ label: "카드내역 보기", ariaLabel: "카드내역 보기 — 카드별 사용 내역", onClick: () => onOpenCards?.() }}
        />
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
              style={{ flex: "1 1 220px", minWidth: 0, maxWidth: 360 }}
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
        <SectionHeader
          id="h-trend"
          title="지출 추이"
          link={{ label: "지출 화면 보기", ariaLabel: "지출 화면 보기 — 지출 추이", onClick: () => onOpenExpenses?.() }}
        />
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
              style={{ flex: "1 1 220px", minWidth: 0, maxWidth: 360 }}
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
        <SectionHeader
          id="h-cashflow"
          title="월별 현금흐름"
          link={{ label: "지출 화면 보기", ariaLabel: "지출 화면 보기 — 월별 현금흐름", onClick: () => onOpenExpenses?.() }}
        />
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
                    확정 {confirmedMonths}개월 · 미확정 {unconfirmedMonths}개월 — 아직 확정하지
                    않은 달은 금액을 표시하지 않습니다.
                    {/* §34.6 미확정 월은 금액을 표시하지 않는다 */}
                  </Typography.Paragraph>
                ) : null}
                <Typography.Paragraph
                  type="secondary"
                  style={{ marginTop: 0, marginBottom: 12 }}
                >
                  수지 = 그 달 수입 − 부가세통장 이체 − 그 달 지출입니다. 이전 달 수지를 더하지 않습니다.
                </Typography.Paragraph>
                <AfListTable
                  labelledBy="h-cashflow"
                  rows={cashflowRows}
                  rowKey={(row) => row.month}
                  columns={cashflowColumns}
                  rowSubtitle={(row) =>
                    isConfirmed(row)
                      ? `수입 ${formatKrwAbbr(row.income)} · 지출 ${formatKrwAbbr(row.expenses)} · 부가세 ${formatKrwAbbr(row.vatSetAside)}`
                      : "아직 확정하지 않은 달"
                  }
                />
              </>
            ) : (
              <Typography.Text type="secondary">표시할 월 데이터가 없습니다</Typography.Text>
            )}
          </StateBlock>
        </Card>
      </section>

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

      <CompositionBasisModal
        open={compositionModalOpen}
        settings={settings}
        data={summary}
        onClose={() => setCompositionModalOpen(false)}
        onSaved={(updated) => setSettings(updated)}
      />
    </AppLayout>
  );
}
