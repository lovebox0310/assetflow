import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Modal, Spin, Tabs, Typography } from "antd";
import {
  previewKisPension,
  type KisPathPreview,
  type KisPensionPreview,
} from "../api/investmentsApi";
import { ApiError } from "../api/client";
import { formatKrwExact } from "../utils/formatters";

interface Props {
  accountId: number;
  accountName: string;
  open: boolean;
  onClose: () => void;
}

/** usedPath → 화면 라벨. 서버가 모르는 값을 보내도 그대로 보여 준다. */
const PATH_LABELS: Record<string, string> = {
  stock: "주식잔고",
  account: "계좌자산현황",
  pension: "퇴직연금",
  unknown: "경로 미확인",
};

function pathLabel(path: string | null | undefined): string {
  if (!path) return "경로 미확인";
  return PATH_LABELS[path] ?? path;
}

/** 진단 JSON 을 그대로 보여 주는 블록 — 320px 에서도 가로로 넘치지 않는다. */
function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <pre
      aria-label={label}
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
      {value === null ? "null" : JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** 세 경로 중 한 섹션 — 경로/tr_id, error, 원본 JSON. */
function PathSection({ title, preview }: { title: string; preview: KisPathPreview | null }) {
  if (!preview) {
    return (
      <Typography.Paragraph type="secondary" style={{ margin: "0 0 8px" }}>
        {title} 응답이 없습니다.
      </Typography.Paragraph>
    );
  }
  return (
    <div>
      <Typography.Paragraph
        type="secondary"
        aria-label={`${title} 경로`}
        style={{ margin: "0 0 8px", fontSize: 12 }}
      >
        <span style={{ wordBreak: "break-all" }}>
          {preview.trId ?? "tr_id 없음"} · {preview.path ?? "경로 없음"}
        </span>
      </Typography.Paragraph>
      {preview.error ? (
        <Alert
          type="error"
          showIcon
          title={`${title} 응답 없음`}
          description={preview.error}
          style={{ marginBottom: 8 }}
        />
      ) : null}
      <JsonBlock label={`${title} 원본 JSON`} value={preview.response} />
    </div>
  );
}

/**
 * 개인연금(22)/IRP(29) 연금 잔고 원본 진단 모달 (읽기 전용).
 *
 * 동기화 결과가 비어 보일 때 "KIS 가 실제로 0 을 보냈는지, 우리 파싱이 0 으로 만드는지"를
 * 구분하기 위해 세 경로(주식잔고 TTTC8434R / 계좌자산현황 CTRP6548R / 퇴직연금 TTTC2208R)
 * 원본을 각각 보여 준다. 이 화면은 저장·동기화를 하지 않는다 — 복사해서 개발/지원에 공유한다.
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
  const balancePreview = data?.balancePreview ?? null;
  const usedPath = data?.usedPath ?? balancePreview?.path ?? null;

  const copy = async () => {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      setError("클립보드에 복사하지 못했습니다. JSON 을 직접 선택해 복사해 주세요.");
    }
  };

  const tabItems = data
    ? [
        {
          key: "stock",
          label: "주식잔고",
          children: <PathSection title="주식잔고" preview={data.stock} />,
        },
        {
          key: "account",
          label: "계좌자산현황",
          children: <PathSection title="계좌자산현황" preview={data.account} />,
        },
        {
          key: "pension",
          label: "퇴직연금",
          children: <PathSection title="퇴직연금" preview={data.pension} />,
        },
      ]
    : [];

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

          <Typography.Paragraph style={{ marginTop: 0 }} aria-label="동기화 경로 요약">
            동기화는 <b>{pathLabel(usedPath)}</b> 경로로 조회됨
            {balancePreview ? (
              <>
                {" · "}예수금{" "}
                <b>
                  {balancePreview.cash === null
                    ? "알 수 없음"
                    : formatKrwExact(balancePreview.cash)}
                </b>
                {" · "}보유 <b>{balancePreview.holdingCount ?? 0}</b>종목
              </>
            ) : null}
          </Typography.Paragraph>

          {balancePreview?.warning ? (
            <Alert
              type="warning"
              showIcon
              title="동기화 경로 확인 사항"
              description={balancePreview.warning}
              style={{ marginBottom: 12 }}
            />
          ) : null}
          {balancePreview?.error ? (
            <Alert
              type="error"
              showIcon
              title="동기화 결과 요약을 만들지 못했습니다"
              description={balancePreview.error}
              style={{ marginBottom: 12 }}
            />
          ) : null}

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

          <Typography.Title level={5} style={{ margin: "4px 0 8px", fontSize: 14 }}>
            경로별 원본
          </Typography.Title>
          <Tabs size="small" items={tabItems} style={{ marginBottom: 8 }} />

          <Typography.Title level={5} style={{ margin: "12px 0 8px", fontSize: 14 }}>
            전체 응답
          </Typography.Title>
          {copied ? (
            <div role="status" aria-live="polite" style={{ marginBottom: 8 }}>
              <Typography.Text type="success">JSON 을 복사했습니다</Typography.Text>
            </div>
          ) : null}
          <JsonBlock label="연금 진단 원본 JSON" value={data} />
        </>
      ) : null}
    </Modal>
  );
}
