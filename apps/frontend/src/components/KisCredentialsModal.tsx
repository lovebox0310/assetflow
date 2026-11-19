import { useEffect, useState } from "react";
import { Button, Form, Input, Modal, Radio, Space, Typography } from "antd";
import {
  deleteKisCredentials,
  getKisCredentials,
  saveKisCredentials,
  testKisCredentials,
  type KisConnectionTest,
  type KisCredentials,
} from "../api/investmentsApi";
import { modalHeaderStyle } from "../theme/modalShell";

interface Props {
  accountId: number;
  accountName: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const MOCK_URL = "https://openapivts.koreainvestment.com:29443";
const REAL_URL = "https://openapi.koreainvestment.com:9443";
/**
 * 기본값은 **실전**으로 둔다. 모의투자를 기본으로 두면 실계좌번호(CANO)와
 * 모의투자 앱키가 섞여 "처리계좌 ID와 사용자정보가 상이" 로 잔고가 0 이 된다.
 * 전역 KIS_BASE_URL 도 실전 서버다(application.yml).
 */
const DEFAULT_URL = REAL_URL;

/**
 * §62.2 한국투자증권 계좌별 API 자격증명 설정 모달.
 */
export function KisCredentialsModal({ accountId, accountName, open, onClose, onSaved }: Props) {
  const [form] = Form.useForm<KisCredentials>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [exists, setExists] = useState(false);
  const [testing, setTesting] = useState(false);
  /** §69 저장 직후·수동 테스트 결과. 실패 사유를 모달 안에서 바로 보여 준다. */
  const [testResult, setTestResult] = useState<KisConnectionTest | null>(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    setExists(false);
    setTestResult(null);
    form.resetFields();
    setLoading(true);
    getKisCredentials(accountId)
      .then((data) => {
        setExists(true);
        form.setFieldsValue({
          // GET 응답의 키는 마스킹돼 있다. 빈 값으로 두고 "바꿀 때만 입력" 으로
          // 안내한다 — 마스킹 문자열을 그대로 저장하면 자격증명이 깨진다.
          appKey: "",
          appSecret: "",
          baseUrl: data.baseUrl || DEFAULT_URL,
          cano: data.cano,
          acntPrdtCd: data.acntPrdtCd,
        });
      })
      .catch(() => {
        // 없으면 기본값으로 신규 입력
        form.setFieldsValue({ baseUrl: DEFAULT_URL, acntPrdtCd: "01" });
      })
      .finally(() => setLoading(false));
  }, [open, accountId, form]);

  /**
   * §69 저장된 키로 실제 KIS 호출을 한 번 해 본다. 성공하면 예수금까지 보여 주고,
   * 실패하면 KIS가 준 사유(예: EGW00002)를 그대로 보여 준다 — "변화 없음" 대신 원인.
   */
  const runTest = async (): Promise<boolean> => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testKisCredentials(accountId);
      setTestResult(result);
      return result.ok;
    } catch (e) {
      setTestResult({
        ok: false,
        cash: null,
        message: e instanceof Error ? e.message : "연결 테스트에 실패했습니다",
      });
      return false;
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (values: KisCredentials) => {
    setSaving(true);
    setError("");
    setTestResult(null);
    try {
      await saveKisCredentials(accountId, {
        appKey: values.appKey,
        appSecret: values.appSecret,
        baseUrl: values.baseUrl,
        cano: values.cano,
        acntPrdtCd: values.acntPrdtCd,
      });
      setExists(true);
      onSaved();
      // 저장만 하고 닫으면 키가 틀렸는지 알 수 없다. 실제로 한 번 호출해 보고
      // 성공했을 때만 닫는다.
      setSaving(false);
      const ok = await runTest();
      if (ok) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setError("");
    try {
      await deleteKisCredentials(accountId);
      form.resetFields();
      form.setFieldsValue({ baseUrl: DEFAULT_URL, acntPrdtCd: "01" });
      setExists(false);
      setTestResult(null);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제하지 못했습니다");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`KIS 연동 설정 · ${accountName}`}
      open={open}
      onCancel={onClose}
      centered
      destroyOnHidden
      /* §125 I-04: 터치 44 스코프. 모달은 body 로 포털되므로 화면 클래스
       * (`.af-investments`)로 잡을 수 없다 — 이 루트 클래스로만 좁힌다. */
      rootClassName="af-modal-touch"
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
            <Button danger onClick={() => void handleDelete()} loading={saving} disabled={loading}>
              삭제
            </Button>
          )}
          {exists && (
            <Button onClick={() => void runTest()} loading={testing} disabled={saving || loading}>
              연결 테스트
            </Button>
          )}
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
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        disabled={loading}
      >
        {/*
         * Enter 제출 경로 유지: footer 의 버튼은 폼 밖에 있어 네이티브 제출 버튼이 아니다.
         * 제출 버튼이 없으면 입력이 둘 이상일 때 브라우저가 implicit submission 을 하지 않는다.
         */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        <Form.Item
          name="baseUrl"
          label="API 환경"
          rules={[{ required: true }]}
          extra={
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              실전 계좌번호(CANO)에는 실전 앱키 + 실전 환경을, 모의투자 계좌에는 모의투자
              앱키 + 모의투자 환경을 짝지어야 합니다. 둘이 섞이면 KIS가 잔고 조회를
              거부하고 잔액이 갱신되지 않습니다.
            </Typography.Text>
          }
        >
          <Radio.Group>
            <Radio value={REAL_URL}>실전</Radio>
            <Radio value={MOCK_URL}>모의투자</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="appKey"
          label="App Key"
          rules={[{ required: !exists, message: "App Key를 입력하세요" }]}
          extra={
            exists ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                키가 저장돼 있습니다. 바꿀 때만 입력하세요.
              </Typography.Text>
            ) : undefined
          }
        >
          <Input placeholder={exists ? "변경할 때만 입력" : "KIS App Key"} />
        </Form.Item>

        <Form.Item
          name="appSecret"
          label="App Secret"
          rules={[{ required: !exists, message: "App Secret을 입력하세요" }]}
        >
          <Input.Password placeholder={exists ? "변경할 때만 입력" : "KIS App Secret"} />
        </Form.Item>

        <Space align="start" wrap style={{ width: "100%" }}>
          <Form.Item
            name="cano"
            label="CANO"
            rules={[{ required: true, message: "CANO를 입력하세요" }]}
            style={{ width: 180, maxWidth: "100%" }}
          >
            <Input placeholder="계좌번호 앞 8자리" maxLength={8} />
          </Form.Item>

          <Form.Item
            name="acntPrdtCd"
            label="상품코드"
            rules={[{ required: true, message: "상품코드를 입력하세요" }]}
            style={{ width: 160, maxWidth: "100%" }}
            extra={
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                종합 01 · 개인연금 22 · 퇴직연금(IRP) 29. IRP는 29로 입력해야 예수금이
                조회됩니다.
                <br />
                개인연금(22)은 주식잔고로 조회하며, 안 되면 퇴직연금 조회를 시도합니다.
                모의투자에는 연금 API가 없습니다.
              </Typography.Text>
            }
          >
            <Input placeholder="예: 01" maxLength={4} />
          </Form.Item>
        </Space>

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
          <Typography.Paragraph type="danger" style={{ marginTop: 8 }}>
            {error}
          </Typography.Paragraph>
        )}
      </Form>
    </Modal>
  );
}
