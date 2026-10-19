import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Checkbox, Form, Input, InputNumber, Popconfirm, Select, Space, Table, Typography } from "antd";
import { AppLayout } from "../layout/AppLayout";
import { StateBlock, type SurfaceStatus } from "../components/StateBlock";
import { clearInflight } from "../api/client";
import { clearToken } from "../auth/authStore";
import {
  confirmMonth,
  createExpenseItem,
  deleteExpenseItem,
  getSnapshot,
  listCardImports,
  listExpenseItems,
  updateExpenseItem,
  type CardImportRowFull,
  type ExpenseItemRow,
  type ItemPayload,
  type MonthSnapshot,
} from "../api/expensesApi";
import { formatKrwExact } from "../utils/formatters";

interface ExpensesPageProps {
  onOpenDashboard: () => void;
  onOpenAssets: () => void;
}

/** 과거 36개월 — 2025년 전체 내역(카드 원장)을 선택할 수 있어야 한다. */
function recentMonths(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 36; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/**
 * 스프린트 3 #36: §31 지출 화면의 React 이관.
 * - 월 선택 → 월 지출 항목(CRUD) + 수입 입력·월 확정(§44 스냅샷) + 카드 원장 소비(§41).
 * - 합계·필수지출 합계는 행에서 재계산 — 저장하지 않는다(§34.6).
 */
export function ExpensesPage({ onOpenDashboard, onOpenAssets }: ExpensesPageProps) {
  const months = recentMonths();
  const [month, setMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [items, setItems] = useState<ExpenseItemRow[] | null>(null);
  const [itemStatus, setItemStatus] = useState<SurfaceStatus>("loading");
  const [itemError, setItemError] = useState("");
  const [cardRows, setCardRows] = useState<CardImportRowFull[] | null>(null);
  const [cardStatus, setCardStatus] = useState<SurfaceStatus>("loading");
  const [cardError, setCardError] = useState("");
  const [snapshot, setSnapshot] = useState<MonthSnapshot | null>(null);
  const [income, setIncome] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<ExpenseItemRow | null>(null);
  const [form] = Form.useForm();
  const mountedRef = useRef(false);

  const loadItems = useCallback(() => {
    clearInflight();
    setItemStatus("loading");
    setItemError("");
    listExpenseItems(month)
      .then((data) => {
        setItems(data);
        setItemStatus(data.length === 0 ? "empty" : "ready");
      })
      .catch((e: Error) => {
        setItemStatus("error");
        setItemError(e.message);
      });
  }, [month]);

  const loadCard = useCallback(() => {
    clearInflight();
    setCardStatus("loading");
    setCardError("");
    listCardImports(month)
      .then((data) => {
        setCardRows(data);
        setCardStatus(data.length === 0 ? "empty" : "ready");
      })
      .catch((e: Error) => {
        setCardStatus("error");
        setCardError(e.message);
      });
  }, [month]);

  const loadSnapshot = useCallback(() => {
    clearInflight();
    getSnapshot(month)
      .then((data) => {
        setSnapshot(data);
        if (data) setIncome(data.income);
      })
      .catch(() => setSnapshot(null));
  }, [month]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
    }
    void loadItems();
    void loadCard();
    void loadSnapshot();
  }, [loadItems, loadCard, loadSnapshot]);

  const saveItem = async () => {
    const values = await form.validateFields();
    const payload: ItemPayload = {
      label: values.label.trim(),
      amount: values.amount ?? 0,
      isEssential: values.isEssential ?? false,
      purchaseVat: values.purchaseVat ?? 0,
    };
    try {
      if (editing) {
        await updateExpenseItem(editing.id, payload);
      } else {
        await createExpenseItem(month, payload);
      }
      setEditing(null);
      form.resetFields();
      setNotice("");
      loadItems();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "저장에 실패했습니다.";
      setNotice(/중복|duplicate/.test(msg) ? "같은 월에 같은 이름의 항목이 이미 있습니다." : msg);
    }
  };

  const removeItem = async (id: number) => {
    try {
      await deleteExpenseItem(id);
      setNotice("");
      loadItems();
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  };

  const beginEdit = (row: ExpenseItemRow) => {
    setEditing(row);
    form.setFieldsValue({
      label: row.label,
      amount: row.amount,
      isEssential: row.isEssential,
      purchaseVat: row.purchaseVat,
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    form.resetFields();
  };

  const handleConfirm = async () => {
    setConfirming(true);
    setNotice("");
    try {
      const snap = await confirmMonth(month, income ?? 0);
      setSnapshot(snap);
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "월 확정에 실패했습니다.");
    } finally {
      setConfirming(false);
    }
  };

  const handleLogout = () => {
    clearToken();
    onOpenDashboard();
  };

  const itemCount = items?.length ?? 0;
  const totalAmount = (items ?? []).reduce((acc, r) => acc + r.amount, 0);
  const totalVat = (items ?? []).reduce((acc, r) => acc + r.purchaseVat, 0);
  const essentialTotal = (items ?? []).filter((r) => r.isEssential).reduce((acc, r) => acc + r.amount, 0);
  const cardTotal = (cardRows ?? []).reduce((acc, r) => acc + r.grossAmount, 0);

  const itemColumns = [
    { title: "항목", dataIndex: "label" },
    { title: "월 금액", dataIndex: "amount", align: "right" as const, width: 140, render: (v: number) => formatKrwExact(v) },
    { title: "필수", dataIndex: "isEssential", width: 70, render: (v: boolean) => (v ? "필수" : "—") },
    { title: "매입세액", dataIndex: "purchaseVat", align: "right" as const, width: 120, render: (v: number) => (v > 0 ? formatKrwExact(v) : "—") },
    {
      title: "작업",
      width: 110,
      render: (_: unknown, row: ExpenseItemRow) => (
        <Space>
          <Button size="small" type="text" onClick={() => beginEdit(row)}>편집</Button>
          <Popconfirm title="이 항목을 삭제할까요?" onConfirm={() => void removeItem(row.id)}>
            <Button size="small" type="text" danger>삭제</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const cardColumns = [
    { title: "승인일", dataIndex: "approvedAt", width: 110 },
    { title: "가맹점", dataIndex: "merchantName" },
    { title: "공급가액", dataIndex: "supplyExVat", align: "right" as const, width: 120, render: (v: number) => formatKrwExact(v) },
    { title: "부가세", dataIndex: "vat", align: "right" as const, width: 110, render: (v: number) => formatKrwExact(v) },
    { title: "이용금액", dataIndex: "grossAmount", align: "right" as const, width: 130, render: (v: number) => formatKrwExact(v) },
    { title: "용도구분", dataIndex: "expenseKind", width: 110, render: (v: string | undefined) => v || "미분류" },
  ];

  return (
    <AppLayout
      onLogout={handleLogout}
      nav={
        <Space>
          <Button type="link" onClick={onOpenDashboard}>대시보드</Button>
          <Button type="link" onClick={onOpenAssets}>자산</Button>
        </Space>
      }
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <Typography.Title level={4} id="h-expenses" style={{ margin: 0 }}>지출</Typography.Title>
        <Select
          aria-label="조회 월"
          value={month}
          options={months.map((m) => ({ value: m, label: m }))}
          onChange={(v: string) => setMonth(v)}
          style={{ width: 130 }}
        />
      </div>

      {notice ? (
        <Card style={{ marginBottom: 16 }}>
          <Typography.Text type="warning">{notice}</Typography.Text>
        </Card>
      ) : null}

      <section aria-labelledby="h-items" style={{ marginBottom: 32 }}>
        <Typography.Title level={4} id="h-items" style={{ margin: 0, marginBottom: 16 }}>월 지출 항목</Typography.Title>
        <Card>
          <StateBlock status={itemStatus} onRetry={loadItems} errorText={itemError} emptyText="항목이 없습니다 — 아래 양식에서 추가하세요">
            {items ? (
              <Table
                size="small"
                rowKey="id"
                dataSource={items}
                pagination={false}
                columns={itemColumns}
                summary={() => (
                  <Table.Summary fixed>
                    <Table.Summary.Row style={{ fontWeight: 600 }}>
                      <Table.Summary.Cell index={0}>목록 합계 ({itemCount}항목)</Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">{formatKrwExact(totalAmount)}</Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="center">필수 {formatKrwExact(essentialTotal)}</Table.Summary.Cell>
                      <Table.Summary.Cell index={3} align="right">{totalVat > 0 ? formatKrwExact(totalVat) : "—"}</Table.Summary.Cell>
                      <Table.Summary.Cell index={4} />
                    </Table.Summary.Row>
                  </Table.Summary>
                )}
              />
            ) : null}
          </StateBlock>

          <div style={{ marginTop: 16 }}>
            <Form form={form} layout="inline" component={false}>
              <Form.Item name="label" rules={[{ required: true, message: "항목명을 입력하세요" }]}
                style={{ marginRight: 8 }}>
                <Input placeholder={editing ? "항목명(편집 중)" : "항목명"} style={{ width: 160 }}
                  aria-label="항목 이름" />
              </Form.Item>
              <Form.Item name="amount" rules={[{ required: true, message: "월 금액을 입력하세요" }]}
                style={{ marginRight: 8 }}>
                <InputNumber placeholder="월 금액" min={0} style={{ width: 140 }} aria-label="월 금액" />
              </Form.Item>
              <Form.Item name="purchaseVat" style={{ marginRight: 8 }}>
                <InputNumber placeholder="매입세액" min={0} style={{ width: 120 }} aria-label="매입세액" />
              </Form.Item>
              <Form.Item name="isEssential" valuePropName="checked" style={{ marginRight: 8 }}>
                <Checkbox>필수</Checkbox>
              </Form.Item>
              <Button type="primary" onClick={() => void saveItem()}>
                {editing ? "저장" : "추가"}
              </Button>
              {editing ? <Button style={{ marginLeft: 8 }} onClick={cancelEdit}>취소</Button> : null}
            </Form>
          </div>
        </Card>
      </section>

      <section aria-labelledby="h-snapshot" style={{ marginBottom: 32 }}>
        <Typography.Title level={4} id="h-snapshot" style={{ margin: 0, marginBottom: 16 }}>월 기준 입력</Typography.Title>
        <Card>
          <Space direction="vertical" style={{ width: "100%" }} size={8}>
            <Space wrap>
              <Typography.Text>이번 달 수입</Typography.Text>
              <InputNumber
                aria-label="이번 달 수입"
                min={0}
                value={income}
                onChange={(v) => setIncome(v)}
                style={{ width: 160 }}
              />
              <Button type="primary" loading={confirming} onClick={() => void handleConfirm()}>
                월 확정
              </Button>
            </Space>
            {snapshot ? (
              <Typography.Text type="secondary">
                확정됨 {snapshot.month} — 지출 {formatKrwExact(snapshot.expenses)} ·
                필수 {formatKrwExact(snapshot.essentialExpenses)} ·
                자산 {formatKrwExact(snapshot.totalAssets)} · 부채 {formatKrwExact(snapshot.totalDebts)}
              </Typography.Text>
            ) : (
              <Typography.Text type="secondary">아직 이 월은 확정되지 않았습니다 — 수입 입력 후 '월 확정'을 누르면 스냅샷이 갱신됩니다</Typography.Text>
            )}
          </Space>
        </Card>
      </section>

      <section aria-labelledby="h-card-imports" style={{ marginBottom: 32 }}>
        <Typography.Title level={4} id="h-card-imports" style={{ margin: 0, marginBottom: 16 }}>가져온 카드내역</Typography.Title>
        <Card>
          <StateBlock status={cardStatus} onRetry={loadCard} errorText={cardError} emptyText="이 월에 반영된 카드 내역이 없습니다">
            {cardRows ? (
              <Table
                size="small"
                rowKey="rowKey"
                dataSource={cardRows}
                pagination={{ pageSize: 10 }}
                columns={cardColumns}
                summary={() => (
                  <Table.Summary fixed>
                    <Table.Summary.Row style={{ fontWeight: 600 }}>
                      <Table.Summary.Cell index={0} colSpan={2}>합계 ({cardRows.length}건)</Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right" />
                      <Table.Summary.Cell index={2} align="right">
                        {formatKrwExact((cardRows ?? []).reduce((acc, r) => acc + r.supplyExVat, 0))}
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={3} align="right">
                        {formatKrwExact((cardRows ?? []).reduce((acc, r) => acc + r.vat, 0))}
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="right">{formatKrwExact(cardTotal)}</Table.Summary.Cell>
                      <Table.Summary.Cell index={5} />
                    </Table.Summary.Row>
                  </Table.Summary>
                )}
              />
            ) : null}
          </StateBlock>
        </Card>
      </section>
    </AppLayout>
  );
}
