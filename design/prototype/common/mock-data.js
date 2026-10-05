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

  /* ---------- 계층 그룹 (Level1 기관 / Level2 상품유형) ----------
   * 자산(소분류)만으로는 트리를 만들 수 없다. 기관이나 상품유형에
   * 자산을 하나도 붙이지 않은 상태를 유지해야 하므로 그룹을 별도 데이터로
   * 보관한다. 트리는 그룹 배열을 뼈대로 삼고 자산을 그 아래에 매달아 쓴다.
   */

  var institutions = [
    { id: "inst-bank-shinhan", name: "신한은행" },
    { id: "inst-bank-kb", name: "KB국민은행" },
    { id: "inst-securities-mirae", name: "미래에셋증권" },
    { id: "inst-securities-shinhan", name: "신한투자증권" },
    { id: "inst-bank-ibk", name: "IBK기업은행" },
    { id: "inst-bank-nh", name: "NH농협은행" },
    { id: "inst-securities-samsung", name: "삼성증권" },
    { id: "inst-other", name: "기타" }
  ];

  // Level2 는 반드시 institutionId 를 갖는다. 어느 기관의 상품유형인지
  // 정해지지 않으면 트리에서 위치를 잃는다.
  var groups = [
    { id: "g-shinhan-general", institutionId: "inst-bank-shinhan", name: "일반자산" },
    { id: "g-kb-general", institutionId: "inst-bank-kb", name: "일반자산" },
    { id: "g-mirae-general", institutionId: "inst-securities-mirae", name: "일반자산" },
    { id: "g-shinhansec-general", institutionId: "inst-securities-shinhan", name: "일반자산" },
    { id: "g-ibk-general", institutionId: "inst-bank-ibk", name: "일반자산" },
    { id: "g-nh-tax", institutionId: "inst-bank-nh", name: "절세/연금자산" },
    { id: "g-samsung-tax", institutionId: "inst-securities-samsung", name: "절세/연금자산" },
    { id: "g-other-other", institutionId: "inst-other", name: "기타자산" }
  ];

  var assets = [
    {
      key: "shinhan-deposit-001",
      label: "신한은행 정기예금",
      amount: 50000000,
      institutionId: "inst-bank-shinhan",
      groupId: "g-shinhan-general",
      categoryLevel3: "예금",
      assetClass: "deposit",
      principalDeposit: 50000000,
      currentValue: 50000000,
      returnRate: 2.5,
      currency: "KRW"
    },
    {
      key: "kb-savings-001",
      label: "KB국민은행 자유적금",
      amount: 30000000,
      institutionId: "inst-bank-kb",
      groupId: "g-kb-general",
      categoryLevel3: "적금",
      assetClass: "savings",
      principalDeposit: 30000000,
      currentValue: 30000000,
      returnRate: 2.3,
      currency: "KRW"
    },
    {
      key: "mirae-stock-001",
      label: "미래에셋증권 삼성전자",
      amount: 70000000,
      institutionId: "inst-securities-mirae",
      groupId: "g-mirae-general",
      categoryLevel3: "주식",
      assetClass: "stock",
      principalInvest: 70000000,
      quantity: 1000,
      avgPrice: 70000,
      currentValue: 75000000,
      returnRate: 7.14,
      currency: "KRW"
    },
    {
      key: "shinhan-etf-001",
      label: "신한투자증권 KODEX 200",
      amount: 30000000,
      institutionId: "inst-securities-shinhan",
      groupId: "g-shinhansec-general",
      categoryLevel3: "ETF",
      assetClass: "etf",
      principalInvest: 30000000,
      quantity: 500,
      avgPrice: 60000,
      currentValue: 32000000,
      returnRate: 6.67,
      currency: "KRW"
    },
    {
      key: "ibk-cma-001",
      label: "IBK기업은행 CMA RP",
      amount: 20000000,
      institutionId: "inst-bank-ibk",
      groupId: "g-ibk-general",
      categoryLevel3: "CMA",
      assetClass: "cma",
      principalDeposit: 20000000,
      currentValue: 20050000,
      returnRate: 0.25,
      currency: "KRW"
    },
    {
      key: "nh-isa-001",
      label: "NH농협은행 ISA",
      amount: 40000000,
      institutionId: "inst-bank-nh",
      groupId: "g-nh-tax",
      categoryLevel3: "ISA",
      assetClass: "isa",
      principalDeposit: 40000000,
      currentValue: 41200000,
      returnRate: 3.0,
      currency: "KRW"
    },
    {
      key: "samsung-irp-001",
      label: "삼성증권 IRP",
      amount: 50000000,
      institutionId: "inst-securities-samsung",
      groupId: "g-samsung-tax",
      categoryLevel3: "IRP",
      assetClass: "irp",
      principalDeposit: 50000000,
      currentValue: 51500000,
      returnRate: 3.0,
      currency: "KRW"
    }
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

  // 월 수지 = 공급가액 - 지출 합계
  // 부가세 820,000원은 현금으로 쓸 수 없으므로 공급대가(9,020,000)가 아니라
  // 공급가액(8,200,000)에서 뺀다. 부가세는 별도 CMA 계좌로 이동한다.
  var monthlyIncome = incomeInput.supplyExVat;
  var monthlyBalance = monthlyIncome - monthlyExpense;

  /* ---------- 자산/부채 계산 ----------
   * 자산 화면이 자산·부채 값의 단일 출처다 (§28.10). 지출 화면이 지출의
   * 단일 출처인 것과 같은 규약이다. 항목을 편집하면 총액·순자산·구성비를
   * 여기서 다시 계산하므로, 대시보드는 하드코딩된 값이 아니라 이 결과를 읽는다.
   */

  // 현금 3계좌 순서. 합계와 구성비 분할이 이 배열을 따른다.
  var CASH_KEYS = ["investable", "autoTransfer", "vat"];
  var emergencyTargetMonths = 6;

  function sumAmounts(list) {
    return list.reduce(function (s, a) {
      var v = a.currentValue != null ? a.currentValue : a.amount;
      return s + (typeof v === "number" && isFinite(v) ? v : 0);
    }, 0);
  }

  function totalCashOf() {
    return CASH_KEYS.reduce(function (s, k) { return s + cash[k].amount; }, 0);
  }

  // 현금은 성격이 다르므로 하나의 막대가 아니라 3분할로 표기한다.
  // pctOfTotal = 전체 자산 대비 비중, pctOfCash = 현금 중 비중
  function buildComposition(totalAssets, totalCash) {
    var rows = assets
      .map(function (a) {
        var amt = a.currentValue != null ? a.currentValue : a.amount;
        return { key: a.key, label: a.label, amount: amt };
      })
      .sort(function (a, b) { return b.amount - a.amount; });

    CASH_KEYS.forEach(function (k) {
      var c = cash[k];
      rows.push({
        key: "cash-" + c.label,
        label: "현금 · " + c.label,
        amount: c.amount,
        isCash: true,
        pctOfTotal: (c.amount / totalAssets) * 100,
        pctOfCash: (c.amount / totalCash) * 100
      });
    });
    rows.forEach(function (r) {
      if (r.pctOfTotal === undefined) r.pctOfTotal = (r.amount / totalAssets) * 100;
    });
    return rows;
  }

  function computeAssetTotals() {
    var totalCash = totalCashOf();
    var totalAssets = sumAmounts(assets) + totalCash;
    return {
      assets: totalAssets,
      liabilities: sumAmounts(liabilities),
      netWorth: totalAssets - sumAmounts(liabilities),
      totalCash: totalCash,
      // 현금이 0원일 때 나눗셈 전에 끊는다. 빈 자산 목록에서 NaN 이 새지 않게.
      liquidRatio: totalCash ? (cash.investable.amount / totalCash) * 100 : 0
    };
  }

  // 비상금 유지 개월 = 투자금 / 월 필수지출
  // 자동이체 잔액과 부가가치세 잔액은 분자에서 제외한다.
  //   자동이체 - 이미 이번 달 지출에 배정된 돈
  //   부가가치세 - Filing 전까지 인출 불가
  var emergencyMonths = cash.investable.amount / cash.autoTransfer.monthlyEssential;
  var emergencyTarget = emergencyTargetMonths * cash.autoTransfer.monthlyEssential;
  var emergencyReached = cash.investable.amount >= emergencyTarget;

  var AT = computeAssetTotals();
  var composition = buildComposition(AT.assets, AT.totalCash);

  /* ---------- 카드내역 (§29) ----------
   * 카드 엑셀/CSV 임포트 결과만 저장한다. 지출 항목과는 다른 증빙 계층이다:
   * 카드 부가세 합계가 세금계산서 매입세액(320,000원/월)과 맞지 않는 갭은
   * 알려진 문제로 그대로 둔다(card-columns.json reconciliation.knownGap).
   * 초기값은 비어 있다. 가져온 적이 없는 상태가 정상 상태다.
   */
  var cardImports = [];
  var cardMerchantRules = {};

  global.AF = global.AF || {};
  var data = {
    user: { email: "demo@assetflow.kr", name: "김민수" },
    asOf: asOfDate,
    asOfMonth: asOfDate.slice(0, 7),
    totals: {
      assets: AT.assets,
      liabilities: AT.liabilities,
      netWorth: AT.netWorth,
      totalCash: AT.totalCash,
      liquidRatio: AT.liquidRatio,
      monthlyIncome: monthlyIncome,
      monthlyExpense: monthlyExpense,
      monthlyBalance: monthlyBalance
    },
    // 자산 화면이 단일 출처다 (§28.10). 배열 자체를 노출해 항목을 편집하게 하고,
    // 합계는 저장하지 않는다 — 행이 단일 출처고 합계는 recompute() 가 다시 만든다.
    assets: assets,
    // 계층 뼈대. 자식을 하나도 붙이지 않은 기관/상품유형도 유지되므로 배열로 둔다.
    institutions: institutions,
    groups: groups,
    liabilities: liabilities,
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
    cashflow: cashflow,
    // 카드내역 (§29). 파서가 뱉은 정규화 행만 저장한다. 원본 파일은 저장하지 않는다.
    card: {
      imports: cardImports,
      merchantRules: cardMerchantRules
    }
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
    // 자산 화면이 단일 출처 (§28.10). 자산·부채를 편집하면 총액·순자산·구성비를
    // 여기서 다시 만든다. 지출 편집과 같은 규약이다.
    var T = computeAssetTotals();
    data.totals.assets = T.assets;
    data.totals.liabilities = T.liabilities;
    data.totals.netWorth = T.netWorth;
    data.totals.totalCash = T.totalCash;
    data.totals.liquidRatio = T.liquidRatio;
    data.composition = buildComposition(T.assets, T.totalCash);

    // Filing 을 편집하면 다음 고지도 다시 계산한다. 로드 시 1회만 정해두면
    //Filing 화면에서 일정을 바꿔도 대시보드 카운트다운이 낡어 있고,
    // 마지막 일정이 지나면 null 인 상태를 아무도 못 본다.
    data.vat.upcoming = nextFiling(data.asOf, data.vat.filings);

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
    }),
assets: assets.map(function (a) {
       var obj = Object.assign({}, a);
       if (obj.currentValue == null) obj.currentValue = obj.amount;
       return obj;
     }),
    institutions: institutions.map(function (i) { return Object.assign({}, i); }),
    groups: groups.map(function (g) { return Object.assign({}, g); }),
    liabilities: liabilities.map(function (l) {
      return { key: l.key, label: l.label, amount: l.amount };
    }),
    // 투자금은 자산 화면에서 고칠 수 있다. 복구 기준값이 필요하다.
    investable: cash.investable.amount
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

  // 그룹(기관/상품유형) 키는 자산 키와 구분한다. 접두어로 보면 로그에서 어느 쪽인지 읽힌다.
  var groupSeq = 0;
  function newGroupKey() {
    return "g" + Date.now().toString(36) + "-" + (++groupSeq);
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

  /* ------------------------------------------------------------------
   * 자산 저장소 (§28.10, 프로토타입 한정)
   * 지출 저장소와 같은 규약을 쓴다: 로드 시 읽고, 값을 바꾼 뒤에만 저장하고,
   * 깨진 값은 조용히 무시하지 말고 걸러낸다. 숫자는 정수로 되돌리고 음수는
   * 0으로 봉정한다. 합계는 저장하지 않는다 — 행이 단일 출처고 합계는
   * recompute() 가 다시 만든다(저장합과 행의 어긋남 원천 차단).
   * ------------------------------------------------------------------ */
var ASSET_KEY = "assetflow.assets.v3";

  function copyAssetSeed() {
    return {
      assets: global.AF.seed.assets.map(function (a) { return Object.assign({}, a); }),
      institutions: global.AF.seed.institutions.map(function (i) { return Object.assign({}, i); }),
      groups: global.AF.seed.groups.map(function (g) { return Object.assign({}, g); }),
      liabilities: global.AF.seed.liabilities.map(function (l) { return Object.assign({}, l); })
    };
  }

  // 이름 없는 행을 걸러낸다. 배열이 비어 있으면 "사용자가 전부 지운 상태"로 존중한다.
  function cleanNamedRows(list, fallback, makeKey) {
    if (!Array.isArray(list)) return fallback;
    if (!list.length) return [];
    var rows = list
      .filter(function (r) { return r && typeof r.name === "string" && r.name.trim() !== ""; })
      .map(function (r) {
        return {
          id: typeof r.id === "string" && r.id ? r.id : makeKey(),
          name: r.name,
          institutionId: typeof r.institutionId === "string" ? r.institutionId : undefined
        };
      });
    return rows.length ? rows : fallback;
  }

  // 이름이 없는 행과 음수·문자 금액을 걸러낸다.
  // 배열이 아예 비어 있으면 "사용자가 전부 지운 정상 상태"로 존중한다.
  // 비어 있지 않는데 살아남은 행이 하나도 없으면 저장소가 깨진 것으로 보고 fallback.

  // 금액·수량은 음수가 아니다. 음수 평가금액은 총자산 합계를 깎아버리고(합계 규칙),
  // 음수 원금은 (평가금액-원금)/원금 수익률의 부호를 뒤집어 버린다.
  // 손실은 수익률로 표현한다. 그래서 아래 둘을 같은 함수로 묶으면 안 된다.
  function nonNegative(v, fallback) {
    var n = +v;
    return v == null || !Number.isFinite(n) || n < 0 ? fallback : n;
  }
  function moneyOf(v, fallback) {
    return Math.round(nonNegative(v, fallback));
  }

    function cleanAssetRows(list, fallback) {
    if (!Array.isArray(list)) return fallback;
    if (!list.length) return [];
    var rows = list
      .filter(function (r) { return r && typeof r.label === "string" && r.label.trim() !== ""; })
      .map(function (r) {
        var assetClass = typeof r.assetClass === "string" ? r.assetClass : "other";
        var amount = moneyOf(r.amount, 0);
        // 평가금액을 모르면 원금으로 채운다. 0 으로 밀어버리면 자산이 사라진다.
        var currentValue = moneyOf(r.currentValue, amount);
        var isInvestClass = assetClass === "stock" || assetClass === "etf" || assetClass === "bond" || assetClass === "fund";
        var isDepositClass = assetClass === "deposit" || assetClass === "savings" || assetClass === "cma" || assetClass === "isa" || assetClass === "pension" || assetClass === "irp";
        var principalInvest = moneyOf(r.principalInvest, isInvestClass ? amount : 0);
        var principalDeposit = moneyOf(r.principalDeposit, isDepositClass ? amount : 0);
        var principal = moneyOf(r.principal, amount);
        var quantity = nonNegative(r.quantity, 0);
        var avgPrice = nonNegative(r.avgPrice, 0);
        // 수익률만 음수가 정상이다. 실제 손실은 여기에 남는다.
        var returnRate = Number.isFinite(+r.returnRate) ? Number(r.returnRate) : 0;
        // 검증한 값을 나중에 쓴다. Object.assign(defaults, r) 로 쓰면 원본 r 이
        // amount:-5000 같은 값을 그대로 덮어써서 위 검증이 전부 무의미해진다.
        // 순서를 바꾸면 r 의 나머지 필드는 보존되고 검증값이 이긴다.
        return Object.assign({}, r, {
          key: typeof r.key === "string" && r.key ? r.key : newKey(),
          label: r.label,
          amount: amount,
          currentValue: currentValue,
          currency: r.currency === "KRW" ? "KRW" : (typeof r.currency === "string" ? r.currency : "KRW"),
          assetClass: assetClass,
          // 계층 위치는 그룹 id로만 가리킨다. 이름은 그룹에서 읽는다(이름 중복 방지).
          institutionId: typeof r.institutionId === "string" ? r.institutionId : "inst-other",
          groupId: typeof r.groupId === "string" ? r.groupId : "g-other-other",
          categoryLevel3: typeof r.categoryLevel3 === "string" ? r.categoryLevel3 : r.label,
          principalInvest: principalInvest,
          principalDeposit: principalDeposit,
          principal: principal,
          quantity: quantity,
          avgPrice: avgPrice,
          returnRate: returnRate
        });
      });
    return rows.length ? rows : fallback;
  }

  function applyAssetSnapshot(snap) {
    if (!snap || typeof snap !== "object") return false;
    var hasAssets = Array.isArray(snap.assets);
    var hasLiabilities = Array.isArray(snap.liabilities);
    var hasInstitutions = Array.isArray(snap.institutions);
    var hasGroups = Array.isArray(snap.groups);
    var hasInvestable = snap.cash && Number.isFinite(+snap.cash.investable);
    if (!hasAssets && !hasLiabilities && !hasInvestable && !hasInstitutions && !hasGroups) {
      return false;
    }
    var seed = copyAssetSeed();

    // 계층 뼈대를 먼저 복구한다. 자식이 없는 그룹도 사용자가 만든 상태이므로 살린다.
    if (hasInstitutions) {
      institutions = cleanNamedRows(snap.institutions, seed.institutions, newGroupKey);
      data.institutions = institutions;
    }
    // 그룹의 institutionId 는 institutions 에 실제로 있는 id 여야 한다.
    // 없는 기관을 가리키면 트리에서 자식과 함께 사라진다.
    if (hasGroups) {
      groups = cleanNamedRows(snap.groups, seed.groups, newGroupKey).filter(function (g) {
        return institutions.some(function (i) { return i.id === g.institutionId; });
      });
      data.groups = groups;
    }
    // 자산이 아예 비어 있으면 사용자가 지운 것으로 존중한다.
    if (hasAssets) {
      assets = cleanAssetRows(snap.assets, seed.assets).filter(function (a) {
        return groups.some(function (g) { return g.id === a.groupId; });
      });
      data.assets = assets;
    }
    // 부채가 없는 것은 정상 상태다. 부채를 0으로 강제하면 사용자의 실제를 덮는다.
    if (hasLiabilities) {
      liabilities = cleanAssetRows(snap.liabilities, []);
      data.liabilities = liabilities;
    }
    // 투자금은 비상금 유지 개월의 분자다. 사용자가 고를 수 있게 한다.
    if (hasInvestable) {
      cash.investable.amount = Math.max(0, Math.round(+snap.cash.investable));
    }
    return true;
  }

  global.AF.assetStorage = {
    key: ASSET_KEY,
    seed: copyAssetSeed,
    load: function () {
      var raw;
      try {
        raw = global.localStorage.getItem(ASSET_KEY);
      } catch (err) {
        return false;
      }
      if (!raw) return false;
      try {
        return applyAssetSnapshot(JSON.parse(raw));
      } catch (err) {
        return false;
      }
    },
    save: function () {
      try {
        global.localStorage.setItem(ASSET_KEY, JSON.stringify({
          assets: data.assets,
          institutions: data.institutions,
          groups: data.groups,
          liabilities: data.liabilities,
          // 자동이체·부가가치세 잔액은 여기서 고치지 않는다(§28.7). 투자금만 보낸다.
          cash: { investable: data.cash.investable.amount }
        }));
        return true;
      } catch (err) {
        return false;
      }
    },
    reset: function () {
      var snap = copyAssetSeed();
      data.assets = snap.assets;
      data.liabilities = snap.liabilities;
      data.institutions = snap.institutions;
      data.groups = snap.groups;
      assets = snap.assets;
      liabilities = snap.liabilities;
      institutions = snap.institutions;
      groups = snap.groups;
      data.cash.investable.amount = global.AF.seed.investable;
      try {
        global.localStorage.removeItem(ASSET_KEY);
      } catch (err) { /* 저장소를 못 쓰는 환경이면 무시 */ }
      return data;
    }
  };

  // 어떤 화면이든 로드 직전에 저장값을 읽는다 (대시보드/설정 포함).
  // 자산 저장소를 먼저 읽어야 recompute() 가 저장된 값으로 합계를 만든다.
  global.AF.assetStorage.load();
  global.AF.storage.load();
  global.AF.recompute();

  /* ------------------------------------------------------------------
   * 카드내역 저장소 (§29, 프로토타입 한정)
   * 지출 저장소와 같은 규약을 쓴다: 로드 시 읽고, 값을 바꾼 뒤에만 저장하고,
   * 깨진 값은 조용히 무시하지 말고 걸러낸다. 행마다 최소 필드를 검증하고
   * 숫자는 정수로 되돌린다. 합계는 저장하지 않는다 — 행이 단일 출처고
   * 합계는 화면이 행에서 다시 계산한다(저장합과 행의 어긋남 원천 차단).
   * ------------------------------------------------------------------ */
  var CARD_KEY = "assetflow.cardImports.v1";
  var EXPENSE_KINDS = ["business", "personal"];

  function snapRow(r) {
    return {
      rowKey: r.rowKey,
      approvedAt: typeof r.approvedAt === "string" ? r.approvedAt : "",
      merchantName: r.merchantName,
      grossAmount: Math.round(r.grossAmount),
      // 역산 공급가액은 파서 규칙(gross - vat)으로 다시 만든다. 저장값을 믿지 않는다.
      supplyExVat: Math.round(r.grossAmount) - Math.round(r.vat),
      vat: Math.round(r.vat),
      expenseKind: EXPENSE_KINDS.indexOf(r.expenseKind) >= 0 ? r.expenseKind : "unclassified",
      reversal: r.reversal === "매입취소" ? "매입취소" : "매입",
      cardMasked: typeof r.cardMasked === "string" ? r.cardMasked : null,
      approvedAmount: typeof r.approvedAmount === "number" ? Math.round(r.approvedAmount) : null,
      installmentCount: typeof r.installmentCount === "number" ? Math.round(r.installmentCount) : null,
      memberRelation: typeof r.memberRelation === "string" ? r.memberRelation : null,
      approvalNo: typeof r.approvalNo === "string" ? r.approvalNo : null
    };
  }

  function applyCardSnapshot(snap) {
    if (!snap || !Array.isArray(snap.imports)) return false;
    var imports = snap.imports
      .filter(function (imp) {
        return imp && typeof imp.id === "string" && Array.isArray(imp.rows);
      })
      .map(function (imp) {
        return {
          id: imp.id,
          company: imp.company === "hyundaicard" ? "hyundaicard" : "samsungcard",
          title: typeof imp.title === "string" ? imp.title : "",
          importedAt: typeof imp.importedAt === "string" ? imp.importedAt : "",
          period: typeof imp.period === "string" ? imp.period : "",
          // 교차검증 결과는 증빙으로 남긴다. 합계 값 자체는 저장하지 않는다.
          crossCheck: imp.crossCheck && typeof imp.crossCheck === "object" ? imp.crossCheck : null,
          rows: imp.rows
            .filter(function (r) {
              return r && typeof r.merchantName === "string" &&
                typeof r.grossAmount === "number" && typeof r.vat === "number" &&
                typeof r.rowKey === "string";
            })
            .map(snapRow)
        };
      })
      .filter(function (imp) { return imp.rows.length > 0; });

    var rules = {};
    if (snap.merchantRules && typeof snap.merchantRules === "object") {
      Object.keys(snap.merchantRules).forEach(function (k) {
        if (EXPENSE_KINDS.indexOf(snap.merchantRules[k]) >= 0) rules[k] = snap.merchantRules[k];
      });
    }

    data.card.imports = imports;
    data.card.merchantRules = rules;
    return true;
  }

  global.AF.cardStorage = {
    key: CARD_KEY,
    load: function () {
      var raw;
      try {
        raw = global.localStorage.getItem(CARD_KEY);
      } catch (err) {
        return false;
      }
      if (!raw) return false;
      try {
        return applyCardSnapshot(JSON.parse(raw));
      } catch (err) {
        return false;
      }
    },
    save: function () {
      try {
        global.localStorage.setItem(CARD_KEY, JSON.stringify({
          imports: data.card.imports,
          merchantRules: data.card.merchantRules
        }));
        return true;
      } catch (err) {
        return false;
      }
    },
    reset: function () {
      data.card.imports = [];
      data.card.merchantRules = {};
      try {
        global.localStorage.removeItem(CARD_KEY);
      } catch (err) { /* 저장소를 못 쓰는 환경이면 무시 */ }
      return data;
    }
  };

  global.AF.cardStorage.load();

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
