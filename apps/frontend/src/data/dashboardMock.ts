import type { SurfaceStatus } from "../components/StateBlock";

export type AssetType = "cash" | "deposit" | "invest" | "realty";

export interface AssetRow {
  id: string;
  type: AssetType;
  name: string;
  /** 원 단위 정수 (§28.3 — Issue 6 API 단위 규칙과 동일) */
  value: number;
}

export interface LiabilityRow {
  id: string;
  name: string;
  /** 원 단위 정수. 잔액(§34 부채 계약과 동일하게 잔액이 원칙) */
  balance: number;
}

export interface MonthlySummary {
  /** 공급가액 기준 월 총수입 (§28.7: 부가세는 현금 아님) */
  income: number;
  /** 월 총지출 (필수+선택 전부) */
  expenses: number;
  /** 월 필수지출 — 지출 화면이 단일 출처 (§28.7/§28.10) */
  essentialExpenses: number;
  /** 필수지출에 미반영 항목이 있으면 false. 0원 투입으로 메우지 않는다 (§28.7) */
  essentialComplete: boolean;
}

export interface DashboardData {
  asOf: string;
  assets: AssetRow[];
  liabilities: LiabilityRow[];
  monthly: MonthlySummary;
}

/** Issue 7(FE-BE 연동)까지의 더미 데이터. 대시보드 계산 테스트의 기준선도 이 값이다. */
export const dashboardMock: DashboardData = {
  asOf: "2026년 10월",
  assets: [
    { id: "c1", type: "cash", name: "우리 파킹통장", value: 18_500_000 },
    { id: "c2", type: "cash", name: "씨티 요구불", value: 6_200_000 },
    { id: "d1", type: "deposit", name: "우리 예적금", value: 42_000_000 },
    { id: "i1", type: "invest", name: "키움 투자금", value: 31_000_000 },
    { id: "i2", type: "invest", name: "미국주식", value: 23_500_000 },
    { id: "r1", type: "realty", name: "실거주 아파트", value: 640_000_000 },
  ],
  liabilities: [{ id: "l1", name: "주택담보대출", balance: 69_355_560 }],
  monthly: {
    income: 8_200_000,
    expenses: 4_960_000,
    essentialExpenses: 2_317_180,
    essentialComplete: true,
  },
};

export type { SurfaceStatus };
