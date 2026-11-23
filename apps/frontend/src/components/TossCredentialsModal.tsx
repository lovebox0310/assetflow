import { useCallback, useEffect, useState } from "react";
import { Button, Form, Input, Modal, Popconfirm, Select, Typography } from "antd";
import {
  deleteTossCredentials,
  diagnoseTossToken,
  getTossStatus,
  listTossAccounts,
  saveTossCredentials,
  testTossConnection,
  type TossAccountsResult,
} from "../api/investmentsApi";
import { ApiError } from "../api/client";
import { modalHeaderStyle } from "../theme/modalShell";

interface Props {
  accountId: number;
  accountName: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface TossFormValues {
  clientId: string;
  clientSecret: string;
  /** Select 는 accountSeq 를 문자열로, 폴백 Input 은 사용자가 적은 문자열 그대로 넘긴다. */
  tossAccountSeq?: string;
}

/** 백엔드·토스가 준 사유는 ApiError.detail 에 들어온다 — 일반 문구보다 우선한다. */
function describeTossError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.detail ?? e.message;
  return e instanceof Error ? e.message : fallback;
}

const IP_HELP =
  "토스증권 WTS → 설정 → Open API → 허용 IP 관리에 이 서버의 IP 를 등록해야 합니다. "
  + "미등록이면 403(ip-not-allowed) 이 발생합니다.";

/**
 * 이슈 #55 Stage 3 토스증권 자격증명 설정 모달.
 *
 * UX 는 `KisCredentialsModal`(§62.2 · §93 셸)과 같다 — 같은 width·헤더/본문/푸터 분리,
 * 같은 버튼 순서(삭제 · 연결 테스트 · 저장 · 취소), 저장 뒤 **자동 연결 테스트**가
 * 성공해야 닫힌다. 다른 점은 API 환경(Radio)이 없다는 것(토스는 실전/모의 구분 없음)과
 * CANO 대신 토스 계좌 식별자(accountSeq)를 고른다는 것뿐이다.
 *
 * 서버는 clientSecret 평문을 어떤 응답에도 담지 않으므로 저장된 키는 빈 칸으로 두고
 * "바꿀 때만 입력" 으로 안내한다(KIS 와 동일 — 마스킹 문자열을 저장하면 키가 깨진다).
 */
export function TossCredentialsModal({ accountId, accountName, open, onClose, onSaved }: Props) {
  const [form] = Form.useForm<TossFormValues>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [exists, setExists] = useState(false);
  const [testing, setTesting] = useState(false);
  /** §69 와 같은 이유로 결과 문구를 모달 안에 남긴다 — 실패 사유를 바로 보여 준다. */
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  /** 계좌 목록(실패도 200 + error). null 이면 아직 부르지 않았다. */
  const [accounts, setAccounts] = useState<TossAccountsResult | null>(null);
  const [accountsLoading, setAccountsLoading] = useState(false);
  /** 토큰 진단(#55) — 403 사유를 화면에서 확인한다. Console 없이 폰에서도 된다. */
  const [diag, setDiag] = useState<import("../api/investmentsApi").TossTokenDiagnosis | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const refreshAccounts = useCallback(async () => {
    setAccountsLoading(true);
    setAccounts(null);
    try {
      setAccounts(await listTossAccounts());
    } catch (e) {
      setAccounts({
        accounts: [],
        error: describeTossError(e, "토스 계좌 목록을 불러오지 못했습니다"),
      });
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError("");
    setExists(false);
    setTestResult(null);
    setAccounts(null);
    form.resetFields();
    setLoading(true);
    getTossStatus()
      .then((data) => {
        setExists(data.configured);
        // 키가 없으면 목록 조회는 항상 "자격증명이 없습니다" 만 돌려준다 — 부르지 않는다.
        if (data.configured) void refreshAccounts();
      })
      .catch(() => {
        // 상태를 못 읽으면 KIS 와 같이 신규 입력으로 연다.
      })
      .finally(() => setLoading(false));
  }, [open, form, refreshAccounts]);

  /**
   * 저장된 키로 실제 토스 호출을 한 번 해 본다. 성공하면 닫고, 실패하면 토스가 준
   * 사유(403 ip-not-allowed 등)를 그대로 남긴다 — "저장됨" 만으로 끝내지 않는다.
   */
  const runTest = async (): Promise<boolean> => {
    setTesting(true);
    setTestResult(null);
    try {
      await testTossConnection();
      setTestResult({ ok: true, message: "연결되었습니다" });
      return true;
    } catch (e) {
      setTestResult({
        ok: false,
        message: describeTossError(e, "토스 연결 테스트에 실패했습니다"),
      });
      return false;
    } finally {
      setTesting(false);
    }
  };

  /**
   * 토큰 발급만 시도해 실패 사유를 본다(#55). `/test` 는 예외만 던져서
   * "허용 IP 미등록"과 "자격증명 오류"를 구분할 수 없었다.
   */
  const runDiagnose = async () => {
    setDiagLoading(true);
    setDiag(null);
    try {
      setDiag(await diagnoseTossToken());
    } catch (e) {
      setDiag({
        status: 0,
        code: null,
        error: describeTossError(e, "토스 토큰 진단에 실패했습니다"),
        body: null,
      });
    } finally {
      setDiagLoading(false);
    }
  };

  const handleSave = async (values: TossFormValues) => {
    setSaving(true);
    setError("");
    setTestResult(null);
    try {
      const seq = values.tossAccountSeq?.trim();
      const status = await saveTossCredentials({
        accountId,
        clientId: (values.clientId ?? "").trim(),
        clientSecret: (values.clientSecret ?? "").trim(),
        // 백엔드가 String 으로 받는다 — Select·직접 입력 모두 문자열 그대로 보낸다.
        // 빈 값은 null(동기화가 계좌 1개일 때 자동 선택).
        tossAccountSeq: seq ? seq : null,
      });
      setExists(status.configured);
      onSaved();
      // 저장만 하고 닫으면 키·IP 가 틀렸는지 알 수 없다 — 실제로 한 번 호출해 보고
      // 성공했을 때만 닫는다(KIS 와 같은 순서).
      setSaving(false);
      const ok = await runTest();
      if (ok) onClose();
    } catch (e) {
      setError(describeTossError(e, "토스 자격증명을 저장하지 못했습니다"));
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setError("");
    try {
      await deleteTossCredentials();
      form.resetFields();
      setExists(false);
      setTestResult(null);
      setAccounts(null);
      onSaved();
    } catch (e) {
      setError(describeTossError(e, "토스 연동을 해제하지 못했습니다"));
    } finally {
      setSaving(false);
    }
  };

  const accountOptions = accounts?.accounts ?? [];
  /*
   * 목록을 못 불러왔거나(실패·빈 목록) 키가 없어 부르지 않았으면 직접 입력.
   * Select 의 값은 문자열로 맞춘다 — 폴백 Input 과 같은 폼 필드를 쓴다.
   */
  const showSelect = accountOptions.length > 0;

  return (
    <Modal
      title={`토스 연동 설정 · ${accountName}`}
      open={open}
      onCancel={onClose}
      centered
      destroyOnHidden
      /* §125 I-04: 터치 44 스코프. 모달은 body 로 포털되므로 화면 클래스
       * (`.af-investments`)로 잡을 수 없다 — 이 루트 클래스로만 좁힌다. */
      rootClassName="af-modal-touch af-toss-modal"
      width="min(560px, calc(100vw - 24px))"
      /*
       * §93 모달 셸: 컨테이너가 높이를 제한하고 본문만 스크롤한다.
       * 헤더/본문/푸터 분리는 320 에서 버튼이 본문과 함께 스크롤돼 사라지던
       * 문제를 막는다(저장 버튼은 항상 보인다). 색은 기존 토큰만 쓴다.
       */
      styles={{
        container: {
          maxHeight: "calc(100dvh - 32px)",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
        },
        // I-02: 헤더는 공통 셸을 쓴다 — 오른쪽에 닫기 버튼 자리를 비워 둔다.
        header: modalHeaderStyle,
        body: {
          overflowY: "auto",
          flex: "1 1 auto",
          minHeight: 0,
          overscrollBehavior: "contain",
          padding: "12px 16px 12px",
        },
        footer: {
          margin: 0,
          flex: "0 0 auto",
          borderTop: "1px solid var(--af-border)",
          padding: "12px 16px calc(12px + var(--af-safe-bottom))",
        },
      }}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          {exists && (
            <Popconfirm
              title="토스 연동을 해제할까요?"
              description="저장된 자격증명이 삭제됩니다. 동기화한 보유종목은 그대로 남습니다."
              okText="해제"
              cancelText="취소"
              onConfirm={() => void handleDelete()}
            >
              <Button danger loading={saving} disabled={loading}>
                삭제
              </Button>
            </Popconfirm>
          )}
          {/* KIS 와 달리 항상 노출한다 — 저장 전에 "키가 맞나" 를 먼저 확인할 수 있고,
              자격증명이 없으면 서버가 404 사유를 그대로 돌려준다. */}
          <Button onClick={() => void runTest()} loading={testing} disabled={saving || loading}>
            연결 테스트
          </Button>
          <Button
            type="primary"
            onClick={() => form.submit()}
            loading={saving}
            disabled={loading || testing}
          >
            저장
          </Button>
          <Button onClick={onClose} disabled={saving}>
            취소
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" onFinish={handleSave} disabled={loading}>
        {/*
         * Enter 제출 경로 유지: footer 의 버튼은 폼 밖에 있어 네이티브 제출 버튼이 아니다.
         * 제출 버튼이 없으면 입력이 둘 이상일 때 브라우저가 implicit submission 을 하지 않는다.
         */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        <Form.Item
          name="clientId"
          label="Client ID"
          rules={[{ required: !exists, message: "Client ID를 입력하세요" }]}
          extra={
            <>
              {exists ? (
                <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                  키가 저장돼 있습니다. 바꿀 때만 입력하세요.
                </Typography.Text>
              ) : null}
              <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                {IP_HELP}
              </Typography.Text>
            </>
          }
        >
          <Input
            placeholder={exists ? "변경할 때만 입력" : "토스 Client ID"}
            autoComplete="off"
          />
        </Form.Item>

        <Form.Item
          name="clientSecret"
          label="Client Secret"
          rules={[{ required: !exists, message: "Client Secret을 입력하세요" }]}
        >
          <Input.Password
            placeholder={exists ? "변경할 때만 입력" : "토스 Client Secret"}
            autoComplete="new-password"
          />
        </Form.Item>

        {showSelect ? (
          <Form.Item
            name="tossAccountSeq"
            label="토스 계좌"
            extra={
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                계좌번호가 아니라 토스 계좌 식별자(accountSeq)입니다. 비워 두면 계좌가
                1개일 때 동기화가 자동 선택합니다.
              </Typography.Text>
            }
          >
            <Select
              allowClear
              placeholder="비우면 계좌가 1개일 때 자동 선택"
              options={accountOptions.map((account) => ({
                value: String(account.accountSeq),
                label: account.accountNo
                  ? `${account.accountNo} (${account.accountType})`
                  : String(account.accountSeq),
              }))}
            />
          </Form.Item>
        ) : (
          <Form.Item
            name="tossAccountSeq"
            label="토스 계좌"
            extra={
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {accounts?.error
                  ? `계좌 목록을 불러오지 못했습니다(${accounts.error}). 토스 계좌 번호(accountSeq)를 직접 입력하세요.`
                  : accountsLoading
                    ? "계좌 목록을 불러오는 중... 실패하면 직접 입력할 수 있습니다."
                    : "계좌번호가 아니라 토스 계좌 식별자(accountSeq)입니다. 비워 두면 계좌가 1개일 때 동기화가 자동 선택합니다."}
              </Typography.Text>
            }
          >
            <Input
              placeholder="예: 42"
              inputMode="numeric"
              aria-label="토스 계좌 식별자(accountSeq)"
            />
          </Form.Item>
        )}

        {testResult && (
          <Typography.Paragraph
            role={testResult.ok ? "status" : "alert"}
            type={testResult.ok ? "success" : "danger"}
            style={{ marginTop: 8, marginBottom: 0 }}
          >
            {testResult.message}
          </Typography.Paragraph>
        )}

        {error && (
          <Typography.Paragraph type="danger" style={{ marginTop: 8 }} aria-live="assertive">
            {error}
          </Typography.Paragraph>
        )}
      </Form>
    </Modal>
  );
}
