import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
} from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Typography,
} from "antd";
import type { AssetAccountRow } from "../api/assetsApi";
import {
  FALLBACK_BANKS,
  isBankLink,
  linkBankAccount,
  listBankLinks,
  listBankOptions,
  syncBankAccount,
  unlinkBankAccount,
  type BankLink,
  type BankOption,
  type BankSyncResult,
} from "../api/bankApi";
import { ApiError } from "../api/client";
import { formatKrwExact } from "../utils/formatters";

/** 연결 목록의 상태. 자산 표 행 메뉴의 활성/비활성 근거로도 쓰인다. */
export type BankLinksState = "loading" | "ready" | "error";

/**
 * 자산 표 행 메뉴에서 은행 동작을 열기 위한 손잡이.
 *
 * 모달·API 구현은 이 섹션 하나만 갖는다 — 행 메뉴는 **같은 함수**를 부르고,
 * `listBankLinks()` 조회도 이 섹션의 마운트 1회뿐이다(중복 조회 금지).
 */
export interface BankLinkSectionHandle {
  openLink: (account: AssetAccountRow) => void;
  openSync: (account: AssetAccountRow) => void;
  unlink: (accountId: number) => void;
}

interface BankLinkSectionProps {
  /** 은행 동기화 대상 계좌 — 현금성(cash)·예적금(deposit)이면서 부채가 아닌 행만. */
  accounts: AssetAccountRow[];
  /**
   * 계정 목록이 확정됐는지(로딩 완료·조회 성공). false 인 동안에는
   * "현금성·예적금 계좌가 없습니다" 를 말하지 않는다 — 아직 모르는 것을
   * "없다"고 단정하면 계좌가 있는데도 추가하라고 시키는 셈이다.
   */
  accountsReady?: boolean;
  /** 동기화 성공 후 자산 목록을 다시 읽는다. */
  onSynced: () => void;
  /** 연결 목록·상태가 바뀔 때마다 올린다 — 자산 표 행 메뉴의 disabled 근거. */
  onLinksChanged?: (links: BankLink[], state: BankLinksState) => void;
  /** 모달이 닫힌 뒤(저장 성공 포함) 그 계좌의 행 메뉴로 포커스를 돌려주는 신호. */
  onModalClosed?: (accountId: number) => void;
}

interface LinkFormValues {
  bankCode: string;
  accountNumber: string;
  accountPassword: string;
  residentNumber: string;
}

interface SyncFormValues {
  accountPassword: string;
  residentNumber: string;
}

function digitsOnly(value: string | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** 사용자에게 보여 줄 오류 — 서버가 준 은행 사유(detail)를 우선한다. */
function messageOf(cause: unknown): string {
  if (cause instanceof ApiError) {
    return cause.detail?.trim() ? cause.detail : cause.message;
  }
  if (cause instanceof Error) return cause.message;
  return "요청에 실패했습니다.";
}

function bankLabelOf(link: BankLink, banks: BankOption[]): string {
  if (link.bankLabel) return link.bankLabel;
  return banks.find((bank) => bank.code === link.bankCode)?.label ?? link.bankCode;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * §61 은행 잔액 가져오기.
 *
 * 자산 표에 버튼을 흩뿌리지 않고 별도 섹션으로 둔다 — 계좌번호·비밀번호·생년월일을
 * 입력하는 흐름이라 표의 편집 동작과 섞이면 안 된다.
 *
 * 안전 규칙:
 * - 계좌 비밀번호·생년월일은 요청 본문에만 쓰고 화면 상태에서도 모달을 닫으면 비운다.
 * - 계좌번호는 서버가 암호화해 저장하고, 목록에는 마스킹된 값만 나온다.
 * - 실패는 숨기지 않는다. 은행 거절 사유(예: "계좌번호 오류")를 그대로 보여 준다.
 *
 * A7-1: 자산 행 `⋯` 메뉴도 이 섹션의 모달·해제 함수를 쓴다. 본문은 그대로 두고
 * ref 만 통과시키는 얇은 껍데기 — 모달 구현은 여전히 한 곳뿐이다.
 */
export const BankLinkSection = forwardRef<BankLinkSectionHandle, BankLinkSectionProps>(BankLinkSectionImpl);

function BankLinkSectionImpl(
  { accounts, accountsReady = true, onSynced, onLinksChanged, onModalClosed }: BankLinkSectionProps,
  ref: ForwardedRef<BankLinkSectionHandle>,
) {
  const [links, setLinks] = useState<BankLink[]>([]);
  const [banks, setBanks] = useState<BankOption[]>(FALLBACK_BANKS);
  /**
   * P3: 연결 목록의 상태. 로딩 중에 "연결 안 됨"을 먼저 그리면, 실제로는
   * 연결된 계좌에 "계좌 연결" 버튼이 잠깐 보인다(연결 상태를 잘못 말한다).
   */
  const [linksState, setLinksState] = useState<BankLinksState>("loading");
  const [linkOpen, setLinkOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [target, setTarget] = useState<AssetAccountRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [summary, setSummary] = useState<BankSyncResult | null>(null);
  const [linkForm] = Form.useForm<LinkFormValues>();
  const [syncForm] = Form.useForm<SyncFormValues>();
  const mountedRef = useRef(false);
  /**
   * A7-1: 모달을 연 주체가 **자산 행 `⋯` 메뉴**인지. 참일 때만 닫힘 후 그 행의
   * `⋯` 로 포커스를 옮긴다 — 섹션 버튼으로 열었으면 antd 기본 복귀(그 버튼)를
   * 그대로 둔다. 닫힘마다 한 번 쓰고 비운다(1회).
   */
  const returnFocusToRow = useRef(false);

  const refreshLinks = useCallback(() => {
    setLinksState("loading");
    listBankLinks()
      .then((rows) => {
        if (!mountedRef.current) return;
        // 다른 GET 응답이 섞여 오더라도(테스트 목업 등) 연결 행만 받는다.
        setLinks(Array.isArray(rows) ? rows.filter(isBankLink) : []);
        setLinksState("ready");
      })
      .catch(() => {
        if (!mountedRef.current) return;
        // 연결 목록은 보조 정보다 — 실패해도 자산 화면 전체를 막지 않는다.
        setLinksState("error");
      });
  }, []);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    refreshLinks();
    void listBankOptions().then((options) => {
      if (mountedRef.current) setBanks(options);
    });
  }, [refreshLinks]);

  const linkByAccount = useMemo(
    () => new Map(links.map((link) => [link.accountId, link])),
    [links],
  );

  const openLink = (account: AssetAccountRow, fromRow = false) => {
    /* A7-1: 모달을 닫은 뒤 포커스를 행 `⋯` 로 돌려줄지는 **연 주체**가 정한다.
       섹션 버튼으로 열었으면 지금처럼 그 버튼으로 돌아가야 한다(기존 동작 유지). */
    returnFocusToRow.current = fromRow;
    setTarget(account);
    setActionError("");
    setSummary(null);
    linkForm.resetFields();
    setLinkOpen(true);
  };

  const openSync = (account: AssetAccountRow, fromRow = false) => {
    returnFocusToRow.current = fromRow;
    setTarget(account);
    setActionError("");
    setSummary(null);
    syncForm.resetFields();
    setSyncOpen(true);
  };

  /**
   * A7-1: 닫힘이 끝났다고 알린다 — **행 메뉴에서 연 경우에만** 그 행 `⋯` 로
   * 포커스를 돌려달라는 신호다(1회). 닫힘 경로(Esc·×·바깥 클릭)와 저장 성공이
   * 모두 이 함수를 지나므로 여기 한 곳에서만 판단한다.
   *
   * 애니메이션 종료(`afterClose`)에 기대지 않는다 — jsdom 에서는 그 콜백이 오지
   * 않아 포커스 복귀가 테스트로 고정되지 않는다. 모달은 즉시 `open=false` 이므로
   * 포커스를 옮겨도 트랩에 걸리지 않는다.
   */
  const notifyClosed = () => {
    if (!returnFocusToRow.current) return;
    returnFocusToRow.current = false;
    if (target) onModalClosed?.(target.id);
  };

  const closeLink = () => {
    setLinkOpen(false);
    // 비밀번호·생년월일을 화면 상태에 남기지 않는다.
    linkForm.resetFields();
    setActionError("");
    notifyClosed();
  };

  const closeSync = () => {
    setSyncOpen(false);
    syncForm.resetFields();
    setActionError("");
    notifyClosed();
  };

  /**
   * 연결 목록을 바깥(자산 표 행 메뉴)에 알린다. 콜백은 ref 로 들고 있어
   * 부모가 인라인 함수를 넘겨도 이 효과가 무한히 다시 돌지 않는다.
   * `links`/`linksState` 가 실제로 바뀐 커밋에서만 한 번 돈다.
   */
  const notifyLinks = useRef(onLinksChanged);
  useEffect(() => {
    notifyLinks.current = onLinksChanged;
  });
  useEffect(() => {
    notifyLinks.current?.(links, linksState);
  }, [links, linksState]);

  const upsertLink = (link: BankLink) => {
    setLinks((prev) => {
      const next = prev.filter((row) => row.accountId !== link.accountId);
      next.push(link);
      return next.sort((a, b) => a.accountId - b.accountId);
    });
  };

  const submitLink = async (values: LinkFormValues) => {
    if (!target) return;
    setBusy(true);
    setActionError("");
    try {
      const result = await linkBankAccount(target.id, {
        bankCode: values.bankCode,
        accountNumber: digitsOnly(values.accountNumber),
        accountPassword: digitsOnly(values.accountPassword),
        residentNumber: digitsOnly(values.residentNumber),
        accountType: "personal",
      });
      upsertLink(result.link);
      setSummary(result.sync);
      setLinkOpen(false);
      linkForm.resetFields();
      notifyClosed();
      onSynced();
    } catch (cause) {
      setActionError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const submitSync = async (values: SyncFormValues) => {
    if (!target) return;
    setBusy(true);
    setActionError("");
    try {
      const result = await syncBankAccount(target.id, {
        accountPassword: digitsOnly(values.accountPassword),
        residentNumber: digitsOnly(values.residentNumber),
      });
      // 서버가 돌려준 동기화 시각과 잔액으로 연결 행을 갱신한다(추가 조회 없이).
      setLinks((prev) =>
        prev.map((link) =>
          link.accountId === result.accountId
            ? { ...link, lastSyncedAt: result.syncedAt, lastBalance: result.balance }
            : link,
        ),
      );
      setSummary(result);
      setSyncOpen(false);
      syncForm.resetFields();
      notifyClosed();
      onSynced();
    } catch (cause) {
      setActionError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (accountId: number) => {
    setBusy(true);
    setActionError("");
    try {
      await unlinkBankAccount(accountId);
      setLinks((prev) => prev.filter((link) => link.accountId !== accountId));
      setSummary(null);
    } catch (cause) {
      setActionError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  /**
   * A7-1: 자산 행 `⋯` 메뉴가 **같은** 모달·해제 함수를 열도록 노출한다.
   * 구현을 복제하지 않는다는 계약이 여기 걸려 있다 — 새 모달·새 API 호출을
   * 만들지 말고 이 세 함수를 부른다.
   */
  useImperativeHandle(ref, () => ({
    /* 행 메뉴 경로만 닫힘 후 포커스를 그 행 `⋯` 로 돌린다. */
    openLink: (account) => openLink(account, true),
    openSync: (account) => openSync(account, true),
    unlink,
  }));

  return (
    <section aria-labelledby="h-bank-sync" style={{ marginBottom: 24 }}>
      <Typography.Title level={2} id="h-bank-sync" style={{ fontSize: 18, margin: 0, marginBottom: 16 }}>
        은행 잔액 가져오기
      </Typography.Title>
      <Card>
        {/* P2: 자격증명 안내는 모달 안에 이미 있다 — 카드 문단은 1~2줄로 줄인다(중복 제거). */}
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          농협·국민·우리·기업은행의 빠른조회에 등록된 계좌만, 같은 계좌는 5분에 1회 조회합니다.
        </Typography.Paragraph>

        {linksState === "error" ? (
          <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
            은행 연결 정보를 불러오지 못했습니다. 자산 화면을 새로고침한 뒤 다시 시도해 주세요.
          </Typography.Paragraph>
        ) : null}

        {/*
         * P3: 계정 목록이 확정되기 전(로딩·조회 실패)에는 "계좌가 없습니다"를
         * 말하지 않는다. 화면은 은행 연결 상태와 무관하게 나머지를 그린다.
         */}
        {!accountsReady ? null : accounts.length === 0 ? (
          <Typography.Text type="secondary">
            현금성·예적금 계좌가 없습니다 — 위에서 계좌를 먼저 추가하세요.
          </Typography.Text>
        ) : (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {accounts.map((account) => {
              const link = linkByAccount.get(account.id);
              return (
                <div
                  key={account.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 12,
                    paddingTop: 12,
                    borderTop: "1px solid var(--af-border, rgba(0,0,0,0.06))",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    {/*
                     * 기존 자산 표와 같은 이름이 정확히 겹치지 않도록 항상 기관 또는 유형을
                     * 같은 문자열에 붙인다 — 화면 낭독기에서도 어느 계좌인지 분명해진다.
                     */}
                    <Typography.Text strong>
                      {`${account.name} · ${account.institutionName || (account.accountType === "deposit" ? "예적금" : "현금성")}`}
                    </Typography.Text>
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {linksState === "loading"
                          ? "연결 정보를 불러오는 중"
                          : linksState === "error"
                            ? "연결 정보를 확인할 수 없습니다"
                            : link
                              ? `${bankLabelOf(link, banks)} ${link.accountNumberMasked}${
                                  link.lastSyncedAt
                                    ? ` · 마지막 동기화 ${formatWhen(link.lastSyncedAt)}`
                                    : " · 동기화 전"
                                }`
                              : "연결 안 됨"}
                      </Typography.Text>
                    </div>
                  </div>
                  {/*
                   * 연결 상태를 모르는 동안(로딩·실패)에는 동작을 내지 않는다 —
                   * "계좌 연결"은 "연결 안 됨"을 전제한 버튼이다.
                   */}
                  {linksState !== "ready" ? null : (
                    <Space wrap>
                      {link ? (
                        <>
                          <Button onClick={() => openSync(account)}>잔액 가져오기</Button>
                          <Popconfirm
                            title="은행 연결을 해제할까요?"
                            description="잔액은 그대로 남고, 자동 조회만 끊깁니다."
                            onConfirm={() => void unlink(account.id)}
                          >
                            <Button type="text" danger>연결 해제</Button>
                          </Popconfirm>
                        </>
                      ) : (
                        <Button onClick={() => openLink(account)}>계좌 연결</Button>
                      )}
                    </Space>
                  )}
                </div>
              );
            })}
          </Space>
        )}

        {actionError && !linkOpen && !syncOpen ? (
          <Typography.Paragraph role="alert" type="danger" style={{ marginTop: 12, marginBottom: 0 }}>
            {actionError}
          </Typography.Paragraph>
        ) : null}

        {summary ? (
          <div aria-live="polite" style={{ marginTop: 16 }}>
            <Typography.Text>
              {banks.find((bank) => bank.code === summary.bankCode)?.label ?? summary.bankCode} 잔액{" "}
              <b>{formatKrwExact(summary.balance)}</b>
            </Typography.Text>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                최근 7일 거래 {summary.transactionCount}건
                {summary.latest
                  ? ` · 최근 ${summary.latest.date} ${summary.latest.displayName || summary.latest.description} ${formatKrwExact(summary.latest.amount)}`
                  : ""}
                {` · ${formatWhen(summary.syncedAt)} 기준`}
              </Typography.Text>
            </div>
          </div>
        ) : null}
      </Card>

      {/*
       * §93 모달 셸: 320px 에서도 footer 가 화면 안에 남도록 컨테이너를 flex 열로
       * 두고 body 만 스크롤한다. `styles.container` 는 antd 6 이름이다
       * (형제 구현 CompositionBasisModal 과 같은 값).
       */}
      <Modal
        /* §128 AS-05: 모달은 body 로 포털돼 화면 클래스(`.af-assets`)가 닿지 않는다.
           터치 컨트롤 44 를 이 루트 클래스로만 좁힌다(§125 `.af-modal-touch` 방식).
           투자 모달과 클래스를 나눠 두는 이유: `.ant-input` 규칙이 그쪽까지 번지지 않게. */
        rootClassName="af-bank-modal"
        open={linkOpen}
        title={target ? `${target.name} 은행 연결` : "은행 연결"}
        onCancel={closeLink}
        /* 닫힘 3경로(Esc·×·바깥 클릭)와 저장 성공이 모두 여기로 모인다 — 한 곳에서만
           그 행 `⋯` 로 포커스를 돌려준다(1회, §125 I-03 과 같은 규칙). */
        centered
        destroyOnHidden
        width="min(560px, calc(100vw - 24px))"
        okText="연결하고 잔액 가져오기"
        cancelText="취소"
        confirmLoading={busy}
        okButtonProps={{ type: "primary" }}
        onOk={() => void linkForm.submit()}
        styles={{
          container: {
            maxHeight: "calc(100dvh - 32px)",
            display: "flex",
            flexDirection: "column",
            padding: 0,
            overflow: "hidden",
          },
          /*
           * 컨테이너 padding 을 0 으로 두면 제목도 여백 없이 테두리에 붙는다 —
           * 제목만 따로 16px 들여 body(0 16px 12px)와 왼쪽을 맞춘다.
           */
          header: { padding: "16px 40px 8px 16px" },
          body: {
            overflowY: "auto",
            flex: "1 1 auto",
            minHeight: 0,
            padding: "0 16px 12px",
            overscrollBehavior: "contain",
          },
          footer: {
            margin: 0,
            flex: "0 0 auto",
            padding: "12px 16px calc(12px + var(--af-safe-bottom))",
            borderTop: "1px solid var(--af-border)",
          },
        }}
      >
        <Form form={linkForm} layout="vertical" onFinish={(values) => void submitLink(values)}>
          <Form.Item
            name="bankCode"
            label="은행"
            rules={[{ required: true, message: "은행을 선택하세요" }]}
          >
            <Select
              placeholder="은행 선택"
              options={banks.map((bank) => ({ value: bank.code, label: bank.label }))}
              aria-label="은행"
            />
          </Form.Item>
          <Form.Item
            name="accountNumber"
            label="계좌번호"
            rules={[
              { required: true, message: "계좌번호를 입력하세요" },
              {
                validator: (_, value: string) => {
                  const digits = digitsOnly(value);
                  return digits.length >= 6 && digits.length <= 20
                    ? Promise.resolve()
                    : Promise.reject(new Error("계좌번호는 숫자 6~20자리입니다"));
                },
              },
            ]}
          >
            <Input inputMode="numeric" autoComplete="off" placeholder="숫자만 (하이픈 허용)" />
          </Form.Item>
          <Form.Item
            name="accountPassword"
            label="계좌 비밀번호 (4자리)"
            rules={[
              { required: true, message: "계좌 비밀번호를 입력하세요" },
              {
                validator: (_, value: string) =>
                  digitsOnly(value).length === 4
                    ? Promise.resolve()
                    : Promise.reject(new Error("계좌 비밀번호는 숫자 4자리입니다")),
              },
            ]}
          >
            <Input.Password maxLength={4} inputMode="numeric" autoComplete="off" placeholder="4자리" />
          </Form.Item>
          <Form.Item
            name="residentNumber"
            label="생년월일 6자리"
            rules={[
              { required: true, message: "생년월일 6자리를 입력하세요" },
              {
                validator: (_, value: string) =>
                  digitsOnly(value).length === 6
                    ? Promise.resolve()
                    : Promise.reject(new Error("생년월일은 숫자 6자리입니다")),
              },
            ]}
          >
            <Input maxLength={6} inputMode="numeric" autoComplete="off" placeholder="YYMMDD" />
          </Form.Item>
        </Form>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
          계좌 비밀번호와 생년월일은 조회에만 쓰고 저장하지 않습니다. 모달을 닫으면 입력값도
          지워집니다.
        </Typography.Paragraph>
        {actionError ? (
          <Alert type="error" showIcon title="은행 연결에 실패했습니다" description={actionError} style={{ marginTop: 12 }} />
        ) : null}
      </Modal>

      <Modal
        rootClassName="af-bank-modal"
        open={syncOpen}
        title={target ? `${target.name} 잔액 가져오기` : "잔액 가져오기"}
        onCancel={closeSync}
        centered
        destroyOnHidden
        width="min(560px, calc(100vw - 24px))"
        okText="가져오기"
        cancelText="취소"
        confirmLoading={busy}
        okButtonProps={{ type: "primary" }}
        onOk={() => void syncForm.submit()}
        styles={{
          container: {
            maxHeight: "calc(100dvh - 32px)",
            display: "flex",
            flexDirection: "column",
            padding: 0,
            overflow: "hidden",
          },
          /*
           * 컨테이너 padding 을 0 으로 두면 제목도 여백 없이 테두리에 붙는다 —
           * 제목만 따로 16px 들여 body(0 16px 12px)와 왼쪽을 맞춘다.
           */
          header: { padding: "16px 40px 8px 16px" },
          body: {
            overflowY: "auto",
            flex: "1 1 auto",
            minHeight: 0,
            padding: "0 16px 12px",
            overscrollBehavior: "contain",
          },
          footer: {
            margin: 0,
            flex: "0 0 auto",
            padding: "12px 16px calc(12px + var(--af-safe-bottom))",
            borderTop: "1px solid var(--af-border)",
          },
        }}
      >
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          연결된 계좌번호로 최근 7일 거래와 현재 잔액을 조회합니다. 자산 화면의 잔액이 은행
          잔액으로 바뀝니다.
        </Typography.Paragraph>
        <Form form={syncForm} layout="vertical" onFinish={(values) => void submitSync(values)}>
          <Form.Item
            name="accountPassword"
            label="계좌 비밀번호 (4자리)"
            rules={[
              { required: true, message: "계좌 비밀번호를 입력하세요" },
              {
                validator: (_, value: string) =>
                  digitsOnly(value).length === 4
                    ? Promise.resolve()
                    : Promise.reject(new Error("계좌 비밀번호는 숫자 4자리입니다")),
              },
            ]}
          >
            <Input.Password maxLength={4} inputMode="numeric" autoComplete="off" placeholder="4자리" />
          </Form.Item>
          <Form.Item
            name="residentNumber"
            label="생년월일 6자리"
            rules={[
              { required: true, message: "생년월일 6자리를 입력하세요" },
              {
                validator: (_, value: string) =>
                  digitsOnly(value).length === 6
                    ? Promise.resolve()
                    : Promise.reject(new Error("생년월일은 숫자 6자리입니다")),
              },
            ]}
          >
            <Input maxLength={6} inputMode="numeric" autoComplete="off" placeholder="YYMMDD" />
          </Form.Item>
        </Form>
        {actionError ? (
          <Alert type="error" showIcon title="잔액을 가져오지 못했습니다" description={actionError} style={{ marginTop: 12 }} />
        ) : null}
      </Modal>
    </section>
  );
}
