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
  spans?: { xs: number; md?: number; lg?: number };
  children: ReactNode[];
}

export function ResponsiveGrid({ spans = CARD_SPANS, children }: ResponsiveGridProps) {
  const screens = Grid.useBreakpoint();
  const wide = Boolean(screens.lg);
  const gap = wide ? GUTTER.desktop : GUTTER.mobile;
  return (
    <Row gutter={[gap, gap]}>
      {children.map((child, i) => (
        <Col key={i} {...spans}>
          {child}
        </Col>
      ))}
    </Row>
  );
}
