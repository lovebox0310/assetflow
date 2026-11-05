import { useEffect, useState } from "react";
import { Button, Form, Input, Modal, Radio, Space, Typography } from "antd";
import { deleteKisCredentials, getKisCredentials, saveKisCredentials, type KisCredentials } from "../api/investmentsApi";

interface Props {
  accountId: number;
  accountName: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const MOCK_URL = "https://openapivts.koreainvestment.com:29443";
const REAL_URL = "https://openapi.koreainvestment.com:9443";

/**
 * §62.2 한국투자증권 계좌별 API 자격증명 설정 모달.
 */
export function KisCredentialsModal({ accountId, accountName, open, onClose, onSaved }: Props) {
  const [form] = Form.useForm<KisCredentials>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [exists, setExists] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setExists(false);
    form.resetFields();
    setLoading(true);
    getKisCredentials(accountId)
      .then((data) => {
        setExists(true);
        form.setFieldsValue({
          appKey: data.appKey,
          appSecret: data.appSecret,
          baseUrl: data.baseUrl || MOCK_URL,
          cano: data.cano,
          acntPrdtCd: data.acntPrdtCd,
        });
      })
      .catch(() => {
        // 없으면 기본값으로 신규 입력
        form.setFieldsValue({ baseUrl: MOCK_URL, acntPrdtCd: "01" });
      })
      .finally(() => setLoading(false));
  }, [open, accountId, form]);

  const handleSave = async (values: KisCredentials) => {
    setSaving(true);
    setError("");
    try {
      await saveKisCredentials(accountId, {
        appKey: values.appKey,
        appSecret: values.appSecret,
        baseUrl: values.baseUrl,
        cano: values.cano,
        acntPrdtCd: values.acntPrdtCd,
      });
      setExists(true);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setError("");
    try {
      await deleteKisCredentials(accountId);
      form.resetFields();
      form.setFieldsValue({ baseUrl: MOCK_URL, acntPrdtCd: "01" });
      setExists(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제하지 못했습니다");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`KIS 연동 설정 · ${accountName}`}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        disabled={loading}
        style={{ marginTop: 16 }}
      >
        <Form.Item name="baseUrl" label="API 환경" rules={[{ required: true }]}>
          <Radio.Group>
            <Radio value={MOCK_URL}>모의투자</Radio>
            <Radio value={REAL_URL}>실전</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="appKey"
          label="App Key"
          rules={[{ required: true, message: "App Key를 입력하세요" }]}
        >
          <Input placeholder="KIS App Key" />
        </Form.Item>

        <Form.Item
          name="appSecret"
          label="App Secret"
          rules={[{ required: true, message: "App Secret을 입력하세요" }]}
        >
          <Input.Password placeholder="KIS App Secret" />
        </Form.Item>

        <Space align="start" style={{ width: "100%" }}>
          <Form.Item
            name="cano"
            label="CANO"
            rules={[{ required: true, message: "CANO를 입력하세요" }]}
            style={{ width: 180 }}
          >
            <Input placeholder="계좌번호 앞 8자리" maxLength={8} />
          </Form.Item>

          <Form.Item
            name="acntPrdtCd"
            label="상품코드"
            rules={[{ required: true, message: "상품코드를 입력하세요" }]}
            style={{ width: 120 }}
          >
            <Input placeholder="예: 01" maxLength={4} />
          </Form.Item>
        </Space>

        {error && (
          <Typography.Paragraph type="danger" style={{ marginTop: 8 }}>
            {error}
          </Typography.Paragraph>
        )}

        <Space style={{ marginTop: 16 }}>
          <Button type="primary" htmlType="submit" loading={saving}>
            저장
          </Button>
          {exists && (
            <Button danger onClick={() => void handleDelete()} loading={saving}>
              삭제
            </Button>
          )}
          <Button onClick={onClose} disabled={saving}>
            취소
          </Button>
        </Space>
      </Form>
    </Modal>
  );
}
