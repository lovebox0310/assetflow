import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Form,
  Grid,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
  Typography,
  type FormInstance,
} from "antd";
import { AfListTable, type AfListColumn, type AfRowAction } from "../components/AfListTable";
import { AppLayout } from "../layout/AppLayout";
import { StandardNav } from "../layout/StandardNav";
import { StateBlock, type SurfaceStatus } from "../components/StateBlock";
import { SubNav } from "../components/SubNav";
import {
  createAccount,
  deleteAccount,
  listAccounts,
  updateAccount,
  type AssetAccountRow,
  type UpsertPayload,
} from "../api/assetsApi";
import { getPortfolio, type Portfolio } from "../api/investmentsApi";
import { clearInflight } from "../api/client";
import { clearToken } from "../auth/authStore";
import {
  BankLinkSection,
  type BankLinkSectionHandle,
  type BankLinksState,
} from "../components/BankLinkSection";
import type { BankLink } from "../api/bankApi";
import { formatKrwExact } from "../utils/formatters";
import { SPACE } from "../theme/tokens";

interface AssetsPageProps {
  /** 대시보드로 돌아간다. */
  onBack: () => void;
  /** §54.1: 자산의 하위 화면인 투자 화면으로 이동한다. */
  onOpenInvestments?: () => void;
  /** 헤더 내비게이션 — 지출 화면으로 이동 (§42). */
  onOpenExpenses?: () => void;
  /** 헤더 내비게이션 — 설정 화면으로 이동 (§46). */
  onOpenSettings?: () => void;
}

const TYPES = new Set<AssetAccountRow["accountType"]>(["cash", "deposit", "invest", "realty"]);
void TYPES; // §40.2 enum 참조 — 화면 추가 폼의 유형 제한에서 쓴다

/**
 * §40.2 enum 의 화면 표기. **§23 의 라벨과 같은 값을 쓴다** — 목록에서 유형을
 * 보여 주는 순간 화면에 이름이 필요해졌고, 두 곳에 다른 이름을 두면
 * 대시보드 구성비와 자산 화면이 같은 행을 다르게 부른다.
 * `invest` 는 "투자"다: §28.7 비상금 유지 개월의 분자(투자금 잔액)가 이 유형이다.
 */
const TYPE_LABELS: Record<AssetAccountRow["accountType"], string> = {
  cash: "현금성",
  deposit: "예적금",
  invest: "투자",
  realty: "부동산·기타",
};

/** 폼의 Select 선택지. 순서는 §40.2 enum 순서를 따른다. */
const TYPE_OPTIONS = (Object.keys(TYPE_LABELS) as AssetAccountRow["accountType"][]).map((value) => ({
  value,
  label: TYPE_LABELS[value],
}));

/**
 * 유형별 합계 차례: 자금 성격 순서(§28.7 현금 3계좌 + 예적금 + 기타).
 * 0원인 유형도 빠뜨리지 않고 `0원` 으로 보여 준다 — 숨기면 "행이 없다"와
 * "행이 있는데 0원이다" 를 구별할 수 없고, 그 구별이 안 되는 것이 #68 의 원인이었다.
 */
const TYPE_ORDER: AssetAccountRow["accountType"][] = ["cash", "deposit", "invest", "realty"];

/**
 * D5: 화면 문구에서 스펙 번호를 걷어낸다 — 사용자는 `§31.4` 를 읽을 이유가 없다.
 * 부채가 빈 상태는 "오류"가 아니라 정상이라는 사실만 남긴다(§31.4).
 */
const DEBT_EMPTY_TEXT = "등록된 부채가 없습니다. 빌린 돈이 없다면 그대로 두세요.";

/**
 * 스프린트 2 #21: §31 자산 화면의 React 이관.
 * - §31.1: 합계·구성비는 저장하지 않는다 — 행에서 매번 계산한다.
 * - §31.2: 금융자산·부채·투자금 행은 편집 가능. 자동이체·부가세는 지출 도메인의
 *   단일 출처라 이 화면에서 편집하지 않는다(읽기 전용 자리 표시).
 * - 상태 4종은 StateBlock 단일 구현체를 재사용한다(§35 화면마다 다른 스피너 금지).
 */
export function AssetsPage({ onBack, onOpenInvestments, onOpenExpenses, onOpenSettings }: AssetsPageProps) {
  const screens = Grid.useBreakpoint();
  /** §35 중단점: md 미만은 폼 컨트롤을 세로로 쌓아 100% 폭을 쓴다. */
  const wide = Boolean(screens.md);
  const [rows, setRows] = useState<AssetAccountRow[] | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [status, setStatus] = useState<SurfaceStatus>("loading");
  const [errorText, setErrorText] = useState("");
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form] = Form.useForm<UpsertPayload>();
  const mountedRef = useRef(false);
  /** 추가 폼 블록 — 열릴 때 첫 입력으로 포커스를 옮기는 기준점(§128 AS-04). */
  const addFormRef = useRef<HTMLDivElement | null>(null);
  /**
   * A7-1: 자산 행 `⋯` 메뉴의 은행 동작은 **은행 섹션의 함수**를 부른다.
   * 모달·API 는 그쪽 하나만 갖고 있고, 이 ref 는 그 문을 여는 손잡이다.
   */
  const bankSectionRef = useRef<BankLinkSectionHandle | null>(null);
  /**
   * 은행 섹션의 연결 목록을 올려 받은 사본. 행 메뉴의 `잔액 가져오기`·
   * `연결 해제` disabled 판단에만 쓴다(조회는 섹션이 페이지 로드당 1회).
   * 로딩·실패 동안에는 아무것도 단정하지 않고 3개 모두 disabled 다.
   */
  const [bankLinks, setBankLinks] = useState<{ links: BankLink[]; state: BankLinksState }>({
    links: [],
    state: "loading",
  });
  /** 모달이 닫힌 뒤 포커스를 되돌릴 계좌 id (§125 I-03 규칙). */
  const [focusReturnAccountId, setFocusReturnAccountId] = useState<number | null>(null);

  const load = useCallback((silent = false) => {
    clearInflight(); // 앞선 요청의 dedupe 잔여를 비우고 새로 읽는다
    if (!silent) setStatus("loading");
    setErrorText("");
    Promise.all([
      listAccounts(),
      // §54.3: 투자 계좌의 총액은 예수금 + 평가액이다. 포트폴리오 조회가 실패해도
      // 자산 목록은 보여야 하므로 보조값으로만 쓰고, 없으면 balance 로 폴백한다.
      getPortfolio().catch(() => null),
    ])
      .then(([data, portfolioData]) => {
        setRows(data);
        setPortfolio(portfolioData && Array.isArray(portfolioData.accounts) ? portfolioData : null);
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
  /** §61: 은행 동기화 대상 — 현금성·예적금이면서 부채가 아닌 계좌만. */
  const bankAccounts = assets.filter((r) => r.accountType === "cash" || r.accountType === "deposit");
  const liabilities = rows?.filter((r) => r.isDebt) ?? [];
  const investTotals = new Map((portfolio?.accounts ?? []).map((a) => [a.accountId, a.totalValue]));

  /**
   * 은행 섹션이 올린 연결 목록. 화면이 소유한 값이 아니라 **사본**이라
   * 행 메뉴의 disabled 판단에만 쓴다 — 조회(listBankLinks)는 섹션이 1회 한다.
   */
  const handleLinksChanged = useCallback((links: BankLink[], state: BankLinksState) => {
    setBankLinks((prev) => (prev.state === state && prev.links === links ? prev : { links, state }));
  }, []);

  /**
   * 모달이 닫히면 그 행의 `⋯` 로 포커스를 되돌린다(§125 I-03 과 같은 규칙).
   * 모달을 연 주체가 메뉴 항목이라 항목은 이미 사라졌고, 남은 복귀 지점은
   * `⋯` 뿐이다. 행이 사라졌으면 아무것도 하지 않는다 — 남은 행을 억지로 고르지 않는다.
   *
   * `AfListTable` 은 손대지 않는다(actions 계약 그대로). 표가 그 버튼에 붙인
   * 접근 이름(`{이름} 행 메뉴`)이 유일한 공개 표식이라 그것으로 찾는다.
   * 이동은 **한 번만** 한다 — 상태를 곧바로 비워 다음 커밋에서 다시 훔치지 않게.
   */
  useEffect(() => {
    if (focusReturnAccountId === null) return;
    const row = rows?.find((r) => r.id === focusReturnAccountId);
    const table = document.querySelector<HTMLTableElement>('table[aria-labelledby="h-assets"]');
    const button =
      row && table
        ? Array.from(table.querySelectorAll<HTMLButtonElement>("button.af-icon-btn")).find(
            (b) => b.getAttribute("aria-label") === `${row.name} 행 메뉴`,
          )
        : undefined;
    button?.focus({ preventScroll: true });
    setFocusReturnAccountId(null);
  }, [focusReturnAccountId, rows]);

  /** §54.3: invest 행은 예수금이 아니라 계좌 총액(예수금+평가액)을 보여 준다. */
  const displayValue = (row: AssetAccountRow) =>
    row.accountType === "invest" ? investTotals.get(row.id) ?? row.balance : row.balance;
  const totalAssets = assets.reduce((acc, r) => acc + displayValue(r), 0);
  const totalLiabilities = liabilities.reduce((acc, r) => acc + r.balance, 0);

  const beginCreate = (isDebt = false) => {
    setEditingId("new");
    form.setFieldsValue({
      accountType: isDebt ? "realty" : "cash",
      name: "",
      institutionName: "",
      balance: 0,
      isDebt,
    });
  };

  /**
   * §128 AS-04: "+ 자산 추가"/"+ 부채 추가" 를 누르면 그 버튼이 disabled 되며
   * 포커스가 body 로 사라졌다(activeElement=BODY). 폼이 렌더된 뒤(효과) 첫
   * 입력인 이름으로 옮긴다 — 편집 행 진입과 같은 규칙이다(§124, AfListTable).
   *
   * 추가 폼은 하나만 렌더되므로(자산/부채 분기) ref 도 그 하나를 가리킨다.
   * 이름 input 을 먼저 찾고, 없으면 폼 안 첫 포커서블로 물러난다.
   */
  useEffect(() => {
    if (editingId !== "new") return;
    const group = addFormRef.current;
    if (!group) return;
    const first =
      group.querySelector<HTMLElement>('input[aria-label="자산 이름"], input[aria-label="부채 이름"]') ??
      group.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), button:not([disabled])',
      );
    first?.focus();
  }, [editingId]);

  const beginEdit = (row: AssetAccountRow) => {
    // §54.3: invest 행의 balance 는 예수금이다. 이 화면에서 총액을 편집하면
    // 예수금 자리에 총액이 저장돼 이중 계상된다 — 편집은 투자 화면에서만.
    if (row.accountType === "invest") return;
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

  /**
   * #69: 저장/삭제 실패가 화면에 전혀 드러나지 않았다.
   *
   * 두 핸들러가 async 인데 `onClick`/`onConfirm` 에 그대로 넘겨져서, API 가
   * reject 하면 unhandled promise rejection 이 되고 UI 는 아무 일도 없던 것처럼
   * 조용히 남았다. 사용자 입장에서는 버튼을 눌러도 저장이 안 되는데 이유를
   * 알 수 없는 상태다.
   *
   * `busy` 로 진행 중 버튼을 잠그는 이유: 요청이 뜬 상태에서 두 번 누르면
   * 같은 행이 두 번 생성된다(§40 CRUD 왕복이 멱등하지 않다).
   */
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const runAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError("");
    try {
      await fn();
    } catch (e: unknown) {
      // 실패하면 편집 상태를 닫지 않는다 — 입력값을 잃으면 다시 채워야 한다.
      setActionError(e instanceof Error ? e.message : "요청에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = () =>
    runAction(async () => {
      const values = await form.validateFields();
      const payload: UpsertPayload = { ...values, institutionName: values.institutionName ?? "" };
      if (editingId === "new") {
        await createAccount(payload);
      } else if (typeof editingId === "number") {
        await updateAccount(editingId, payload);
      }
      setEditingId(null);
      load();
    });

  const removeRow = (id: number) =>
    runAction(async () => {
      await deleteAccount(id);
      load();
    });

  /**
   * 폼 블록의 저장/취소. 버튼을 폼 밖에 두는 이유는 두 폼(추가·편집 행)이
   * 같은 버튼을 쓰기 때문이다 — 폼 안에 넣으면 제출 경로가 둘로 갈린다.
   */
  const formActions = (
    <Space style={{ marginTop: SPACE.s2 }}>
      <Button type="primary" onClick={saveEdit} loading={busy}>저장</Button>
      <Button onClick={cancelEdit} disabled={busy}>취소</Button>
    </Space>
  );

  /** 두 표가 같은 편집 폼을 쓴다 — 편집 행은 셀 하나(colSpan)다. */
  const renderEditor = (row: AssetAccountRow, isDebt: boolean) => (
    <div className="af-item-form">
      <div className="af-item-form__label">{isDebt ? "부채 편집" : "자산 편집"}</div>
      <EditForm form={form} isDebt={isDebt} wide={wide} />
      {formActions}
    </div>
  );

  /**
   * 추가 폼은 StateBlock **밖**에 둔다(P1). StateBlock 은 empty/error 에서
   * children 을 버리므로, 안에 두면 계정이 0건일 때 "+ 자산 추가" 를 눌러도
   * 폼이 화면에 나오지 않는다.
   */
  const addFormBlock = (isDebt: boolean) => (
    /* 카드 첫 블록이라 구분선은 두지 않는다 — `.af-item-form` 의 라벨·간격만 쓴다.
       role="group" + 이름: 이 블록이 방금 열린 "추가 폼"임을 AT 에도 알린다(§128). */
    <div
      className="af-item-form"
      role="group"
      aria-label={isDebt ? "부채 추가 폼" : "자산 추가 폼"}
      ref={addFormRef}
      style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}
    >
      <div className="af-item-form__label">{isDebt ? "새 부채" : "새 자산"}</div>
      <EditForm form={form} isDebt={isDebt} wide={wide} />
      {formActions}
    </div>
  );

  /**
   * A7-1: 현금성·예적금 계좌 행에만 은행 동작 3개를 더한다. 모달·API 는
   * 은행 섹션이 갖고 있으므로 여기서는 그 손잡이(`bankSectionRef`)만 부른다.
   *
   * disabled 규칙은 섹션이 보여 주는 버튼과 같다:
   * - 연결 정보를 모르는 동안(로딩·실패) → 3개 모두 disabled ("연결 안 됨"을 단정하지 않는다)
   * - 연결됨 → `잔액 가져오기`·`연결 해제` 만, 연결 안 됨 → `은행 연결` 만 활성
   */
  const bankActions = (row: AssetAccountRow): AfRowAction[] => {
    const ready = bankLinks.state === "ready";
    const linked = ready && bankLinks.links.some((link) => link.accountId === row.id);
    return [
      {
        key: "bank-link",
        label: "은행 연결",
        disabled: !ready || linked,
        onSelect: () => bankSectionRef.current?.openLink(row),
      },
      {
        key: "bank-sync",
        label: "잔액 가져오기",
        disabled: !ready || !linked,
        onSelect: () => bankSectionRef.current?.openSync(row),
      },
      {
        key: "bank-unlink",
        label: "연결 해제",
        disabled: !ready || !linked,
        /* 잔액은 그대로 남고 자동 조회만 끊긴다 — 섹션의 확인 문구와 같은 말. */
        confirm: "은행 연결을 해제할까요?",
        onSelect: () => bankSectionRef.current?.unlink(row.id),
      },
    ];
  };

  /**
   * 투자 행은 이 화면에서 편집하지 않는다(§54.3): balance 가 예수금이라
   * 총액을 여기서 저장하면 이중 계상된다. 그래서 동작 메뉴도 주지 않는다.
   *
   * 부채 행에는 은행 동작을 주지 않는다 — 부채는 잔액을 가져올 대상이 아니다
   * (`accountType` 이 cash 여도 `isDebt` 면 제외).
   */
  const assetActions = (row: AssetAccountRow): AfRowAction[] => {
    if (row.accountType === "invest") return [];
    const isBankAccount = !row.isDebt && (row.accountType === "cash" || row.accountType === "deposit");
    const deleteAction: AfRowAction = {
      key: "delete",
      label: "삭제",
      danger: true,
      /* A11: 어느 행을 지우는지 확인 문구에 계좌명을 넣는다 — 표에서 한 줄만 보고도 판단되게. */
      confirm: `${row.name} 계좌를 삭제할까요?`,
      onSelect: () => void removeRow(row.id),
    };
    return isBankAccount ? [...bankActions(row), deleteAction] : [deleteAction];
  };

  const activateRow = (row: AssetAccountRow) => {
    if (row.accountType === "invest") {
      // §54.3: invest 행의 총액은 투자 화면에서 관리한다.
      onOpenInvestments?.();
      return;
    }
    beginEdit(row);
  };

  const rowSubtitle = (r: AssetAccountRow) =>
    `${TYPE_LABELS[r.accountType]}${r.institutionName ? " · " + r.institutionName : ""}`;

  /**
   * A8: 부채 표에는 유형 열도, 유형 선택도 없다(§34.6). 부제가 유형 이름을
   * 말하면 화면에 없는 분류를 읽는 셈이라 "부채"라고만 적는다.
   */
  const debtRowSubtitle = (r: AssetAccountRow) =>
    `부채${r.institutionName ? " · " + r.institutionName : ""}`;

  const assetColumns: AfListColumn<AssetAccountRow>[] = [
    { key: "name", header: "이름", mobile: "primary", render: (r) => r.name },
    {
      key: "accountType",
      header: "계정 유형",
      width: 110,
      mobile: "meta",
      render: (r) => <Tag>{TYPE_LABELS[r.accountType]}</Tag>,
    },
    { key: "institution", header: "기관", mobile: "meta", render: (r) => r.institutionName || "—" },
    {
      key: "balance",
      header: "잔액",
      numeric: true,
      mobile: "value",
      render: (r) => formatKrwExact(displayValue(r)),
    },
  ];

  const liabilityColumns: AfListColumn<AssetAccountRow>[] = [
    { key: "name", header: "이름", mobile: "primary", render: (r) => r.name },
    { key: "institution", header: "기관", mobile: "meta", render: (r) => r.institutionName || "—" },
    {
      key: "balance",
      header: "잔액",
      numeric: true,
      mobile: "value",
      render: (r) => formatKrwExact(displayValue(r)),
    },
  ];

  const handleLogout = () => {
    clearToken();
    onBack();
  };

  const debtFormOpen = editingId !== null && (editingId === "new" ? form.getFieldValue("isDebt") === true : liabilities.some((r) => r.id === editingId));

  return (
    <AppLayout
      /* §128 AS-05: 터치에서 폼 컨트롤 높이를 이 화면 폭으로만 좁혀 올린다
         (`.af-item-form` 은 지출 화면도 쓰므로 화면 루트 클래스가 필요하다 — §88/§125). */
      className="af-assets"
      onLogout={handleLogout}
      nav={
        <StandardNav current="assets" onOpenDashboard={onBack} onOpenExpenses={onOpenExpenses} onOpenSettings={onOpenSettings} />
      }
    >
      {/* 이슈 #70: 페이지 h1 은 정확히 1개. 섹션(금융자산·부채 등)은 h2. */}
      <Typography.Title level={1} id="h-assets-page" style={{ fontSize: 24, margin: 0, marginBottom: 16 }}>
        자산
      </Typography.Title>
      {/* §54.1: 자산의 하위 화면 탭 — 전역 nav 는 4개를 유지한다. */}
      <SubNav
        ariaLabel="자산 하위 화면"
        current="assets"
        items={[
          { key: "assets", label: "자산", ariaLabel: "자산 탭" },
          { key: "investments", label: "투자", ariaLabel: "투자 탭", onClick: onOpenInvestments },
        ]}
      />
      <section aria-labelledby="h-assets" style={{ marginBottom: 24 }}>
        {/*
         * #69: 저장/삭제 실패를 화면에 알린다. role="alert" 로 두어 스크린리더가
         * 즉시 읽게 한다(§70 a11y 와 같은 방향, LoginPage 도 같은 방식을 쓴다).
         * 편집 상태는 닫지 않으므로 입력값이 남고, 사용자가 다시 시도할 수 있다.
         */}
        {actionError ? (
          <Typography.Paragraph role="alert" type="danger" style={{ marginBottom: 16 }}>
            {actionError}
          </Typography.Paragraph>
        ) : null}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <Typography.Title level={2} id="h-assets" style={{ fontSize: 18, margin: 0 }}>금융자산</Typography.Title>
          <Button onClick={() => beginCreate()} disabled={editingId !== null}>+ 자산 추가</Button>
        </div>
        <Card>
          {editingId === "new" && debtFormOpen === false ? addFormBlock(false) : null}
          <StateBlock status={status} onRetry={() => load()} errorText={errorText} emptyText="자산 행이 없습니다 — '+ 자산 추가'로 시작하세요">
            <AfListTable
              labelledBy="h-assets"
              rows={assets}
              rowKey={(r) => r.id}
              columns={assetColumns}
              onActivate={activateRow}
              activateLabel={(r) =>
                r.accountType === "invest" ? `${r.name} 투자 화면에서 관리` : `${r.name} 편집`
              }
              rowSubtitle={rowSubtitle}
              actions={assetActions}
              actionsLabel={(r) => `${r.name} 행 메뉴`}
              editingKey={editingId}
              renderEditor={(r) => renderEditor(r, r.isDebt)}
              onCancelEdit={cancelEdit}
              editorLabel={(r) => `${r.name} 편집`}
              footer={<AssetTotals assets={assets} total={totalAssets} valueOf={displayValue} />}
            />
          </StateBlock>
        </Card>
      </section>

      <section aria-labelledby="h-liab" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <Typography.Title level={2} id="h-liab" style={{ fontSize: 18, margin: 0 }}>부채</Typography.Title>
          <Button
            onClick={() => beginCreate(true)}
            disabled={editingId !== null}
          >
            + 부채 추가
          </Button>
        </div>
        <Card>
          {editingId === "new" && debtFormOpen ? addFormBlock(true) : null}
          {/* P4: 조회 실패 알림은 금융자산 카드 한 곳에서만 낸다 — 부채 카드가
              같은 오류를 큰 알림으로 한 번 더 내지 않는다.
              이슈 #36 AS-02: 대신 카드를 비워 두지 않는다. 빈 판(2px)은 "부채
              없음"으로 오독되므로, 한 줄 문구 + 재시도를 카드 안에 둔다.
              자산/부채는 listAccounts 한 번의 결과를 같이 쓰므로 상태도 같다. */}
          {status === "error" ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: SPACE.s3,
              }}
            >
              <Typography.Text type="secondary">부채를 불러오지 못했습니다</Typography.Text>
              <Button className="af-retry-btn" onClick={() => load()}>
                재시도
              </Button>
            </div>
          ) : (
            <StateBlock status={status} onRetry={() => load()} errorText={errorText} emptyText={DEBT_EMPTY_TEXT}>
              {liabilities.length === 0 ? (
                /* D5: 스펙 번호 대신 사용자가 할 일을 적는다 (§31.4 — 빈 부채는 정상). */
                <Typography.Text type="secondary">{DEBT_EMPTY_TEXT}</Typography.Text>
              ) : (
                <AfListTable
                  labelledBy="h-liab"
                  rows={liabilities}
                  rowKey={(r) => r.id}
                  columns={liabilityColumns}
                  onActivate={activateRow}
                  activateLabel={(r) => `${r.name} 편집`}
                  rowSubtitle={debtRowSubtitle}
                  actions={assetActions}
                  actionsLabel={(r) => `${r.name} 행 메뉴`}
                  editingKey={editingId}
                  renderEditor={(r) => renderEditor(r, true)}
                  onCancelEdit={cancelEdit}
                  editorLabel={(r) => `${r.name} 편집`}
                  footer={
                    /* P6: 총합계는 화면에서 마지막으로 읽는 숫자 — 자산 표와 같은 크기로 맞춘다. */
                    <Typography.Paragraph
                      style={{ marginBottom: 0, fontSize: 16, fontWeight: 600, color: "var(--af-foreground)" }}
                    >
                      합계 {formatKrwExact(totalLiabilities)}
                    </Typography.Paragraph>
                  }
                />
              )}
            </StateBlock>
          )}
        </Card>
      </section>

      {/* §61: 은행 잔액 자동 갱신 — 표의 편집 동작과 섞이지 않도록 별도 섹션.
          A10-A: 읽는 순서는 금융자산 → 부채 → 은행 → 다른 화면이다(부채를 은행
          앞으로). 앵커 id(`h-bank-sync`)·제목·`aria-labelledby` 는 그대로다.
          자산 행 `⋯` 메뉴의 은행 동작도 이 섹션의 함수를 ref 로 부른다 — 모달을
          복제하지 않는다. */}
      <BankLinkSection
        ref={bankSectionRef}
        accounts={bankAccounts}
        accountsReady={rows !== null && status !== "error"}
        onSynced={() => load(true)}
        onLinksChanged={handleLinksChanged}
        onModalClosed={setFocusReturnAccountId}
      />

      <section aria-labelledby="h-expense-owned" style={{ marginBottom: 24 }}>
        <Typography.Title level={2} id="h-expense-owned" style={{ fontSize: 18, margin: 0, marginBottom: 16 }}>
          다른 화면이 읽는 값
        </Typography.Title>
        <Card>
          {/* D5: 스펙 번호 대신 어디서 관리하는지 적는다 (§31.2 — 자동이체·부가세의 단일 출처는 지출 화면). */}
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            자동이체와 부가가치세 잔액은 지출 화면에서 관리합니다. 지출 화면과 연결되면 여기에
            표시됩니다.
          </Typography.Paragraph>
        </Card>
      </section>
    </AppLayout>
  );
}

/**
 * 유형별 합계 + 총합계. §31.1 대로 저장하지 않고 행에서 매번 다시 센다.
 *
 * P6/A9 위계: 총합계가 먼저(16/600), 유형별 합계는 보조(12/muted).
 * 총합계는 **한 텍스트 노드** `합계 {금액}` 이다 — 스크린리더와 단위 테스트가
 * 같은 문장을 읽는다.
 *
 * 유형별 합계를 보여 주는 이유는 #68 의 AC 다 — "유형을 바꾸면 지표가 즉시 달라지는
 * 것을 육안으로 확인". 대시보드로 건너가지 않고도 `invest` 합계가 바뀌는 것을
 * 여기서 볼 수 있다. 값이 0원인 유형도 자리를 지킨다: 0 을 숨기면
 * "투자 행이 없다"와 "투자 행이 0원이다"가 구별되지 않는다(§28.7 분자가 0 이던 상태).
 */
function AssetTotals({
  assets,
  total,
  valueOf,
}: {
  assets: AssetAccountRow[];
  total: number;
  /** §54.3: invest 행은 계좌 총액(예수금+평가액)으로 센다. */
  valueOf: (row: AssetAccountRow) => number;
}) {
  return (
    <div style={{ width: "100%" }}>
      <Typography.Text
        style={{
          display: "block",
          fontSize: 16,
          lineHeight: "24px",
          fontWeight: 600,
          color: "var(--af-foreground)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        합계 {formatKrwExact(total)}
      </Typography.Text>
      <Space size={[12, 4]} wrap style={{ marginTop: SPACE.s1 }}>
        {TYPE_ORDER.map((type) => {
          const sum = assets.filter((r) => r.accountType === type).reduce((acc, r) => acc + valueOf(r), 0);
          return (
            <Typography.Text
              key={type}
              style={{ fontSize: 12, lineHeight: "18px", color: "var(--af-muted-foreground)", fontVariantNumeric: "tabular-nums" }}
            >
              {TYPE_LABELS[type]} {formatKrwExact(sum)}
            </Typography.Text>
          );
        })}
      </Space>
    </div>
  );
}

/**
 * 자산·부채 추가/편집 폼. 좁은 화면(320 등)에서는 컨트롤을 한 줄에 하나씩
 * 100% 폭으로 쌓고 세로 갭은 `SPACE.s2`(8) 로 둔다 — 폭이 다른 컨트롤이
 * 섞이면 오른쪽 끝이 어긋나 보인다(designer 감사 A5/A6).
 */
function EditForm({ form, isDebt, wide }: { form: FormInstance; isDebt: boolean; wide: boolean }) {
  const itemStyle: React.CSSProperties = wide ? {} : { flex: "1 1 100%", minWidth: 0, marginInlineEnd: 0 };

  return (
    <Form
      form={form}
      layout="inline"
      style={{ display: "flex", flexWrap: "wrap", gap: wide ? "10px 12px" : SPACE.s2 }}
    >
      <Form.Item name="name" rules={[{ required: true, message: "이름을 입력하세요" }]} style={itemStyle}>
        <Input
          placeholder={isDebt ? "부채 이름" : "자산 이름"}
          aria-label={isDebt ? "부채 이름" : "자산 이름"}
          style={{ width: wide ? 180 : "100%" }}
        />
      </Form.Item>
      <Form.Item name="institutionName" style={itemStyle}>
        <Input placeholder="기관 (선택)" aria-label="기관" style={{ width: wide ? 140 : "100%" }} />
      </Form.Item>
      <Form.Item name="balance" rules={[{ required: true, message: "잔액을 입력하세요" }]} style={itemStyle}>
        <InputNumber min={0} placeholder="잔액(원)" aria-label="잔액" style={{ width: wide ? 160 : "100%" }} />
      </Form.Item>
      {/*
       * 유형은 더 이상 숨은 필드가 아니다. 숨겨 두면 저장된 값을 읽을 수도 바꿀 수도
       * 없어서, §28.7 비상금 분자(투자금)에서 빠진 행을 사용자가 고칠 방법이 없었다 —
       * 그 결과가 "비상금 0.0개월" 이었다. 라벨을 붙여 화면에 노출한다.
       * 부채는 유형이 금액 성격을 바꾸지 않으므로 계속 숨긴다(§34.6 부채 계약).
       */}
      {isDebt ? (
        <Form.Item name="accountType" hidden initialValue="realty">
          <Input />
        </Form.Item>
      ) : (
        <Form.Item
          name="accountType"
          label="계정 유형"
          initialValue="cash"
          rules={[{ required: true, message: "계정 유형을 선택하세요" }]}
          style={itemStyle}
        >
          <Select options={TYPE_OPTIONS} style={{ width: wide ? 150 : "100%" }} aria-label="계정 유형" />
        </Form.Item>
      )}
      <Form.Item name="isDebt" hidden initialValue={isDebt}>
        <Input />
      </Form.Item>
    </Form>
  );
}
