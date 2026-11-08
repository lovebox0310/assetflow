import type { ReactNode } from "react";
import { Col, Grid, Row } from "antd";
import { GUTTER } from "../theme/tokens";

/**
 * §35 그리드 규칙 (핵심 카드 4종 기준):
 *   - <768px   : 1열 (xs 24)
 *   - 768~991  : 2열 (md 12)
 *   - >=992    : 4열 1스크린 (lg 6)
 * §28.2 의 antd Grid(Row/Col) 경로를 따른다.
 */
export const CARD_SPANS = { xs: 24, md: 12, lg: 6 } as const;

interface ResponsiveGridProps {
  /** Col span 맵. 기본값은 핵심 카드 4종. */
  spans?: { xs: number; md?: number; lg?: number; xl?: number };
  /** 같은 행 카드의 세로 정렬. 기본 "top" — 기존 호출부 동작은 그대로다. */
  align?: "top" | "middle" | "bottom" | "stretch";
  children: ReactNode[];
}

export function ResponsiveGrid({ spans = CARD_SPANS, align = "top", children }: ResponsiveGridProps) {
  const screens = Grid.useBreakpoint();
  const wide = Boolean(screens.lg);
  const gap = wide ? GUTTER.desktop : GUTTER.mobile;
  return (
    <Row gutter={[gap, gap]} align={align}>
      {children.map((child, i) => (
        <Col key={i} {...spans}>
          {child}
        </Col>
      ))}
    </Row>
  );
}
