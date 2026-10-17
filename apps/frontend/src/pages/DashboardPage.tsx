import { useState } from "react";
import { Card, Segmented, Typography } from "antd";
import { AppLayout } from "../layout/AppLayout";
import { ResponsiveGrid } from "../layout/ResponsiveGrid";
import { StateBlock, type SurfaceStatus } from "../components/StateBlock";
import { clearToken } from "../auth/authStore";

const CORE_CARDS = ["순자산", "월 수지", "비상금 유지 개월", "자산 구성비"] as const;

interface DashboardPageProps {
  /** 로그아웃 후 로그인 화면으로 전환한다 (§21 로그아웃 처리). */
  onLogout: () => void;
}

/**
 * Issue 3: 대시보드 정보구조와 반응형 레이아웃.
 * 영역 순서(§35, 프로토타입 dashboard.html과 동일): 핵심 지표 4종 → 자산 구성비 →
 * 현금 3계좌 → 월별 현금흐름. 카드 내용과 계산은 Issue 4, 실데이터는 Issue 7.
 * 상태 미리보기는 §31 의 프로토타입 관례 — 레이아웃 AC(로딩/빈 상태)를
 * 화면으로 증명할 수 있게 한다.
 */
export function DashboardPage({ onLogout }: DashboardPageProps) {
  const [preview, setPreview] = useState<SurfaceStatus>("ready");

  const handleLogout = () => {
    clearToken();
    onLogout();
  };

  return (
    <AppLayout onLogout={handleLogout}>
      <section aria-labelledby="h-core" style={{ marginBottom: 32 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <Typography.Title level={4} id="h-core" style={{ margin: 0 }}>
            핵심 지표
          </Typography.Title>
          <Segmented
            aria-label="상태 미리보기"
            options={["ready", "loading", "empty", "error"]}
            value={preview}
            onChange={(v) => setPreview(v as SurfaceStatus)}
          />
        </div>
        <ResponsiveGrid>
          {CORE_CARDS.map((title) => (
            <Card key={title} title={title}>
              <StateBlock status={preview} onRetry={() => setPreview("ready")}>
                <Typography.Text type="secondary">
                  카드 값은 Issue 4(계산 로직)에서 채워집니다
                </Typography.Text>
              </StateBlock>
            </Card>
          ))}
        </ResponsiveGrid>
      </section>

      <section aria-labelledby="h-composition" style={{ marginBottom: 32 }}>
        <Typography.Title level={4} id="h-composition">
          자산 구성비
        </Typography.Title>
        <Card>
          <StateBlock status={preview} onRetry={() => setPreview("ready")}>
            <Typography.Text type="secondary">
              도넛 차트 영역 — Issue 4에서 구현
            </Typography.Text>
          </StateBlock>
        </Card>
      </section>

      <section aria-labelledby="h-cash" style={{ marginBottom: 32 }}>
        <Typography.Title level={4} id="h-cash">
          현금 3계좌
        </Typography.Title>
        <Card>
          <StateBlock status={preview} onRetry={() => setPreview("ready")}>
            <Typography.Text type="secondary">
              요구불/파킹/예적금 요약 영역 — Issue 4에서 구현
            </Typography.Text>
          </StateBlock>
        </Card>
      </section>

      <section aria-labelledby="h-cashflow">
        <Typography.Title level={4} id="h-cashflow">
          월별 현금흐름
        </Typography.Title>
        <Card>
          <StateBlock status={preview} onRetry={() => setPreview("ready")}>
            <Typography.Text type="secondary">
              최근 6개월 차트 영역 — Issue 4에서 구현
            </Typography.Text>
          </StateBlock>
        </Card>
      </section>
    </AppLayout>
  );
}
