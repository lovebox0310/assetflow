import { useCallback, Suspense, lazy, useEffect, useRef, useState } from "react";
import { Card, Skeleton, Typography } from "antd";
import { AppLayout } from "../layout/AppLayout";
import { ResponsiveGrid } from "../layout/ResponsiveGrid";
import { StandardNav } from "../layout/StandardNav";
import { StateBlock, type SurfaceStatus } from "../components/StateBlock";
import { MetricCard } from "../components/MetricCard";
import type { DashboardData } from "../data/dashboardMock";
import { fetchCashflow, fetchDashboardSummary, type CashflowRow } from "../api/dashboardApi";
import { assetComposition, emergencyMonths, monthlyBalance, netWorth } from "../dashboard/metrics";
import { AssetCompositionList } from "../dashboard/AssetCompositionList";
import {
  formatKrwAbbr,
  formatKrwExact,
  formatMonths,
  formatSignedKrw,
} from "../utils/formatters";
import { clearToken } from "../auth/authStore";

const CompositionDonut = lazy(() => import("../components/CompositionDonut").then(m => ({ default: m.CompositionDonut })));

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
  const [summary, setSummary] = useState<DashboardData | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<SurfaceStatus>("loading");
  const [summaryError, setSummaryError] = useState("");

  const [cashflow, setCashflow] = useState<CashflowRow[] | null>(null);
  const [cashflowStatus, setCashflowStatus] = useState<SurfaceStatus>("loading");

  // React 18 StrictMode 더블 마운트 + 리마운트에서도 중복 호출이 없어야 한다.
  // dedupe 가 네트워크 중복을 막지만, 마운트마다 재요청 자체도 마운트 플래그로 막는다.
  const mountedRef = useRef(false);

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

    fetchCashflow()
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
  }, [load]);

  const handleLogout = () => {
    clearToken();
    onLogout();
  };

  const dataReady = summaryStatus === "ready" && summary !== null;
  const composition = dataReady ? assetComposition(summary) : [];
  const cashRows = dataReady ? summary.assets.filter((a) => a.type === "cash") : [];

  return (
    <AppLayout
      onLogout={handleLogout}
      nav={<StandardNav current="dashboard" onOpenAssets={onOpenAssets} onOpenExpenses={onOpenExpenses} onOpenSettings={onOpenSettings} />}
    >
      <section aria-labelledby="h-core" style={{ marginBottom: 32 }}>
        <Typography.Title level={4} id="h-core" style={{ margin: 0, marginBottom: 16 }}>
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
            hint={dataReady ? `수입 ${formatKrwAbbr(summary.monthly.income)} · 지출 ${formatKrwAbbr(summary.monthly.expenses)}` : undefined}
          >
            {dataReady ? formatSignedKrw(monthlyBalance(summary)) : "—"}
          </MetricCard>
          <MetricCard
            title="비상금 유지 개월"
            status={summaryStatus}
            onRetry={load}
            hint={dataReady && !summary.monthly.essentialComplete ? "필수지출에 미확정 항목이 있습니다" : undefined}
          >
            {dataReady ? formatMonths(emergencyMonths(summary)) : "—"}
          </MetricCard>
          <MetricCard title="자산 구성비" status={summaryStatus} onRetry={load}>
            <AssetCompositionList slices={composition} />
          </MetricCard>
        </ResponsiveGrid>
      </section>

      <section aria-labelledby="h-composition" style={{ marginBottom: 32 }}>
        <Typography.Title level={4} id="h-composition">
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
        <Typography.Title level={4} id="h-cash">
          현금 3계좌
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
        <Typography.Title level={4} id="h-cashflow">
          월별 현금흐름
        </Typography.Title>
        <Card>
          <StateBlock status={cashflowStatus} onRetry={load}>
            {cashflow && cashflow.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", paddingBottom: 8 }}>월</th>
                    <th style={{ textAlign: "right", paddingBottom: 8 }}>수입</th>
                    <th style={{ textAlign: "right", paddingBottom: 8 }}>지출</th>
                    <th style={{ textAlign: "right", paddingBottom: 8 }}>수지</th>
                  </tr>
                </thead>
                <tbody>
                  {cashflow.map((row) => (
                    <tr key={row.month}>
                      <td style={{ paddingBottom: 6 }}>{row.month}</td>
                      <td style={{ textAlign: "right" }}>{formatKrwAbbr(row.income)}</td>
                      <td style={{ textAlign: "right" }}>{formatKrwAbbr(row.expenses)}</td>
                      <td style={{ textAlign: "right" }}>{formatSignedKrw(row.income - row.expenses)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Typography.Text type="secondary">표시할 월 데이터가 없습니다</Typography.Text>
            )}
          </StateBlock>
        </Card>
      </section>
    </AppLayout>
  );
}
