/**
 * E2E 테스트용 API 모의 데이터.
 * DashboardPage 가 마운트 시 호출하는 엔드포인트들을 채운다.
 */

export const today = new Date();
export const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

function monthKey(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function summaryResponse() {
  return {
    code: "OK",
    message: "Summary loaded",
    data: {
      asOf: new Date().toISOString(),
      assets: [
        { id: "c1", type: "cash", name: "우리 파킹통장", value: 18_500_000 },
        { id: "c2", type: "cash", name: "신한 입출금", value: 7_000_000 },
        { id: "d1", type: "deposit", name: "우리 예적금", value: 42_000_000 },
        { id: "i1", type: "invest", name: "삼성전자", value: 25_000_000 },
      ],
      liabilities: [{ id: "l1", name: "주택담보 대출", balance: 120_000_000 }],
      monthly: {
        income: 12_000_000,
        vatSetAside: 1_000_000,
        expenses: 8_500_000,
        essentialExpenses: 6_000_000,
        essentialComplete: true,
        balance: 2_500_000,
      },
    },
  };
}

export function cashflowResponse() {
  return {
    code: "OK",
    message: "Cashflow loaded",
    data: [
      { month: monthKey(5), income: 11_000_000, vatSetAside: 1_000_000, expenses: 8_000_000, balance: 2_000_000, confirmed: true },
      { month: monthKey(4), income: 12_000_000, vatSetAside: 1_000_000, expenses: 8_500_000, balance: 2_500_000, confirmed: true },
      { month: monthKey(3), income: 10_000_000, vatSetAside: 1_000_000, expenses: 7_500_000, balance: 1_500_000, confirmed: true },
      { month: monthKey(2), income: 12_000_000, vatSetAside: 1_000_000, expenses: 9_000_000, balance: 2_000_000, confirmed: true },
      { month: monthKey(1), income: 11_500_000, vatSetAside: 1_000_000, expenses: 8_200_000, balance: 2_300_000, confirmed: true },
      { month: thisMonth, income: null, vatSetAside: null, expenses: null, balance: null, confirmed: false },
    ],
  };
}

export function monthlyIncomeResponse() {
  return {
    code: "OK",
    message: "Monthly income loaded",
    data: [{ month: monthKey(1), income: 12_000_000, vatSetAside: 1_000_000, disposableIncome: 11_000_000 }],
  };
}

export function monthlyCategoriesResponse() {
  return {
    code: "OK",
    message: "Monthly categories loaded",
    data: [
      { month: monthKey(0), category: "식비", gross: 1_200_000 },
      { month: monthKey(1), category: "식비", gross: 900_000 },
      { month: monthKey(1), category: "미분류", gross: 10_000 },
    ],
  };
}

export function cardCompanyGroupsResponse() {
  return {
    code: "OK",
    message: "Card company groups loaded",
    data: [
      { month: monthKey(0), cardCompany: "현대카드", memberRelation: "본인", count: 3, grossAmount: 100_000 },
      { month: monthKey(0), cardCompany: "현대카드", memberRelation: "가족", count: 2, grossAmount: 80_000 },
      { month: monthKey(0), cardCompany: "삼성카드", memberRelation: "본인", count: 1, grossAmount: 50_000 },
    ],
  };
}

export function settingsResponse() {
  return {
    code: "OK",
    message: "Settings loaded",
    data: {
      targetMonths: 6,
      emergencyAvgMonths: 3,
      emergencyAccountIds: ["c1"],
      emergencyCategories: ["식비", "주거/통신", "교통/차량"],
    },
  };
}

export function authToken(): string {
  // JWT 형태를 흉낸 더미 토큰. 백엔드 검증이 없는 모의 환경에서만 사용한다.
  return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIn0.test";
}
