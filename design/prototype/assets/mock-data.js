/* AssetFlow 프로토타입 더미 데이터 + 포맷터
 * project.md §28.3 (통화·날짜 포맷) 규칙을 그대로 반영한 JS 이식본.
 * 실제 앱에서는 apps/frontend/src/utils/formatters.ts 로 옮긴다.
 *
 * 카드 계산식 출처: project.md §23 "표시 규칙"
 *   순자산           = 총자산 - 총부채
 *   월 수지          = 월 총수입 - 월 총지출
 *   비상금 유지 개월  = 투자금 잔액 / 월 필수지출  (§28.7, 총 현금이 아님)
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
    autoTransfer: {
      label: "자동이체",
      amount: 12400000,
      // 아래 expenseItems 의 합계(2,053,753)와 같은 값이어야 한다 (§28.7 단일 출처)
      monthlyEssential: 2053753
    },
    // 세금 Filing 후 잔액을 투자금으로 이체한다
    vat: { label: "부가가치세", amount: 28500000 },
    // 순수 사용가능. 비상금 유지 개월의 분자가 된다
    investable: { label: "투자금", amount: 38000000 }
  };

  /* ---------- 월 수입 ---------- */

  // 사업소득은 필요경비를 차감한 세후 순수익이다.
  // 부가가치세 산정 기준(공급대가)이 아니므로 여기서 10%를 뽑지 않는다.
  var incomeInput = {
    businessIncome: 8200000 // 개인사업 수입 (월)
  };

  /* ---------- 월 지출 ---------- */

  // 실제 지출 내역. 합계는 자동이체 monthlyEssential 과 일치해야 한다.
  // vatDeductible: 매입세액 공제가 가능한지 여부 (추정 분류, 세금계산서 확인 필요)
  //   보험서비스, 기부금, 대출이자는 비과세여서 매입세액을 받을 수 없다.
  var expenseItems = [
    { key: "education", label: "고정지출/교육비", amount: 1000000, essential: true, vatDeductible: true },
    { key: "loan", label: "고정지출/대출상환및이자", amount: 317180, essential: true, vatDeductible: false },
    { key: "association", label: "공제/중소기업중앙회", amount: 150000, essential: true, vatDeductible: true },
    { key: "family", label: "고정지출/가족회비", amount: 50000, essential: true, vatDeductible: false },
    { key: "telecom", label: "통신비", amount: 45000, essential: true, vatDeductible: true },
    { key: "dbinsurance", label: "보험/DB손해보험", amount: 34160, essential: true, vatDeductible: false },
    { key: "samsungfire", label: "보험/삼성화재해상보험", amount: 17413, essential: true, vatDeductible: false },
    { key: "donation-sdc", label: "기부금/세이브더칠드런", amount: 20000, essential: false, vatDeductible: false },
    { key: "donation-child", label: "기부금/어린이재단", amount: 10000, essential: false, vatDeductible: false },
    { key: "donation-barn", label: "기부금/함께하는사랑밭", amount: 10000, essential: false, vatDeductible: false },
    { key: "employmentInsurance", label: "고용보험", amount: 70000, essential: true, vatDeductible: false },
    { key: "taxFee", label: "세금/수수료", amount: 330000, essential: true, vatDeductible: false }
    // [미확인] 이 2개 항목의 성격. 금액은 사용자 확인값.
    //   고용보험 70,000원 - 보험료이므로 매입세액 공제 불가
    //   세금/수수료 330,000원 - 종합소득세 0원인 달에 대체로 발생하는 금액.
    //     무엇에 대한 수수료인지 미확인 (신고 대리인료 / 세액계산서 발급 / 기타)
  ];

  var expenseSum = expenseItems.reduce(function (a, e) {
    return a + e.amount;
  }, 0);
  var monthlyExpense = expenseSum;

  // 매입세액 공제 가능 항목 합계 (비과세 항목은 대상이 아님)
  var nonDeductible = expenseItems
    .filter(function (e) {
      return !e.vatDeductible;
    })
    .reduce(function (a, e) {
      return a + e.amount;
    }, 0);

  /* ---------- 부가가치세 실제 산식 ----------
   * 부가가치세법 제46조 신용카드등 사용에 따른 세액공제를 반영한다.
   *
   * 용어 혼동 주의:
   *   공급가액(부가세 제외 매출) -> 10% 를 또 곱하면 이중 계상
   *   공급대가(부가세 포함 매출) -> 10/110 으로 세액을 뽑는다
   * 사업소득은 필요경비를 차감한 세후 순수익이므로 공급대가가 아니다.
   * 부가가치세는 공급대가(매출)에서 낸다.
   *
   * 신고 단위: 반기(6개월). 예정고지 4/10월, 확정고지 7월/다음해 1월.
   *   예정고지세액 = 직전 반기 실제 납부세액 x 1/3
   *   확정고지세액 = 당기 실제 납부세액 - 당기 예정고지세액
   */

  // 국세청 실무에 맞게 원 미만을 절삭한다
  function floorWon(v) {
    return Math.floor(v);
  }

  // 공제율/한도는 세법 개정으로 바뀐다. 상수로 박지 말고 정책 객체로 분리한다.
  var taxPolicy = {
    // 2026-12-31까지 적용되는 우대제도 (부가가치세법 제46조)
    cardCreditRate: 0.013, // 일반 1.3%
    cardCreditRateHospitality: 0.026, // 음식점·숙박업 등 2.6%
    annualCap: 10000000, // 연 1,000만원
    // 2026 세제개편안(2026-08-03 발표). 2027-01-01부터 예정이며 확정 여부 확인 필요
    planned2027: {
      rate: 0.012, // 1.3% -> 1.2%
      annualCap: 5000000, // 1,000만원 -> 500만원
      untilYear: 2029,
      note: "개편안 확정 시 반영. 미확정 상태"
    }
  };

  var vatInput = {
    // 실제 신고 기준 값 (사용자 확인)
    grossSales: 9020000, // 월 공급대가 = 세금계산서 발행액 (부가세 포함)
    purchaseTax: 320000, // 월 매입세액 (실제 인정분)
    exemptSales: 0, // 면세/과세제외 매출
    monthlyEmploymentInsurance: 70000, // 월 고용보험 (지출 목록에 포함)

    // 실제 운영값
    businessIncome: 8200000, // 사업소득 (월, 세후 순수익)
    monthlyAccrual: 820000, // 월 CMA 적립액 (매출세액 기준)
    cardSupplyAmount: 5000000, // 카드매출 공급대가 (월 평균)
    isHospitality: false // 컴퓨터수리업 -> 2.6% 대상 아님, 1.3% 적용
  };

  /* ----- 실제 신고 산식 ----- */

  // 매출세액 = 공급대가 x 10/110
  // 9,020,000 / 11 = 820,000. 현행 적립액과 일치하나 근거가 다르다
  //   (적립액은 '사업소득 x 10%' 로 계산했으나 결과가 우연히 같았다)
  var vatOnSalesMonthly = floorWon((vatInput.grossSales * 10) / 110);

  // 납부세액(공제 전) = 매출세액 - 매입세액
  var vatPayableMonthly = vatOnSalesMonthly - vatInput.purchaseTax;
  var vatPayableAnnual = vatPayableMonthly * 12;

  /* ----- 카드 발행세액공제: 카드매출만으로 계산된다 ----- */

  // 공제액은 연 한도 이내. 공제액은 납부세액을 초과할 수 없다(환급 불가).
  var cardRate = vatInput.isHospitality
    ? taxPolicy.cardCreditRateHospitality
    : taxPolicy.cardCreditRate;
  var cardCreditRaw = floorWon(vatInput.cardSupplyAmount * 12 * cardRate);
  var cardCreditByLimit = Math.min(cardCreditRaw, taxPolicy.annualCap);
  var cardCreditAnnual = Math.min(cardCreditByLimit, vatPayableAnnual);
  var cardCreditMonthly = floorWon(cardCreditAnnual / 12);

  /* ----- 실제 납부세액 ----- */

  var vatActualAnnual = vatPayableAnnual - cardCreditAnnual;
  var vatActualMonthly = floorWon(vatActualAnnual / 12);

  // 반기 단위 고지 (정기면 1기, 추가면 2기)
  // 예정고지세액 = 직전 반기 실제 납부세액 x 1/3   (카드공제 후 기준)
  // 확정고지세액 = 당기 실제 납부세액 - 당기 예정고지세액
  var halfActual = floorWon(vatActualAnnual / 2);
  var vatAssessmentNotice = floorWon(halfActual / 3);
  var vatFinalNotice = halfActual - vatAssessmentNotice;

  // 적립액과 실제 납부세액의 차이.
  // 적립액은 매출세액 기준이라 매입세액과 카드공제를 반영하지 않아
  // 실제로는 납부세액보다 많이 쌓인다. 이 차액이 Filing 후 투자금으로 이체된다.
  var vatSurplusMonthly = vatInput.monthlyAccrual - vatActualMonthly;
  var vatSurplusAnnual = vatInput.monthlyAccrual * 12 - vatActualAnnual;
  var vatSurplusShareOfAccrual = (vatSurplusAnnual / (vatInput.monthlyAccrual * 12)) * 100;

  // 사업소득(순수익)과 공급대가(매출)의 관계 점검
  // 공급대가 - 지출 = 예상 사업소득. 실제 사업소득과 다르면 원인을 확인한다.
  var impliedIncomeFromSales = vatInput.grossSales - expenseSum;
  var incomeGap = incomeInput.businessIncome - impliedIncomeFromSales;


  /* ---------- Filing 일정 ---------- */

  // 1기 = 1~6월 실적, 2기 = 7~12월 실적
  //   1기 예정고지 4월 / 1기 확정고지 7월
  //   2기 예정고지 10월 / 2기 확정고지 다음해 1월
  // 고지액은 위에서 계산한 예정고지/확정고지 값을 그대로 쓴다.
  var filings = [
    { id: "2026-01", label: "2기 확정", kind: "final", month: "2026-01", day: 25, tax: vatFinalNotice },
    { id: "2026-04", label: "1기 예정", kind: "notice", month: "2026-04", day: 25, tax: vatAssessmentNotice },
    { id: "2026-07", label: "1기 확정", kind: "final", month: "2026-07", day: 25, tax: vatFinalNotice },
    { id: "2026-10", label: "2기 예정", kind: "notice", month: "2026-10", day: 25, tax: vatAssessmentNotice }
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

  // 월 수지 = 사업소득 - 지출 합계
  // 세금(부가가치세·고용보험·종합소득세)은 이 지출 목록에 포함되지 않는다.
  var monthlyIncome = incomeInput.businessIncome;
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
      reached: emergencyReached,
      // 분모에 고용보험·종합소득세·지방세가 빠져 있다 (expenses.notIncluded)
      incomplete: true
    },
    vat: {
      input: vatInput,
      policy: taxPolicy,
      hasActualFilingData: vatInput.grossSales !== null && vatInput.purchaseTax !== null,
      onSalesMonthly: vatOnSalesMonthly,
      payableMonthly: vatPayableMonthly,
      payableAnnual: vatPayableAnnual,
      accrualMonthly: vatInput.monthlyAccrual,
      accrualAnnual: vatInput.monthlyAccrual * 12,
      actualAnnual: vatActualAnnual,
      actualMonthly: vatActualMonthly,
      assessmentNotice: vatAssessmentNotice,
      finalNotice: vatFinalNotice,
      cardRate: cardRate,
      cardCreditAnnual: cardCreditAnnual,
      cardCreditMonthly: cardCreditMonthly,
      cardCreditRaw: cardCreditRaw,
      cardCreditCappedByLimit: cardCreditByLimit < cardCreditRaw,
      cardCreditCappedByPayable: cardCreditAnnual < cardCreditByLimit,
      surplusMonthly: vatSurplusMonthly,
      surplusAnnual: vatSurplusAnnual,
      surplusShareOfAccrual: vatSurplusShareOfAccrual,
      impliedIncomeFromSales: impliedIncomeFromSales,
      incomeGap: incomeGap,
      filings: filings,
      upcoming: upcoming
    },
    income: incomeInput,
    expenses: {
      items: expenseItems,
      total: monthlyExpense,
      deductibleTotal: expenseSum - nonDeductible,
      nonDeductibleTotal: nonDeductible,
      // 미확정 항목. 종합소득세는 보통 0원이지만 연말에 발생할 수 있다.
      notIncluded: [
        {
          key: "incomeTax",
          label: "종합소득세",
          amount: null,
          note: "보통 0원이나 납부되는 달이 있다"
        }
      ],
      emergencyIncomplete: true
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
