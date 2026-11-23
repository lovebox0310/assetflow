import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Modal, Spin, Typography } from "antd";
import { previewToss } from "../api/investmentsApi";
import { ApiError } from "../api/client";
import { modalHeaderStyle } from "../theme/modalShell";

interface Props {
  accountId: number;
  accountName: string;
  open: boolean;
  onClose: () => void;
}

/**
 * 토스 진단 — `POST /accounts/{id}/toss-preview` 의 **파싱된 보유자산**과 warning/error 를 보여 준다.
 *
 * `KisPensionPreviewModal` 과 같은 셸(§93)을 쓴다: 컨테이너가 높이를 제한하고 본문만
 * 스크롤하며 footer 는 safe-area 를 포함해 고정된다. 계좌번호는 **서버가 마스킹**한 값만
 * 오므로 화면에서 추가 마스킹을 하지 않는다.
 */
export function TossPreviewModal({ accountId, accountName, open, onClose }: Props) {
  const [data, setData] = useState<{
    holdings: unknown | null;
    warning: string | null;
    error: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setError("");
    setCopied(false);
    setLoading(true);
    previewToss(accountId)
      .then(setData)
      .catch((e: unknown) => {
        const message =
          e instanceof ApiError
            ? e.detail ?? e.message
            : e instanceof Error
              ? e.message
              : "토스 진단을 불러오지 못했습니다";
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [open, accountId]);

  const json = useMemo(() => (data ? JSON.stringify(data, null, 2) : ""), [data]);

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
      title={`토스 진단 · ${accountName}`}
      onCancel={onClose}
      centered
      destroyOnHidden
      /* 터치 44 스코프 — 포털 모달이라 루트 클래스로만 좁힌다(§125 I-04). */
      rootClassName="af-modal-touch"
      width="min(720px, calc(100vw - 24px))"
      styles={{
        container: {
          maxHeight: "calc(100dvh - 32px)",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
        },
        header: modalHeaderStyle,
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
            {copied ? "복사됨" : "복사"}
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
          title="토스 진단 오류"
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

      {data?.error ? (
        <Alert
          type="error"
          showIcon
          title="토스 응답 오류"
          description={data.error}
          style={{ marginBottom: 12 }}
          aria-live="assertive"
        />
      ) : null}

      {data?.warning ? (
        <Alert
          type="warning"
          showIcon
          title="확인 사항"
          description={data.warning}
          style={{ marginBottom: 12 }}
          aria-live="polite"
        />
      ) : null}

      {data ? (
        <>
          <Typography.Paragraph type="secondary" style={{ margin: "0 0 8px", fontSize: 12 }}>
            계좌번호는 서버에서 마스킹되어 표시됩니다. 값이 0 이거나 비어 있으면 토스 응답을
            확인하세요.
          </Typography.Paragraph>
          <pre
            aria-label="토스 진단 원본 JSON"
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
