import { useEffect, useState } from "react";
import { Alert, Button, Empty, Input, Modal, Spin, Typography } from "antd";
import { searchBonds, type BondItem } from "../api/investmentsApi";
import { ApiError } from "../api/client";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (bond: BondItem) => void;
}

const DEBOUNCE_MS = 300;

function dateRange(bond: BondItem): string {
  const issue = bond.issueDate ? `발행 ${bond.issueDate}` : "발행 날짜 미상";
  const maturity = bond.maturityDate ? `만기 ${bond.maturityDate}` : "만기 날짜 미상";
  return `${bond.code} · ${issue} ~ ${maturity}`;
}

/**
 * BOND-SEARCH-1 채권 마스터 검색 모달.
 *
 * 이름으로 찾아 선택하면 종목명·종목번호·발행일·만기일을 폼에 채운다. 마스터에 없는
 * 보험 상품은 이 모달을 쓰지 않고 기존 수동 입력을 그대로 쓴다.
 */
export function BondSearchModal({ open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<BondItem[] | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setItems(null);
    setWarning(null);
    setError("");
    setLoading(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 1) {
      setItems(null);
      setWarning(null);
      setError("");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchBonds(q, 20)
        .then((result) => {
          if (cancelled) return;
          setItems(result.items);
          setWarning(result.warning);
          setError("");
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setItems(null);
          setWarning(null);
          setError(e instanceof ApiError
            ? e.detail ?? e.message
            : e instanceof Error ? e.message : "채권을 검색하지 못했습니다");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  return (
    <Modal
      open={open}
      title="채권 찾기"
      onCancel={onClose}
      centered
      destroyOnHidden
      width="min(640px, calc(100vw - 24px))"
      styles={{
        container: {
          maxHeight: "calc(100dvh - 32px)",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
        },
        body: {
          overflowY: "auto",
          flex: "1 1 auto",
          minHeight: 0,
          padding: "0 16px 12px",
          overscrollBehavior: "contain",
        },
        footer: {
          margin: 0,
          flex: "0 0 auto",
          padding: "12px 16px calc(12px + var(--af-safe-bottom))",
          borderTop: "1px solid var(--af-border)",
        },
      }}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={onClose}>닫기</Button>
        </div>
      }
    >
      <Input
        autoFocus
        allowClear
        aria-label="채권 검색"
        placeholder="종목명 또는 종목번호 (예: 국고03000, KR1035)"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        style={{ marginBottom: 12 }}
      />

      {error ? (
        <Alert type="error" showIcon title="채권 검색 오류" description={error} aria-live="assertive" />
      ) : null}

      {warning ? (
        <Alert
          type="warning"
          showIcon
          title="채권 마스터 안내"
          description={warning}
          style={{ marginBottom: 8 }}
        />
      ) : null}

      {loading ? (
        <div style={{ padding: 24, textAlign: "center" }}>
          <Spin />
        </div>
      ) : null}

      {!loading && items && items.length === 0 ? (
        <Empty description="검색 결과가 없습니다. 이름을 줄이거나 직접 입력하세요." />
      ) : null}

      {!loading && items && items.length > 0 ? (
        <ul aria-label="채권 검색 결과" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {items.map((bond) => (
            <li key={bond.code}>
              <button
                type="button"
                onClick={() => {
                  onSelect(bond);
                  onClose();
                }}
                style={{
                  width: "100%",
                  minHeight: 48,
                  textAlign: "left",
                  background: "transparent",
                  border: 0,
                  borderTop: "1px solid var(--af-border)",
                  padding: "8px 4px",
                  cursor: "pointer",
                  color: "inherit",
                }}
              >
                <span style={{ display: "block", fontWeight: 600, overflowWrap: "anywhere" }}>
                  {bond.name}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "var(--af-muted-foreground)",
                    overflowWrap: "anywhere",
                  }}
                >
                  {dateRange(bond)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && !items && !error ? (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          이름 또는 종목번호를 입력하면 채권 마스터(18,000여 건)에서 찾습니다.
        </Typography.Paragraph>
      ) : null}
    </Modal>
  );
}
