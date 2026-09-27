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

  // 주의: 사용자가 말하는 "사업소득 8,200,000원"은 필요경비를 차감한 순수익이 아니라
  // **공급가액(부가세 제외 매출)** 이다. 9,020,000 = 8,200,000 + 820,000 이다.
  // 따라서 부가가치세 산정 기준이 된다(10/110).
  var incomeInput = {
    supplyExVat: 8200000 // 공급가액 = 세금계산서 발행액에서 부가세를 뺀 매출 (월)
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
    // 세금/수수료 330,000원 = 종합소득세 신고 대리인에게 지불하는 수수료 (사용자 확인).
    //   종합소득세가 0원인 달에도 대리 수수료는 발생한다.
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
    // 공급대가 9,020,000 = 공급가액 8,200,000 + 부가세 820,000
    grossSales: 9020000, // 월 공급대가 = 세금계산서 발행액 (부가세 포함)
    // 매입세액 320,000원/월 (6개월 1,920,000원). 사용자 확인 근거:
    //   6개월 매출세액 4,920,000 (= 820,000 x 6)
    //   6개월 납부세액 3,000,000 (= 예정 1,500,000 + 확정 1,500,000)
    //   4,920,000 - 3,000,000 = 1,920,000 = 6개월 매입세액 -> 월 320,000원
    purchaseTax: 320000, // 월 매입세액 (인정 세금계산서 기준)
    exemptSales: 0, // 면세/과세제외 매출
    monthlyEmploymentInsurance: 70000, // 월 고용보험 (지출 목록에 포함)

    // 실제 운영값
    supplyExVat: 8200000, // 공급가액 (월. 부가세 제외 매출)
    monthlyAccrual: 820000, // 월 CMA 적립액 (매출세액 820,000원 그대로)
    cardSupplyAmount: 5000000, // 카드매출 공급대가 (월 평균)
    isHospitality: false, // 컴퓨터수리업 -> 2.6% 대상 아님, 1.3% 적용

    // 실제 고지서(반기 1,500,000 + 1,500,000 = 3,000,000)는 카드 발행세액공제를
    // 차감하기 전 금액과 일치한다. 즉 지금은 공제를 신고하지 않고 있다.
    cardCreditClaimed: false,

    // 실제 고지서 금액 (사용자 확인). 반기당 1,500,000 + 1,500,000 = 3,000,000원.
    // 아래 예정고지/확정고지 공식이 재현해야 하는 값이다.
    priorHalfActual: 4500000, // 직전 반기 실제 납부세액 -> 1/3 = 1,500,000
    actualNotice: 1500000,
    actualFinal: 1500000
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
  var cardCreditEligible = Math.min(cardCreditByLimit, vatPayableAnnual);
  var cardCreditMonthlyEligible = floorWon(cardCreditEligible / 12);

  // 실제 고지서(반기 1,500,000 + 1,500,000 = 3,000,000)는 카드공제를 차감하기 전
  // 금액이다. 즉 지금은 발행세액공제를 신고하지 않고 있다.
  // 공제를 적용받으면 납부세액이 이만큼 줄어든다.
  var cardCreditClaimed = vatInput.cardCreditClaimed;
  var cardCreditAnnual = cardCreditClaimed ? cardCreditEligible : 0;
  var cardCreditMonthly = cardCreditClaimed ? cardCreditMonthlyEligible : 0;
  var unclaimedCreditAnnual = cardCreditEligible - cardCreditAnnual;

  /* ----- 실제 납부세액 ----- */

  var vatActualAnnual = vatPayableAnnual - cardCreditAnnual;
  var vatActualMonthly = floorWon(vatActualAnnual / 12);

  // 공제를 적용받는 경우의 납부세액 (미청구 공제만큼 줄어든다)
  var vatActualAnnualIfClaimed = vatPayableAnnual - cardCreditEligible;
  var vatActualMonthlyIfClaimed = floorWon(vatActualAnnualIfClaimed / 12);

  // 반기 단위 고지 (정기면 1기, 추가면 2기)
  // 예정고지세액 = 직전 반기 실제 납부세액 x 1/3
  // 확정고지세액 = 당기 실제 납부세액 - 당기 예정고지세액
  // 직전 반기가 4,500,000원이면 예정고지 = 1,500,000원이 되어 실제 고지서와 일치한다.
  var halfActual = floorWon(vatActualAnnual / 2);
  var vatAssessmentNotice = floorWon(vatInput.priorHalfActual / 3);
  var vatFinalNotice = halfActual - vatAssessmentNotice;

  // 적립액과 실제 납부세액의 차이.
  // 적립액은 매출세액 기준이라 매입세액과 카드공제를 반영하지 않아
  // 실제로는 납부세액보다 많이 쌓인다. 이 차액이 Filing 후 투자금으로 이체된다.
  var vatSurplusMonthly = vatInput.monthlyAccrual - vatActualMonthly;
  var vatSurplusAnnual = vatInput.monthlyAccrual * 12 - vatActualAnnual;
  var vatSurplusShareOfAccrual = (vatSurplusAnnual / (vatInput.monthlyAccrual * 12)) * 100;

  // 매입세액 320,000원이 함의하는 실제 매입 규모.
  // 매입세액 = 매입 공급가액 x 10/110 이므로 역산하면
  //   매입 공급가액 = 320,000 x 110/10 = 3,520,000원
  //
  // 업태는 컴퓨터수리업이지만 실제 수입은 소프트웨어 개발 용역이다.
  // 따라서 부품비가 반드시 있는 것은 아니다. 다만 인정 매입세액에는 실제 세금계산서가
  // 있으므로 매입 규모 3,520,000원/월은 실재하는 현금 유출이다.
  // 지출 목록(2,053,753원)만으로 수지를 계산하면 이 금액이 통째로 빠진다.
  var impliedPurchaseExVat = floorWon((vatInput.purchaseTax * 110) / 10);
  var purchaseReconciliationGap = impliedPurchaseExVat - expenseSum;

  // 세금계산서로 확인된 매입 규모 3,520,000원이 월 사업 비용의 하한이다.
  // 목록에 잡히지 않은 금액은 성격을 확인할 수 없으므로 임의로 분류하지 않고
  // '미분류' 로 둔다. 목록만으로 계산한 수지와 비상금은 낙관적이다.
  var unclassifiedBusinessCost = purchaseReconciliationGap;
  var monthlyBusinessCost = expenseSum + unclassifiedBusinessCost;
  var monthlySurplusOnPurchases = incomeInput.supplyExVat - monthlyBusinessCost;
  var emergencyMonthsOnPurchases = cash.investable.amount / monthlyBusinessCost;

  // 고지 공식이 실제 고지서를 재현하는지 검증한다.
  //   예정고지 = 직전 반기 실제 납부세액 x 1/3
  //   확정고지 = 당기 실제 납부세액 - 예정고지
  // 실제 고지서: 예정 1,500,000 + 확정 1,500,000 = 3,000,000원/반기
  // 반기 납부세액이 3,000,000원으로 고정이므로 4회 고지 합계는 연 6,000,000원으로 일치한다.
  var noticeFormulaCheck =
    Math.abs(vatAssessmentNotice - vatInput.actualNotice) +
    Math.abs(vatFinalNotice - vatInput.actualFinal);


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

  // 월 수지 = 공급가액 - 지출 합계
  // 부가세 820,000원은 현금으로 쓸 수 없으므로 공급대가(9,020,000)가 아니라
  // 공급가액(8,200,000)에서 뺀다. 부가세는 별도 CMA 계좌로 이동한다.
  var monthlyIncome = incomeInput.supplyExVat;
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
  var data = {
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
      // 초기값. recompute() 가 emergencyIncomplete 로 덮어쓴다.
      // 고용보험은 지출 목록에 이미 들어 있고, 종합소득세만 미확정이다.
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
      cardCreditClaimed: cardCreditClaimed,
      cardCreditAnnual: cardCreditAnnual,
      cardCreditMonthly: cardCreditMonthly,
      cardCreditEligible: cardCreditEligible,
      unclaimedCreditAnnual: unclaimedCreditAnnual,
      cardCreditRaw: cardCreditRaw,
      cardCreditCappedByLimit: cardCreditByLimit < cardCreditRaw,
      cardCreditCappedByPayable: cardCreditEligible < cardCreditByLimit,
      actualAnnualIfClaimed: vatActualAnnualIfClaimed,
      actualMonthlyIfClaimed: vatActualMonthlyIfClaimed,
      surplusMonthly: vatSurplusMonthly,
      surplusAnnual: vatSurplusAnnual,
      surplusShareOfAccrual: vatSurplusShareOfAccrual,
      impliedPurchaseExVat: impliedPurchaseExVat,
      purchaseReconciliationGap: purchaseReconciliationGap,
      unclassifiedBusinessCost: unclassifiedBusinessCost,
      monthlyBusinessCost: monthlyBusinessCost,
      monthlySurplusOnPurchases: monthlySurplusOnPurchases,
      emergencyMonthsOnPurchases: emergencyMonthsOnPurchases,
      actualNotice: vatInput.actualNotice,
      actualFinal: vatInput.actualFinal,
      actualHalfTotal: vatInput.actualNotice + vatInput.actualFinal,
      priorHalfActual: vatInput.priorHalfActual,
      noticeFormulaCheck: noticeFormulaCheck,
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
  global.AF.data = data;

  /* ---------- 재계산 ----------
   * 지출 항목이 단일 출처다. 항목을 편집하면 파생값을 전부 다시 계산한다.
   *   expenseItems
   *     -> 합계 / 매입세액 분류 합계
   *     -> monthlyBalance, monthlyExpense
   *     -> emergencyMonths (월 필수지출 = 지출 합계)
   *     -> 매입 규모 대조 (purchaseReconciliationGap 등)
   *
   * 새 항목을 추가하면 필수지출 여부(essential)로 비상금 분자가 바뀐다.
   * 매입 대조는 세금계산서로 확인된 매입 규모를 상한으로 본다.
   *   목록 합계가 매입 규모를 넘어서면 목록이 과대하다는 뜻이므로 경고한다.
   */
  global.AF.recompute = function () {
    var sum = data.expenses.items.reduce(function (a, e) { return a + e.amount; }, 0);
    var nonDed = data.expenses.items
      .filter(function (e) { return !e.vatDeductible; })
      .reduce(function (a, e) { return a + e.amount; }, 0);

    data.expenses.total = sum;
    data.expenses.deductibleTotal = sum - nonDed;
    data.expenses.nonDeductibleTotal = nonDed;
    data.expenses.essentialTotal = data.expenses.items
      .filter(function (e) { return e.essential; })
      .reduce(function (a, e) { return a + e.amount; }, 0);

    // 미확정 항목에 확정 금액이 들어가면 지출에 합산한다
    var notIncludedAmount = data.expenses.notIncluded.reduce(function (a, x) {
      return a + (x.amount === null || x.amount === undefined ? 0 : x.amount);
    }, 0);
    data.expenses.notIncludedAmount = notIncludedAmount;
    data.expenses.notIncludedTotal = sum + notIncludedAmount;
    data.expenses.emergencyIncomplete = data.expenses.notIncluded.some(function (x) {
      return x.amount === null || x.amount === undefined;
    });

    // 월 필수지출 = 필수 항목 + 확정된 미포함 항목
    data.cash.autoTransfer.monthlyEssential =
      data.expenses.essentialTotal + notIncludedAmount;

    data.totals.monthlyExpense = data.expenses.notIncludedTotal;
    data.totals.monthlyBalance = data.totals.monthlyIncome - data.totals.monthlyExpense;

    data.emergency.months = data.cash.investable.amount / data.cash.autoTransfer.monthlyEssential;
    data.emergency.targetAmount =
      data.emergency.targetMonths * data.cash.autoTransfer.monthlyEssential;
    data.emergency.reached = data.cash.investable.amount >= data.emergency.targetAmount;
    data.emergency.incomplete = data.expenses.emergencyIncomplete;

    // 매입 규모 대조
    var v = data.vat;
    var gap = v.impliedPurchaseExVat - sum;
    v.purchaseReconciliationGap = gap;
    v.unclassifiedBusinessCost = gap > 0 ? gap : 0;
    v.overStatedList = gap < 0 ? -gap : 0;
    // 보수적으로 두 값을 모두 만족해야 하므로 큰 쪽을 쓴다.
    // 목록이 매입 규모를 넘으면 작은 값은 비상금을 부풀리게 만든다.
    v.monthlyBusinessCost = Math.max(sum, v.impliedPurchaseExVat);
    v.monthlySurplusOnPurchases = data.totals.monthlyIncome - v.monthlyBusinessCost;
    v.emergencyMonthsOnPurchases = data.cash.investable.amount / v.monthlyBusinessCost;
    return data;
  };

  // 원본 보존: 초기값 복구에 사용한다
  global.AF.seed = {
    items: expenseItems.map(function (e) {
      return { key: e.key, label: e.label, amount: e.amount, essential: e.essential, vatDeductible: e.vatDeductible };
    }),
    notIncluded: data.expenses.notIncluded.map(function (x) {
      return { key: x.key, label: x.label, amount: x.amount, note: x.note };
    })
  };

  /* ------------------------------------------------------------------
   * 지출 저장소 (프로토타입 한정)
   * 지출 화면이 단일 출처지만, 입력값을 모든 화면이 함께 봐야 한다.
   * 그래서 저장/복구는 데이터 계층이 담당하고 화면은 save/reset만 호출한다.
   * 실제 구현에서는 이 계층이 서버 API로 교체된다 (§28.7).
   * ------------------------------------------------------------------ */
  var STORAGE_KEY = "assetflow.expenses.v1";

  function copySeed() {
    return {
      items: global.AF.seed.items.map(function (e) { return Object.assign({}, e); }),
      notIncluded: global.AF.seed.notIncluded.map(function (x) { return Object.assign({}, x); })
    };
  }

  function applySnapshot(snap) {
    if (!snap || !Array.isArray(snap.items) || !Array.isArray(snap.notIncluded)) return false;

    // 항목 하나하나를 값 검증한다. 깨진 값 하나가 화면 전체를 죽이면 안 된다.
    var items = snap.items
      .filter(function (e) { return e && typeof e.label === "string"; })
      .map(function (e) {
        return {
          key: typeof e.key === "string" ? e.key : newKey(),
          label: e.label,
          amount: Number.isFinite(+e.amount) && +e.amount >= 0 ? Math.round(+e.amount) : 0,
          essential: e.essential !== false,
          vatDeductible: e.vatDeductible !== false
        };
      });

    var notIncluded = snap.notIncluded
      .filter(function (x) { return x && typeof x.label === "string"; })
      .map(function (x) {
        var amt = x.amount === null || x.amount === undefined || x.amount === ""
          ? null
          : (Number.isFinite(+x.amount) && +x.amount >= 0 ? Math.round(+x.amount) : null);
        return {
          key: typeof x.key === "string" ? x.key : newKey(),
          label: x.label,
          amount: amt,
          note: typeof x.note === "string" ? x.note : ""
        };
      });

    if (!items.length) return false;
    data.expenses.items = items;
    data.expenses.notIncluded = notIncluded;
    return true;
  }

  function newKey() {
    return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  global.AF.storage = {
    key: STORAGE_KEY,
    seed: copySeed,
    // 저장된 값이 있으면 적용하고 true. 없으면 false.
    load: function () {
      var raw;
      try {
        raw = global.localStorage.getItem(STORAGE_KEY);
      } catch (err) {
        // 사생활 모드 등으로 막혀 있으면 시드값으로 진행한다
        return false;
      }
      if (!raw) return false;
      try {
        return applySnapshot(JSON.parse(raw));
      } catch (err) {
        return false;
      }
    },
    save: function () {
      try {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          items: data.expenses.items,
          notIncluded: data.expenses.notIncluded
        }));
        return true;
      } catch (err) {
        return false;
      }
    },
    reset: function () {
      var snap = copySeed();
      data.expenses.items = snap.items;
      data.expenses.notIncluded = snap.notIncluded;
      try {
        global.localStorage.removeItem(STORAGE_KEY);
      } catch (err) { /* 저장소를 못 쓰는 환경이면 무시 */ }
      return data;
    }
  };

  // 어떤 화면이든 로드 직전에 저장값을 읽는다 (대시보드/설정 포함).
  global.AF.storage.load();
  global.AF.recompute();

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
