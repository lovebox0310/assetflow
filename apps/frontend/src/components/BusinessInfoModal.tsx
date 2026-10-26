import { useEffect, useState } from "react";
import { Alert, Button, Descriptions, Modal, Space, Spin, Typography } from "antd";
import { ApiError } from "../api/client";
import {
  biznoUrl,
  formatBusinessNo,
  getBusinessInfo,
  type BusinessInfo,
} from "../api/businessInfoApi";

interface BusinessInfoModalProps {
  open: boolean;
  /** 조회할 사업자번호(하이픈 허용). */
  businessNo: string | null;
  /** 모달 제목에 같이 보여줄 가맹점명. */
  merchantName?: string | undefined;
  onClose: () => void;
}

function text(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

/** 라벨:값 목록 — 값이 있는 항목만 보여준다. */
function descriptionItems(info: BusinessInfo): { key: string; label: string; children: React.ReactNode }[] {
  const rows: { key: string; label: string; value: string }[] = [
    { key: "businessNo", label: "사업자등록번호", value: formatBusinessNo(info.businessNo) },
    { key: "companyName", label: "상호", value: text(info.companyName) },
    { key: "ceoName", label: "대표자명", value: text(info.ceoName) },
    { key: "bizType", label: "업태", value: text(info.bizType) },
    { key: "bizItem", label: "종목", value: text(info.bizItem) },
    { key: "mainProduct", label: "주요제품", value: text(info.mainProduct) },
    { key: "businessStatus", label: "사업자 상태", value: text(info.businessStatus) },
    { key: "taxType", label: "과세유형", value: text(info.taxType) },
    { key: "corporateType", label: "법인구분", value: text(info.corporateType) },
    { key: "corporateForm", label: "법인형태", value: text(info.corporateForm) },
    { key: "companySize", label: "기업규모", value: text(info.companySize) },
    { key: "headquarters", label: "본사/지사", value: text(info.headquarters) },
    { key: "phone", label: "전화번호", value: text(info.phone) },
    { key: "fax", label: "팩스번호", value: text(info.fax) },
    { key: "email", label: "회사이메일", value: text(info.email) },
    { key: "homepage", label: "홈페이지", value: text(info.homepage) },
    { key: "irHomepage", label: "IR홈페이지", value: text(info.irHomepage) },
    { key: "zipCode", label: "우편번호", value: text(info.zipCode) },
    { key: "address", label: "회사주소", value: text(info.address) },
    { key: "taxOffice", label: "관할세무서", value: text(info.taxOffice) },
    { key: "corporateRegNo", label: "법인등록번호", value: text(info.corporateRegNo) },
    { key: "employees", label: "종업원수", value: info.employees ? `${info.employees}명` : "" },
    { key: "registeredAt", label: "등록일", value: text(info.registeredAt) },
    { key: "fiscalMonth", label: "결산월", value: info.fiscalMonth ? `${info.fiscalMonth}월` : "" },
  ];
  return rows
    .filter((row) => row.value.trim() !== "")
    .map((row) => ({
      key: row.key,
      label: row.label,
      children:
        row.key === "address" ? (
          <Typography.Text style={{ whiteSpace: "pre-wrap" }}>{row.value}</Typography.Text>
        ) : (
          <Typography.Text>{row.value}</Typography.Text>
        ),
    }));
}

/**
 * 사업자번호를 누르면 뜨는 사업자 정보 모달.
 * 화면 이동 없이 백엔드가 캐시/수집한 값을 보여준다. 원문은 새 탭 링크로만 연다.
 */
export function BusinessInfoModal({ open, businessNo, merchantName, onClose }: BusinessInfoModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<BusinessInfo | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !businessNo) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setInfo(null);
    getBusinessInfo(businessNo)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.code === "BIZNO_BUSY") {
          setError("bizno.net 접속이 지연되고 있습니다. 잠시 후 다시 조회해 주세요.");
        } else if (cause instanceof ApiError && cause.kind === "client") {
          setError("사업자번호를 확인해 주세요.");
        } else {
          setError("사업자 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, businessNo, attempt]);

  const title = merchantName ? `${merchantName} 사업자 정보` : "사업자 정보";
  const items = info ? descriptionItems(info) : [];

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      width={640}
      destroyOnHidden
      footer={[
        <Button key="retry" onClick={() => setAttempt((n) => n + 1)} disabled={!businessNo} loading={loading}>
          다시 조회
        </Button>,
        <Button
          key="source"
          href={biznoUrl(businessNo ?? "")}
          target="_blank"
          rel="noreferrer"
          disabled={!businessNo}
        >
          bizno.net에서 열기
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          닫기
        </Button>,
      ]}
    >
      <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
        {loading ? (
          <Space style={{ padding: "24px 0", width: "100%", justifyContent: "center" }}>
            <Spin tip="사업자 정보를 조회하는 중…">
              <div style={{ minHeight: 60, minWidth: 200 }} />
            </Spin>
          </Space>
        ) : null}

        {!loading && error ? <Alert type="warning" showIcon message={error} /> : null}

        {!loading && info ? (
          <>
            <Descriptions
              size="small"
              bordered
              column={1}
              items={items.length > 0 ? items : [{ key: "empty", label: "안내", children: "조회된 정보가 없습니다." }]}
            />
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
              출처: {info.source ?? "bizno.net"}
              {info.cached ? " (저장된 정보)" : " (새로 조회)"}
              {info.fetchedAt ? ` · ${info.fetchedAt.slice(0, 10)} 조회` : ""}
            </Typography.Paragraph>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
