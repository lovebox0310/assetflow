import { apiFetch } from "./client";

/** 사업자번호 조회 결과 (bizno.net 캐시). */
export interface BusinessInfo {
  businessNo: string;
  companyName?: string | null;
  ceoName?: string | null;
  bizType?: string | null;
  bizItem?: string | null;
  mainProduct?: string | null;
  phone?: string | null;
  fax?: string | null;
  companySize?: string | null;
  corporateType?: string | null;
  taxType?: string | null;
  headquarters?: string | null;
  corporateForm?: string | null;
  registeredAt?: string | null;
  homepage?: string | null;
  irHomepage?: string | null;
  email?: string | null;
  businessStatus?: string | null;
  corporateRegNo?: string | null;
  employees?: number | null;
  zipCode?: string | null;
  address?: string | null;
  taxOffice?: string | null;
  fiscalMonth?: number | null;
  source?: string | null;
  fetchedAt?: string | null;
  /** DB 캐시에서 돌려줬는지. */
  cached?: boolean;
}

/**
 * 사업자번호로 사업자 정보를 조회한다.
 * 서버가 bizno.net 을 읽어 DB 에 캐시한다. 혼잡하면 ApiError(code="BIZNO_BUSY") 가 난다.
 */
export function getBusinessInfo(businessNo: string): Promise<BusinessInfo> {
  return apiFetch<BusinessInfo>(`/api/v1/assets/business-info/${encodeURIComponent(businessNo)}`);
}

/** 사업자번호 표기: 10자리면 000-00-00000, 아니면 원본. */
export function formatBusinessNo(value?: string | null): string {
  if (!value) return "";
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/** bizno.net 원문 주소. */
export function biznoUrl(businessNo: string): string {
  return `https://bizno.net/article/${businessNo.replace(/[^0-9]/g, "")}`;
}
