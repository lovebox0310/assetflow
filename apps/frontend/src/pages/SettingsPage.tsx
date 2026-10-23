import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Form, Grid, InputNumber, Space, Table, Typography } from "antd";
import { AppLayout } from "../layout/AppLayout";
import { StandardNav } from "../layout/StandardNav";
import { StateBlock, type SurfaceStatus } from "../components/StateBlock";
import { clearInflight } from "../api/client";
import { clearToken } from "../auth/authStore";
import { getSettings, updateSettings, type UserSettings } from "../api/settingsApi";
import { fetchDashboardSummary } from "../api/dashboardApi";
import { formatKrwExact } from "../utils/formatters";

interface SettingsPageProps {
  onOpenDashboard: () => void;
  onOpenAssets: () => void;
  onOpenExpenses: () => void;
}

/**
 * 스프린트 3 #37: §31 설정 화면의 React 이관.
 * 프로필(me 실검증) · 비상금 기준(필수지출 readonly + 목표 개월) · 계정 요약(원장 재계산).
 */
export function SettingsPage({ onOpenDashboard, onOpenAssets, onOpenExpenses }: SettingsPageProps) {
  const screens = Grid.useBreakpoint();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [status, setStatus] = useState<SurfaceStatus>("loading");
  const [errorText, setErrorText] = useState("");
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<{ totalAssets: number; totalDebts: number; income: number; expenses: number; essential: number } | null>(null);
  const [form] = Form.useForm();
  const mountedRef = useRef(false);

  const load = useCallback(() => {
    clearInflight();
    setStatus("loading");
    setErrorText("");
    getSettings()
      .then((data) => {
        setSettings(data);
        form.setFieldsValue({ targetMonths: data.targetMonths });
        setStatus("ready");
      })
      .catch((e: Error) => {
        setStatus("error");
        setErrorText(e.message);
      });
    fetchDashboardSummary()
      .then((s) => setSummary({
        totalAssets: s.assets.reduce((acc: number, r) => acc + r.value, 0),
        totalDebts: s.liabilities.reduce((acc: number, r) => acc + r.balance, 0),
        income: s.monthly.income,
        expenses: s.monthly.expenses,
        essential: s.monthly.essentialExpenses,
      }))
      .catch(() => setSummary(null));
  }, [form]);

  useEffect(() => {
    if (!mountedRef.current) mountedRef.current = true;
    void load();
  }, [load]);

  const handleLogout = () => {
    clearToken();
    onOpenDashboard();
  };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const updated = await updateSettings(values.targetMonths);
      setSettings(updated);
    } finally {
      setSaving(false);
    }
  };

  const net = summary ? summary.totalAssets - summary.totalDebts : 0;

  return (
    <AppLayout
      onLogout={handleLogout}
      nav={<StandardNav current="settings" onOpenDashboard={onOpenDashboard} onOpenAssets={onOpenAssets} onOpenExpenses={onOpenExpenses} />}
    >
      {/* 이슈 #70: 페이지 h1 은 정확히 1개. 섹션은 h2, 계정 요약도 병렬 섹션이라 h2. */}
      <Typography.Title level={1} id="h-settings" style={{ fontSize: 24, margin: 0, marginBottom: 16 }}>설정</Typography.Title>

      <div style={screens.md ? { display: "flex", gap: 24, alignItems: "flex-start" } : undefined}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <section aria-labelledby="h-profile" style={{ marginBottom: 24 }}>
            <Typography.Title level={2} id="h-profile" style={{ fontSize: 16, margin: 0, marginBottom: 16 }}>프로필</Typography.Title>
            <Card>
              <StateBlock status={status} onRetry={load} errorText={errorText}>
                {settings ? (
                  <Space direction="vertical" size={4}>
                    <Typography.Text><b>{settings.displayName}</b></Typography.Text>
                    <Typography.Text type="secondary">{settings.email}</Typography.Text>
                  </Space>
                ) : null}
              </StateBlock>
            </Card>
          </section>

          <section aria-labelledby="h-emergency" style={{ marginBottom: 24 }}>
            <Typography.Title level={2} id="h-emergency" style={{ fontSize: 16, margin: 0, marginBottom: 16 }}>비상금 기준</Typography.Title>
            <Card>
              <StateBlock status={status} onRetry={load} errorText={errorText}>
                {settings ? (
                  <Form form={form} layout="inline" style={{ display: "flex", flexWrap: "wrap", gap: "10px 12px" }}>
                    <Form.Item label="필수지출(월)" style={{ marginBottom: 0, flex: "0 1 320px", minWidth: 0 }}>
                      <Typography.Text strong>{summary ? formatKrwExact(summary.essential) : "—"}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", maxWidth: 260, whiteSpace: "normal", lineHeight: 1.5 }}>
                        지출 화면의 '필수' 항목 합계 · 월 확정 시 스냅샷에 저장
                      </Typography.Text>
                    </Form.Item>
                    <Form.Item name="targetMonths" label="목표 개월"
                      rules={[{ required: true, message: "목표 개월을 입력하세요" }]}>
                      <InputNumber min={1} max={60} aria-label="비상금 목표 개월" style={{ width: 110 }} />
                    </Form.Item>
                    <Button type="primary" loading={saving} onClick={() => void save()}>저장</Button>
                  </Form>
                ) : null}
              </StateBlock>
            </Card>
          </section>
        </div>

        <aside aria-labelledby="h-summary" style={screens.md ? { width: 300, flexShrink: 0 } : { marginTop: 24 }}>
          <Card>
            <Typography.Title level={2} id="h-summary" style={{ fontSize: 14, margin: 0, marginBottom: 12 }}>계정 요약</Typography.Title>
            <Table
              aria-label="계정 요약"
              size="small"
              pagination={false}
              showHeader={false}
              dataSource={[
                { key: "assets", label: "총 자산", value: summary ? formatKrwExact(summary.totalAssets) : "—" },
                { key: "debts", label: "총 부채", value: summary ? formatKrwExact(summary.totalDebts) : "—" },
                { key: "net", label: "순자산", value: summary ? formatKrwExact(net) : "—" },
                { key: "income", label: "이달 수입", value: summary ? formatKrwExact(summary.income) : "—" },
                { key: "expenses", label: "이달 지출", value: summary ? formatKrwExact(summary.expenses) : "—" },
              ]}
              columns={[{ dataIndex: "label" }, { dataIndex: "value", align: "right" as const, render: (v: string) => <span style={{ whiteSpace: "nowrap" }}>{v}</span> }]}
              rowKey="key"
            />
          </Card>
        </aside>
      </div>
    </AppLayout>
  );
}
