import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, Modal, Typography } from "antd";
import {
  deleteUpbitKeys,
  getUpbitStatus,
  saveUpbitKeys,
  testUpbit,
  type UpbitKeysInput,
} from "../api/investmentsApi";
import { ApiError } from "../api/client";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** ApiError.detail 에 백엔드의 code/사유가 들어 있다 — 일반 문구보다 우선한다. */
function describeUpbitError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.detail ?? e.message;
  return e instanceof Error ? e.message : fallback;
}

/**
 * UPBIT-2 업비트 Open API 키 설정 모달.
 *
 * - 키는 백엔드에서 AES/GCM 으로 암호화 저장한다. 이 화면은 평문을 한 번 보내고
 *   저장 후에는 마스킹된 access key 만 보여 준다(마스킹 문자열을 폼에 채우지 않는다).
 * - 저장 → 연결 테스트 성공 시에만 닫는다. 실패하면 사유(업비트 code 포함)를 남긴다.
 * - 자산조회(View Account) 권한 + 등록 IP 만 필요하다. 주문·출금 권한은 요구하지 않는다.
 */
export function UpbitCredentialsModal({ open, onClose, onSaved }: Props) {
  const [form] = Form.useForm<UpbitKeysInput>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setMessage("");
    setConfigured(false);
    setMasked(null);
    form.resetFields();
    setLoading(true);
    getUpbitStatus()
      .then((status) => {
        setConfigured(status.configured);
        setMasked(status.accessKeyMasked);
      })
      .catch((e: unknown) => {
        setError(describeUpbitError(e, "업비트 연동 상태를 불러오지 못했습니다"));
      })
      .finally(() => setLoading(false));
  }, [open, form]);

  const handleSave = async (values: UpbitKeysInput) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const status = await saveUpbitKeys({
        accessKey: values.accessKey.trim(),
        secretKey: values.secretKey.trim(),
      });
      setConfigured(status.configured);
      setMasked(status.accessKeyMasked);
      form.resetFields();
      // 저장만 하고 닫으면 키/IP 가 틀렸는지 알 수 없다 — 실제 호출까지 확인한다.
      const test = await testUpbit();
      setMessage(`연결되었습니다 — 계좌 ${test.accounts}개`);
      onSaved();
      onClose();
    } catch (e) {
      setError(describeUpbitError(e, "업비트 키를 저장하거나 연결을 확인하지 못했습니다"));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError("");
    setMessage("");
    try {
      const result = await testUpbit();
      setMessage(`연결되었습니다 — 계좌 ${result.accounts}개`);
    } catch (e) {
      setError(describeUpbitError(e, "업비트 연결 테스트에 실패했습니다"));
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await deleteUpbitKeys();
      setConfigured(false);
      setMasked(null);
      form.resetFields();
      setMessage("업비트 연동을 해제했습니다");
      onSaved();
    } catch (e) {
      setError(describeUpbitError(e, "업비트 연동을 해제하지 못했습니다"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="업비트 연동 설정"
      onCancel={onClose}
      centered
      destroyOnHidden
      width="min(520px, calc(100vw - 24px))"
      styles={{
        container: {
          maxHeight: "calc(100dvh - 32px)",
          display: "flex",
          flexDirection: "column",
          padding: 0,
        },
        body: {
          overflowY: "auto",
          flex: "1 1 auto",
          minHeight: 0,
          padding: "0 16px 12px",
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
          {configured ? (
            <Button danger onClick={() => void handleDelete()} loading={saving} disabled={testing}>
              연동 해제
            </Button>
          ) : null}
          {configured ? (
            <Button onClick={() => void handleTest()} loading={testing} disabled={saving}>
              연결 테스트
            </Button>
          ) : null}
          <Button
            type="primary"
            onClick={() => form.submit()}
            loading={saving}
            disabled={loading || testing}
          >
            저장
          </Button>
          <Button onClick={onClose} disabled={saving}>
            취소
          </Button>
        </div>
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        업비트 Open API에서 <b>자산조회</b> 권한만 주고, 허용 IP에 <b>서버 공인 IP</b>를
        등록하세요. 주문·출금 권한은 주지 마세요.
      </Typography.Paragraph>

      {configured && masked ? (
        <Typography.Paragraph style={{ marginTop: 0 }}>
          저장된 Access Key <code>{masked}</code>
        </Typography.Paragraph>
      ) : null}

      {error ? (
        <Alert
          type="error"
          showIcon
          title="업비트 연동 오류"
          description={error}
          style={{ marginBottom: 16 }}
          aria-live="assertive"
        />
      ) : null}

      {message ? (
        <div role="status" aria-live="polite" style={{ marginBottom: 12 }}>
          <Typography.Text type="success">{message}</Typography.Text>
        </div>
      ) : null}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        disabled={loading || saving}
        requiredMark={false}
      >
        <Form.Item
          name="accessKey"
          label="Access Key"
          rules={[{ required: true, message: "Access Key를 입력하세요" }]}
          extra={
            configured ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                키가 저장돼 있습니다. 바꿀 때만 입력하세요.
              </Typography.Text>
            ) : undefined
          }
        >
          <Input placeholder={configured ? "변경할 때만 입력" : "업비트 Access Key"} autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="secretKey"
          label="Secret Key"
          rules={[{ required: true, message: "Secret Key를 입력하세요" }]}
        >
          <Input.Password
            placeholder={configured ? "변경할 때만 입력" : "업비트 Secret Key"}
            autoComplete="new-password"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
