import { Card } from "antd";
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
  /** 제목 오른쪽에 붙는 액션(스위치·버튼 등) */
  extra?: ReactNode;
}

/**
 * "6.9억" → 6.9 + 작은 "억". 단위가 없으면 그대로.
 *
 * 숫자부와 단위부를 나눠 단위만 작게 그린다. 두 조각은 DOM 에서 이어지므로
 * textContent 는 "6.9억" 그대로이고, 값을 가리거나 중복 낭독시키는 요소는
 * 두지 않는다.
 */
function splitUnit(node: ReactNode): ReactNode {
  if (typeof node !== "string") return node;
  const m = node.match(/^(.+?)(\s*)(억|만|개월|원|%)$/);
  if (!m) return node;
  return (
    <span>
      {m[1]}
      <span className="af-metric-unit">{m[3]}</span>
    </span>
  );
}

/**
 * 카드 4종 공통 껍데기. 값은 metrics.ts, 포맷은 formatters.ts 만 쓰고
 * 이 컴포넌트는 배치와 상태 렌더만 담당한다 (§23 작업: 카드 4종 UI 컴포넌트).
 * 숫자 세로 정렬은 .af-num (font-variant-numeric: tabular-nums, §28.2).
 */
export function MetricCard({ title, status, onRetry, children, hint, extra }: MetricCardProps) {
  return (
    /*
      이슈 #70 제목 체계: 카드 제목은 h3 (§ 표준: h1 페이지 → h2 섹션 → h3 카드).
      시각 크기는 기존과 동일하다(1em = 부모 16px, 굵기 600).
    */
    <Card title={<h3 style={{ margin: 0, fontSize: "1em", fontWeight: 600 }}>{title}</h3>} extra={extra} style={{ height: "100%" }}>
      <StateBlock status={status} {...(onRetry ? { onRetry } : {})}>
        <div className="af-num af-metric-value" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.35 }}>
          {splitUnit(children)}
        </div>
        {hint ? <div className="af-metric-hint">{hint}</div> : null}
      </StateBlock>
    </Card>
  );
}
