/* AssetFlow 프로토타입 더미 데이터 + 포맷터
 * project.md §28.3 (통화·날짜 포맷) 규칙을 그대로 반영한 JS 이식본.
 * 실제 앱에서는 apps/frontend/src/utils/formatters.ts 로 옮긴다.
 *
 * 카드 계산식 출처: project.md §23 "표시 규칙"
 *   순자산           = 총자산 - 총부채
 *   월 수지          = 월 총수입 - 월 총지출
 *   비상금 유지 개월  = 보유 현금 / 월 필수지출
 *   자산 구성비      = 자산 유형별 비율(합계 100%)
 *
 * 현금 3계좌 분리는 사용자 운영 방식에 따른 것이다.
 *   투자금     - 순수 사용가능. 투자 여력
 *   자동이체   - 고정비 배정 대기. 기간 내 소진
 *   부가가치세 - 세금 적립 보관. Filing 후 잔액을 투자금으로 이체
 *                (한투 발행어음 CMA. 지급일 전까지 인출 가능하므로
 *                 현금성 자산에 포함하되 '기타 자산' 성격으로 분리 표기)
 */

(function (global) {
  "use strict";

  /* ---------- 포맷터 (§28.3) ---------- */

  // 축약 표기: 1억 / 1만 (카드 대용량 금액)
  function formatCompactKR(value) {
    var abs = Math.abs(value);
    var sign = value < 0 ? "-" : "";
    if (abs >= 100000000) {
      return sign + (abs / 100000000).toFixed(1) + "억";
    }
    if (abs >= 10000) {
      return sign + (abs / 10000).toFixed(1) + "만";
    }
    return sign + abs.toLocaleString("ko-KR") + "원";
  }

  // 상세 표기: 원 단위 정수 + 천단위 구분
  function formatKRW(value) {
    return value.toLocaleString("ko-KR") + "원";
  }

  // 부호 포함 상세 표기 (월 수지)
  function formatSignedKRW(value) {
    var sign = value > 0 ? "+" : "";
    return sign + value.toLocaleString("ko-KR") + "원";
  }

  // 소수점 1자리 (비상금 개월, 구성비)
  function formatOneDecimal(value, unit) {
    return value.toFixed(1) + (unit || "");
  }

  function formatPercent(value) {
    return value.toFixed(1) + "%";
  }

  // ko-KR 날짜 (차트 축은 축약형)
  function formatMonthKo(iso) {
    var d = new Date(iso + "T00:00:00");
    return d.getFullYear() + "년 " + (d.getMonth() + 1) + "월";
  }

  function formatMonthAxis(iso) {
    return iso.replace("-", ".");
  }

  /* ---------- 투자/부채 자산 ---------- */

  var assets = [
    { key: "stock", label: "주식", amount: 142600000 },
    { key: "realestate", label: "부동산", amount: 158000000 },
    { key: "pension", label: "연금", amount: 36600000 }
  ];

  var liabilities = [{ key: "loan", label: "대출", amount: 62500000 }];

  /* ---------- 현금 3계좌 ---------- */

  var cash = {
    // 월 초에 그달 고정비 전액을 이체, 기간 내 실제 사용액만큼 남는다
    autoTransfer: { label: "자동이체", amount: 12400000, monthlyEssential: 6700000 },
    // 세금 Filing 후 잔액을 투자금으로 이체한다
    vat: { label: "부가가치세", amount: 28500000 },
    // 순수 사용가능. 비상금 유지 개월의 분자가 된다
    investable: { label: "투자금", amount: 38000000 }
  };

  /* ---------- 부가가치세 실제 산식 ---------- */

  var vatInput = {
    // 직전 연도 월평균
    taxableSales: 14000000, // 과세 매출세액
    purchaseTax: 3200000, // 매입세액
    exemptSales: 2000000, // 면세/과세제외 매출 (참고용, 별도 세액 없음)
    monthlyDeposit: 1200000, // CMA 월 적립액
    monthlyEmploymentInsurance: 1450000 // 고용보험 (적립 시 차감)
  };

  // 납부세액 = 과세 매출세액 - 매입세액
  // 10/110 근사가 아닌 실제 신고 기준을 쓴다.
  //   근사(월 매출/11) = 1,272,727원
  //   실제(월 납부/12)  =   900,000원
  // 적립액이 법정 고지세액을 초과하므로 과다 적립 중이다.
  var vatPayableMonthly = vatInput.taxableSales - vatInput.purchaseTax;
  var vatStatutoryMonthly = vatPayableMonthly / 12;
  var vatOverDepositMonthly = vatInput.monthlyDeposit - vatStatutoryMonthly;
  var vatApproxMonthly = vatInput.taxableSales / 11; // 비교용 근사치

  /* ---------- Filing 일정 ---------- */

  // 확정신고 1/7월, 예정신고 4/10월. Filing 후 잔액을 투자금으로 이체.
  var filings = [
    { id: "2026-01", label: "1기 확정", month: "2026-01", day: 25, tax: 10800000 },
    { id: "2026-04", label: "1기 예정", month: "2026-04", day: 25, tax: 10800000 },
    { id: "2026-07", label: "2기 확정", month: "2026-07", day: 25, tax: 10800000 },
    { id: "2026-10", label: "2기 예정", month: "2026-10", day: 25, tax: 10800000 }
  ];

  var asOfDate = "2026-09-30";

  function nextFiling(fromIso, list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].month > fromIso.slice(0, 7)) return list[i];
    }
    return null;
  }

  var upcoming = nextFiling(asOfDate, filings);

  /* ---------- 월 현금흐름 ---------- */

  var cashflow = [
    { month: "2026-04", amount: 1180000 },
    { month: "2026-05", amount: 1340000 },
    { month: "2026-06", amount: 980000 },
    { month: "2026-07", amount: 1420000 },
    { month: "2026-08", amount: 1090000 },
    { month: "2026-09", amount: 1240000 }
  ];

  /* ---------- 계산 ---------- */

  var totalAssets =
    assets.reduce(function (s, a) { return s + a.amount; }, 0) +
    cash.investable.amount + cash.autoTransfer.amount + cash.vat.amount;

  var totalLiabilities = liabilities.reduce(function (s, l) { return s + l.amount; }, 0);
  var netWorth = totalAssets - totalLiabilities;

  var totalCash = cash.investable.amount + cash.autoTransfer.amount + cash.vat.amount;

  var monthlyIncome = 8400000;
  var monthlyExpense = 7160000;
  var monthlyBalance = monthlyIncome - monthlyExpense;

  // 비상금 유지 개월 = 투자금 / 월 필수지출
  // 자동이체 잔액과 부가가치세 잔액은 분자에서 제외한다.
  //   자동이체 - 이미 이번 달 지출에 배정된 돈
  //   부가가치세 - Filing 전까지 인출 불가
  var emergencyMonths = cash.investable.amount / cash.autoTransfer.monthlyEssential;
  var emergencyTargetMonths = 6;
  var emergencyTarget = emergencyTargetMonths * cash.autoTransfer.monthlyEssential;
  var emergencyReached = cash.investable.amount >= emergencyTarget;

  // 현금 중 지금 쓸 수 있는 비율
  var liquidRatio = (cash.investable.amount / totalCash) * 100;

  var composition = assets
    .map(function (a) {
      return { key: a.key, label: a.label, amount: a.amount };
    })
    .sort(function (a, b) { return b.amount - a.amount; });

  // 현금은 성격이 다르므로 하나의 막대가 아니라 3분할로 표기한다.
  // pctOfTotal = 전체 자산 대비 비중, pctOfCash = 현금 중 비중
  [cash.investable, cash.autoTransfer, cash.vat].forEach(function (c) {
    composition.push({
      key: "cash-" + c.label,
      label: "현금 · " + c.label,
      amount: c.amount,
      isCash: true,
      pctOfTotal: (c.amount / totalAssets) * 100,
      pctOfCash: (c.amount / totalCash) * 100
    });
  });
  composition.forEach(function (c) {
    if (c.pctOfTotal === undefined) c.pctOfTotal = (c.amount / totalAssets) * 100;
  });

  global.AF = global.AF || {};
  global.AF.data = {
    user: { email: "demo@assetflow.kr", name: "김민수" },
    asOf: asOfDate,
    asOfMonth: asOfDate.slice(0, 7),
    totals: {
      assets: totalAssets,
      liabilities: totalLiabilities,
      netWorth: netWorth,
      totalCash: totalCash,
      liquidRatio: liquidRatio,
      monthlyIncome: monthlyIncome,
      monthlyExpense: monthlyExpense,
      monthlyBalance: monthlyBalance
    },
    cash: cash,
    emergency: {
      months: emergencyMonths,
      current: cash.investable.amount,
      targetMonths: emergencyTargetMonths,
      targetAmount: emergencyTarget,
      reached: emergencyReached
    },
    vat: {
      input: vatInput,
      payableMonthly: vatPayableMonthly,
      statutoryMonthly: vatStatutoryMonthly,
      overDepositMonthly: vatOverDepositMonthly,
      approxMonthly: vatApproxMonthly,
      overApproxYear: (vatApproxMonthly - vatStatutoryMonthly) * 12,
      filings: filings,
      upcoming: upcoming
    },
    composition: composition,
    cashflow: cashflow
  };

  global.AF.fmt = {
    formatCompactKR: formatCompactKR,
    formatKRW: formatKRW,
    formatSignedKRW: formatSignedKRW,
    formatOneDecimal: formatOneDecimal,
    formatPercent: formatPercent,
    formatMonthKo: formatMonthKo,
    formatMonthAxis: formatMonthAxis
  };
})(window);
