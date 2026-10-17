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
        type="error"
        showIcon
        title="데이터를 불러오지 못했습니다"
        description={errorText || undefined}
        action={
          onRetry ? (
            <Button size="small" onClick={onRetry}>
              재시도
            </Button>
          ) : undefined
        }
      />
    );
  }
  return <>{children}</>;
}
