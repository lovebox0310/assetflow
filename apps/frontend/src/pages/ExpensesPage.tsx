import { useCallback, useEffect, useState } from "react";
import { Button, Card, Checkbox, Form, Grid, Input, InputNumber, Select, Typography } from "antd";
import { AppLayout } from "../layout/AppLayout";
import { StandardNav } from "../layout/StandardNav";
import { SubNav } from "../components/SubNav";
import { MonthSelect } from "../components/MonthSelect";
import { StateBlock, type SurfaceStatus } from "../components/StateBlock";
import { AfListTable, type AfListColumn, type AfRowAction } from "../components/AfListTable";
import { clearInflight } from "../api/client";
import { clearToken } from "../auth/authStore";
import { CATEGORY_GROUP_OPTIONS } from "../data/expenseCategories";
import {
  confirmMonth,
  copyItems,
  convertItemToRecurring,
  createExpenseItem,
  createRecurring,
  deleteExpenseItem,
  deleteRecurring,
  getSnapshot,
  listExpenseItems,
  listRecurring,
  updateExpenseItem,
  updateRecurring,
  type ExpenseItemRow,
  type ItemPayload,
  type MonthSnapshot,
  type RecurringPayload,
  type RecurringRow,
} from "../api/expensesApi";
import { formatKrwExact } from "../utils/formatters";
import { previousMonth, recentMonths } from "../utils/months";

interface ExpensesPageProps {
  /** App 이 소유하는 조회 월 — 카드내역 탭과 공유한다. */
  month: string;
  onMonthChange: (month: string) => void;
  onOpenDashboard: () => void;
  onOpenAssets: () => void;
  /** 지출 하위 화면인 카드내역 탭으로 이동한다. */
  onOpenCards: () => void;
  /** 헤더 나이게이션 — 설정 화면으로 이동 (§46). */
  onOpenSettings: () => void;
}

/*
 * §28.4 — 배지 스타일은 `app.css` 의 `.af-badge` 로 옮겼다.
 * 라벨이 한국어라 letter-spacing·uppercase·모노는 쓰지 않는다(§28.2/D5).
 * 높낮이(크기)·굵기·배경색만으로 구분한다.
 * 옮긴 이유: 모바일에서만 배지 폭을 줄여야 한다(인라인 style 은 CSS 로 덮을 수
 * 없다). 데스크톱 값은 기존과 같다.
 */

/**
 * 스프린트 3 #36: §31 지출 화면의 React 이관.
 * - 월 선택 → 월 지출 항목(CRUD) + 수입 입력·월 확정(§44 스냅샷).
 * - 카드 원장 소비·미분류 정리는 카드내역 탭으로 분리했다(§58).
 * - 합계·필수지출 합계는 행에서 재계산 — 저장하지 않는다(§34.6).
 * - §55.10: 항목마다 대분류를 골라 지출 추이에 반영한다.
 */
export function ExpensesPage({
  month,
  onMonthChange,
  onOpenDashboard,
  onOpenAssets,
  onOpenCards,
  onOpenSettings,
}: ExpensesPageProps) {
  const screens = Grid.useBreakpoint();
  // §35 중단점: md 미만은 표 대신 카드형 리스트 — 6열 표는 좁은 폭에서 읽을 수 없다
  const wide = Boolean(screens.md);
  const [items, setItems] = useState<ExpenseItemRow[] | null>(null);
  const [itemStatus, setItemStatus] = useState<SurfaceStatus>("loading");
  const [itemError, setItemError] = useState("");
  const [snapshot, setSnapshot] = useState<MonthSnapshot | null>(null);
  const [income, setIncome] = useState<number | null>(null);
  const [vatSetAside, setVatSetAside] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  const [recurring, setRecurring] = useState<RecurringRow[] | null>(null);
  const [recForm, setRecForm] = useState<RecurringRow | "new" | null>(null);
  const [prevCount, setPrevCount] = useState<number | null>(null);
  const [prefill, setPrefill] = useState<Partial<RecurringRow> | null>(null);
  const [editing, setEditing] = useState<ExpenseItemRow | null>(null);
  const [form] = Form.useForm();

  const prevMonth = previousMonth(month);
  const monthOptions = recentMonths().map((m) => ({ value: m, label: m }));

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

  const loadSnapshot = useCallback(() => {
    clearInflight();
    getSnapshot(month)
      .then((data) => {
        setSnapshot(data);
        if (data) {
          setIncome(data.income);
          setVatSetAside(data.vatSetAside ?? 0);
        }
      })
      .catch(() => setSnapshot(null));
  }, [month]);

  const loadRecurring = useCallback(() => {
    listRecurring()
      .then((data) => setRecurring(data))
      .catch(() => setRecurring(null));
  }, []);

  const [recFormInstance] = Form.useForm();

  useEffect(() => {
    if (recForm && recForm !== "new") {
      recFormInstance.setFieldsValue({ label: recForm.label, amount: recForm.amount, purchaseVat: recForm.purchaseVat, isEssential: recForm.isEssential, startMonth: recForm.startMonth, endMonth: recForm.endMonth, category: recForm.category ?? undefined });
    } else if (recForm === "new") {
      const values = prefill ?? { label: "", amount: null, purchaseVat: null, isEssential: false, startMonth: month, endMonth: null, category: undefined };
      recFormInstance.setFieldsValue(values);
    }
  }, [recForm, recFormInstance, month]);

  useEffect(() => {
    void loadItems();
    void loadSnapshot();
    void loadRecurring();
  }, [loadItems, loadSnapshot, loadRecurring]);

  /**
   * 월을 바꾸면 편집 중이던 행은 그 달 목록에 없다. 편집 행이 사라진 채
   * 추가 폼까지 숨으면 입력할 곳이 없으므로 편집 상태를 닫는다.
   */
  useEffect(() => {
    setEditing(null);
    form.resetFields();
  }, [month, form]);

  // 빈 월에만 지난달 복사 배너를 제안한다 — 지난달 항목 수를 조용히 조회
  useEffect(() => {
    if (itemStatus === "empty") {
      listExpenseItems(prevMonth)
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
      category: values.category ?? null,
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
      category: row.category ?? undefined,
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
      category: values.category ?? null,
    };
    try {
      if (recForm === "new") {
        await createRecurring(payload);
      } else {
        await updateRecurring((recForm as RecurringRow).id, payload);
      }
      setRecForm(null);
      setPrefill(null);
      setNotice("");
      loadRecurring();
      loadItems();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "정기 항목 저장에 실패했습니다.";
      setNotice(/중복|duplicate/.test(msg) ? "같은 이름·시작월의 정기 항목이 이미 있습니다." : msg);
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
      await copyItems(prevMonth, month);
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

  /** 월 항목을 그 값 그대로 정기 정의로 등록하고 행을 연결한다 (§45.5) — 서버 연산 1클릭. */
  const convertToRecurring = async (row: ExpenseItemRow) => {
    try {
      await convertItemToRecurring(row.id, row.month);
      setNotice("");
      loadItems();
      loadRecurring();
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : "정기 항목 등록에 실패했습니다.");
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    form.resetFields();
  };

  const handleConfirm = async () => {
    setConfirming(true);
    setNotice("");
    try {
      const snap = await confirmMonth(month, income ?? 0, vatSetAside ?? 0);
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

  /**
   * 정기 정의를 못 읽었으면(로드 실패) "이 달만 수정" 을 판단하지 않는다 —
   * 비교 대상이 없는데 태그를 붙이면 없는 차이를 만들어 낸다(§34.6).
   */
  const recurringDefinition = (it: ExpenseItemRow) =>
    it.recurringId ? (recurring ?? []).find((d) => d.id === it.recurringId) : undefined;
  const isMonthOnlyEdit = (it: ExpenseItemRow) => {
    const def = recurringDefinition(it);
    return Boolean(def && def.amount !== it.amount);
  };

  /**
   * 행 배지는 행 탭 버튼 **밖**(primaryExtra)에 둔다 — 버튼 안에 넣으면
   * 접근 이름과 보이는 텍스트가 어긋나 `label-content-name-mismatch` 가 난다.
   *
   * "이 달만 수정" 태그는 여기 두지 않는다. 320px 에서 이름·필수·정기·태그를
   * 한 줄에 넣으면 배지가 3~4줄로 접혀 행이 90px 를 넘는다(측정). 금액이
   * 바뀐 달이라는 뜻이므로 금액 옆/아래에 붙인다 — `amount` 열 render 참고.
   */
  const itemPrimaryExtra = (it: ExpenseItemRow) => (
    <>
      {it.isEssential ? <span className="af-badge af-badge--essential">필수</span> : null}
      <span className="af-badge af-badge--recurring">{it.recurringId ? "정기" : "수동"}</span>
    </>
  );

  const itemColumns: AfListColumn<ExpenseItemRow>[] = [
    { key: "label", header: "항목", mobile: "primary", render: (it) => <span>{it.label}</span> },
    {
      key: "amount",
      header: "금액",
      numeric: true,
      mobile: "value",
      render: (it) => (
        <>
          {formatKrwExact(it.amount)}
          {isMonthOnlyEdit(it) ? <span className="af-list__amount-note">이 달만 수정</span> : null}
        </>
      ),
    },
    { key: "category", header: "대분류", mobile: "meta", render: (it) => it.category ?? "추이 제외" },
    {
      key: "purchaseVat",
      header: "매입세액",
      numeric: true,
      mobile: "meta",
      render: (it) => (it.purchaseVat > 0 ? formatKrwExact(it.purchaseVat) : "—"),
    },
  ];

  const itemActions = (it: ExpenseItemRow): AfRowAction[] => [
    it.recurringId
      ? {
          key: "edit-recurring",
          label: "정기 항목 수정",
          onSelect: () => openRecurringEdit(it.recurringId),
        }
      : {
          key: "convert-recurring",
          label: "정기 항목으로 등록",
          onSelect: () => void convertToRecurring(it),
        },
    {
      key: "delete",
      label: "삭제",
      danger: true,
      confirm: "이 항목을 삭제할까요?",
      onSelect: () => void removeItem(it.id),
    },
  ];

  /**
   * 모바일 2행은 대분류만 쓴다. 매입세액까지 붙이면 320px 에서 배지와 줄을
   * 나눠 쓰다가 폭 31px 로 잘려 아무 정보도 남지 않는다(F1, 실측).
   * 매입세액은 meta 셀(접근성 트리)과 합계 줄이 계속 갖고 있다.
   */
  const itemRowSubtitle = (it: ExpenseItemRow) => it.category ?? "추이 제외";

  /**
   * 항목 폼은 한 번에 하나만 마운트한다 — Form 인스턴스 하나에 Form 요소 둘을
   * 연결하면 antd 가 값을 잃는다. 편집 중에는 편집 행, 그 외에는 목록 아래 추가 폼.
   */
  const renderItemForm = (mode: "add" | "edit") => (
    <Form form={form} layout="inline" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: wide ? "10px 12px" : "12px" }}>
      <Form.Item name="label" rules={[{ required: true, message: "항목명을 입력하세요" }]}
        style={wide ? {} : { flex: "1 1 100%", minWidth: 0 }}
      >
        <Input placeholder={mode === "edit" ? "항목명(편집 중)" : "항목명"} style={{ width: wide ? 160 : "100%" }}
          aria-label="항목 이름" />
      </Form.Item>
      <Form.Item name="amount" rules={[{ required: true, message: "월 금액을 입력하세요" }]}
        style={wide ? {} : { flex: "1 1 100%", minWidth: 0 }}
      >
        <InputNumber placeholder="월 금액" min={0} style={{ width: wide ? 140 : "100%" }} aria-label="월 금액" />
      </Form.Item>
      <Form.Item name="category" style={wide ? {} : { flex: "1 1 100%", minWidth: 0 }}>
        <Select
          placeholder="대분류(추이 제외)"
          allowClear
          options={CATEGORY_GROUP_OPTIONS}
          style={{ width: wide ? 150 : "100%" }}
          aria-label="대분류"
        />
      </Form.Item>
      <Form.Item name="purchaseVat" style={wide ? {} : { flex: "1 1 100%", minWidth: 0 }}>
        <InputNumber placeholder="매입세액" min={0} style={{ width: wide ? 120 : "100%" }} aria-label="매입세액" />
      </Form.Item>
      <Form.Item name="isEssential" valuePropName="checked">
        <Checkbox>필수</Checkbox>
      </Form.Item>
      <Button type="primary" onClick={() => void saveItem()}>
        {mode === "edit" ? "저장" : "추가"}
      </Button>
      {mode === "edit" ? <Button onClick={cancelEdit}>취소</Button> : null}
    </Form>
  );

  /**
   * 정기 항목 표. `기간` 은 폭과 무관하게 항상 셀에 렌더한다 — meta 셀이 clip
   * 되어 있어도 스크린리더는 셀 값을 읽는다(모바일에서 빈 셀이 되면 정보 손실).
   * 그래서 rowSubtitle 은 대분류만 쓴다(같은 기간 문구를 두 곳에 두면 중복된다).
   */
  const recurringColumns: AfListColumn<RecurringRow>[] = [
    { key: "label", header: "항목", mobile: "primary", render: (r) => <span>{r.label}</span> },
    { key: "amount", header: "금액", numeric: true, mobile: "value", render: (r) => formatKrwExact(r.amount) },
    { key: "category", header: "대분류", mobile: "meta", render: (r) => r.category ?? "추이 제외" },
    {
      key: "period",
      header: "기간",
      mobile: "meta",
      render: (r) => (r.endMonth ? `~${r.endMonth}` : "무기한"),
    },
  ];

  return (
    <AppLayout
      onLogout={handleLogout}
      nav={<StandardNav current="expenses" onOpenDashboard={onOpenDashboard} onOpenAssets={onOpenAssets} onOpenSettings={onOpenSettings} />}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <Typography.Title level={1} id="h-expenses" style={{ fontSize: 24, margin: 0 }}>지출</Typography.Title>
        <MonthSelect value={month} onChange={onMonthChange} />
      </div>

      <SubNav
        ariaLabel="지출 하위 화면"
        current="expenses"
        items={[
          { key: "expenses", label: "지출", ariaLabel: "지출 탭" },
          { key: "cards", label: "카드내역", ariaLabel: "카드내역 탭", onClick: onOpenCards },
        ]}
      />

      {/* 이슈 #70: 변경 알림을 role=status + aria-live=polite 로 — 스크린리더가
          화면 전환 없이도 안내를 읽는다. (notice 는 주로 실패·중복 안내다) */}
      {notice ? (
        <Card style={{ marginBottom: 16 }} role="status" aria-live="polite">
          <Typography.Text type="warning">{notice}</Typography.Text>
        </Card>
      ) : null}

      <section aria-labelledby="h-items" style={{ marginBottom: 32 }}>
        <Typography.Title level={2} id="h-items" style={{ fontSize: 16, margin: 0, marginBottom: 16 }}>월 지출 항목</Typography.Title>
        <Card>
          {prevCount !== null && prevCount > 0 && itemStatus === "empty" ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "var(--af-secondary)", border: "1px dashed var(--af-border)", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
              <span style={{ fontSize: 13 }}>이 월은 항목이 비어 있어요 — 지난달({prevMonth}) 항목 <b>{prevCount}건</b>을 가져올까요?</span>
              <Button type="primary" onClick={() => void copyPrev()}>지난달 항목 가져오기</Button>
            </div>
          ) : null}
          <StateBlock status={itemStatus} onRetry={loadItems} errorText={itemError} emptyText="항목이 없습니다 — 아래 양식에서 추가하세요">
            {items ? (
              <AfListTable
                labelledBy="h-items"
                rows={items}
                rowKey={(it) => it.id}
                columns={itemColumns}
                onActivate={beginEdit}
                activateLabel={(it) => `${it.label} 이 달만 수정`}
                primaryExtra={itemPrimaryExtra}
                rowSubtitle={itemRowSubtitle}
                actions={itemActions}
                actionsLabel={(it) => `${it.label} 행 메뉴`}
                editingKey={editing ? editing.id : null}
                renderEditor={() => renderItemForm("edit")}
                editorLabel={(r) => `${r.label} 편집`}
                onCancelEdit={cancelEdit}
                footer={
                  /* 단일 flex item — span 4개를 그대로 넘기면 320px 에서 3줄로 쪼개진다(F3). */
                  <span>
                    <span>합계 ({itemCount}항목)</span>
                    <span> {formatKrwExact(totalAmount)}</span>
                    <span> · 필수 {formatKrwExact(essentialTotal)}</span>
                    {totalVat > 0 ? <span> · 매입세액 {formatKrwExact(totalVat)}</span> : null}
                  </span>
                }
              />
            ) : null}
          </StateBlock>

          {/* 편집 중에는 편집 행이 같은 폼을 들고 있으므로 추가 폼을 숨긴다(중복 라벨 금지). */}
          {editing ? null : <div style={{ marginTop: 16 }}>{renderItemForm("add")}</div>}
        </Card>
      </section>

      <section aria-labelledby="h-recurring" style={{ marginBottom: 32 }}>
        <Typography.Title level={2} id="h-recurring" style={{ fontSize: 16, margin: 0, marginBottom: 16 }}>정기 항목 (고정지출)</Typography.Title>
        <Card>
          {recurring === null ? (
            <Typography.Text type="secondary">정기 항목을 불러올 수 없습니다</Typography.Text>
          ) : (
            <>
              {recurring.length > 0 ? (
                <AfListTable
                  labelledBy="h-recurring"
                  rows={recurring}
                  rowKey={(r) => r.id}
                  columns={recurringColumns}
                  onActivate={(r) => setRecForm(r)}
                  activateLabel={(r) => `${r.label} 정기 항목 편집`}
                  primaryExtra={(r) => (r.isEssential ? <span className="af-badge af-badge--essential">필수</span> : null)}
                  rowSubtitle={(r) => r.category ?? "추이 제외"}
                  actions={(r) => [
                    {
                      key: "stop",
                      label: "중지",
                      danger: true,
                      confirm: "정기 항목을 중지할까요? (이미 만들어진 월 표 행은 유지됩니다)",
                      onSelect: () => void removeRecurring(r.id),
                    },
                  ]}
                  actionsLabel={(r) => `${r.label} 행 메뉴`}
                />
              ) : null}
              <div style={{ marginTop: recurring.length > 0 ? 12 : 0 }}>
                <Button type="dashed" onClick={() => setRecForm("new")}>+ 정기 항목 추가</Button>
              </div>
              {recForm ? (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--af-border)", paddingTop: 12 }}>
                  {recForm !== "new" ? (
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                      이미 만들어진 달의 금액은 그 달 값으로 유지됩니다. 이름 변경은 연결된 월에 반영됩니다.
                    </Typography.Text>
                  ) : null}
                  <Form form={recFormInstance} layout="inline" style={{ display: "flex", flexWrap: "wrap", gap: wide ? "10px 12px" : "12px" }}>
                    <Form.Item name="label" rules={[{ required: true, message: "항목명을 입력하세요" }]} style={wide ? {} : { flex: "1 1 100%", minWidth: 0 }}>
                      <Input placeholder="항목명" style={{ width: wide ? 140 : "100%" }} aria-label="정기 항목 이름" />
                    </Form.Item>
                    <Form.Item name="amount" rules={[{ required: true, message: "월 금액을 입력하세요" }]} style={wide ? {} : { flex: "1 1 100%", minWidth: 0 }}>
                      <InputNumber placeholder="월 금액" min={0} style={{ width: wide ? 120 : "100%" }} aria-label="정기 월 금액" />
                    </Form.Item>
                    <Form.Item name="category" style={wide ? {} : { flex: "1 1 100%", minWidth: 0 }}>
                      <Select
                        placeholder="대분류(추이 제외)"
                        allowClear
                        options={CATEGORY_GROUP_OPTIONS}
                        style={{ width: wide ? 150 : "100%" }}
                        aria-label="정기 대분류"
                      />
                    </Form.Item>
                    <Form.Item name="purchaseVat" style={wide ? {} : { flex: "1 1 100%", minWidth: 0 }}>
                      <InputNumber placeholder="매입세액" min={0} style={{ width: wide ? 110 : "100%" }} aria-label="정기 매입세액" />
                    </Form.Item>
                    <Form.Item name="isEssential" valuePropName="checked">
                      <Checkbox>필수</Checkbox>
                    </Form.Item>
                    <Form.Item name="startMonth" rules={[{ required: true, message: "시작월을 선택하세요" }]} style={wide ? {} : { flex: "1 1 100%", minWidth: 0 }}>
                      <Select placeholder="시작월" options={monthOptions} style={{ width: wide ? 120 : "100%" }} aria-label="시작월" />
                    </Form.Item>
                    <Form.Item name="endMonth" style={wide ? {} : { flex: "1 1 100%", minWidth: 0 }}>
                      <Select placeholder="종료월" allowClear options={monthOptions} style={{ width: wide ? 120 : "100%" }} aria-label="종료월" />
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
        <Typography.Title level={2} id="h-snapshot" style={{ fontSize: 16, margin: 0, marginBottom: 16 }}>월 기준 입력</Typography.Title>
        <Card>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--af-muted-foreground)" }}>
            이번 달 수입과 부가세통장 이체액으로 확정합니다. 부가세통장 이체는 부가세 납부를 위해
            따로 남겨 둘 금액이며 월 수지에서 차감됩니다.
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: wide ? "row" : "column",
              flexWrap: wide ? "wrap" : "nowrap",
              // 좁은 화면은 column — flex-end 로 두면 자식의 교차축 폭이
              // 줄어들어(min-content) 입력이 카드 폭을 못 채운다. 세로는 stretch.
              alignItems: wide ? "flex-end" : "stretch",
              gap: 16,
            }}
          >
            <div style={{ flex: wide ? "0 1 280px" : "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              <label htmlFor="snap-income" style={{ fontSize: 14, lineHeight: "22px", color: "var(--af-muted-foreground)" }}>이번 달 수입</label>
              <InputNumber id="snap-income" min={0} value={income} onChange={(v) => setIncome(v)} style={{ width: "100%" }} />
            </div>
            <div style={{ flex: wide ? "0 1 280px" : "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              <label htmlFor="snap-vat" style={{ fontSize: 14, lineHeight: "22px", color: "var(--af-muted-foreground)" }}>부가세통장 이체</label>
              <InputNumber id="snap-vat" min={0} value={vatSetAside} onChange={(v) => setVatSetAside(v)} style={{ width: "100%" }} />
            </div>
            <Button
              type="primary"
              loading={confirming}
              onClick={() => void handleConfirm()}
              style={{ flex: wide ? "0 0 auto" : "1 1 100%", width: wide ? undefined : "100%" }}
            >
              월 확정
            </Button>
          </div>
          <div style={{ marginTop: 12 }}>
            {snapshot ? (
              <Typography.Text type="secondary">
                확정됨 {snapshot.month} — 부가세통장 {formatKrwExact(snapshot.vatSetAside)} ·
                지출 {formatKrwExact(snapshot.expenses)} ·
                수지 {formatKrwExact(snapshot.balance)} ·
                필수 {formatKrwExact(snapshot.essentialExpenses)} ·
                자산 {formatKrwExact(snapshot.totalAssets)} · 부채 {formatKrwExact(snapshot.totalDebts)}
              </Typography.Text>
            ) : (
              <Typography.Text type="secondary">아직 이 월은 확정되지 않았습니다 — 수입 입력 후 '월 확정'을 누르면 스냅샷이 갱신됩니다</Typography.Text>
            )}
          </div>
        </Card>
      </section>
    </AppLayout>
  );
}
