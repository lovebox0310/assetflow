import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Form, Grid, Input, InputNumber, Popconfirm, Space, Typography, type FormInstance } from "antd";
import {
  MobileListCardActions,
  MobileListCardHeader,
  MobileListCardItem,
  MobileListCardMeta,
} from "../components/MobileListCard";
import { AppLayout } from "../layout/AppLayout";
import { StandardNav } from "../layout/StandardNav";
import { StateBlock, type SurfaceStatus } from "../components/StateBlock";
import {
  createAccount,
  deleteAccount,
  listAccounts,
  updateAccount,
  type AssetAccountRow,
  type UpsertPayload,
} from "../api/assetsApi";
import { clearInflight } from "../api/client";
import { clearToken } from "../auth/authStore";
import { CardImportPanel } from "../components/CardImportPanel";

interface AssetsPageProps {
  /** 대시보드로 돌아간다. */
  onBack: () => void;
  /** 헤더 내비게이션 — 지출 화면으로 이동 (§42). */
  onOpenExpenses?: () => void;
  /** 헤더 내비게이션 — 설정 화면으로 이동 (§46). */
  onOpenSettings?: () => void;
}

const TYPES = new Set<AssetAccountRow["accountType"]>(["cash", "deposit", "invest", "realty"]);
void TYPES; // §40.2 enum 참조 — 화면 추가 폼의 유형 제한에서 쓴다

/**
 * 스프린트 2 #21: §31 자산 화면의 React 이관.
 * - §31.1: 합계·구성비는 저장하지 않는다 — 행에서 매번 계산한다.
 * - §31.2: 금융자산·부채·투자금 행은 편집 가능. 자동이체·부가세는 지출 도메인의
 *   단일 출처라 이 화면에서 편집하지 않는다(읽기 전용 자리 표시).
 * - 상태 4종은 StateBlock 단일 구현체를 재사용한다(§35 화면마다 다른 스피너 금지).
 */
export function AssetsPage({ onBack, onOpenExpenses, onOpenSettings }: AssetsPageProps) {
  const screens = Grid.useBreakpoint();
  // §35 중단점: md 미만은 표 대신 카드형 리스트 — 4열 표는 좁은 폭에서 읽을 수 없다
  const wide = Boolean(screens.md);

  const [rows, setRows] = useState<AssetAccountRow[] | null>(null);
  const [status, setStatus] = useState<SurfaceStatus>("loading");
  const [errorText, setErrorText] = useState("");
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form] = Form.useForm<UpsertPayload>();
  const mountedRef = useRef(false);

  const load = useCallback(() => {
    clearInflight(); // 앞선 요청의 dedupe 잔여를 비우고 새로 읽는다
    setStatus("loading");
    setErrorText("");
    listAccounts()
      .then((data) => {
        setRows(data);
        setStatus(data.length === 0 ? "empty" : "ready");
      })
      .catch((e: Error) => {
        setStatus("error");
        setErrorText(e.message);
      });
  }, []);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    void load();
  }, [load]);

  const assets = rows?.filter((r) => !r.isDebt) ?? [];
  const liabilities = rows?.filter((r) => r.isDebt) ?? [];
  const totalAssets = assets.reduce((acc, r) => acc + r.balance, 0);
  const totalLiabilities = liabilities.reduce((acc, r) => acc + r.balance, 0);

  const beginCreate = () => {
    setEditingId("new");
    form.setFieldsValue({ accountType: "cash", name: "", institutionName: "", balance: 0, isDebt: false });
  };

  const beginEdit = (row: AssetAccountRow) => {
    setEditingId(row.id);
    form.setFieldsValue({
      accountType: row.accountType,
      name: row.name,
      institutionName: row.institutionName,
      balance: row.balance,
      isDebt: row.isDebt,
    });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    const values = await form.validateFields();
    const payload: UpsertPayload = { ...values, institutionName: values.institutionName ?? "" };
    if (editingId === "new") {
      await createAccount(payload);
    } else if (typeof editingId === "number") {
      await updateAccount(editingId, payload);
    }
    setEditingId(null);
    load();
  };

  const removeRow = async (id: number) => {
    await deleteAccount(id);
    load();
  };

  const renderRow = (row: AssetAccountRow, debt: boolean) => {
    if (editingId === row.id) {
      return wide ? (
        <tr key={row.id}>
          <td colSpan={4}>
            <EditForm form={form} isDebt={debt} />
            <Space style={{ marginTop: 8 }}>
              <Button type="primary" onClick={saveEdit}>저장</Button>
              <Button onClick={cancelEdit}>취소</Button>
            </Space>
          </td>
        </tr>
      ) : (
        <MobileListCardItem key={row.id}>
          <EditForm form={form} isDebt={debt} />
          <MobileListCardActions>
            <Button type="primary" onClick={saveEdit}>저장</Button>
            <Button onClick={cancelEdit}>취소</Button>
          </MobileListCardActions>
        </MobileListCardItem>
      );
    }
    return wide ? (
      <tr key={row.id}>
        <td>{row.name}</td>
        <td>{row.institutionName || "—"}</td>
        <td style={{ textAlign: "right" }}>{row.balance.toLocaleString("ko-KR")}원</td>
        <td>
          <Space>
            <Button size="small" type="text" onClick={() => beginEdit(row)}>편집</Button>
            <Popconfirm title="이 행을 삭제할까요?" onConfirm={() => void removeRow(row.id)}>
              <Button size="small" type="text" danger>삭제</Button>
            </Popconfirm>
          </Space>
        </td>
      </tr>
    ) : (
      <MobileListCardItem key={row.id}>
        <MobileListCardHeader title={row.name} value={`${row.balance.toLocaleString("ko-KR")}원`} />
        <MobileListCardMeta>{row.institutionName || "—"}</MobileListCardMeta>
        <MobileListCardActions>
          <Button size="small" type="text" onClick={() => beginEdit(row)}>편집</Button>
          <Popconfirm title="이 행을 삭제할까요?" onConfirm={() => void removeRow(row.id)}>
            <Button size="small" type="text" danger>삭제</Button>
          </Popconfirm>
        </MobileListCardActions>
      </MobileListCardItem>
    );
  };

  const handleLogout = () => {
    clearToken();
    onBack();
  };

  const debtFormOpen = editingId !== null && (editingId === "new" ? form.getFieldValue("isDebt") === true : liabilities.some((r) => r.id === editingId));

  return (
    <AppLayout
      onLogout={handleLogout}
      nav={
        <StandardNav current="assets" onOpenDashboard={onBack} onOpenExpenses={onOpenExpenses} onOpenSettings={onOpenSettings} />
      }
    >
      <section aria-labelledby="h-assets" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <Typography.Title level={4} id="h-assets" style={{ margin: 0 }}>금융자산</Typography.Title>
          <Button onClick={beginCreate} disabled={editingId !== null}>+ 자산 추가</Button>
        </div>
        <Card>
          <StateBlock status={status} onRetry={load} errorText={errorText} emptyText="자산 행이 없습니다 — '+ 자산 추가'로 시작하세요">
            {editingId === "new" && debtFormOpen === false ? (
              <div style={{ marginBottom: 12 }}>
                <EditForm form={form} isDebt={false} />
                <Space style={{ marginTop: 8 }}>
                  <Button type="primary" onClick={saveEdit}>저장</Button>
                  <Button onClick={cancelEdit}>취소</Button>
                </Space>
              </div>
            ) : null}
            {wide ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", paddingBottom: 8 }}>이름</th>
                    <th style={{ textAlign: "left", paddingBottom: 8 }}>기관</th>
                    <th style={{ textAlign: "right", paddingBottom: 8 }}>잔액</th>
                    <th style={{ width: 120 }} />
                  </tr>
                </thead>
                <tbody>{assets.map((r) => renderRow(r, false))}</tbody>
              </table>
            ) : (
              <div>{assets.map((r) => renderRow(r, false))}</div>
            )}
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              합계 {totalAssets.toLocaleString("ko-KR")}원 — 저장하지 않고 행에서 재계산한다 (§31.1)
            </Typography.Paragraph>
          </StateBlock>
        </Card>
      </section>

      <section aria-labelledby="h-liab" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <Typography.Title level={4} id="h-liab" style={{ margin: 0 }}>부채</Typography.Title>
          <Button
            onClick={() => {
              setEditingId("new");
              form.setFieldsValue({ accountType: "realty", name: "", institutionName: "", balance: 0, isDebt: true });
            }}
            disabled={editingId !== null}
          >
            + 부채 추가
          </Button>
        </div>
        <Card>
          <StateBlock status={status} onRetry={load} errorText={errorText} emptyText="부채가 비어 있는 것은 정상이다 (§31.4)">
            {editingId === "new" && debtFormOpen ? (
              <div style={{ marginBottom: 12 }}>
                <EditForm form={form} isDebt />
                <Space style={{ marginTop: 8 }}>
                  <Button type="primary" onClick={saveEdit}>저장</Button>
                  <Button onClick={cancelEdit}>취소</Button>
                </Space>
              </div>
            ) : null}
            {liabilities.length === 0 ? (
              <Typography.Text type="secondary">부채가 비어 있는 것은 정상이다 (§31.4)</Typography.Text>
            ) : wide ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", paddingBottom: 8 }}>이름</th>
                    <th style={{ textAlign: "left", paddingBottom: 8 }}>기관</th>
                    <th style={{ textAlign: "right", paddingBottom: 8 }}>잔액</th>
                    <th style={{ width: 120 }} />
                  </tr>
                </thead>
                <tbody>{liabilities.map((r) => renderRow(r, true))}</tbody>
              </table>
            ) : (
              <div>{liabilities.map((r) => renderRow(r, true))}</div>
            )}
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              합계 {totalLiabilities.toLocaleString("ko-KR")}원
            </Typography.Paragraph>
          </StateBlock>
        </Card>
      </section>

      <section aria-labelledby="h-readonly" style={{ marginBottom: 24 }}>
        <Typography.Title level={4} id="h-readonly" style={{ margin: 0, marginBottom: 16 }}>
          카드 내역 가져오기
        </Typography.Title>
        <CardImportPanel />
      </section>

      <section aria-labelledby="h-expense-owned" style={{ marginBottom: 24 }}>
        <Typography.Title level={4} id="h-expense-owned" style={{ margin: 0, marginBottom: 16 }}>
          다른 화면이 읽는 값
        </Typography.Title>
        <Card>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            자동이체 잔액·부가가치세 잔액은 지출 화면의 단일 출처 값이다(§31.2) — 이 화면에서
            편집하지 않는다. 지출 화면 연계 후 표시된다.
          </Typography.Paragraph>
        </Card>
      </section>
    </AppLayout>
  );
}

function EditForm({ form, isDebt }: { form: FormInstance; isDebt: boolean }) {
  return (
    <Form form={form} layout="inline">
      <Form.Item name="name" rules={[{ required: true, message: "이름을 입력하세요" }]}>
        <Input placeholder={isDebt ? "부채 이름" : "자산 이름"} style={{ width: 180 }} />
      </Form.Item>
      <Form.Item name="institutionName">
        <Input placeholder="기관 (선택)" style={{ width: 140 }} />
      </Form.Item>
      <Form.Item name="balance" rules={[{ required: true, message: "잔액을 입력하세요" }]}>
        <InputNumber min={0} placeholder="잔액(원)" style={{ width: 160 }} />
      </Form.Item>
      <Form.Item name="accountType" hidden initialValue={isDebt ? "realty" : "cash"}>
        <Input />
      </Form.Item>
      <Form.Item name="isDebt" hidden initialValue={isDebt}>
        <Input />
      </Form.Item>
    </Form>
  );
}
