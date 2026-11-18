import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Modal, Spin, Typography } from "antd";
import { previewKisPension, type KisPensionPreview } from "../api/investmentsApi";
import { ApiError } from "../api/client";

interface Props {
  accountId: number;
  accountName: string;
  open: boolean;
  onClose: () => void;
}

/**
 * 개인연금(22)/IRP(29) 퇴직연금 잔고 원본 진단 모달 (읽기 전용).
 *
 * 동기화 결과가 비어 보일 때, KIS 가 실제로 무엇을 돌려줬는지(TTTC2208R JSON)를
 * 그대로 확인한다. 이 화면은 저장·동기화를 하지 않는다 — 복사해서 개발/지원에 공유한다.
 * 구조·여백은 KisBondPreviewModal 과 같게 유지한다(320px 가로 넘침 0).
 */
export function KisPensionPreviewModal({ accountId, accountName, open, onClose }: Props) {
  const [data, setData] = useState<KisPensionPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setError("");
    setCopied(false);
    setLoading(true);
    previewKisPension(accountId)
      .then(setData)
      .catch((e: unknown) => {
        const message = e instanceof ApiError
          ? e.detail ?? e.message
          : e instanceof Error ? e.message : "연금 진단을 불러오지 못했습니다";
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [open, accountId]);

  const json = useMemo(() => (data ? JSON.stringify(data, null, 2) : ""), [data]);
  // 상품코드가 없거나 공백이면 "null" 대신 — 를 보여 준다(자격증명 누락 진단 경로).
  const productCode = data?.acntPrdtCd?.trim() || "—";

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
      title={`연금 진단 · ${accountName}`}
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
        header: { flex: "0 0 auto", padding: "20px 24px 0" },
        body: {
          overflowY: "auto",
          overflowX: "hidden",
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
          title="연금 진단 오류"
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
          <Typography.Paragraph style={{ marginTop: 0 }} aria-label="연금 계좌 요약">
            상품코드 <b>{productCode}</b> · <b>{data.isMock ? "모의투자" : "실전"}</b>
          </Typography.Paragraph>
          {data.error ? (
            <Alert
              type="error"
              showIcon
              title="연금 잔고 조회 오류"
              description={data.error}
              style={{ marginBottom: 12 }}
            />
          ) : null}
          {data.warning ? (
            <Alert
              type="warning"
              showIcon
              title="연금 잔고 확인 사항"
              description={data.warning}
              style={{ marginBottom: 12 }}
            />
          ) : null}
          {!data.balance && !data.error ? (
            <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
              KIS 원본 응답이 비어 있습니다 — 아래 JSON 에 warning 내용이 있습니다.
            </Typography.Paragraph>
          ) : null}
          {copied ? (
            <div role="status" aria-live="polite" style={{ marginBottom: 8 }}>
              <Typography.Text type="success">JSON 을 복사했습니다</Typography.Text>
            </div>
          ) : null}
          <pre
            aria-label="연금 진단 원본 JSON"
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
