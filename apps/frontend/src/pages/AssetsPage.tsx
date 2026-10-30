import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Form, Grid, Input, InputNumber, Popconfirm, Select, Space, Tag, Typography, type FormInstance } from "antd";
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
import { getPortfolio, type Portfolio } from "../api/investmentsApi";
import { clearInflight } from "../api/client";
import { clearToken } from "../auth/authStore";
import { formatKrwExact } from "../utils/formatters";

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
 * 스프린트 2 #21: §31 자산 화면의 React 이관.
 * - §31.1: 합계·구성비는 저장하지 않는다 — 행에서 매번 계산한다.
 * - §31.2: 금융자산·부채·투자금 행은 편집 가능. 자동이체·부가세는 지출 도메인의
 *   단일 출처라 이 화면에서 편집하지 않는다(읽기 전용 자리 표시).
 * - 상태 4종은 StateBlock 단일 구현체를 재사용한다(§35 화면마다 다른 스피너 금지).
 */
export function AssetsPage({ onBack, onOpenInvestments, onOpenExpenses, onOpenSettings }: AssetsPageProps) {
  const screens = Grid.useBreakpoint();
  // §35 중단점: md 미만은 표 대신 카드형 리스트 — 4열 표는 좁은 폭에서 읽을 수 없다
  const wide = Boolean(screens.md);

  const [rows, setRows] = useState<AssetAccountRow[] | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [status, setStatus] = useState<SurfaceStatus>("loading");
  const [errorText, setErrorText] = useState("");
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form] = Form.useForm<UpsertPayload>();
  const mountedRef = useRef(false);

  const load = useCallback(() => {
    clearInflight(); // 앞선 요청의 dedupe 잔여를 비우고 새로 읽는다
    setStatus("loading");
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
  const liabilities = rows?.filter((r) => r.isDebt) ?? [];
  const investTotals = new Map((portfolio?.accounts ?? []).map((a) => [a.accountId, a.totalValue]));
  /** §54.3: invest 행은 예수금이 아니라 계좌 총액(예수금+평가액)을 보여 준다. */
  const displayValue = (row: AssetAccountRow) =>
    row.accountType === "invest" ? investTotals.get(row.id) ?? row.balance : row.balance;
  const totalAssets = assets.reduce((acc, r) => acc + displayValue(r), 0);
  const totalLiabilities = liabilities.reduce((acc, r) => acc + r.balance, 0);

  const beginCreate = () => {
    setEditingId("new");
    form.setFieldsValue({ accountType: "cash", name: "", institutionName: "", balance: 0, isDebt: false });
  };

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

  const renderRow = (row: AssetAccountRow, debt: boolean) => {
    if (editingId === row.id) {
      return wide ? (
        <tr key={row.id}>
          {/* 열이 5개다(이름·유형·기관·잔액·액션) — 4 로 두면 표가 어긋난다. */}
          <td colSpan={5}>
            <EditForm form={form} isDebt={debt} wide={wide} />
            <Space style={{ marginTop: 8 }}>
              <Button type="primary" onClick={saveEdit} loading={busy}>저장</Button>
              <Button onClick={cancelEdit} disabled={busy}>취소</Button>
            </Space>
          </td>
        </tr>
      ) : (
        <MobileListCardItem key={row.id}>
          <EditForm form={form} isDebt={debt} wide={wide} />
          <MobileListCardActions>
            <Button type="primary" onClick={saveEdit} loading={busy}>저장</Button>
            <Button onClick={cancelEdit} disabled={busy}>취소</Button>
          </MobileListCardActions>
        </MobileListCardItem>
      );
    }
    return wide ? (
      <tr key={row.id}>
        <td>{row.name}</td>
        <td>
          <Tag>{TYPE_LABELS[row.accountType]}</Tag>
        </td>
        <td>{row.institutionName || "—"}</td>
        <td style={{ textAlign: "right" }}>{formatKrwExact(displayValue(row))}</td>
        <td>
          {row.accountType === "invest" ? (
            <Button size="small" type="text" onClick={onOpenInvestments}>
              투자 화면에서 관리
            </Button>
          ) : (
            <Space>
              <Button size="small" type="text" onClick={() => beginEdit(row)}>편집</Button>
              <Popconfirm title="이 행을 삭제할까요?" onConfirm={() => void removeRow(row.id)}>
                <Button size="small" type="text" danger>삭제</Button>
              </Popconfirm>
            </Space>
          )}
        </td>
      </tr>
    ) : (
      <MobileListCardItem key={row.id}>
        <MobileListCardHeader title={row.name} value={`${formatKrwExact(displayValue(row))}`} />
        <MobileListCardMeta>
          {TYPE_LABELS[row.accountType]}
          {row.institutionName ? ` · ${row.institutionName}` : ""}
        </MobileListCardMeta>
        <MobileListCardActions>
          {row.accountType === "invest" ? (
            <Button size="small" type="text" onClick={onOpenInvestments}>
              투자 화면에서 관리
            </Button>
          ) : (
            <Space>
              <Button size="small" type="text" onClick={() => beginEdit(row)}>편집</Button>
              <Popconfirm title="이 행을 삭제할까요?" onConfirm={() => void removeRow(row.id)}>
                <Button size="small" type="text" danger>삭제</Button>
              </Popconfirm>
            </Space>
          )}
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
      {/* 이슈 #70: 페이지 h1 은 정확히 1개. 섹션(금융자산·부채 등)은 h2. */}
      <Typography.Title level={1} id="h-assets-page" style={{ fontSize: 24, margin: 0, marginBottom: 16 }}>
        자산
      </Typography.Title>
      {/* §54.1: 자산의 하위 화면 탭 — 전역 nav 는 4개를 유지한다. */}
      <nav aria-label="자산 하위 화면" style={{ marginBottom: 16 }}>
        <Space size={4}>
          <Button
            type="link"
            aria-label="자산 탭"
            aria-current="page"
            style={{ paddingInline: 8, fontWeight: 700, color: "var(--af-foreground)" }}
          >
            자산
          </Button>
          <Button type="link" aria-label="투자 탭" onClick={onOpenInvestments} style={{ paddingInline: 8 }}>
            투자
          </Button>
        </Space>
      </nav>
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
          <Typography.Title level={2} id="h-assets" style={{ fontSize: 16, margin: 0 }}>금융자산</Typography.Title>
          <Button onClick={beginCreate} disabled={editingId !== null}>+ 자산 추가</Button>
        </div>
        <Card>
          <StateBlock status={status} onRetry={load} errorText={errorText} emptyText="자산 행이 없습니다 — '+ 자산 추가'로 시작하세요">
            {editingId === "new" && debtFormOpen === false ? (
              <div style={{ marginBottom: 12 }}>
                <EditForm form={form} isDebt={false} wide={wide} />
                <Space style={{ marginTop: 8 }}>
                  <Button type="primary" onClick={saveEdit} loading={busy}>저장</Button>
                  <Button onClick={cancelEdit} disabled={busy}>취소</Button>
                </Space>
              </div>
            ) : null}
            {wide ? (
              <table aria-labelledby="h-assets" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ textAlign: "left", paddingBottom: 8 }}>이름</th>
                    <th scope="col" style={{ textAlign: "left", paddingBottom: 8, width: 110 }}>계정 유형</th>
                    <th scope="col" style={{ textAlign: "left", paddingBottom: 8 }}>기관</th>
                    <th scope="col" style={{ textAlign: "right", paddingBottom: 8 }}>잔액</th>
                    <th scope="col" style={{ width: 120 }} />
                  </tr>
                </thead>
                <tbody>{assets.map((r) => renderRow(r, false))}</tbody>
              </table>
            ) : (
              <div>{assets.map((r) => renderRow(r, false))}</div>
            )}
            <AssetTotals assets={assets} total={totalAssets} valueOf={displayValue} />
          </StateBlock>
        </Card>
      </section>

      <section aria-labelledby="h-liab" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <Typography.Title level={2} id="h-liab" style={{ fontSize: 16, margin: 0 }}>부채</Typography.Title>
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
                <EditForm form={form} isDebt wide={wide} />
                <Space style={{ marginTop: 8 }}>
                  <Button type="primary" onClick={saveEdit} loading={busy}>저장</Button>
                  <Button onClick={cancelEdit} disabled={busy}>취소</Button>
                </Space>
              </div>
            ) : null}
            {liabilities.length === 0 ? (
              <Typography.Text type="secondary">부채가 비어 있는 것은 정상이다 (§31.4)</Typography.Text>
            ) : wide ? (
              <table aria-labelledby="h-liab" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ textAlign: "left", paddingBottom: 8 }}>이름</th>
                    <th scope="col" style={{ textAlign: "left", paddingBottom: 8 }}>기관</th>
                    <th scope="col" style={{ textAlign: "right", paddingBottom: 8 }}>잔액</th>
                    <th scope="col" style={{ width: 120 }} />
                  </tr>
                </thead>
                <tbody>{liabilities.map((r) => renderRow(r, true))}</tbody>
              </table>
            ) : (
              <div>{liabilities.map((r) => renderRow(r, true))}</div>
            )}
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              합계 {formatKrwExact(totalLiabilities)}
            </Typography.Paragraph>
          </StateBlock>
        </Card>
      </section>

      <section aria-labelledby="h-expense-owned" style={{ marginBottom: 24 }}>
        <Typography.Title level={2} id="h-expense-owned" style={{ fontSize: 16, margin: 0, marginBottom: 16 }}>
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

/**
 * 유형별 합계 + 총합계. §31.1 대로 저장하지 않고 행에서 매번 다시 센다.
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
    <div style={{ marginTop: 12 }}>
      <Space size={[16, 4]} wrap>
        {TYPE_ORDER.map((type) => {
          const sum = assets.filter((r) => r.accountType === type).reduce((acc, r) => acc + valueOf(r), 0);
          // exactOptionalPropertyTypes: type={undefined} 를 넘길 수 없다 —
          // 0원일 때만 secondary 를 붙이려고 스프레드를 쓴다.
          const tone = sum > 0 ? {} : { type: "secondary" as const };
          return (
            <Typography.Text key={type} {...tone}>
              {TYPE_LABELS[type]} {formatKrwExact(sum)}
            </Typography.Text>
          );
        })}
      </Space>
      <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
        합계 {formatKrwExact(total)} — 저장하지 않고 행에서 재계산한다 (§31.1)
      </Typography.Paragraph>
    </div>
  );
}

function EditForm({ form, isDebt, wide }: { form: FormInstance; isDebt: boolean; wide: boolean }) {
  /**
   * 모바일에서는 필드를 세로로 쌓아 길이를 맞추고, 줄 사이 갭을 12px 로 둔다.
   * 지출 화면의 편집 폼과 동일한 기준(§71 모바일 갭)을 따른다.
   */
  const itemStyle: React.CSSProperties = wide ? {} : { flex: "1 1 100%", minWidth: 0 };

  return (
    <Form form={form} layout="inline" style={{ display: "flex", flexWrap: "wrap", gap: wide ? "10px 12px" : "12px" }}>
      <Form.Item name="name" rules={[{ required: true, message: "이름을 입력하세요" }]} style={itemStyle}>
        <Input placeholder={isDebt ? "부채 이름" : "자산 이름"} style={{ width: wide ? 180 : "100%" }} />
      </Form.Item>
      <Form.Item name="institutionName" style={itemStyle}>
        <Input placeholder="기관 (선택)" style={{ width: wide ? 140 : "100%" }} />
      </Form.Item>
      <Form.Item name="balance" rules={[{ required: true, message: "잔액을 입력하세요" }]} style={itemStyle}>
        <InputNumber min={0} placeholder="잔액(원)" style={{ width: wide ? 160 : "100%" }} />
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
