import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Button, Card, Checkbox, Input, Progress, Select, Space, Tag, Typography } from "antd";
import { AppLayout } from "../layout/AppLayout";
import { StandardNav } from "../layout/StandardNav";
import { SubNav } from "../components/SubNav";
import { CardEmailImportSettingsSection } from "../components/CardEmailImportSettingsSection";
import { MonthSelect } from "../components/MonthSelect";
import { StateBlock, type SurfaceStatus } from "../components/StateBlock";
import { AfListTable, type AfListColumn } from "../components/AfListTable";
import { clearInflight } from "../api/client";
import { clearToken } from "../auth/authStore";
import {
  assignMerchantCategory,
  listCardStatements,
  listUnclassifiedGroups,
  reclassifyCardImports,
  updateCardImportCategory,
  type CardStatement,
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
import { listCardImports, type CardImportRowFull } from "../api/expensesApi";
import { CardImportPanel } from "../components/CardImportPanel";
import { formatKrwExact } from "../utils/formatters";

/** YYYY-MM 에서 back 개월 전 월. (예: 2026-10, 2 → 2026-08) */
function monthsAgo(month: string, back: number): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const date = new Date(year, m - 1 - back, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

interface CardExpensesPageProps {
  /** App 이 소유하는 조회 월 — 지출 탭과 공유한다. */
  month: string;
  onMonthChange: (month: string) => void;
  onOpenDashboard: () => void;
  onOpenAssets: () => void;
  /** 지출 하위 화면의 첫 탭으로 이동한다. */
  onOpenExpenses: () => void;
  onOpenSettings: () => void;
}

/** §72.1 카드사별 승인일 합계 + 이 달/최근 명세서 비교 행. */
interface CardCompanyRow {
  company: string;
  count: number;
  gross: number;
  statement?: CardStatement;
  recentStatement?: CardStatement;
}

/**
 * §58 — 지출 화면에서 분리한 카드내역 탭.
 * - 카드 원장 소비(§41), 미분류 정리(§55.8), 자동 분류(§55.8), CSV 내보내기(§55.10).
 * - 업로드(§29.7)도 이 탭으로 모았다 — 가져오기와 분류가 한 화면에서 이어진다.
 * - 합계는 행에서 재계산하고 저장하지 않는다(§34.6).
 */
export function CardExpensesPage({
  month,
  onMonthChange,
  onOpenDashboard,
  onOpenAssets,
  onOpenExpenses,
  onOpenSettings,
}: CardExpensesPageProps) {
  const [cardRows, setCardRows] = useState<CardImportRowFull[] | null>(null);
  const [cardStatus, setCardStatus] = useState<SurfaceStatus>("loading");
  const [cardError, setCardError] = useState("");
  const [notice, setNotice] = useState("");
  const [cardLimit, setCardLimit] = useState(20);
  const [reclassifying, setReclassifying] = useState(false);
  const [unclassified, setUnclassified] = useState<UnclassifiedGroup[] | null>(null);
  const [unclassifiedError, setUnclassifiedError] = useState("");
  const [unclassifiedSearch, setUnclassifiedSearch] = useState("");
  const [unclassifiedLimit, setUnclassifiedLimit] = useState(10);
  const [unclassifiedInitialCount, setUnclassifiedInitialCount] = useState(0);
  const [undo, setUndo] = useState<{ group: UnclassifiedGroup; category: string } | null>(null);
  const [unclassifiedOnly, setUnclassifiedOnly] = useState(false);
  /** 사업자번호 클릭 → 사업자 정보 모달 (화면 이동 없음). */
  const [businessInfoTarget, setBusinessInfoTarget] = useState<{ businessNo: string; merchantName: string } | null>(null);
  /** 미분류 작업함: 분류 편집 행(가맹점명) — Select 는 이 행 안에만 둔다. */
  const [editingMerchant, setEditingMerchant] = useState<string | null>(null);
  /** 가져온 카드내역: 분류 편집 행(rowKey). */
  const [editingCardRowKey, setEditingCardRowKey] = useState<string | null>(null);

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

  // §72 명세서가 있으면 승인일 기준 합계와 함께 명세서 금액을 보여 준다.
  // 선택한 달에 명세서가 없을 때를 대비해 최근 3개월치를 함께 읽는다.
  const [statements, setStatements] = useState<CardStatement[]>([]);
  useEffect(() => {
    let cancelled = false;
    const from = monthsAgo(month, 2);
    listCardStatements(from, month)
      .then((rows) => {
        if (!cancelled) setStatements(rows);
      })
      .catch(() => {
        if (!cancelled) setStatements([]);
      });
    return () => {
      cancelled = true;
    };
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

  useEffect(() => {
    void loadCard();
    void loadUnclassified();
  }, [loadCard, loadUnclassified]);

  /** 서버가 이미 같은 가맹점 행 전체를 바꿨으므로, 화면도 재조회 없이 그 자리에서 맞춘다. */
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
      const repaired = result.rulesRepaired ?? 0;
      const suffix = repaired > 0 ? ` (가맹점 규칙 ${repaired}건 복구)` : "";
      setNotice(
        result.updated > 0
          ? `카드내역 ${result.total}건 중 ${result.updated}건을 자동 분류했습니다.${suffix}`
          : `카드내역 ${result.total}건을 확인했습니다 — 새로 분류된 항목은 없습니다.${suffix}`,
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

  const handleMonthChange = (next: string) => {
    onMonthChange(next);
    setCardLimit(20);
    setUnclassifiedLimit(10);
  };

  const handleLogout = () => {
    clearToken();
    onOpenDashboard();
  };

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
  const cardSpendingCount = useMemo(
    () => (cardRows ?? []).filter((r) => !isUnclassified(r.expenseKind) && !isAssetTransferSubCategory(r.subCategory)).length,
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

  /** §55.8: "미분류만 보기" 필터. 재조회 없이 화면에서만 거르므로 페이지·스크롤이 유지된다. */
  const visibleCardRows = useMemo(
    () => (unclassifiedOnly ? (cardRows ?? []).filter((r) => isUnclassified(r.expenseKind)) : cardRows ?? []),
    [cardRows, unclassifiedOnly],
  );

  const monthStatements = useMemo(
    () => statements.filter((s) => s.usageMonth === month),
    [statements, month],
  );
  const latestStatementByCompany = useMemo(() => {
    const map = new Map<string, CardStatement>();
    for (const s of statements) {
      if (s.kind !== "billing") continue;
      const company = s.cardCompany || "미확인";
      const current = map.get(company);
      if (!current || s.periodEnd > current.periodEnd) {
        map.set(company, s);
      }
    }
    return map;
  }, [statements]);

  /** §72.1 카드사별 승인일 합계 + 명세서 금액 비교. 승인일 합계는 카드 목록에서 직접 계산한다. */
  const cardCompanySummary = useMemo(() => {
    const map = new Map<string, CardCompanyRow>();
    for (const r of cardRows ?? []) {
      const company = r.cardCompany || "미확인";
      const row = map.get(company) ?? { company, count: 0, gross: 0 };
      row.count += 1;
      row.gross += r.grossAmount;
      map.set(company, row);
    }
    for (const s of monthStatements) {
      if (s.kind !== "billing") continue;
      const company = s.cardCompany || "미확인";
      const row = map.get(company) ?? { company, count: 0, gross: 0 };
      row.statement = s;
      map.set(company, row);
    }
    for (const [company, recent] of latestStatementByCompany) {
      const row = map.get(company);
      if (row && !row.statement) {
        row.recentStatement = recent;
      }
    }
    return [...map.values()].sort((a, b) => b.gross - a.gross || a.company.localeCompare(b.company));
  }, [cardRows, monthStatements, latestStatementByCompany]);

  const lastApprovedByCompany = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of cardRows ?? []) {
      const company = r.cardCompany || "미확인";
      const current = map.get(company) ?? "";
      if (r.approvedAt > current) {
        map.set(company, r.approvedAt);
      }
    }
    return map;
  }, [cardRows]);

  const MUTED_STYLE: CSSProperties = { color: "var(--af-muted-foreground)", fontSize: 12 };

  /** §72.1 카드사별 표 — 승인일 합계 아래에 건수·최근 승인일을 붙인다. */
  const companyColumns: AfListColumn<CardCompanyRow>[] = [
    { key: "company", header: "카드사", mobile: "primary", render: (row) => row.company },
    {
      key: "gross",
      header: "승인일 기준",
      numeric: true,
      mobile: "value",
      render: (row) => (
        <>
          {formatKrwExact(row.gross)}
          <div style={MUTED_STYLE}>
            {row.count}건 · 최근 {lastApprovedByCompany.get(row.company) || "-"}
          </div>
        </>
      ),
    },
    {
      key: "statement",
      header: "명세서 금액",
      numeric: true,
      mobile: "meta",
      /* 한 줄만 쓴다 — 금액 + <br/> + 기간으로 3줄이 되면 행이 76px 까지 커진다(F3). */
      render: (row) => (
        <>
          {row.statement ? formatKrwExact(row.statement.totalAmount) : "-"}
          {!row.statement && row.recentStatement ? (
            <div style={MUTED_STYLE}>최근 수집 {formatKrwExact(row.recentStatement.totalAmount)}</div>
          ) : null}
        </>
      ),
    },
    {
      key: "period",
      header: "명세서 이용기간",
      mobile: "meta",
      render: (row) => {
        if (row.statement) return `${row.statement.periodStart} ~ ${row.statement.periodEnd}`;
        // 이 달 명세서가 없으면 최근 수집 명세서의 기간을 참고용으로 보여 준다.
        if (row.recentStatement) return `최근 ${row.recentStatement.periodStart} ~ ${row.recentStatement.periodEnd}`;
        return "-";
      },
    },
    {
      key: "diff",
      header: "차이 (명세서−승인일)",
      numeric: true,
      mobile: "meta",
      render: (row) => (row.statement ? formatKrwExact(row.statement.totalAmount - row.gross) : "-"),
    },
  ];

  /** §55.8 미분류 작업함 — 가맹점 단위 묶음. */
  const unclassifiedColumns: AfListColumn<UnclassifiedGroup>[] = [
    { key: "merchant", header: "가맹점", mobile: "primary", render: (g) => g.merchantName },
    { key: "gross", header: "금액", numeric: true, mobile: "value", render: (g) => formatKrwExact(g.grossTotal) },
    { key: "category", header: "업종", mobile: "meta", render: (g) => g.businessCategory?.trim() || "업종 미확인" },
    { key: "count", header: "건수·최근", mobile: "meta", render: (g) => `${g.count}건 · 최근 ${g.lastApprovedAt}` },
  ];

  /** §55.10 카테고리별 합계 — 대분류·세부 묶음. */
  const categoryTotalColumns: AfListColumn<(typeof cardSubTotals)[number]>[] = [
    { key: "category", header: "카테고리", mobile: "primary", render: (r) => r.category },
    { key: "gross", header: "금액", numeric: true, mobile: "value", render: (r) => formatKrwExact(r.gross) },
    {
      key: "count",
      header: "세부·건수",
      mobile: "meta",
      render: (r) => `${r.subCategory ? `${r.subCategory} · ` : ""}${r.count}건`,
    },
  ];

  /**
   * 가져온 카드내역은 같은 가맹점 행이 여러 개다 — 행 탭 접근 이름이 겹치면
   * 스크린리더·테스트가 어느 행인지 고를 수 없다. 반복 가맹점만 승인일을 붙인다.
   */
  const merchantRowCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of visibleCardRows) map.set(r.merchantName, (map.get(r.merchantName) ?? 0) + 1);
    return map;
  }, [visibleCardRows]);

  /** §55.10 가져온 카드내역 상세 — 행 탭에서 분류를 고친다(D7: Select 상시 노출 제거). */
  const cardRowColumns: AfListColumn<CardImportRowFull>[] = [
    { key: "merchant", header: "가맹점", mobile: "primary", render: (r) => r.merchantName },
    { key: "gross", header: "금액", numeric: true, mobile: "value", render: (r) => formatKrwExact(r.grossAmount) },
    { key: "approvedAt", header: "승인일", mobile: "meta", render: (r) => <span className="af-mono">{r.approvedAt}</span> },
    { key: "businessCategory", header: "업종", mobile: "meta", render: (r) => r.businessCategory?.trim() || "—" },
    { key: "card", header: "카드", mobile: "meta", render: (r) => r.cardMasked || "—" },
  ];

  /** §55.10: CSV 내보내기 [날짜 | 사용처(가맹점) | 금액 | 카테고리 | 세부 분류]. */
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
      nav={<StandardNav current="expenses" onOpenDashboard={onOpenDashboard} onOpenAssets={onOpenAssets} onOpenExpenses={onOpenExpenses} onOpenSettings={onOpenSettings} />}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <Typography.Title level={1} id="h-expense-cards" style={{ fontSize: 24, margin: 0 }}>카드내역</Typography.Title>
        <MonthSelect value={month} onChange={handleMonthChange} />
      </div>

      <SubNav
        ariaLabel="지출 하위 화면"
        current="cards"
        items={[
          { key: "expenses", label: "지출", ariaLabel: "지출 탭", onClick: onOpenExpenses },
          { key: "cards", label: "카드내역", ariaLabel: "카드내역 탭" },
        ]}
      />

      {/* §72.1: 카드사별 승인일 합계와 명세서 금액을 한 표에서 비교한다. */}
      <section aria-labelledby="h-card-companies" style={{ marginBottom: 32 }}>
        <Typography.Title level={2} id="h-card-companies" style={{ fontSize: 16, margin: 0, marginBottom: 16 }}>
          카드사별 사용금액
        </Typography.Title>
        <Card>
          {cardCompanySummary.length === 0 ? (
            <Typography.Text type="secondary">이 달 카드 사용 내역이 없습니다.</Typography.Text>
          ) : (
            <AfListTable
              /* caption 문구 그대로 — 표의 접근 이름이다. */
              ariaLabel={`${month} 카드사별 승인일 기준 합계와 명세서 금액 비교`}
              rows={cardCompanySummary}
              rowKey={(row) => row.company}
              columns={companyColumns}
              /* 모바일에서는 명세서 금액·차이가 meta 로 clip 된다 — 2행이 비교를 보여 준다.
               * "최근 수집" 이 아니라 "최근" 을 쓴다: 금액 셀의 문구와 겹치지 않게(테스트 :120). */
              rowSubtitle={(row) =>
                row.statement
                  ? `명세서 ${formatKrwExact(row.statement.totalAmount)} · 차이 ${formatKrwExact(row.statement.totalAmount - row.gross)}`
                  : row.recentStatement
                    ? `명세서 없음 · 최근 ${formatKrwExact(row.recentStatement.totalAmount)}`
                    : "명세서 없음"
              }
            />
          )}
          <Typography.Text type="secondary" style={{ display: "block", marginTop: 4, fontSize: 12 }}>
            명세서 금액은 이용기간 시작 월이 {month}인 정기 청구서 기준입니다. 해당 월 명세서가 없으면 가장 최근에 수집한 명세서를 참고용으로 표시합니다.
          </Typography.Text>
        </Card>
      </section>

      {/* 이슈 #70: 변경 알림을 role=status + aria-live=polite 로 — 스크린리더가
          화면 전환 없이도 안내를 읽는다.
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

      <section aria-labelledby="h-card-upload" style={{ marginBottom: 32 }}>
        <Typography.Title level={2} id="h-card-upload" style={{ fontSize: 16, margin: 0, marginBottom: 16 }}>
          카드 내역 가져오기
        </Typography.Title>
        <CardImportPanel />
      </section>

      {/* §63/§68 카드 명세서 자동 수집은 카드내역 화면에 둔다 — h2 는 컴포넌트 안에 1개만. */}
      <section aria-labelledby="h-card-email-import" style={{ marginBottom: 32 }}>
        <CardEmailImportSettingsSection />
      </section>

      <section aria-labelledby="h-unclassified" style={{ marginBottom: 32 }}>
        {/* 공용 섹션 헤더 — 좁은 폭에서 제목이 글자 단위로 쪼개지지 않고,
            설명은 다음 줄로 내려간다(InvestmentsPage 와 같은 패턴). */}
        <div className="af-section-head" style={{ marginBottom: 16 }}>
          <Typography.Title level={2} id="h-unclassified" className="af-section-head__title" style={{ fontSize: 16, margin: 0 }}>미분류 정리</Typography.Title>
          <Typography.Text type="secondary" className="af-section-head__actions" style={{ fontSize: 12 }}>
            가맹점 하나를 고르면 같은 가맹점 내역 전체에 한 번에 적용됩니다
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
                  aria-label="미분류 정리 진행률"
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
                onChange={(e) => { setUnclassifiedSearch(e.target.value); setUnclassifiedLimit(10); }}
                style={{ maxWidth: 320 }}
              />
              <AfListTable
                labelledBy="h-unclassified"
                rows={visibleUnclassifiedGroups.slice(0, unclassifiedLimit)}
                rowKey={(g) => g.merchantName}
                columns={unclassifiedColumns}
                onActivate={(g) => setEditingMerchant(g.merchantName)}
                activateLabel={(g) => `${g.merchantName} 분류 편집`}
                rowSubtitle={(g) =>
                  `${g.businessCategory?.trim() || "업종 미확인"} · ${g.count}건 · 최근 ${g.lastApprovedAt}`
                }
                editingKey={editingMerchant}
                renderEditor={(g) => {
                  // 사업자번호는 1열 폭을 넘어 금액 열을 침범했다(fix 실측 8px) — 편집 행으로 옮긴다.
                  const numbers = (g.businessNo ?? "")
                    .split(",")
                    .map((n) => n.trim())
                    .filter((n) => n.length > 0);
                  return (
                    <Space wrap>
                      <Select
                        size="small"
                        style={{ width: 180, maxWidth: "100%" }}
                        placeholder="대분류 지정"
                        value={null}
                        options={CATEGORY_GROUP_OPTIONS}
                        onChange={(category: string) => {
                          setEditingMerchant(null);
                          void handleAssignMerchant(g, category);
                        }}
                        aria-label={`${g.merchantName} 카테고리 지정`}
                      />
                      {numbers.map((businessNo) => (
                        <Button
                          key={businessNo}
                          type="link"
                          size="small"
                          style={{ padding: 0, height: "auto" }}
                          onClick={() => setBusinessInfoTarget({ businessNo, merchantName: g.merchantName })}
                          aria-label={`${g.merchantName} ${formatBusinessNo(businessNo)} 사업자 정보 보기`}
                        >
                          {formatBusinessNo(businessNo)}
                        </Button>
                      ))}
                      <Button size="small" onClick={() => setEditingMerchant(null)}>취소</Button>
                    </Space>
                  );
                }}
                editorLabel={(g) => `${g.merchantName} 분류 편집`}
                onCancelEdit={() => setEditingMerchant(null)}
              />
              {visibleUnclassifiedGroups.length > unclassifiedLimit ? (
                <Button block type="text" onClick={() => setUnclassifiedLimit((n) => n + 10)}>
                  나머지 {visibleUnclassifiedGroups.length - unclassifiedLimit}개 가맹점 더 보기
                </Button>
              ) : null}
            </Space>
          )}
        </Card>
      </section>

      <section aria-labelledby="h-card-imports" style={{ marginBottom: 32 }}>
        <div className="af-section-head" style={{ marginBottom: 16 }}>
          <Typography.Title level={2} id="h-card-imports" className="af-section-head__title" style={{ fontSize: 16, margin: 0 }}>가져온 카드내역</Typography.Title>
          <Space className="af-section-head__actions">
            <Button onClick={downloadCsv}>CSV 다운로드</Button>
            <Button
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
              onChange={(e) => { setUnclassifiedOnly(e.target.checked); setUnclassifiedLimit(10); }}
            >
              미분류만 보기{unclassifiedInMonth > 0 ? ` (${unclassifiedInMonth}건)` : ""}
            </Checkbox>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              카테고리를 바꿔도 목록을 다시 불러오지 않습니다 — 페이지와 스크롤이 그대로 유지됩니다
            </Typography.Text>
          </div>
          {cardStatus === "ready" && cardSubTotals.length > 0 ? (
            <div style={{ marginBottom: 20 }}>
              <Typography.Text strong id="h-category-sums" style={{ display: "block", marginBottom: 8 }}>카테고리별 합계</Typography.Text>
              <AfListTable
                labelledBy="h-category-sums"
                rows={cardSubTotals}
                rowKey={(r) => `${r.category}|${r.subCategory}`}
                columns={categoryTotalColumns}
                /* 모바일에서는 세부·건수 열이 clip 된다 — 2행이 대신 보여 준다. */
                rowSubtitle={(r) => `${r.subCategory?.trim() || "미지정"} · ${r.count}건`}
              />
              {/*
               * 하단 총계 블록은 여러 줄 구조라 표 footer 로 옮기지 않는다.
               * aria-label 은 이 블록이 갖는다(테스트 :166 이 "표 없는" 요소를 찾는다).
               */}
              <div role="group" aria-label="이 달 카드 카테고리별 합계" style={{ marginTop: 4, padding: "8px 12px", borderTop: "1px solid var(--af-border)", fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: 600 }}>
                  <span>지출 합계 (자산 이동 제외) · {cardSpendingCount}건</span>
                  <span>{formatKrwExact(cardSpendingTotal)}</span>
                </div>
                {cardFixedTotal > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, paddingLeft: 12, color: "var(--af-muted-foreground)" }}>
                    <span>└ 고정비</span>
                    <span>{formatKrwExact(cardFixedTotal)}</span>
                  </div>
                ) : null}
                {cardVariableTotal > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, paddingLeft: 12, color: "var(--af-muted-foreground)" }}>
                    <span>└ 변동비</span>
                    <span>{formatKrwExact(cardVariableTotal)}</span>
                  </div>
                ) : null}
                {cardAssetTransferTotal > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "var(--af-muted-foreground)" }}>
                    <span>자산 이동 (지출 총합 제외)</span>
                    <span>{formatKrwExact(cardAssetTransferTotal)}</span>
                  </div>
                ) : null}
                {cardUnclassifiedTotal > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "var(--af-muted-foreground)" }}>
                    <span>미분류</span>
                    <span>{formatKrwExact(cardUnclassifiedTotal)}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          <StateBlock status={cardStatus} onRetry={loadCard} errorText={cardError} emptyText="이 월에 반영된 카드 내역이 없습니다">
            {cardRows ? (
              <div>
                {visibleCardRows.length > 0 ? (
                  <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>상세 내역</Typography.Text>
                ) : null}
                {visibleCardRows.length > 0 ? (
                  <AfListTable
                    labelledBy="h-card-imports"
                    rows={visibleCardRows.slice(0, cardLimit)}
                    rowKey={(r) => r.rowKey}
                    columns={cardRowColumns}
                    onActivate={(r) => setEditingCardRowKey(r.rowKey)}
                    rowSubtitle={(r) =>
                      `${r.approvedAt} · ${r.businessCategory?.trim() || "업종 미확인"}${r.cardMasked ? ` · ${r.cardMasked}` : ""}`
                    }
                    activateLabel={(r) =>
                      (merchantRowCounts.get(r.merchantName) ?? 0) > 1
                        ? `${r.merchantName} ${r.approvedAt} 분류 편집`
                        : `${r.merchantName} 분류 편집`
                    }
                    primaryExtra={(r) =>
                      r.memberRelation ? (
                        <Tag color={r.memberRelation === "본인" ? "blue" : "purple"} style={{ marginLeft: 4, fontSize: 12 }}>
                          {r.memberRelation}
                        </Tag>
                      ) : null
                    }
                    editingKey={editingCardRowKey}
                    renderEditor={(r) => {
                      const businessNo = (r.businessNo ?? "").trim();
                      return (
                        <Space wrap>
                          <Select
                            size="small"
                            style={{ width: 130 }}
                            placeholder="대분류"
                            value={r.expenseKind?.trim() || null}
                            options={CATEGORY_GROUP_OPTIONS}
                            onChange={(category: string) => {
                              setEditingCardRowKey(null);
                              void handleCardCategory(r, category);
                            }}
                            aria-label={`${r.merchantName} 카테고리`}
                          />
                          <Select
                            size="small"
                            style={{ width: 120 }}
                            placeholder="세부 분류"
                            value={r.subCategory?.trim() || null}
                            options={subCategoryOptions(r.expenseKind)}
                            onChange={(subCategory: string) => void handleCardSubCategory(r, subCategory)}
                            disabled={isUnclassified(r.expenseKind)}
                            aria-label={`${r.merchantName} 세부 분류`}
                          />
                          {businessNo ? (
                            <Button
                              type="link"
                              size="small"
                              style={{ padding: 0, height: "auto" }}
                              onClick={() => setBusinessInfoTarget({ businessNo, merchantName: r.merchantName })}
                              aria-label={`${r.merchantName} ${formatBusinessNo(businessNo)} 사업자 정보 보기`}
                            >
                              {formatBusinessNo(businessNo)}
                            </Button>
                          ) : null}
                          <Button size="small" onClick={() => setEditingCardRowKey(null)}>취소</Button>
                        </Space>
                      );
                    }}
                    editorLabel={(r) => `${r.merchantName} 분류 편집`}
                    onCancelEdit={() => setEditingCardRowKey(null)}
                  />
                ) : null}
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
