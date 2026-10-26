import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Checkbox, Form, Grid, Input, InputNumber, Popconfirm, Progress, Select, Space, Table, Typography } from "antd";
import { AppLayout } from "../layout/AppLayout";
import { StandardNav } from "../layout/StandardNav";
import { StateBlock, type SurfaceStatus } from "../components/StateBlock";
import {
  MobileListCardActions,
  MobileListCardHeader,
  MobileListCardItem,
  MobileListCardMeta,
} from "../components/MobileListCard";
import { clearInflight } from "../api/client";
import { clearToken } from "../auth/authStore";
import {
  assignMerchantCategory,
  listUnclassifiedGroups,
  reclassifyCardImports,
  updateCardImportCategory,
  type UnclassifiedGroup,
} from "../api/cardImportApi";
import {
  CATEGORY_GROUP_OPTIONS,
  isAssetTransferSubCategory,
  isFixedSubCategory,
  isUnclassified,
  subCategoryOptions,
} from "../data/expenseCategories";
import { BusinessInfoModal } from "../components/BusinessInfoModal";
import { formatBusinessNo } from "../api/businessInfoApi";
import {
  confirmMonth,
  copyItems,
  convertItemToRecurring,
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
  /** 헤더 나이게이션 — 설정 화면으로 이동 (§46). */
  onOpenSettings: () => void;
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
 * §28.4 — 배지 스타일.
 * 라벨이 한국어라 letter-spacing·uppercase·모노는 쓰지 않는다(§28.2/D5).
 * 높낮이(크기)·굵기·배경색만으로 구분한다.
 */
const badgeBase: React.CSSProperties = {
  borderRadius: 20,
  fontSize: 11,
  fontWeight: 600,
  padding: "2px 9px",
  lineHeight: "16px",
  display: "inline-block",
};

const recurringBadgeStyle: React.CSSProperties = {
  ...badgeBase,
  background: "var(--af-badge-signal-bg)",
  color: "var(--af-badge-signal-fg)",
};

const essentialBadgeStyle: React.CSSProperties = {
  ...badgeBase,
  background: "var(--af-badge-grove-bg)",
  color: "var(--af-badge-grove-fg)",
};

/**
 * 스프린트 3 #36: §31 지출 화면의 React 이관.
 * - 월 선택 → 월 지출 항목(CRUD) + 수입 입력·월 확정(§44 스냅샷) + 카드 원장 소비(§41).
 * - 합계·필수지출 합계는 행에서 재계산 — 저장하지 않는다(§34.6).
 * - §55.10: 카드내역은 대분류+세부 두 단계, 고정비/변동비/자산 이동을 구분해 표시.
 */
export function ExpensesPage({ onOpenDashboard, onOpenAssets, onOpenSettings }: ExpensesPageProps) {
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
  const [reclassifying, setReclassifying] = useState(false);
  const [unclassified, setUnclassified] = useState<UnclassifiedGroup[] | null>(null);
  const [unclassifiedError, setUnclassifiedError] = useState("");
  const [unclassifiedSearch, setUnclassifiedSearch] = useState("");
  const [unclassifiedPage, setUnclassifiedPage] = useState(1);
  const [unclassifiedInitialCount, setUnclassifiedInitialCount] = useState(0);
  const [undo, setUndo] = useState<{ group: UnclassifiedGroup; category: string } | null>(null);
  const [cardPage, setCardPage] = useState(1);
  const [unclassifiedOnly, setUnclassifiedOnly] = useState(false);
  /** 사업자번호 클릭 → 사업자 정보 모달 (화면 이동 없음). */
  const [businessInfoTarget, setBusinessInfoTarget] = useState<{ businessNo: string; merchantName: string } | null>(null);
  const [recurring, setRecurring] = useState<RecurringRow[] | null>(null);
  const [recForm, setRecForm] = useState<RecurringRow | "new" | null>(null);
  const [prevCount, setPrevCount] = useState<number | null>(null);
  const [prefill, setPrefill] = useState<Partial<RecurringRow> | null>(null);
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

  /** §55.8 미분류 작업함 — 월과 무관하게 전체 미분류를 가맹점 단위로 읽는다. */
  const loadUnclassified = useCallback(() => {
    setUnclassifiedError("");
    setUnclassified(null);
    listUnclassifiedGroups()
      .then((data) => {
        setUnclassified(data);
        setUnclassifiedInitialCount((prev) => Math.max(prev, data.length));
      })
      .catch((e: Error) => setUnclassifiedError(e.message));
  }, []);

  /** 서버가 이미 같은 가맹점 행 전체를 바꿨으므로, 화멾도 재조회 없이 그 자리에서 맞춘다. */
  const applyMerchantCategoryLocally = useCallback((merchantName: string, category: string, subCategory: string) => {
    setCardRows((prev) =>
      prev
        ? prev.map((r) => (r.merchantName === merchantName ? { ...r, expenseKind: category, subCategory } : r))
        : prev,
    );
    setUnclassified((prev) =>
      prev ? prev.filter((g) => g.merchantName !== merchantName) : prev,
    );
  }, []);

  const restoreMerchantLocally = useCallback((group: UnclassifiedGroup) => {
    setCardRows((prev) =>
      prev
        ? prev.map((r) => (r.merchantName === group.merchantName ? { ...r, expenseKind: "", subCategory: "" } : r))
        : prev,
    );
    setUnclassified((prev) => {
      if (!prev || prev.some((g) => g.merchantName === group.merchantName)) return prev;
      return [...prev, group].sort((a, b) => b.grossTotal - a.grossTotal);
    });
  }, []);

  /** §55.8: 기존 카드 내역을 키워드·가맹점 규칙으로 일괄 재분류한 뒤 다시 읽는다. */
  const handleReclassify = useCallback(async () => {
    setReclassifying(true);
    setNotice("");
    setUndo(null);
    try {
      const result = await reclassifyCardImports();
      setNotice(
        result.updated > 0
          ? `카드내역 ${result.total}건 중 ${result.updated}건을 자동 분류했습니다.`
          : `카드내역 ${result.total}건을 확인했습니다 — 새로 분류된 항목은 없습니다.`,
      );
      loadCard();
      loadUnclassified();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "재분류에 실패했습니다.");
    } finally {
      setReclassifying(false);
    }
  }, [loadCard, loadUnclassified]);

  /** §55.10: 사용자가 행의 대분류를 고치면 같은 가맹점 행 전체 + 다음 임포트 규칙에 반영된다. */
  const handleCardCategory = useCallback(async (row: CardImportRowFull, category: string) => {
    if (!category || category === row.expenseKind) return;
    setNotice("");
    setUndo(null);
    try {
      const result = await updateCardImportCategory(row.rowKey, category, "");
      applyMerchantCategoryLocally(result.merchantName, result.category, result.subCategory);
      setNotice(`${result.merchantName} → ${result.category} (${result.updatedRows}건 반영)`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "카테고리 변경에 실패했습니다.");
    }
  }, [applyMerchantCategoryLocally]);

  /** §55.10: 사용자가 행의 세부 분류를 고친다. */
  const handleCardSubCategory = useCallback(async (row: CardImportRowFull, subCategory: string) => {
    if (subCategory === row.subCategory) return;
    setNotice("");
    setUndo(null);
    try {
      const result = await updateCardImportCategory(row.rowKey, row.expenseKind || "", subCategory);
      applyMerchantCategoryLocally(result.merchantName, result.category, result.subCategory);
      setNotice(`${result.merchantName} → ${result.category}/${result.subCategory} (${result.updatedRows}건 반영)`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "세부 분류 변경에 실패했습니다.");
    }
  }, [applyMerchantCategoryLocally]);

  /** §55.10 작업함: 가맹점 하나를 한 번에 분류한다 — 목록 재조회 없이 그 묶음만 사라진다. */
  const handleAssignMerchant = useCallback(async (group: UnclassifiedGroup, category: string) => {
    if (!category) return;
    setNotice("");
    try {
      const result = await assignMerchantCategory(group.merchantName, category, "");
      applyMerchantCategoryLocally(group.merchantName, category, "");
      setUndo({ group, category });
      setNotice(`${result.merchantName} → ${result.category} (${result.updatedRows}건 반영)`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "카테고리 지정에 실패했습니다.");
    }
  }, [applyMerchantCategoryLocally]);

  /** 잘못 지정했을 때: 그 가맹점을 미분류로 되돌리고 규칙도 지운다. */
  const handleUndo = useCallback(async () => {
    if (!undo) return;
    try {
      await assignMerchantCategory(undo.group.merchantName, "", "");
      restoreMerchantLocally(undo.group);
      setNotice(`${undo.group.merchantName} 분류를 되돌렸습니다.`);
      setUndo(null);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "되돌리기에 실패했습니다.");
    }
  }, [undo, restoreMerchantLocally]);

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
      const values = prefill ?? { label: "", amount: null, purchaseVat: null, isEssential: false, startMonth: month, endMonth: null };
      recFormInstance.setFieldsValue(values);
    }
  }, [recForm, recFormInstance, month]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
    }
    void loadItems();
    void loadCard();
    void loadUnclassified();
    void loadSnapshot();
    void loadRecurring();
  }, [loadItems, loadCard, loadUnclassified, loadSnapshot, loadRecurring]);

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

  /** §55.10: 이 달 카드 사용금을 대분류·세부로 합산 — "어디에 썼나"를 바로 보여 준다. */
  const cardSubTotals = useMemo(() => {
    const map = new Map<string, { category: string; subCategory: string; count: number; gross: number }>();
    for (const r of cardRows ?? []) {
      const category = r.expenseKind?.trim() || "미분류";
      const subCategory = isUnclassified(category) ? "" : (r.subCategory?.trim() || "미지정");
      const key = `${category}|${subCategory}`;
      const row = map.get(key) ?? { category, subCategory, count: 0, gross: 0 };
      row.count += 1;
      row.gross += r.grossAmount;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.gross - a.gross);
  }, [cardRows]);

  /** §55.10: 지출 합계(자산 이동 제외), 고정비, 변동비. */
  const cardSpendingTotal = useMemo(
    () => (cardRows ?? []).filter((r) => !isUnclassified(r.expenseKind) && !isAssetTransferSubCategory(r.subCategory)).reduce((acc, r) => acc + r.grossAmount, 0),
    [cardRows],
  );
  const cardFixedTotal = useMemo(
    () => (cardRows ?? []).filter((r) => isFixedSubCategory(r.subCategory)).reduce((acc, r) => acc + r.grossAmount, 0),
    [cardRows],
  );
  const cardVariableTotal = cardSpendingTotal - cardFixedTotal;
  const cardAssetTransferTotal = useMemo(
    () => (cardRows ?? []).filter((r) => isAssetTransferSubCategory(r.subCategory)).reduce((acc, r) => acc + r.grossAmount, 0),
    [cardRows],
  );
  const cardUnclassifiedTotal = useMemo(
    () => (cardRows ?? []).filter((r) => isUnclassified(r.expenseKind)).reduce((acc, r) => acc + r.grossAmount, 0),
    [cardRows],
  );

  /** §55.8 작업함: 검색어로 거른 가맹점 묶음. 정렬은 서버가 금액 큰 순으로 준 순서를 지킨다. */
  const visibleUnclassifiedGroups = useMemo(() => {
    const groups = unclassified ?? [];
    const q = unclassifiedSearch.trim().toLowerCase();
    return q ? groups.filter((g) => g.merchantName.toLowerCase().includes(q)) : groups;
  }, [unclassified, unclassifiedSearch]);

  const unclassifiedRowTotal = (unclassified ?? []).reduce((acc, g) => acc + g.count, 0);
  const unclassifiedAmountTotal = (unclassified ?? []).reduce((acc, g) => acc + g.grossTotal, 0);
  const unclassifiedCleared = Math.max(0, unclassifiedInitialCount - (unclassified?.length ?? 0));
  const unclassifiedProgress = unclassifiedInitialCount > 0
    ? Math.round((unclassifiedCleared / unclassifiedInitialCount) * 100)
    : 0;

  /** §55.8: 이 달 카드내역 중 아직 미분류인 행 (표 필터 배지에 쓴다). */
  const unclassifiedInMonth = useMemo(
    () => (cardRows ?? []).filter((r) => isUnclassified(r.expenseKind)).length,
    [cardRows],
  );

  /** §55.8: "미분류만 보기" 필터. 재조회 없이 화면에서만 거륵으므로 페이지·스크롤이 유지된다. */
  const visibleCardRows = useMemo(
    () => (unclassifiedOnly ? (cardRows ?? []).filter((r) => isUnclassified(r.expenseKind)) : cardRows ?? []),
    [cardRows, unclassifiedOnly],
  );

  const cardPageSize = 10;
  const cardPageCount = Math.max(1, Math.ceil(visibleCardRows.length / cardPageSize));
  const cardCurrentPage = Math.min(cardPage, cardPageCount);

  const unclassifiedPageCount = Math.max(1, Math.ceil(visibleUnclassifiedGroups.length / 10));
  const unclassifiedCurrentPage = Math.min(unclassifiedPage, unclassifiedPageCount);

  const itemColumns = [
    { title: "항목", dataIndex: "label" },
    { title: "구분", width: 84, render: (_: unknown, row: ExpenseItemRow) =>
      row.recurringId
        ? <span style={recurringBadgeStyle}>정기</span>
        : <Typography.Text type="secondary" style={{ fontSize: 12 }}>수동</Typography.Text> },
    {
      title: "월 금액",
      dataIndex: "amount",
      align: "right" as const,
      width: 140,
      className: "af-num",
      render: (v: number, row: ExpenseItemRow) => {
        const def = row.recurringId ? recurring?.find((d) => d.id === row.recurringId) : undefined;
        const overridden = Boolean(def && def.amount !== v);
        return (
          <div style={{ textAlign: "right" }}>
            <div>{formatKrwExact(v)}</div>
            {overridden ? (
              <Typography.Text type="secondary" style={{ fontSize: 11 }} title={`정기 정의 ${formatKrwExact(def!.amount)}`}>
                이 달만 수정
              </Typography.Text>
            ) : null}
          </div>
        );
      },
    },
    { title: "필수", dataIndex: "isEssential", width: 70, render: (v: boolean) => (v ? "필수" : "—") },
    { title: "매입세액", dataIndex: "purchaseVat", align: "right" as const, width: 120, className: "af-num", render: (v: number) => (v > 0 ? formatKrwExact(v) : "—") },
    {
      title: "작업",
      render: (_: unknown, row: ExpenseItemRow) => (
        <Space size={0}>
          <Button size="small" type="text" onClick={() => beginEdit(row)} aria-label={`${row.label} 이 달만 수정`}>이 달만 수정</Button>
          {row.recurringId ? <Button size="small" type="text" onClick={() => openRecurringEdit(row.recurringId)} aria-label={`${row.label} 정기 항목 수정`}>정기 항목 수정</Button> : null}
          {!row.recurringId ? <Button size="small" type="text" onClick={() => convertToRecurring(row)} aria-label={`${row.label} 정기 항목으로 등록`}>정기 항목으로 등록</Button> : null}
          <Popconfirm title="이 항목을 삭제할까요?" onConfirm={() => void removeItem(row.id)}>
            <Button size="small" type="text" danger aria-label={`${row.label} 삭제`}>삭제</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const cardColumns = [
    {
      title: "승인일",
      dataIndex: "approvedAt",
      width: 110,
      sorter: (a: CardImportRowFull, b: CardImportRowFull) => a.approvedAt.localeCompare(b.approvedAt),
    },
    {
      title: "가맹점",
      dataIndex: "merchantName",
      sorter: (a: CardImportRowFull, b: CardImportRowFull) => a.merchantName.localeCompare(b.merchantName),
    },
    {
      title: "업종",
      dataIndex: "businessCategory",
      width: 110,
      render: (v: string | undefined) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{v || "—"}</Typography.Text>
      ),
    },
    {
      title: "이용금액",
      dataIndex: "grossAmount",
      align: "right" as const,
      width: 110,
      className: "af-num",
      sorter: (a: CardImportRowFull, b: CardImportRowFull) => a.grossAmount - b.grossAmount,
      render: (v: number) => formatKrwExact(v),
    },
    {
      title: "대분류",
      dataIndex: "expenseKind",
      width: 140,
      render: (v: string | undefined, row: CardImportRowFull) => (
        <Select
          size="small"
          style={{ width: 130 }}
          placeholder="미분류"
          value={v || null}
          options={CATEGORY_GROUP_OPTIONS}
          onChange={(category: string) => void handleCardCategory(row, category)}
          aria-label={`${row.merchantName} 카테고리`}
        />
      ),
    },
    {
      title: "세부 분류",
      dataIndex: "subCategory",
      width: 130,
      render: (v: string | undefined, row: CardImportRowFull) => (
        <Select
          size="small"
          style={{ width: 120 }}
          placeholder="-"
          value={v || null}
          options={subCategoryOptions(row.expenseKind)}
          onChange={(subCategory: string) => void handleCardSubCategory(row, subCategory)}
          disabled={isUnclassified(row.expenseKind)}
          aria-label={`${row.merchantName} 세부 분류`}
        />
      ),
    },
    {
      title: "사업자번호",
      dataIndex: "businessNo",
      width: 130,
      className: "af-mono",
      render: (v: string | undefined, row: CardImportRowFull) => {
        const businessNo = (v ?? "").trim();
        if (!businessNo) return "—";
        return (
          <Button
            type="link"
            size="small"
            style={{ padding: 0, height: "auto" }}
            onClick={() => setBusinessInfoTarget({ businessNo, merchantName: row.merchantName })}
            aria-label={`${row.merchantName} 사업자 정보 보기`}
          >
            {formatBusinessNo(businessNo)}
          </Button>
        );
      },
    },
  ];

  /** §55.10: CSV 낼출 [날짜 | 사용처(가맹점) | 금액 | 카테고리 | 세부 분류]. */
  const downloadCsv = useCallback(() => {
    const rows = visibleCardRows;
    const header = "날짜,사용처(가맹점),금액,카테고리,세부 분류";
    const lines = rows.map((r) => {
      const category = r.expenseKind?.trim() || "미분류";
      const sub = isUnclassified(category) ? "" : (r.subCategory?.trim() || "");
      return [r.approvedAt, `"${r.merchantName.replace(/"/g, '""')}"`, String(r.grossAmount), `"${category}"`, `"${sub}"`].join(",");
    });
    const blob = new Blob([["\uFEFF", header, ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `card-expenses-${month}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [visibleCardRows, month]);

  return (
    <AppLayout
      onLogout={handleLogout}
      nav={<StandardNav current="expenses" onOpenDashboard={onOpenDashboard} onOpenAssets={onOpenAssets} onOpenSettings={onOpenSettings} />}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <Typography.Title level={1} id="h-expenses" style={{ fontSize: 24, margin: 0 }}>지출</Typography.Title>
        <Select
          aria-label="조회 월"
          value={month}
          options={months.map((m) => ({ value: m, label: m }))}
          onChange={(v: string) => { setMonth(v); setCardLimit(20); setCardPage(1); }}
          style={{ width: 130 }}
        />
      </div>

      {/* 이슈 #70: 변경 알림을 role=status + aria-live=polite 로 — 스크린리더가
          화면 전환 없이도 안내를 읽는다. (notice 는 주로 실패·중복 안내다)
          §55.8: 작업함에서 방금 지정한 분류는 여기서 바로 되돌릴 수 있다. */}
      {notice || undo ? (
        <Card style={{ marginBottom: 16 }} role="status" aria-live="polite">
          <Space wrap size={12}>
            {notice ? <Typography.Text type="warning">{notice}</Typography.Text> : null}
            {undo ? (
              <>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {undo.group.merchantName} → {undo.category}
                </Typography.Text>
                <Button size="small" onClick={() => void handleUndo()}>되돌리기</Button>
              </>
            ) : null}
          </Space>
        </Card>
      ) : null}

      <section aria-labelledby="h-items" style={{ marginBottom: 32 }}>
        <Typography.Title level={2} id="h-items" style={{ fontSize: 16, margin: 0, marginBottom: 16 }}>월 지출 항목</Typography.Title>
        <Card>
          {prevCount !== null && prevCount > 0 && itemStatus === "empty" ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "var(--af-secondary)", border: "1px dashed var(--af-border)", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
              <span style={{ fontSize: 13 }}>이 월은 항목이 비어 있어요 — 지난달({prevMonth()}) 항목 <b>{prevCount}건</b>을 가져올까요?</span>
              <Button size="small" type="primary" onClick={() => void copyPrev()}>지난달 항목 가져오기</Button>
            </div>
          ) : null}
          <StateBlock status={itemStatus} onRetry={loadItems} errorText={itemError} emptyText="항목이 없습니다 — 아래 양식에서 추가하세요">
            {items ? (
              wide ? (
              <Table
                aria-label="월 지출 항목"
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
                    <MobileListCardItem key={it.id}>
                      <MobileListCardHeader
                        title={
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                            <span>{it.label}</span>
                            {it.isEssential ? (
                              <span style={essentialBadgeStyle}>필수</span>
                            ) : null}
                            <span style={recurringBadgeStyle}>{it.recurringId ? "정기" : "수동"}</span>
                          </span>
                        }
                        value={formatKrwExact(it.amount)}
                      />
                      <MobileListCardMeta>
                        매입세액 {it.purchaseVat > 0 ? formatKrwExact(it.purchaseVat) : "—"}
                        {it.recurringId && recurring
                          ? (() => {
                              const def = recurring.find((d) => d.id === it.recurringId);
                              return def && def.amount !== it.amount ? " · 이 달만 수정" : "";
                            })()
                          : ""}
                      </MobileListCardMeta>
                      <MobileListCardActions>
                        <Button size="small" type="text" onClick={() => beginEdit(it)} aria-label={`${it.label} 이 달만 수정`}>이 달만 수정</Button>
                        {it.recurringId ? <Button size="small" type="text" onClick={() => openRecurringEdit(it.recurringId)} aria-label={`${it.label} 정기 항목 수정`}>정기 항목 수정</Button> : <Button size="small" type="text" onClick={() => convertToRecurring(it)} aria-label={`${it.label} 정기 항목으로 등록`}>정기 항목으로 등록</Button>}
                        <Popconfirm title="이 항목을 삭제할까요?" onConfirm={() => void removeItem(it.id)}>
                          <Button size="small" type="text" danger aria-label={`${it.label} 삭제`}>삭제</Button>
                        </Popconfirm>
                      </MobileListCardActions>
                    </MobileListCardItem>
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
            <Form form={form} layout="inline" style={{ display: "flex", flexWrap: "wrap", gap: wide ? "10px 12px" : "12px" }}>
              <Form.Item name="label" rules={[{ required: true, message: "항목명을 입력하세요" }]}
                style={wide ? {} : { flex: "1 1 100%", minWidth: 0 }}
              >
                <Input placeholder={editing ? "항목명(편집 중)" : "항목명"} style={{ width: wide ? 160 : "100%" }}
                  aria-label="항목 이름" />
              </Form.Item>
              <Form.Item name="amount" rules={[{ required: true, message: "월 금액을 입력하세요" }]}
                style={wide ? {} : { flex: "1 1 100%", minWidth: 0 }}
              >
                <InputNumber placeholder="월 금액" min={0} style={{ width: wide ? 140 : "100%" }} aria-label="월 금액" />
              </Form.Item>
              <Form.Item name="purchaseVat" style={wide ? {} : { flex: "1 1 100%", minWidth: 0 }}>
                <InputNumber placeholder="매입세액" min={0} style={{ width: wide ? 120 : "100%" }} aria-label="매입세액" />
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
        <Typography.Title level={2} id="h-recurring" style={{ fontSize: 16, margin: 0, marginBottom: 16 }}>정기 항목 (고정지출)</Typography.Title>
        <Card>
          {recurring === null ? (
            <Typography.Text type="secondary">정기 항목을 불러올 수 없습니다</Typography.Text>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {recurring.map((r) => (
                  /*
                    이슈 #70: span onClick 대신 실제 button — 키보드 포커스·Enter/Space
                    동작이 브라우저가 책임진다. ✕(중지) 버튼은 중첩 버튼(잘못된 HTML)을
                    피하기 위해 형제로 분리했다.
                  */
                  <div
                    key={r.id}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--af-secondary)", border: "1px solid var(--af-border)", borderRadius: 20, padding: "5px 6px 5px 12px", fontSize: 12.5 }}
                  >
                    <button
                      type="button"
                      onClick={() => setRecForm(r)}
                      aria-label={`${r.label} 정기 항목 편집`}
                      style={{ background: "none", border: "none", padding: 0, margin: 0, font: "inherit", display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer", color: "inherit", textAlign: "left" }}
                    >
                      <span><b>{r.label}</b> {formatKrwExact(r.amount)}{r.isEssential ? " · 필수" : ""} · {r.endMonth ? <span className="af-mono">~{r.endMonth}</span> : "무기한"}</span>
                    </button>
                    <Popconfirm title="정기 항목을 중지할까요? (이미 만들어진 월 표 행은 유지됩니다)" onConfirm={() => void removeRecurring(r.id)}>
                      <Button type="text" size="small" aria-label={`${r.label} 정기 중지`}>✕</Button>
                    </Popconfirm>
                  </div>
                ))}
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
                    <Form.Item name="purchaseVat" style={wide ? {} : { flex: "1 1 100%", minWidth: 0 }}>
                      <InputNumber placeholder="매입세액" min={0} style={{ width: wide ? 110 : "100%" }} aria-label="정기 매입세액" />
                    </Form.Item>
                    <Form.Item name="isEssential" valuePropName="checked">
                      <Checkbox>필수</Checkbox>
                    </Form.Item>
                    <Form.Item name="startMonth" rules={[{ required: true, message: "시작월을 선택하세요" }]} style={wide ? {} : { flex: "1 1 100%", minWidth: 0 }}>
                      <Select placeholder="시작월" options={months.map((m) => ({ value: m, label: m }))} style={{ width: wide ? 120 : "100%" }} aria-label="시작월" />
                    </Form.Item>
                    <Form.Item name="endMonth" style={wide ? {} : { flex: "1 1 100%", minWidth: 0 }}>
                      <Select placeholder="종료월" allowClear options={months.map((m) => ({ value: m, label: m }))} style={{ width: wide ? 120 : "100%" }} aria-label="종료월" />
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
              <Typography.Text type="secondary">아직 이 월은 확정되지 않았습니다 — 수입 입력 후 '월 확정'을 누륶면 스냅샷이 갱신됩니다</Typography.Text>
            )}
          </Space>
        </Card>
      </section>

      <section aria-labelledby="h-unclassified" style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <Typography.Title level={2} id="h-unclassified" style={{ fontSize: 16, margin: 0 }}>미분류 정리</Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            가맹점 하나를 고륵면 같은 가맹점 내역 전체에 한 번에 적용됩니다
          </Typography.Text>
        </div>
        <Card>
          {unclassifiedError ? (
            <Space direction="vertical" size={8}>
              <Typography.Text type="danger">{unclassifiedError}</Typography.Text>
              <Button size="small" onClick={loadUnclassified}>다시 시도</Button>
            </Space>
          ) : unclassified === null ? (
            <Typography.Text type="secondary">미분류 내역을 불러오는 중…</Typography.Text>
          ) : unclassified.length === 0 ? (
            <Typography.Text type="success">
              {unclassifiedInitialCount > 0
                ? `미분류 ${unclassifiedInitialCount}개 가맹점을 모두 정리했습니다.`
                : "미분류 카드내역이 없습니다 — 모든 내역이 분류되어 있습니다."}
            </Typography.Text>
          ) : (
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              <div>
                <Progress
                  percent={unclassifiedProgress}
                  format={() => `${unclassifiedCleared}/${unclassifiedInitialCount}`}
                  style={{ marginBottom: 4 }}
                />
                <Space wrap size={12}>
                  <Typography.Text strong>남은 가맹점 {unclassified.length}개</Typography.Text>
                  <Typography.Text type="secondary">{unclassifiedRowTotal}건</Typography.Text>
                  <Typography.Text type="secondary">{formatKrwExact(unclassifiedAmountTotal)}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>금액 큰 순</Typography.Text>
                </Space>
              </div>
              <Input.Search
                allowClear
                placeholder="가맹점 이름으로 찾기"
                aria-label="미분류 가맹점 검색"
                value={unclassifiedSearch}
                onChange={(e) => { setUnclassifiedSearch(e.target.value); setUnclassifiedPage(1); }}
                style={{ maxWidth: 320 }}
              />
              <Table
                aria-label="미분류 가맹점"
                size="small"
                rowKey="merchantName"
                dataSource={visibleUnclassifiedGroups}
                pagination={{
                  pageSize: 10,
                  current: unclassifiedCurrentPage,
                  onChange: (p) => setUnclassifiedPage(p),
                  showSizeChanger: false,
                  showTotal: (total) => `${total}개 가맹점`,
                }}
                columns={[
                  { title: "가맹점", dataIndex: "merchantName" },
                  {
                    title: "업종",
                    dataIndex: "businessCategory",
                    width: 130,
                    render: (v: string | undefined) => (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{v || "—"}</Typography.Text>
                    ),
                  },
                  {
                    title: "사업자번호",
                    dataIndex: "businessNo",
                    width: 130,
                    className: "af-mono",
                    render: (v: string | undefined, g: UnclassifiedGroup) => {
                      const numbers = (v ?? "")
                        .split(",")
                        .map((n) => n.trim())
                        .filter((n) => n.length > 0);
                      if (numbers.length === 0) return "—";
                      return (
                        <Space size={4} wrap>
                          {numbers.map((businessNo) => (
                            <Button
                              key={businessNo}
                              type="link"
                              size="small"
                              style={{ padding: 0, height: "auto" }}
                              onClick={() => setBusinessInfoTarget({ businessNo, merchantName: g.merchantName })}
                              aria-label={`${g.merchantName} ${businessNo} 사업자 정보 보기`}
                            >
                              {formatBusinessNo(businessNo)}
                            </Button>
                          ))}
                        </Space>
                      );
                    },
                  },
                  { title: "건수", dataIndex: "count", width: 70, align: "right" as const, render: (v: number) => `${v}건` },
                  {
                    title: "합계",
                    dataIndex: "grossTotal",
                    width: 130,
                    align: "right" as const,
                    className: "af-num",
                    render: (v: number) => formatKrwExact(v),
                  },
                  { title: "최근 승인", dataIndex: "lastApprovedAt", width: 100, className: "af-mono" },
                  {
                    title: "대분류 지정",
                    width: 150,
                    render: (_: unknown, g: UnclassifiedGroup) => (
                      <Select
                        size="small"
                        style={{ width: 140 }}
                        placeholder="선택"
                        value={null}
                        options={CATEGORY_GROUP_OPTIONS}
                        onChange={(category: string) => void handleAssignMerchant(g, category)}
                        aria-label={`${g.merchantName} 카테고리 지정`}
                      />
                    ),
                  },
                ]}
              />
            </Space>
          )}
        </Card>
      </section>

      <section aria-labelledby="h-card-imports" style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <Typography.Title level={2} id="h-card-imports" style={{ fontSize: 16, margin: 0 }}>가져온 카드내역</Typography.Title>
          <Space>
            <Button size="small" onClick={downloadCsv}>CSV 다운로드</Button>
            <Button
              size="small"
              loading={reclassifying}
              onClick={() => void handleReclassify()}
              title="저장된 카드 내역을 가맹점 규칙·키워드로 다시 분류합니다"
            >
              카테고리 자동 분류
            </Button>
          </Space>
        </div>
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <Checkbox
              checked={unclassifiedOnly}
              onChange={(e) => { setUnclassifiedOnly(e.target.checked); setCardPage(1); }}
            >
              미분류만 보기{unclassifiedInMonth > 0 ? ` (${unclassifiedInMonth}건)` : ""}
            </Checkbox>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              카테고리를 바꿔도 목록을 다시 불러오지 않습니다 — 페이지와 스크롤이 그대로 유지됩니다
            </Typography.Text>
          </div>
          {cardStatus === "ready" && cardSubTotals.length > 0 ? (
            <div style={{ marginBottom: 20 }} aria-label="이 달 카드 카테고리별 합계">
              <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>카테고리별 합계</Typography.Text>
              <Table
                size="small"
                rowKey={(r: { category: string; subCategory: string }) => `${r.category}|${r.subCategory}`}
                pagination={false}
                dataSource={cardSubTotals}
                columns={[
                  { title: "대분류", dataIndex: "category" },
                  { title: "세부 분류", dataIndex: "subCategory" },
                  { title: "건수", dataIndex: "count", width: 70, align: "right" as const },
                  { title: "이용금액", dataIndex: "gross", width: 130, align: "right" as const, render: (v: number) => formatKrwExact(v) },
                ]}
                summary={() => (
                  <Table.Summary>
                    <Table.Summary.Row style={{ fontWeight: 600 }}>
                      <Table.Summary.Cell index={0} colSpan={2}>지출 합계 (자산 이동 제외)</Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right">{(cardRows ?? []).filter((r) => !isUnclassified(r.expenseKind) && !isAssetTransferSubCategory(r.subCategory)).length}건</Table.Summary.Cell>
                      <Table.Summary.Cell index={3} align="right">{formatKrwExact(cardSpendingTotal)}</Table.Summary.Cell>
                    </Table.Summary.Row>
                    {cardFixedTotal > 0 ? (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={2}>└ 고정비</Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right" />
                        <Table.Summary.Cell index={3} align="right">{formatKrwExact(cardFixedTotal)}</Table.Summary.Cell>
                      </Table.Summary.Row>
                    ) : null}
                    {cardVariableTotal > 0 ? (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={2}>└ 변동비</Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right" />
                        <Table.Summary.Cell index={3} align="right">{formatKrwExact(cardVariableTotal)}</Table.Summary.Cell>
                      </Table.Summary.Row>
                    ) : null}
                    {cardAssetTransferTotal > 0 ? (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={2}>자산 이동 (지출 총합 제외)</Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right" />
                        <Table.Summary.Cell index={3} align="right">{formatKrwExact(cardAssetTransferTotal)}</Table.Summary.Cell>
                      </Table.Summary.Row>
                    ) : null}
                    {cardUnclassifiedTotal > 0 ? (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={2}>미분류</Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right" />
                        <Table.Summary.Cell index={3} align="right">{formatKrwExact(cardUnclassifiedTotal)}</Table.Summary.Cell>
                      </Table.Summary.Row>
                    ) : null}
                  </Table.Summary>
                )}
              />
            </div>
          ) : null}
          <StateBlock status={cardStatus} onRetry={loadCard} errorText={cardError} emptyText="이 월에 반영된 카드 내역이 없습니다">
            {cardRows ? (
              wide ? (
              <Table
                aria-label="가져온 카드내역"
                size="small"
                rowKey="rowKey"
                dataSource={visibleCardRows}
                pagination={{
                  pageSize: cardPageSize,
                  current: cardCurrentPage,
                  onChange: (p) => setCardPage(p),
                  showSizeChanger: false,
                }}
                columns={cardColumns}
                locale={{ emptyText: unclassifiedOnly ? "이 달 미분류 내역이 없습니다" : "내역이 없습니다" }}
                summary={() => (
                  <Table.Summary fixed>
                    <Table.Summary.Row style={{ fontWeight: 600 }}>
                      <Table.Summary.Cell index={0} colSpan={2}>합계 ({visibleCardRows.length}건)</Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right" />
                      <Table.Summary.Cell index={3} align="right">
                        {formatKrwExact(visibleCardRows.reduce((acc, r) => acc + r.grossAmount, 0))}
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={4} />
                      <Table.Summary.Cell index={5} />
                      <Table.Summary.Cell index={6} />
                    </Table.Summary.Row>
                  </Table.Summary>
                )}
              />
              ) : (
                <div>
                  {visibleCardRows.slice(0, cardLimit).map((r) => (
                    <MobileListCardItem key={r.rowKey}>
                      <MobileListCardHeader title={r.merchantName} value={formatKrwExact(r.grossAmount)} />
                      <MobileListCardMeta>
                        <span className="af-mono">{r.approvedAt}</span>{r.businessCategory?.trim() ? ` · ${r.businessCategory.trim()}` : ""} · {(r.expenseKind?.trim() || "미분류")}{r.subCategory?.trim() ? `/${r.subCategory.trim()}` : ""}
                      </MobileListCardMeta>
                    </MobileListCardItem>
                  ))}
                  {visibleCardRows.length > cardLimit ? (
                    <Button block type="text" onClick={() => setCardLimit((n) => n + 30)}>
                      나머지 {visibleCardRows.length - cardLimit}건 더 보기
                    </Button>
                  ) : null}
                  <div style={{ fontWeight: 600, padding: "4px 2px" }}>
                    <span>합계 ({visibleCardRows.length}건)</span>
                    <span> {formatKrwExact(visibleCardRows.reduce((acc, r) => acc + r.grossAmount, 0))}</span>
                  </div>
                </div>
              )
            ) : null}
          </StateBlock>
        </Card>
      </section>

      <BusinessInfoModal
        open={businessInfoTarget !== null}
        businessNo={businessInfoTarget?.businessNo ?? null}
        merchantName={businessInfoTarget?.merchantName}
        onClose={() => setBusinessInfoTarget(null)}
      />
    </AppLayout>
  );
}
