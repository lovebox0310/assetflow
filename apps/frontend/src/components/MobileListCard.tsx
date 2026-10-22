import type { ReactNode, CSSProperties } from "react";

export interface MobileListCardItemProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function MobileListCardItem({ children, className, style }: MobileListCardItemProps) {
  return (
    <div
      className={className}
      style={{
        border: "1px solid var(--af-border)",
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 10,
        background: "var(--af-card)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface MobileListCardHeaderProps {
  title: ReactNode;
  value?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function MobileListCardHeader({ title, value, className, style }: MobileListCardHeaderProps) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        ...style,
      }}
    >
      <span style={{ fontWeight: 700, wordBreak: "break-all" }}>{title}</span>
      {value !== undefined && (
        <span style={{ whiteSpace: "nowrap", fontWeight: 700 }}>{value}</span>
      )}
    </div>
  );
}

export interface MobileListCardMetaProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function MobileListCardMeta({ children, className, style }: MobileListCardMetaProps) {
  return (
    <div
      className={className}
      style={{
        fontSize: 12,
        color: "var(--af-muted-foreground)",
        marginTop: 4,
        wordBreak: "break-all",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface MobileListCardActionsProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function MobileListCardActions({ children, className, style }: MobileListCardActionsProps) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 10,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
