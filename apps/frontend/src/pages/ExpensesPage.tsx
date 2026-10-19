import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Checkbox, Form, Grid, Input, InputNumber, Popconfirm, Select, Space, Table, Typography } from "antd";
import { AppLayout } from "../layout/AppLayout";
import { StateBlock, type SurfaceStatus } from "../components/StateBlock";
import { clearInflight } from "../api/client";
import { clearToken } from "../auth/authStore";
import {
  confirmMonth,
  copyItems,
  createExpenseItem,
  createRecurring,
  deleteExpenseItem,
  deleteRecurring,
  getSnapshot,
  listCardImports,
  listExpenseItems,
  listRecurring,
  updateExpenseItem,
  updateRecurring,
  type CardImportRowFull,
  type ExpenseItemRow,
  type ItemPayload,
  type MonthSnapshot,
  type RecurringPayload,
  type RecurringRow,
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
  const screens = Grid.useBreakpoint();
  // §35 중단점: md 미만은 표 대신 카드형 리스트 — 6열 표는 좁은 폭에서 읽을 수 없다
  const wide = Boolean(screens.md);
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
  const [cardLimit, setCardLimit] = useState(20);
  const [recurring, setRecurring] = useState<RecurringRow[] | null>(null);
  const [recForm, setRecForm] = useState<RecurringRow | "new" | null>(null);
  const [prevCount, setPrevCount] = useState<number | null>(null);
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

  const loadRecurring = useCallback(() => {
    listRecurring()
      .then((data) => setRecurring(data))
      .catch(() => setRecurring(null));
  }, []);

  const prevMonth = useCallback(() => {
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, [month]);

  const [recFormInstance] = Form.useForm();

  useEffect(() => {
    if (recForm && recForm !== "new") {
      recFormInstance.setFieldsValue({ label: recForm.label, amount: recForm.amount, purchaseVat: recForm.purchaseVat, isEssential: recForm.isEssential, startMonth: recForm.startMonth, endMonth: recForm.endMonth });
    } else if (recForm === "new") {
      recFormInstance.setFieldsValue({ label: "", amount: null, purchaseVat: null, isEssential: false, startMonth: month, endMonth: null });
    }
  }, [recForm, recFormInstance, month]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
    }
    void loadItems();
    void loadCard();
    void loadSnapshot();
    void loadRecurring();
  }, [loadItems, loadCard, loadSnapshot, loadRecurring]);

  // 빈 월에만 지난달 복사 배너를 제안한다 — 지난달 항목 수를 조용히 조회
  useEffect(() => {
    if (itemStatus === "empty") {
      listExpenseItems(prevMonth())
        .then((rows) => setPrevCount(rows.length))
        .catch(() => setPrevCount(0));
    } else {
      setPrevCount(null);
    }
  }, [itemStatus, prevMonth]);

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

  const saveRecurring = async () => {
    const values = await recFormInstance.validateFields();
    const payload: RecurringPayload = {
      label: values.label.trim(),
      amount: values.amount ?? 0,
      isEssential: values.isEssential ?? false,
      purchaseVat: values.purchaseVat ?? 0,
      startMonth: values.startMonth,
      endMonth: values.endMonth ?? null,
    };
    try {
      if (recForm === "new") {
        await createRecurring(payload);
      } else {
        await updateRecurring((recForm as RecurringRow).id, payload);
      }
      setRecForm(null);
      setNotice("");
      loadRecurring();
      loadItems();
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "정기 항목 저장에 실패했습니다.");
    }
  };

  const removeRecurring = async (id: number) => {
    try {
      await deleteRecurring(id);
      loadRecurring();
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "정기 항목 중지에 실패했습니다.");
    }
  };

  const copyPrev = async () => {
    try {
      await copyItems(prevMonth(), month);
      loadItems();
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "복사에 실패했습니다.");
    }
  };

  const openRecurringEdit = (recurringId: number | null) => {
    if (!recurringId) return;
    const def = (recurring ?? []).find((d) => d.id === recurringId);
    if (def) setRecForm(def);
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
    { title: "구분", width: 84, render: (_: unknown, row: ExpenseItemRow) =>
      row.recurringId
        ? <span style={{ background: "#e0e7ff", color: "#3730a3", borderRadius: 20, fontSize: 11, padding: "2px 9px" }}>정기</span>
        : <Typography.Text type="secondary" style={{ fontSize: 12 }}>수동</Typography.Text> },
    { title: "월 금액", dataIndex: "amount", align: "right" as const, width: 140, render: (v: number) => formatKrwExact(v) },
    { title: "필수", dataIndex: "isEssential", width: 70, render: (v: boolean) => (v ? "필수" : "—") },
    { title: "매입세액", dataIndex: "purchaseVat", align: "right" as const, width: 120, render: (v: number) => (v > 0 ? formatKrwExact(v) : "—") },
    {
      title: "작업",
      render: (_: unknown, row: ExpenseItemRow) => (
        <Space size={0}>
          <Button size="small" type="text" onClick={() => beginEdit(row)}>이 달만 수정</Button>
          {row.recurringId ? <Button size="small" type="text" onClick={() => openRecurringEdit(row.recurringId)}>정기 항목 수정</Button> : null}
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
          onChange={(v: string) => { setMonth(v); setCardLimit(20); }}
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
          {prevCount !== null && prevCount > 0 && itemStatus === "empty" ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "rgba(0, 0, 0, 0.02)", border: "1px dashed rgba(5, 5, 5, 0.15)", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
              <span style={{ fontSize: 13 }}>이 월은 항목이 비어 있어요 — 지난달({prevMonth()}) 항목 <b>{prevCount}건</b>을 가져올까요?</span>
              <Button size="small" type="primary" onClick={() => void copyPrev()}>지난달 항목 가져오기</Button>
            </div>
          ) : null}
          <StateBlock status={itemStatus} onRetry={loadItems} errorText={itemError} emptyText="항목이 없습니다 — 아래 양식에서 추가하세요">
            {items ? (
              wide ? (
              <Table
                size="small"
                rowKey="id"
                dataSource={items}
                pagination={false}
                columns={itemColumns}
                summary={() => (
                  <Table.Summary fixed>
                    <Table.Summary.Row style={{ fontWeight: 600 }}>
                      <Table.Summary.Cell index={0} colSpan={2}>합계 ({itemCount}항목)</Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right">
                        <div style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{formatKrwExact(totalAmount)}</div>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={3} align="center">
                        <div style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{formatKrwExact(essentialTotal)}</div>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="right">{totalVat > 0 ? formatKrwExact(totalVat) : "—"}</Table.Summary.Cell>
                      <Table.Summary.Cell index={5} />
                    </Table.Summary.Row>
                  </Table.Summary>
                )}
              />
              ) : (
                <div>
                  {items.map((it) => (
                    <div key={it.id} style={{ border: "1px solid rgba(5, 5, 5, 0.06)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <span style={{ fontWeight: 600 }}>{it.label}</span>
                          {it.isEssential ? (
                            <span style={{ background: "#dcfce7", color: "#166534", borderRadius: 20, fontSize: 11, padding: "2px 9px", lineHeight: "16px" }}>필수</span>
                          ) : null}
                          <span style={{ background: "#e0e7ff", color: "#3730a3", borderRadius: 20, fontSize: 11, padding: "2px 9px", lineHeight: "16px" }}>{it.recurringId ? "정기" : "수동"}</span>
                        </div>
                        <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{formatKrwExact(it.amount)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <span style={{ fontSize: 12, color: "rgba(0, 0, 0, 0.45)" }}>
                          매입세액 {it.purchaseVat > 0 ? formatKrwExact(it.purchaseVat) : "—"}
                        </span>
                        <Space size={0} wrap>
                          <Button size="small" type="text" onClick={() => beginEdit(it)}>이 달만 수정</Button>
                          {it.recurringId ? <Button size="small" type="text" onClick={() => openRecurringEdit(it.recurringId)}>정기 항목 수정</Button> : null}
                          <Popconfirm title="이 항목을 삭제할까요?" onConfirm={() => void removeItem(it.id)}>
                            <Button size="small" type="text" danger>삭제</Button>
                          </Popconfirm>
                        </Space>
                      </div>
                    </div>
                  ))}
                  <div style={{ fontWeight: 600, padding: "4px 2px" }}>
                    <span>합계 ({itemCount}항목)</span>
                    <span> {formatKrwExact(totalAmount)}</span>
                    <span> · 필수 {formatKrwExact(essentialTotal)}</span>
                  </div>
                </div>
              )
            ) : null}
          </StateBlock>

          <div style={{ marginTop: 16 }}>
            <Form form={form} layout="inline" style={{ display: "flex", flexWrap: "wrap", gap: "10px 12px" }}>
              <Form.Item name="label" rules={[{ required: true, message: "항목명을 입력하세요" }]}
               >
                <Input placeholder={editing ? "항목명(편집 중)" : "항목명"} style={{ width: 160 }}
                  aria-label="항목 이름" />
              </Form.Item>
              <Form.Item name="amount" rules={[{ required: true, message: "월 금액을 입력하세요" }]}
               >
                <InputNumber placeholder="월 금액" min={0} style={{ width: 140 }} aria-label="월 금액" />
              </Form.Item>
              <Form.Item name="purchaseVat">
                <InputNumber placeholder="매입세액" min={0} style={{ width: 120 }} aria-label="매입세액" />
              </Form.Item>
              <Form.Item name="isEssential" valuePropName="checked">
                <Checkbox>필수</Checkbox>
              </Form.Item>
              <Button type="primary" onClick={() => void saveItem()}>
                {editing ? "저장" : "추가"}
              </Button>
              {editing ? <Button onClick={cancelEdit}>취소</Button> : null}
            </Form>
          </div>
        </Card>
      </section>

      <section aria-labelledby="h-recurring" style={{ marginBottom: 32 }}>
        <Typography.Title level={4} id="h-recurring" style={{ margin: 0, marginBottom: 16 }}>정기 항목 (고정지출)</Typography.Title>
        <Card>
          {recurring === null ? (
            <Typography.Text type="secondary">정기 항목을 불러올 수 없습니다</Typography.Text>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {recurring.map((r) => (
                  <span
                    key={r.id}
                    onClick={() => setRecForm(r)}
                    style={{ background: "rgba(0, 0, 0, 0.02)", border: "1px solid rgba(5, 5, 5, 0.06)", borderRadius: 20, padding: "5px 12px", fontSize: 12.5, display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}
                  >
                    <span><b>{r.label}</b> {formatKrwExact(r.amount)}{r.isEssential ? " · 필수" : ""} · {r.endMonth ? `~${r.endMonth}` : "무기한"}</span>
                    <Popconfirm title="정기 항목을 중지할까요? (이미 만들어진 월 표 행은 유지됩니다)" onConfirm={() => void removeRecurring(r.id)}>
                      <Button type="text" size="small" onClick={(e) => e.stopPropagation()} aria-label={`${r.label} 정기 중지`}>✕</Button>
                    </Popconfirm>
                  </span>
                ))}
                <Button type="dashed" onClick={() => setRecForm("new")}>+ 정기 항목 추가</Button>
              </div>
              {recForm ? (
                <div style={{ marginTop: 12, borderTop: "1px solid rgba(5, 5, 5, 0.06)", paddingTop: 12 }}>
                  <Form form={recFormInstance} layout="inline" style={{ display: "flex", flexWrap: "wrap", gap: "10px 12px" }}>
                    <Form.Item name="label" rules={[{ required: true, message: "항목명을 입력하세요" }]}>
                      <Input placeholder="항목명" style={{ width: 140 }} aria-label="정기 항목 이름" />
                    </Form.Item>
                    <Form.Item name="amount" rules={[{ required: true, message: "월 금액을 입력하세요" }]}>
                      <InputNumber placeholder="월 금액" min={0} style={{ width: 120 }} aria-label="정기 월 금액" />
                    </Form.Item>
                    <Form.Item name="purchaseVat">
                      <InputNumber placeholder="매입세액" min={0} style={{ width: 110 }} aria-label="정기 매입세액" />
                    </Form.Item>
                    <Form.Item name="isEssential" valuePropName="checked">
                      <Checkbox>필수</Checkbox>
                    </Form.Item>
                    <Form.Item name="startMonth" rules={[{ required: true, message: "시작월을 선택하세요" }]}>
                      <Select placeholder="시작월" options={months.map((m) => ({ value: m, label: m }))} style={{ width: 120 }} aria-label="시작월" />
                    </Form.Item>
                    <Form.Item name="endMonth">
                      <Select placeholder="종료월" allowClear options={months.map((m) => ({ value: m, label: m }))} style={{ width: 120 }} aria-label="종료월" />
                    </Form.Item>
                    <Button type="primary" onClick={() => void saveRecurring()}>저장</Button>
                    <Button onClick={() => setRecForm(null)}>취소</Button>
                  </Form>
                </div>
              ) : null}
            </>
          )}
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
              wide ? (
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
              ) : (
                <div>
                  {cardRows.slice(0, cardLimit).map((r) => (
                    <div key={r.rowKey} style={{ border: "1px solid rgba(5, 5, 5, 0.06)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{r.merchantName}</span>
                        <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{formatKrwExact(r.grossAmount)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(0, 0, 0, 0.45)", marginTop: 4 }}>
                        {r.approvedAt} · 공급 {formatKrwExact(r.supplyExVat)} · 부가세 {formatKrwExact(r.vat)} · {r.expenseKind || "미분류"}
                      </div>
                    </div>
                  ))}
                  {cardRows.length > cardLimit ? (
                    <Button block type="text" onClick={() => setCardLimit((n) => n + 30)}>
                      나머지 {cardRows.length - cardLimit}건 더 보기
                    </Button>
                  ) : null}
                  <div style={{ fontWeight: 600, padding: "4px 2px" }}>
                    <span>합계 ({cardRows.length}건)</span>
                    <span> {formatKrwExact(cardTotal)}</span>
                  </div>
                </div>
              )
            ) : null}
          </StateBlock>
        </Card>
      </section>
    </AppLayout>
  );
}
