import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { AppLayout } from "../layout/AppLayout";
import { StandardNav } from "../layout/StandardNav";
import { StateBlock, type SurfaceStatus } from "../components/StateBlock";
import { clearInflight } from "../api/client";
import { clearToken } from "../auth/authStore";
import { getSettings, updatePassword, type UserSettings } from "../api/settingsApi";

interface SettingsPageProps {
  onOpenDashboard: () => void;
  onOpenAssets: () => void;
  onOpenExpenses: () => void;
}

/**
 * 스프린트 3 #37: §31 설정 화면의 React 이관.
 * 설정에는 계정·보안만 둔다 — 프로필(me 실검증) · 비밀번호 변경.
 *
 * 기능 설정은 기능 화면에 둔다:
 * - 비상금 목표 개월 → 대시보드의 '비상금 유지 개월' 카드(EmergencyFundSettingsModal)가 유일한 편집점
 * - 카드 명세서 자동 수집 → 카드내역 화면(CardEmailImportSettingsSection)
 */
export function SettingsPage({ onOpenDashboard, onOpenAssets, onOpenExpenses }: SettingsPageProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [status, setStatus] = useState<SurfaceStatus>("loading");
  const [errorText, setErrorText] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<SurfaceStatus>("ready");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordForm] = Form.useForm();
  const mountedRef = useRef(false);

  const load = useCallback(() => {
    clearInflight();
    setStatus("loading");
    setErrorText("");
    getSettings()
      .then((data) => {
        setSettings(data);
        setStatus("ready");
      })
      .catch((e: Error) => {
        setStatus("error");
        setErrorText(e.message);
      });
  }, []);

  useEffect(() => {
    if (!mountedRef.current) mountedRef.current = true;
    void load();
  }, [load]);

  const handleLogout = () => {
    clearToken();
    onOpenDashboard();
  };

  const savePassword = async () => {
    const values = await passwordForm.validateFields();
    if (values.newPassword !== values.confirmPassword) {
      passwordForm.setFields([{ name: "confirmPassword", errors: ["비밀번호가 일치하지 않습니다"] }]);
      return;
    }
    setPasswordStatus("ready");
    setPasswordMessage("");
    setPasswordSaving(true);
    try {
      await updatePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      setPasswordStatus("ready");
      setPasswordMessage("비밀번호가 변경되었습니다.");
      passwordForm.resetFields();
    } catch (e: unknown) {
      setPasswordStatus("error");
      setPasswordMessage(e instanceof Error ? e.message : "비밀번호 변경에 실패했습니다.");
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <AppLayout
      onLogout={handleLogout}
      nav={<StandardNav current="settings" onOpenDashboard={onOpenDashboard} onOpenAssets={onOpenAssets} onOpenExpenses={onOpenExpenses} />}
    >
      <div style={{ maxWidth: 720, width: "100%", marginInline: "auto", minWidth: 0 }}>
        {/* 이슈 #70: 페이지 h1 은 정확히 1개. 섹션은 h2. */}
        <Typography.Title level={1} id="h-settings" style={{ fontSize: 24, margin: 0, marginBottom: 8 }}>설정</Typography.Title>
        <p style={{ fontSize: 13, color: "var(--af-muted-foreground)", margin: "0 0 24px" }}>
          계정과 보안 설정입니다. 비상금 목표·카드 명세서 수집은 각 기능 화면에서 바꿉니다.
        </p>

        <section aria-labelledby="h-profile" style={{ marginBottom: 32 }}>
          <Typography.Title level={2} id="h-profile" style={{ fontSize: 16, margin: 0, marginBottom: 16 }}>프로필</Typography.Title>
          <Card>
            <StateBlock status={status} onRetry={load} errorText={errorText}>
              {settings ? (
                <dl style={{ display: "grid", gridTemplateColumns: "64px minmax(0,1fr)", rowGap: 12, columnGap: 16, margin: 0 }}>
                  <dt style={{ fontSize: 13, color: "var(--af-muted-foreground)" }}>이름</dt>
                  <dd style={{ margin: 0, fontWeight: 700 }}>{settings.displayName}</dd>
                  <dt style={{ fontSize: 13, color: "var(--af-muted-foreground)" }}>이메일</dt>
                  <dd style={{ margin: 0, color: "var(--af-muted-foreground)", overflowWrap: "anywhere" }}>{settings.email}</dd>
                </dl>
              ) : null}
            </StateBlock>
          </Card>
        </section>

        <section aria-labelledby="h-password" style={{ marginBottom: 32 }}>
          <Typography.Title level={2} id="h-password" style={{ fontSize: 16, margin: 0, marginBottom: 16 }}>비밀번호 변경</Typography.Title>
          <Card>
            {passwordStatus === "error" && (
              <Alert
                type="error"
                showIcon
                message="비밀번호 변경 실패"
                description={passwordMessage}
                style={{ marginBottom: 16 }}
                aria-live="assertive"
              />
            )}
            {passwordStatus === "ready" && passwordMessage && (
              <Alert
                type="success"
                showIcon
                message={passwordMessage}
                style={{ marginBottom: 16 }}
                aria-live="polite"
              />
            )}
            <Form form={passwordForm} layout="vertical" style={{ maxWidth: 520, width: "100%" }}>
              <Form.Item name="currentPassword" label="현재 비밀번호"
                rules={[{ required: true, message: "현재 비밀번호를 입력하세요" }]}>
                <Input.Password aria-label="현재 비밀번호" autoComplete="current-password" style={{ fontSize: 16 }} />
              </Form.Item>
              <Form.Item name="newPassword" label="새 비밀번호"
                rules={[
                  { required: true, message: "새 비밀번호를 입력하세요" },
                  { min: 8, message: "비밀번호는 8자 이상이어야 합니다" },
                ]}>
                <Input.Password aria-label="새 비밀번호" autoComplete="new-password" style={{ fontSize: 16 }} />
              </Form.Item>
              <Form.Item name="confirmPassword" label="새 비밀번호 확인"
                rules={[{ required: true, message: "새 비밀번호 확인을 입력하세요" }]}>
                <Input.Password aria-label="새 비밀번호 확인" autoComplete="new-password" style={{ fontSize: 16 }} />
              </Form.Item>
              <Button type="primary" loading={passwordSaving} onClick={() => void savePassword()}>비밀번호 변경</Button>
            </Form>
          </Card>
        </section>
      </div>
    </AppLayout>
  );
}
