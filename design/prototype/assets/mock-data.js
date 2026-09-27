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
    autoTransfer: { label: "자동이체", amount: 12400000, monthlyEssential: 6700000 },
    // 세금 Filing 후 잔액을 투자금으로 이체한다
    vat: { label: "부가가치세", amount: 28500000 },
    // 순수 사용가능. 비상금 유지 개월의 분자가 된다
    investable: { label: "투자금", amount: 38000000 }
  };

  /* ---------- 부가가치세 실제 산식 ----------
   * 부가가치세법 제46조 신용카드등 사용에 따른 세액공제를 반영한다.
   *
   * 용어 혼동 주의:
   *   공급가액(부가세 제외 매출) = 1,454만  -> 10% 를 또 곱하면 이중 계상
   *   공급대가(부가세 포함 매출) = 1,600만  -> 10/110 = 145만
   * 10/110 은 세액 추출 단계로는 맞지만 매입세액과 카드 발행세액공제를
   * 빠뜨리므로 실제 납부세액보다 크다.
   *
   * 신고 단위: 반기(6개월). 예정고지 4/10월, 확정고지 7월/다음해 1월.
   *   예정고지세액 = 직전 반기 실제 납부세액 x 1/3
   *   확정고지세액 = 당기 실제 납부세액 - 당기 예정고지세액
   * 월 1,200,000원 적립은 연 14,400,000원으로 예정고지를 충당하며,
   * Filing 후 남는 잔액은 카드 발행세액공제분이다.
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
    // 직전 연도 월평균
    grossSales: 16000000, // 공급대가 (부가세 포함)
    exemptSales: 2000000, // 면세/과세제외 공급대가. 세액 없음, 카드공제 기준에서도 제외
    purchaseTax: 254545, // 매입세액 (공제)
    monthlyDeposit: 1200000, // CMA 월 적립액
    monthlyEmploymentInsurance: 1450000, // 고용보험 (적립 시 차감)
    cardSupplyAmount: 10000000, // 카드매출 공급대가(부가세 포함)
    isHospitality: false // 음식점·숙박업 등 2.6% 업종 여부
  };

  // 매출세액 = 공급대가 x 10/110  (부가세 포함 매출에서 세액만 뽑는다)
  var vatOnSalesMonthly = floorWon((vatInput.grossSales * 10) / 110);

  // 납부세액(공제 전) = 매출세액 - 매입세액
  var vatPayableMonthly = vatOnSalesMonthly - vatInput.purchaseTax;
  var vatPayableAnnual = vatPayableMonthly * 12;

  // 카드 발행세액공제: 공급대가 x 공제율, 연 한도 이내.
  // 공제액은 납부세액을 초과할 수 없다(환급 불가).
  var cardRate = vatInput.isHospitality
    ? taxPolicy.cardCreditRateHospitality
    : taxPolicy.cardCreditRate;
  var cardCreditRaw = floorWon(vatInput.cardSupplyAmount * 12 * cardRate);
  var cardCreditByLimit = Math.min(cardCreditRaw, taxPolicy.annualCap);
  var cardCreditAnnual = Math.min(cardCreditByLimit, vatPayableAnnual);
  var cardCreditMonthly = floorWon(cardCreditAnnual / 12);

  // 공제 적용 후 실제 납부
  var vatActualAnnual = vatPayableAnnual - cardCreditAnnual;
  var vatActualMonthly = floorWon(vatActualAnnual / 12);

  // 반기 단위 고지 (정기면 1기, 추가면 2기)
  // 예정고지세액 = 직전 반기 실제 납부세액 x 1/3   (카드공제 후 기준)
  // 확정고지세액 = 당기 실제 납부세액 - 당기 예정고지세액
  var halfActual = floorWon(vatActualAnnual / 2);
  var vatAssessmentNotice = floorWon(halfActual / 3);
  var vatFinalNotice = halfActual - vatAssessmentNotice;

  // 10/110 만 계산했을 때의 적립 필요액 (매입세액/카드공제 미반영)
  var vatApproxMonthly = vatOnSalesMonthly;

  // Filing 후 세금 계좌에 남는 금액.
  // 적립액이 납부세액을 정확히 충당하므로 잔액은 카드공제분이다.
  var vatSurplusMonthly = vatInput.monthlyDeposit - vatActualMonthly;
  var vatSurplusAnnual = vatInput.monthlyDeposit * 12 - vatActualAnnual;
  var vatOverApproxYear = (vatApproxMonthly - vatActualMonthly) * 12;

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
      policy: taxPolicy,
      onSalesMonthly: vatOnSalesMonthly,
      payableMonthly: vatPayableMonthly,
      payableAnnual: vatPayableAnnual,
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
      approxMonthly: vatApproxMonthly,
      overApproxYear: vatOverApproxYear,
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
