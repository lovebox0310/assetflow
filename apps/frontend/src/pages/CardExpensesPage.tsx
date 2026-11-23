import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button, Card, Checkbox, Input, Progress, Select, Space, Tag, Typography } from "antd";
import type { InputRef } from "antd";
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

/**
 * 이슈 #46 — 미분류 검색의 두 버튼 아이콘.
 *
 * 종전 `Input.Search`(allowClear)는 두 조작의 접근 이름이 antd 내부 아이콘
 * (`close-circle`/`search`)이었고, clear 의 `::after` 히트가 인접 검색 버튼 rect 와
 * 가로로 5px 겹쳤다(§124 는 그 결과를 가로 38.5 로 기록 — 이 빌드 재실측은 44).
 * 버튼을 직접 그리면서 이름을 한국어로 주고, 히트 44 는 CSS
 * (`.af-unclassified-search`)가 각 버튼 박스로 만든다.
 * `@ant-design/icons` 는 새 의존성이라 들이지 않는다 — DashboardPage 톱니와
 * 같은 인라인 SVG 방식이다.
 */
function ClearGlyph() {
  return (
    <svg width="12" height="12" viewBox="64 64 896 896" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M512 64c247.4 0 448 200.6 448 448S759.4 960 512 960 64 759.4 64 512 264.6 64 512 64zm127.98 274.82h-.04l-.08.06L512 466.75 384.14 338.88c-.04-.05-.06-.06-.08-.06a.12.12 0 00-.07 0c-.03 0-.05.01-.09.05l-45.02 45.02a.2.2 0 00-.05.09.12.12 0 000 .07v.02a.27.27 0 00.06.06L466.75 512 338.88 639.86c-.05.04-.06.06-.06.08a.12.12 0 000 .07c0 .03.01.05.05.09l45.02 45.02a.2.2 0 00.09.05.12.12 0 00.07 0c.02 0 .04-.01.08-.05L512 557.25l127.86 127.87c.04.04.06.05.08.05a.12.12 0 00.07 0c.03 0 .05-.01.09-.05l45.02-45.02a.2.2 0 00.05-.09.12.12 0 000-.07v-.02a.27.27 0 00-.05-.06L557.25 512l127.87-127.86c.04-.04.05-.06.05-.08a.12.12 0 000-.07c0-.03-.01-.05-.05-.09l-45.02-45.02a.2.2 0 00-.09-.05.12.12 0 00-.07 0z" />
    </svg>
  );
}

/**
 * 미분류 검색 옆 버튼의 아이콘 — **되돌리기(초기화)**. 필터는 입력 즉시 걸리므로
 * (§55.8) 이 버튼은 검색이 아니라 "더 보기로 늘어난 표시 수를 처음으로 되돌리기"다.
 * 돋보기를 쓰면 동작을 오해하게 되므로 반시계 화살표(rotate-ccw)로 둔다.
 */
function ResetGlyph() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
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
  /** D-03: 성공·안내는 중립, 실패만 danger — 알림 톤을 문구와 함께 기억한다. */
  const [noticeTone, setNoticeTone] = useState<"info" | "error">("info");
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

  /** 이슈 #46: clear 후 포커스를 입력으로 되돌린다(종전 antd clear 와 같은 동작). */
  const unclassifiedSearchRef = useRef<InputRef>(null);
  /** 이슈 #46 후속: 이 버튼은 **검색이 아니다**. 필터는 입력 즉시(§55.8 — onChange) 걸리므로
   * "더 보기"로 늘어난 표시 수를 첫 묶음(10)으로 되돌리는 동작만 한다 — 이름도 그에 맞춘다.
   * Enter 는 아무 동작도 하지 않는다(이미 즉시 적용됨). */
  const resetUnclassifiedDisplay = useCallback(() => {
    setUnclassifiedLimit(10);
  }, []);
  /** 이슈 #46: 값 비우기 + 포커스 유지(clear 버튼이 사라지므로 입력으로 되돌린다). */
  const clearUnclassifiedSearch = useCallback(() => {
    setUnclassifiedSearch("");
    setUnclassifiedLimit(10);
    unclassifiedSearchRef.current?.focus();
  }, []);

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
  /**
   * 이슈 #51: 명세서 조회 결과(로딩/실패)를 구분한다 — 실패를 "명세서 없음"으로 읽으면
   * 없는 근거로 "추정" 배지를 띄우게 된다. 실패면 배지를 그리지 않는다.
   */
  const [statementStatus, setStatementStatus] = useState<SurfaceStatus>("loading");
  useEffect(() => {
    let cancelled = false;
    const from = monthsAgo(month, 2);
    setStatementStatus("loading");
    listCardStatements(from, month)
      .then((rows) => {
        if (!cancelled) {
          setStatements(rows);
          setStatementStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatements([]);
          setStatementStatus("error");
        }
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
      setNoticeTone("info");
      setNotice(
        result.updated > 0
          ? `카드내역 ${result.total}건 중 ${result.updated}건을 자동 분류했습니다.${suffix}`
          : `카드내역 ${result.total}건을 확인했습니다 — 새로 분류된 항목은 없습니다.${suffix}`,
      );
      loadCard();
      loadUnclassified();
    } catch (e) {
      setNoticeTone("error");
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
      setNoticeTone("info");
      setNotice(`${result.merchantName} → ${result.category} (${result.updatedRows}건 반영)`);
    } catch (e) {
      setNoticeTone("error");
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
      setNoticeTone("info");
      setNotice(`${result.merchantName} → ${result.category}/${result.subCategory} (${result.updatedRows}건 반영)`);
    } catch (e) {
      setNoticeTone("error");
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
      setNoticeTone("info");
      setNotice(`${result.merchantName} → ${result.category} (${result.updatedRows}건 반영)`);
    } catch (e) {
      setNoticeTone("error");
      setNotice(e instanceof Error ? e.message : "카테고리 지정에 실패했습니다.");
    }
  }, [applyMerchantCategoryLocally]);

  /** 잘못 지정했을 때: 그 가맹점을 미분류로 되돌리고 규칙도 지운다. */
  const handleUndo = useCallback(async () => {
    if (!undo) return;
    try {
      await assignMerchantCategory(undo.group.merchantName, "", "");
      restoreMerchantLocally(undo.group);
      setNoticeTone("info");
      setNotice(`${undo.group.merchantName} 분류를 되돌렸습니다.`);
      setUndo(null);
    } catch (e) {
      setNoticeTone("error");
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
  /**
   * 이슈 #51·#56 — 이 달 카드 금액의 근거.
   * 서버(MonthlyExpenseTotals)와 같은 규칙을 쓴다: 카드사마다 그 카드사의 billing 명세서가
   * 있으면 명세서, 없으면 그 카드사의 승인일 합계. 전부 명세서면 "statement", 전부
   * 승인일(카드사 0개 포함)이면 "approval", 섞이면 "mixed". 카드사 이름이 비면 서버와
   * 같이 "미확인" 한 묶음으로 센다. 계산의 단일 출처는 서버이고, 이 화면은 "무엇을
   * 근거로 보는지"만 같은 규칙으로 표시한다. 조회 전·실패(null)에는 배지를 그리지 않는다.
   */
  type CardSource = "statement" | "approval" | "mixed";
  const cardSource: CardSource | null = ((): CardSource | null => {
    if (statementStatus !== "ready") return null;
    const billing = monthStatements.filter((s) => s.kind === "billing");
    // 카드 원장이 아직 오지 않았으면 승인일 카드사를 모른다 — 명세서만으로 기존 표기를 유지한다.
    if (cardStatus !== "ready") return billing.length > 0 ? "statement" : "approval";
    const statementCompanies = new Set(
      billing.filter((s) => s.totalAmount > 0).map((s) => s.cardCompany || "미확인"),
    );
    const companies = new Set(statementCompanies);
    for (const r of cardRows ?? []) companies.add(r.cardCompany || "미확인");
    if (companies.size === 0 || statementCompanies.size === 0) return "approval";
    return statementCompanies.size === companies.size ? "statement" : "mixed";
  })();
  /**
   * A안: 이 달 billing 명세서의 **청구액 합계**. 승인일 합계와는 기간이 달라 금액이
   * 다를 수 있으므로 합계를 교체하지 않고 두 숫자를 라벨로 구분해 함께 보여 준다.
   * 저장하지 않고 명세서 목록에서 매번 재계산한다(§34.6 — 저장값은 행 편집과 어긋난다).
   */
  const statementBillingTotal = useMemo(
    () => monthStatements.filter((s) => s.kind === "billing").reduce((acc, s) => acc + s.totalAmount, 0),
    [monthStatements],
  );
  /**
   * 차이의 기준은 **승인일 기준 전체 행 합계**다 — 명세서 총액도 미분류·자산 이동 행을
   * 포함하므로, "지출 합계(자산 이동 제외)"와 비교하면 분류 제외분이 기간 차이로 섞인다.
   */
  const cardGrossTotal = useMemo(
    () => (cardRows ?? []).reduce((acc, r) => acc + r.grossAmount, 0),
    [cardRows],
  );
  const statementBillingDiff = statementBillingTotal - cardGrossTotal;
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
      className="af-expenses"
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
        <Typography.Title level={2} id="h-card-companies" style={{ fontSize: 18, margin: 0, marginBottom: 16 }}>
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

      <section aria-labelledby="h-card-upload" className="af-cash-import" style={{ marginBottom: 32 }}>
        <Typography.Title level={2} id="h-card-upload" style={{ fontSize: 18, margin: 0, marginBottom: 16 }}>
          카드 내역 가져오기
        </Typography.Title>
        <CardImportPanel />
      </section>

      <section aria-labelledby="h-unclassified" style={{ marginBottom: 32 }}>
        {/* 공용 섹션 헤더 — 좁은 폭에서 제목이 글자 단위로 쪼개지지 않고,
            설명은 다음 줄로 내려간다(InvestmentsPage 와 같은 패턴). */}
        <div className="af-section-head" style={{ marginBottom: 16 }}>
          <Typography.Title level={2} id="h-unclassified" className="af-section-head__title" style={{ fontSize: 18, margin: 0 }}>미분류 정리</Typography.Title>
          <Typography.Text type="secondary" className="af-section-head__actions" style={{ fontSize: 12 }}>
            가맹점 하나를 고르면 같은 가맹점 내역 전체에 한 번에 적용됩니다
          </Typography.Text>
        </div>
        <Card>
          {/* §55.8: 작업함에서 방금 지정한 분류는 이 카드 안에서 바로 되돌린다.
              live region(role=status)은 가져온 카드내역의 알림 1개만 갖는다 — 중복 낭독 금지(D-03). */}
          {undo ? (
            <Space wrap size={12} style={{ marginBottom: 12 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {undo.group.merchantName} → {undo.category}
              </Typography.Text>
              <Button size="small" className="af-tap-sm" onClick={() => void handleUndo()}>되돌리기</Button>
            </Space>
          ) : null}
          {unclassifiedError ? (
            <Space direction="vertical" size={8}>
              <Typography.Text type="danger">{unclassifiedError}</Typography.Text>
              <Button size="small" className="af-tap-sm" onClick={loadUnclassified}>다시 시도</Button>
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
              <div className="af-unclassified-search">
                <Input
                  ref={unclassifiedSearchRef}
                  placeholder="가맹점 이름으로 찾기"
                  aria-label="미분류 가맹점 검색"
                  value={unclassifiedSearch}
                  onChange={(e) => { setUnclassifiedSearch(e.target.value); setUnclassifiedLimit(10); }}
                  suffix={
                    /* 슬롯 span 을 항상 렌더한다 — suffix 가 null 이면 antd 가 affix 래퍼를
                     * 통째로 다시 만들어 입력 DOM 이 교체되고 clear 직후 포커스가 body 로
                     * 떨어진다(실측). 슬롯을 유지하면 입력 노드가 그대로라 포커스가 남는다. */
                    <span className="af-search-clear-slot">
                      {unclassifiedSearch ? (
                        <button
                          type="button"
                          className="af-search-clear"
                          aria-label="검색어 지우기"
                          onClick={clearUnclassifiedSearch}
                        >
                          <ClearGlyph />
                        </button>
                      ) : null}
                    </span>
                  }
                />
                <Button
                  className="af-search-reset"
                  aria-label="표시 초기화"
                  icon={<ResetGlyph />}
                  onClick={resetUnclassifiedDisplay}
                />
              </div>
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
                          className="af-tap-sm"
                          style={{ padding: 0, height: "auto" }}
                          onClick={() => setBusinessInfoTarget({ businessNo, merchantName: g.merchantName })}
                          aria-label={`${g.merchantName} ${formatBusinessNo(businessNo)} 사업자 정보 보기`}
                        >
                          {formatBusinessNo(businessNo)}
                        </Button>
                      ))}
                      <Button size="small" className="af-tap-sm" onClick={() => setEditingMerchant(null)}>취소</Button>
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
          <Typography.Title level={2} id="h-card-imports" className="af-section-head__title" style={{ fontSize: 18, margin: 0 }}>가져온 카드내역</Typography.Title>
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
        {/* D-03: 자동 분류·분류 변경 결과는 그 동작을 시작한 섹션 헤더 바로 아래에 둔다.
            live region 은 이 알림 하나뿐 — 되돌리기 안내는 미분류 정리 카드가 갖는다. */}
        {notice ? (
          <div role="status" aria-live="polite" style={{ marginBottom: 16 }}>
            <Typography.Text type={noticeTone === "error" ? "danger" : "secondary"}>{notice}</Typography.Text>
          </div>
        ) : null}
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, fontWeight: 600 }}>
                  <span style={{ minWidth: 0, overflow: "hidden", wordBreak: "keep-all" }}>
                    지출 합계 (자산 이동 제외){" "}
                    <span style={{ whiteSpace: "nowrap" }}>· {cardSpendingCount}건</span>
                    {/*
                     * 이슈 #51: 명세서가 없는 달은 승인일 합계로 계산한 값이다 — 숨기지 않고
                     * "추정"으로 표시한다. 이슈 #56: 일부 카드사만 명세서가 없으면 "일부 추정".
                     * 전부 명세서면 배지 없이 기존 표기를 유지하고, 청구액은 바로 아래
                     * "카드 청구액 (명세서)" 행과 카드사별 표의 "명세서 금액" 열이 보여 준다
                     * (A안 — 합계를 교체하지 않는다).
                     */}
                    {cardSource === "approval" || cardSource === "mixed" ? (
                      <span
                        className="af-badge af-badge--estimate"
                        title={
                          cardSource === "mixed"
                            ? "일부 카드사는 명세서가 없어 승인일 기준으로 계산했습니다"
                            : "카드 명세서가 없어 승인일 기준으로 계산했습니다"
                        }
                      >
                        {cardSource === "mixed" ? "일부 추정" : "추정"}
                      </span>
                    ) : null}
                  </span>
                  <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatKrwExact(cardSpendingTotal)}</span>
                </div>
                {/*
                 * A안: 명세서가 있는 달은 청구액을 **지출 합계 바로 아래**에 함께 둔다.
                 * 두 숫자의 의미(승인일 vs 명세서 이용기간)가 달라 합계를 교체하지 않는다.
                 * 이슈 #56: 일부 카드사만 명세서면 그 부분 합계임을 라벨에 "일부"로 밝힌다.
                 */}
                {cardSource === "statement" || cardSource === "mixed" ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 12, minWidth: 0, overflow: "hidden", wordBreak: "keep-all" }}
                        title="카드사 명세서 이용기간 총액입니다. 승인일 기준 합계와 기간이 달라 금액이 다를 수 있습니다."
                      >
                        {cardSource === "mixed" ? "카드 청구액 (명세서, 일부)" : "카드 청구액 (명세서)"}
                      </Typography.Text>
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
                      >
                        {formatKrwExact(statementBillingTotal)}
                      </Typography.Text>
                    </div>
                    {/*
                     * 차이는 승인일 합계 **전체**와 명세서 총액을 비교한 값이다. 혼합 달에는
                     * 명세서가 없는 카드사의 승인액까지 섞여 "기간 차이"로 읽을 수 없으므로
                     * 전부 명세서인 달에서만 보여 준다.
                     */}
                    {cardSource === "statement" && statementBillingDiff !== 0 ? (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, paddingLeft: 12 }}>
                        <Typography.Text
                          type="secondary"
                          style={{ fontSize: 12, minWidth: 0, overflow: "hidden", wordBreak: "keep-all" }}
                          title="승인일 기준 합계(미분류·자산 이동 포함)와 명세서 총액의 차이입니다."
                        >
                          차이 (기간 차이)
                        </Typography.Text>
                        <Typography.Text
                          type="secondary"
                          style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
                        >
                          {formatKrwExact(statementBillingDiff)}
                        </Typography.Text>
                      </div>
                    ) : null}
                  </>
                ) : null}
                {cardFixedTotal > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, paddingLeft: 12, color: "var(--af-muted-foreground)" }}>
                    <span style={{ minWidth: 0, overflow: "hidden" }}>└ 고정비</span>
                    <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatKrwExact(cardFixedTotal)}</span>
                  </div>
                ) : null}
                {cardVariableTotal > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, paddingLeft: 12, color: "var(--af-muted-foreground)" }}>
                    <span style={{ minWidth: 0, overflow: "hidden" }}>└ 변동비</span>
                    <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatKrwExact(cardVariableTotal)}</span>
                  </div>
                ) : null}
                {cardAssetTransferTotal > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, color: "var(--af-muted-foreground)" }}>
                    <span style={{ minWidth: 0, overflow: "hidden" }}>자산 이동 (지출 총합 제외)</span>
                    <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatKrwExact(cardAssetTransferTotal)}</span>
                  </div>
                ) : null}
                {cardUnclassifiedTotal > 0 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, color: "var(--af-muted-foreground)" }}>
                    <span style={{ minWidth: 0, overflow: "hidden" }}>미분류</span>
                    <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatKrwExact(cardUnclassifiedTotal)}</span>
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
                        <Tag
                          /* D-08: antd 프리셋 색 대신 의미 토큰 — 본인=중립, 가족=시그널. */
                          style={{
                            marginLeft: 4,
                            fontSize: 12,
                            borderColor: "transparent",
                            ...(r.memberRelation === "본인"
                              ? { background: "var(--af-slate-soft)", color: "var(--af-slate)" }
                              : { background: "var(--af-badge-signal-bg)", color: "var(--af-badge-signal-fg)" }),
                          }}
                        >
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
                              className="af-tap-sm"
                              style={{ padding: 0, height: "auto" }}
                              onClick={() => setBusinessInfoTarget({ businessNo, merchantName: r.merchantName })}
                              aria-label={`${r.merchantName} ${formatBusinessNo(businessNo)} 사업자 정보 보기`}
                            >
                              {formatBusinessNo(businessNo)}
                            </Button>
                          ) : null}
                          <Button size="small" className="af-tap-sm" onClick={() => setEditingCardRowKey(null)}>취소</Button>
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
                {/*
                 * D-06: 합계는 표 footer 로 옮기지 않는다 — 여기 합계는 cardLimit 까지
                 * "지금 보이는 행"의 합이라, 더 보기 버튼 아래에 있어야 의미가 맞다.
                 * 대신 금액은 한 줄 고정 + 자릿수 정렬, 라벨은 남는 폭만 쓴다.
                 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, fontWeight: 600, padding: "4px 2px" }}>
                  <span style={{ minWidth: 0, overflow: "hidden" }}>합계 ({visibleCardRows.length}건)</span>
                  <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {formatKrwExact(visibleCardRows.reduce((acc, r) => acc + r.grossAmount, 0))}
                  </span>
                </div>
              </div>
            ) : null}
          </StateBlock>
        </Card>
      </section>

      {/* D-07: §63/§68 카드 명세서 자동 수집은 가져온 카드내역 뒤에 둔다 —
          수집 결과가 먼저 보이고, 설정은 그 다음이다. h2 는 카드 밖(다른 섹션과 같은 패턴). */}
      <section aria-labelledby="h-card-email-import" style={{ marginBottom: 32 }}>
        <Typography.Title level={2} id="h-card-email-import" style={{ fontSize: 18, margin: 0, marginBottom: 16 }}>
          카드 명세서 자동 수집
        </Typography.Title>
        <CardEmailImportSettingsSection />
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
