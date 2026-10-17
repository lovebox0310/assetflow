import { Card, Typography } from "antd";
import type { ReactNode } from "react";
import { StateBlock, type SurfaceStatus } from "./StateBlock";

interface MetricCardProps {
  title: string;
  status: SurfaceStatus;
  onRetry?: () => void;
  /** ready 상태의 본문 값(포맷 완료된 문자열 또는 조각 목록) */
  children: ReactNode;
  /** 본문 아래 보조 문구 (상세 금액·경고) */
  hint?: ReactNode;
}

/**
 * 카드 4종 공통 껍데기. 값은 metrics.ts, 포맷은 formatters.ts 만 쓰고
 * 이 컴포넌트는 배치와 상태 렌더만 담당한다 (§23 작업: 카드 4종 UI 컴포넌트).
 * 숫자 세로 정렬은 .af-num (font-variant-numeric: tabular-nums, §28.2).
 */
export function MetricCard({ title, status, onRetry, children, hint }: MetricCardProps) {
  return (
    <Card title={title} style={{ height: "100%" }}>
      <StateBlock status={status} {...(onRetry ? { onRetry } : {})}>
        <div className="af-num" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.35 }}>
          {children}
        </div>
        {hint ? (
          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
            {hint}
          </Typography.Text>
        ) : null}
      </StateBlock>
    </Card>
  );
}
