import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Form, Input, Space, Switch, Typography } from "antd";
import {
  deleteCardEmailImportSettings,
  getCardEmailImportSettings,
  runCardEmailImport,
  saveCardEmailImportSettings,
  type CardEmailImportSettings,
  type CardEmailImportSettingsInput,
} from "../api/cardEmailImportApi";
import { StateBlock, type SurfaceStatus } from "./StateBlock";
import { ApiError } from "../api/client";

const CARD_COMPANY = "hyundaicard";

/**
 * §63 카드 이메일 명세서 자동 수집 설정 섹션.
 *
 * 현재는 현대카드(VestMail)만 지원한다.
 */
export function CardEmailImportSettingsSection() {
  const [settings, setSettings] = useState<CardEmailImportSettings | null>(null);
  const [status, setStatus] = useState<SurfaceStatus>("loading");
  const [errorText, setErrorText] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form] = Form.useForm<CardEmailImportSettingsInput>();

  const load = useCallback(() => {
    setStatus("loading");
    setErrorText("");
    getCardEmailImportSettings(CARD_COMPANY)
      .then((data) => {
        setSettings(data);
        form.setFieldsValue({
          enabled: data.enabled,
          emailProvider: data.emailProvider,
          emailAddress: data.emailAddress,
          emailPassword: "",
          vestmailPassword: "",
        });
        setStatus("ready");
      })
      .catch((e: unknown) => {
        // 설정이 없으면 404 — 이건 정상 상태로 처리하고 폼을 비운다.
        if (e instanceof ApiError && e.code === "NOT_FOUND") {
          setSettings(null);
          form.resetFields();
          form.setFieldsValue({
            enabled: false,
            emailProvider: "gmail",
            emailAddress: "",
            emailPassword: "",
            vestmailPassword: "",
          });
          setStatus("ready");
          return;
        }
        setStatus("error");
        setErrorText(e instanceof Error ? e.message : "설정을 불러오지 못했습니다.");
      });
  }, [form]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveCardEmailImportSettings(CARD_COMPANY, values);
      setSettings(saved);
      setMessage({ type: "success", text: "현대카드 자동 수집 설정을 저장했습니다." });
      form.setFieldsValue({ emailPassword: "", vestmailPassword: "" });
    } catch (e: unknown) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "저장에 실패했습니다." });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await deleteCardEmailImportSettings(CARD_COMPANY);
      setSettings(null);
      form.resetFields();
      form.setFieldsValue({
        enabled: false,
        emailProvider: "gmail",
        emailAddress: "",
        emailPassword: "",
        vestmailPassword: "",
      });
      setMessage({ type: "success", text: "자동 수집 설정을 삭제했습니다." });
    } catch (e: unknown) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "삭제에 실패했습니다." });
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    setMessage(null);
    try {
      const count = await runCardEmailImport(CARD_COMPANY);
      setMessage({ type: "success", text: `${count}건의 거래 내역을 가져왔습니다.` });
      void load();
    } catch (e: unknown) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "수집에 실패했습니다." });
    } finally {
      setRunning(false);
    }
  };

  return (
    <section aria-labelledby="h-card-email-import" style={{ marginBottom: 24 }}>
      <Typography.Title level={2} id="h-card-email-import" style={{ fontSize: 16, margin: 0, marginBottom: 16 }}>
        카드 명세서 자동 수집
      </Typography.Title>
      <StateBlock status={status} onRetry={load} errorText={errorText}>
        {message?.type === "success" && (
          <Alert type="success" showIcon message={message.text} style={{ marginBottom: 16 }} aria-live="polite" />
        )}
        {message?.type === "error" && (
          <Alert type="error" showIcon message={message.text} style={{ marginBottom: 16 }} aria-live="assertive" />
        )}

        <Form form={form} layout="vertical" style={{ maxWidth: 480 }}>
          <Form.Item name="enabled" valuePropName="checked" style={{ marginBottom: 12 }}>
            <Switch aria-label="자동 수집 사용" checkedChildren="사용" unCheckedChildren="사용 안 함" />
          </Form.Item>

          <Form.Item name="emailProvider" hidden>
            <Input />
          </Form.Item>

          <Form.Item
            name="emailAddress"
            label="Gmail 주소"
            rules={[
              { required: true, message: "Gmail 주소를 입력하세요" },
              { type: "email", message: "올바른 이메일 주소를 입력하세요" },
            ]}
          >
            <Input placeholder="example@gmail.com" autoComplete="email" />
          </Form.Item>

          <Form.Item
            name="emailPassword"
            label="Gmail 앱 비밀번호"
            rules={[{ required: !settings, message: "Gmail 앱 비밀번호를 입력하세요" }]}
            extra={
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Google 계정 보안 → 2단계 인증 → 앱 비밀번호에서 발급한 16자리 비밀번호를 입력하세요.
                설정이 이미 저장된 상태에서 비밀번호를 바꾸지 않으려면 비워두세요.
              </Typography.Text>
            }
          >
            <Input.Password placeholder="abcd efgh ijkl mnop" autoComplete="new-password" />
          </Form.Item>

          <Form.Item
            name="vestmailPassword"
            label="현대카드 명세서 비밀번호"
            rules={[{ required: !settings, message: "명세서 비밀번호를 입력하세요" }]}
            extra={
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                보안메일을 열 때 사용하는 비밀번호(생년월일 6자리 또는 사업자등록번호 뒤 7자리)입니다.
              </Typography.Text>
            }
          >
            <Input.Password placeholder="생년월일 6자리" autoComplete="new-password" />
          </Form.Item>

          {settings?.lastImportStatus && (
            <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
              마지막 수집 상태: <b>{settings.lastImportStatus}</b>
            </Typography.Paragraph>
          )}

          <Space>
            <Button type="primary" loading={saving} onClick={() => void handleSave()}>
              저장
            </Button>
            {settings && (
              <>
                <Button loading={running} onClick={() => void handleRun()}>
                  지금 수집
                </Button>
                <Button danger loading={saving} onClick={() => void handleDelete()}>
                  삭제
                </Button>
              </>
            )}
          </Space>
        </Form>
      </StateBlock>
    </section>
  );
}
