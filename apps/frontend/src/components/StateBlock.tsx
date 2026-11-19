import type { ReactNode } from "react";
import { Alert, Button, Empty, Skeleton } from "antd";

export type SurfaceStatus = "loading" | "empty" | "error" | "ready";

interface StateBlockProps {
  status: SurfaceStatus;
  /** error 상태에서 재시도 버튼. 없으면 메시지만 보여 준다. */
  onRetry?: () => void;
  emptyText?: string;
  /** error 상태의 부가 설명 (ApiError 의 사용자 친화 문구, §26). */
  errorText?: string;
  children: ReactNode;
}

/**
 * Issue 3 AC "로딩/빈 데이터 상태 UI 제공" 의 단일 구현체.
 * Issue 4 카드 4종이 같은 상태를 이 블록으로 감싼다 — 화면마다 다른
 * 스피너/문구를 만들지 않는다.
 */
export function StateBlock({ status, onRetry, emptyText = "데이터가 없습니다", errorText, children }: StateBlockProps) {
  if (status === "loading") {
    return <Skeleton active paragraph={{ rows: 2 }} />;
  }
  if (status === "empty") {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />;
  }
  if (status === "error") {
    return (
      <Alert
        /* 이슈 #36 AS-01: 좁은 화면(≤430)에서만 액션을 문구 아래로 내린다.
           배치 규칙은 app.css 의 `.af-alert` 블록이 갖고, 여기서는 그 훅만 단다
           (데스크톱은 antd 기본 인라인 배치 그대로). */
        className="af-alert"
        type="error"
        showIcon
        title="데이터를 불러오지 못했습니다"
        description={errorText || undefined}
        /* 이슈 #70: 오류 알림도 aria-live — 읽기 전용 모드의 콘텐츠처럼
           무음으로 렌더되지 않게 한다. role=alert(기본) + 즉시(al) 통지. */
        aria-live="assertive"
        action={
          onRetry ? (
            /* 이슈 #36 AS-03: size="small"(28)은 전역 히트 확장 규칙에서
               제외돼 28 로 남았다 — 기본 크기 + min-height 44 로 실제 박스를
               44 로 만든다(전 화면 공통). */
            <Button className="af-retry-btn" onClick={onRetry}>
              재시도
            </Button>
          ) : undefined
        }
      />
    );
  }
  return <>{children}</>;
}
