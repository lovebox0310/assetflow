/* AssetFlow 프로토타입 더미 데이터 + 포맷터
 * project.md §28.3 (통화·날짜 포맷) 규칙을 그대로 반영한 JS 이식본.
 * 실제 앱에서는 apps/frontend/src/utils/formatters.ts 로 옮긴다.
 *
 * 카드 계산식 출처: project.md §23 "표시 규칙"
 *   순자산           = 총자산 - 총부채
 *   월 수지          = 월 총수입 - 월 총지출
 *   비상금 유지 개월  = 보유 현금 / 월 필수지출
 *   자산 구성비      = 자산 유형별 비율(합계 100%)
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

  /* ---------- 원본 데이터 ---------- */

  var assets = [
    { key: "stock", label: "주식", amount: 142600000 },
    { key: "realestate", label: "부동산", amount: 158000000 },
    { key: "cash", label: "현금·입출금", amount: 48200000 },
    { key: "pension", label: "연금", amount: 36600000 }
  ];

  var raw = {
    user: { email: "demo@assetflow.kr", name: "김민수" },
    assets: assets,
    liabilities: [{ key: "loan", label: "대출", amount: 62500000 }],
    monthlyIncome: 8400000,
    monthlyExpense: 7160000,
    // 월 필수지출: 고정지출 + 최소 생활비. 비상금 분모로 사용 (§23)
    monthlyEssentialExpense: 6700000,
    emergencyFundTargetMonths: 6,
    cashflow: [
      { month: "2026-04", amount: 1180000 },
      { month: "2026-05", amount: 1340000 },
      { month: "2026-06", amount: 980000 },
      { month: "2026-07", amount: 1420000 },
      { month: "2026-08", amount: 1090000 },
      { month: "2026-09", amount: 1240000 }
    ]
  };

  /* ---------- 카드 계산 (§23 표시 규칙) ---------- */

  var totalAssets = assets.reduce(function (sum, a) {
    return sum + a.amount;
  }, 0);

  var totalLiabilities = raw.liabilities.reduce(function (sum, l) {
    return sum + l.amount;
  }, 0);

  var netWorth = totalAssets - totalLiabilities;
  var monthlyBalance = raw.monthlyIncome - raw.monthlyExpense;

  var cashAmount = assets
    .filter(function (a) {
      return a.key === "cash";
    })
    .reduce(function (sum, a) {
      return sum + a.amount;
    }, 0);

  var emergencyMonths = cashAmount / raw.monthlyEssentialExpense;
  var emergencyTarget = raw.emergencyFundTargetMonths * raw.monthlyEssentialExpense;
  var emergencyReached = cashAmount >= emergencyTarget;

  var composition = assets
    .map(function (a) {
      return {
        key: a.key,
        label: a.label,
        amount: a.amount,
        percent: (a.amount / totalAssets) * 100
      };
    })
    .sort(function (a, b) {
      return b.amount - a.amount;
    });

  var data = {
    user: raw.user,
    asOf: "2026-09-30",
    totals: {
      assets: totalAssets,
      liabilities: totalLiabilities,
      netWorth: netWorth,
      monthlyIncome: raw.monthlyIncome,
      monthlyExpense: raw.monthlyExpense,
      monthlyBalance: monthlyBalance,
      cash: cashAmount,
      emergencyTarget: emergencyTarget,
      emergencyReached: emergencyReached
    },
    emergency: {
      months: emergencyMonths,
      current: cashAmount,
      targetMonths: raw.emergencyFundTargetMonths,
      targetAmount: emergencyTarget,
      reached: emergencyReached
    },
    composition: composition,
    cashflow: raw.cashflow
  };

  global.AF = global.AF || {};
  global.AF.data = data;
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
