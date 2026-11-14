import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Modal, Spin, Typography } from "antd";
import { previewKisBonds, type KisBondPreview } from "../api/investmentsApi";
import { ApiError } from "../api/client";

interface Props {
  accountId: number;
  accountName: string;
  open: boolean;
  onClose: () => void;
}

/** 원본 JSON 에서 잔고 rows 수를 안전하게 센다. */
function balanceRows(balance: unknown): number {
  if (!balance || typeof balance !== "object") return 0;
  const output = (balance as { output?: unknown }).output;
  return Array.isArray(output) ? output.length : 0;
}

/**
 * KIS-BOND-2 IRP 채권 원본 진단 모달 (읽기 전용).
 *
 * 동기화 결과에 채권이 안 보일 때, KIS 가 실제로 무엇을 돌려줬는지(잔고/현재가 JSON)를
 * 그대로 확인한다. 이 화면은 저장·동기화를 하지 않는다 — 복사해서 개발/지원에 공유한다.
 */
export function KisBondPreviewModal({ accountId, accountName, open, onClose }: Props) {
  const [data, setData] = useState<KisBondPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setError("");
    setCopied(false);
    setLoading(true);
    previewKisBonds(accountId)
      .then(setData)
      .catch((e: unknown) => {
        const message = e instanceof ApiError
          ? e.detail ?? e.message
          : e instanceof Error ? e.message : "채권 진단을 불러오지 못했습니다";
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [open, accountId]);

  const json = useMemo(() => (data ? JSON.stringify(data, null, 2) : ""), [data]);
  const rows = data ? balanceRows(data.balance) : 0;
  const priceCount = data?.prices.length ?? 0;

  const copy = async () => {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      setError("클립보드에 복사하지 못했습니다. JSON 을 직접 선택해 복사해 주세요.");
    }
  };

  return (
    <Modal
      open={open}
      title={`채권 진단 · ${accountName}`}
      onCancel={onClose}
      centered
      destroyOnHidden
      width="min(720px, calc(100vw - 24px))"
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
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={() => void copy()} disabled={!data}>
            복사
          </Button>
          <Button type="primary" onClick={onClose}>
            닫기
          </Button>
        </div>
      }
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          title="채권 진단 오류"
          description={error}
          style={{ marginBottom: 12 }}
          aria-live="assertive"
        />
      ) : null}

      {loading ? (
        <div style={{ padding: 24, textAlign: "center" }}>
          <Spin />
        </div>
      ) : null}

      {data ? (
        <>
          <Typography.Paragraph style={{ marginTop: 0 }}>
            잔고 rows <b>{rows}</b>건 · 현재가 <b>{priceCount}</b>건
          </Typography.Paragraph>
          {data.error ? (
            <Alert
              type="warning"
              showIcon
              title="채권 잔고 조회 오류"
              description={data.error}
              style={{ marginBottom: 12 }}
            />
          ) : null}
          {copied ? (
            <div role="status" aria-live="polite" style={{ marginBottom: 8 }}>
              <Typography.Text type="success">JSON 을 복사했습니다</Typography.Text>
            </div>
          ) : null}
          <pre
            aria-label="채권 진단 원본 JSON"
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              margin: 0,
              padding: 12,
              fontSize: 12,
              lineHeight: 1.5,
              background: "var(--af-secondary)",
              border: "1px solid var(--af-border)",
              borderRadius: 8,
            }}
          >
            {json}
          </pre>
        </>
      ) : null}
    </Modal>
  );
}
