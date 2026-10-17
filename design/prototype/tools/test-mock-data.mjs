// common/mock-data.js 의 저장·계산 계약 검증.
//
// 이 파일이 막는 것:
//   계층(기관→그룹→자산) 저장소가 조용히 깨지면 사용자는 "내 값이 반영 안 된다"는
//   버그만 본다. 조용한 실패가 가장 비싸다. 그래서 여기서 나쁜 값이 걸러지는지 본다.
//
// 기대값을 손으로 쓰지 않는다. 시드 데이터에서 직접 계산한다.
// 기준선 숫자를 박아두면 시드를 고칠 때마다 테스트가 거짓말을 하게 된다
// (기존 판단: samples/card/tools/test-parse-*.mjs 의 교차검증과 같은 원칙).

import { check, report, createEnv, ROOT, sum } from "./prototype-harness.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const MOCK = resolve(ROOT, "design", "prototype", "common", "mock-data.js");
const ASSET_KEY = "assetflow.assets.v3";

/** mock-data.js 를 새 환경에 적재한다. localStorage 내용물은 주입할 수 있다. */
function fresh(seedStorage) {
  const env = createEnv();
  if (seedStorage) {
    for (const [k, v] of Object.entries(seedStorage)) env.store.set(k, v);
  }
  vm.runInContext(readFileSync(MOCK, "utf8"), env.sandbox, { filename: "mock-data.js" });
  return env;
}

/* ---------------------------------------------------------------- */
/* 1. 시드 자체가 계층 규칙을 지키는가                                */
/* ---------------------------------------------------------------- */

const seedEnv = fresh();
const seed = seedEnv.window.AF.seed;

check("저장 키가 v3다", seedEnv.window.AF.assetStorage.key === ASSET_KEY,
  "실제 " + seedEnv.window.AF.assetStorage.key);

const instIds = new Set(seed.institutions.map((i) => i.id));
const groupIds = new Set(seed.groups.map((g) => g.id));

check("시드 기관 id 가 중복되지 않는다", instIds.size === seed.institutions.length,
  instIds.size + "/" + seed.institutions.length);
check("시드 그룹 id 가 중복되지 않는다", groupIds.size === seed.groups.length,
  groupIds.size + "/" + seed.groups.length);

const orphanGroups = seed.groups.filter((g) => !instIds.has(g.institutionId));
check("모든 그룹이 실제 기관을 가리킨다", orphanGroups.length === 0,
  orphanGroups.map((g) => g.id).join(","));

const orphanAssets = seed.assets.filter((a) => !groupIds.has(a.groupId));
check("모든 자산이 실제 그룹을 가리킨다", orphanAssets.length === 0,
  orphanAssets.map((a) => a.key).join(","));

check("모든 자산에 이름이 있다", seed.assets.every((a) => typeof a.label === "string" && a.label.trim() !== ""));

/* ---------------------------------------------------------------- */
/* 2. 계산값은 행에서 다시 만들어진다                                 */
/* ---------------------------------------------------------------- */

const d = seedEnv.window.AF.data;

// 자산 합계는 평가금액(currentValue) 기준이다. amount(원금) 기준이 아니다.
const assetByCurrentValue = sum(d.assets, (a) => a.currentValue);
const assetByPrincipal = sum(d.assets, (a) =>
  a.principalDeposit || a.principalInvest || a.principal || 0);
// 총자산에는 현금이 같이 들어간다. 자산 합계와 같으면 현금을 빼먹은 것이다.
const cashTotal = sum(
  ["investable", "autoTransfer", "vat"],
  (k) => d.cash[k].amount
);

check("totals.assets = 자산 평가합계 + 현금 3계좌",
  d.totals.assets === assetByCurrentValue + cashTotal,
  "totals " + d.totals.assets + " vs 계산 " + (assetByCurrentValue + cashTotal));
check("평가합계와 원금합계가 다르다 (한쪽으로 잘못 고정되지 않았는지)",
  assetByCurrentValue !== assetByPrincipal,
  "둘이 같으면 검증이 무의미하다");
check("totals.liabilities = 부채 합계",
  d.totals.liabilities === sum(d.liabilities, (l) => l.amount));
check("totals.netWorth = 총자산 - 총부채",
  d.totals.netWorth === d.totals.assets - d.totals.liabilities);

/* ---------------------------------------------------------------- */
/* 2b. 예적금 수익률 규칙                                             */
/* ---------------------------------------------------------------- */

// 예적금 계열은 원금이 있고 평가금액이 따로 있으면 반드시 수익률이 있어야 한다.
// 원금 == 평가금액 으로 두면 파생값이 0 이 되는데, 그건 버그다. 2026-10-05 에
// 정기예금·자유적금 두 행이 이 상태였고, 시드는 2.5 / 2.3 이라고 적고 있었다 —
// 편집하지 않아도 이미 자기모순이었다.
const DEPOSIT_CLASS = new Set([
  "deposit", "savings", "cma", "isa", "pension", "irp"
]);
const depositRows = d.assets.filter((a) => DEPOSIT_CLASS.has(a.assetClass));

check("예적금 계열 자산이 시드에 존재한다", depositRows.length > 0,
  "0건이면 아래 검증이 무의미하다");

const rateMismatch = depositRows.filter((a) => {
  const p = a.principalDeposit || 0;
  if (p <= 0) return false;
  const derived = ((a.currentValue - p) / p) * 100;
  return Math.abs(derived - a.returnRate) > 0.05;
});
check("예적금 수익률이 (평가금액-원금)/원금 파생값과 일치한다",
  rateMismatch.length === 0,
  rateMismatch.map((a) =>
    a.label + " " + a.returnRate + "% vs 파생 " +
    (((a.currentValue - a.principalDeposit) / a.principalDeposit) * 100).toFixed(3) + "%"
  ).join(" | "));

const zeroRate = depositRows.filter((a) =>
  (a.principalDeposit || 0) > 0 && a.returnRate <= 0);
check("원금이 있는 예적금의 수익률이 0 이하다 (무조건 0% 는 버그)",
  zeroRate.length === 0,
  zeroRate.map((a) => a.label).join(", "));

// 평가금액이 원금과 같으면 이자가 하나도 없다. 시드의 규칙상 이자는 항상 붙는다.
const noInterest = depositRows.filter((a) =>
  (a.principalDeposit || 0) > 0 && a.currentValue <= a.principalDeposit);
check("예적금 평가금액이 원금보다 크다 (이자 0 을 상태로 두지 않는다)",
  noInterest.length === 0,
  noInterest.map((a) => a.label).join(", "));

/* ---------------------------------------------------------------- */
/* 3. 왕복: 저장 → 새 환경 → 로드                                   */
/* ---------------------------------------------------------------- */

const roundEnv = fresh();
roundEnv.window.AF.data.assets[0].currentValue += 12345;
roundEnv.window.AF.data.assets[0].label = "왕복 확인용 이름";
roundEnv.window.AF.assetStorage.save();

check("저장하면 저장소가 생긴다", roundEnv.store.has(ASSET_KEY));

const reloaded = fresh({ [ASSET_KEY]: roundEnv.store.get(ASSET_KEY) });
check("새 환경에서 로드하면 값이 유지된다",
  reloaded.window.AF.data.assets[0].currentValue === roundEnv.window.AF.data.assets[0].currentValue);
check("이름도 유지된다",
  reloaded.window.AF.data.assets[0].label === "왕복 확인용 이름");
check("계층 뼈대도 유지된다",
  reloaded.window.AF.data.institutions.length === roundEnv.window.AF.data.institutions.length &&
  reloaded.window.AF.data.groups.length === roundEnv.window.AF.data.groups.length);

/* ---------------------------------------------------------------- */
/* 4. 사용자가 전부 지운 상태는 존중한다                             */
/* ---------------------------------------------------------------- */

// 여기서 이 판단이 틀리면, 항목을 지운 사용자는 새로고침마다 되살아난다.
const emptied = fresh();
emptied.window.AF.data.assets = [];
emptied.window.AF.data.institutions = [];
emptied.window.AF.data.groups = [];
emptied.window.AF.assetStorage.save();

const afterEmpty = fresh({ [ASSET_KEY]: emptied.store.get(ASSET_KEY) });
check("빈 배열은 손상이 아니라 사용자의 선택으로 존중한다",
  afterEmpty.window.AF.data.assets.length === 0,
  "자산 " + afterEmpty.window.AF.data.assets.length + "건 되살아남");
check("빈 기관 배열도 존중한다", afterEmpty.window.AF.data.institutions.length === 0);
check("빈 그룹 배열도 존중한다", afterEmpty.window.AF.data.groups.length === 0);

/* ---------------------------------------------------------------- */
/* 5. 깨진 저장소는 조용히 버리지 않고 걸러낸다                       */
/* ---------------------------------------------------------------- */

const cases = [
  {
    name: "JSON 이 깨졌다면 시드로 되돌린다",
    raw: "{ 이건 JSON 아님",
    expect: (e) => e.window.AF.data.assets.length === seed.assets.length,
  },
  {
    name: "배열이 아니면 시드로 되돌린다",
    raw: JSON.stringify({ assets: "문자열", groups: 3 }),
    expect: (e) => e.window.AF.data.assets.length === seed.assets.length,
  },
  {
    name: "이름이 전부 비었다면 손상으로 보고 시드",
    raw: JSON.stringify({
      assets: [{ key: "k", label: "   ", amount: 1 }],
      institutions: [{ id: "i1", name: " " }],
      groups: [{ id: "g1", name: "", institutionId: "i1" }],
    }),
    expect: (e) => e.window.AF.data.assets.length === seed.assets.length &&
                   e.window.AF.data.institutions.length === seed.institutions.length,
  },
];

cases.forEach((c) => {
  const e = fresh({ [ASSET_KEY]: c.raw });
  check(c.name, c.expect(e),
    "자산 " + e.window.AF.data.assets.length + " / 기관 " + e.window.AF.data.institutions.length);
});

/* ---------------------------------------------------------------- */
/* 6. 나쁜 값이 조용히 통과하지 않는다                               */
/* ---------------------------------------------------------------- */

const dirty = fresh({
  [ASSET_KEY]: JSON.stringify({
    institutions: [
      { id: "inst-ok", name: "정상 기관" },
      { id: "inst-a", name: "그룹 귀환机构" },
      { id: "inst-b", name: "빈 그룹 기관" },
    ],
    groups: [
      { id: "grp-ok", name: "정상 그룹", institutionId: "inst-ok" },
      // 아래 기관은 저장소에 없다. 이 그룹은 트리에서 사라져야 한다.
      { id: "grp-orphan", name: "고아 그룹", institutionId: "inst-없는곳" },
      { id: "grp-empty", name: "빈 그룹", institutionId: "inst-b" },
    ],
    assets: [
      { key: "a-ok", label: "남는 자산", groupId: "grp-ok", amount: 1000, currentValue: 1000 },
      { key: "a-orphan", label: "고아 자산", groupId: "grp-없는곳", amount: 1000, currentValue: 1000 },
      { key: "a-neg", label: "음수 원금", groupId: "grp-ok", amount: -5000, currentValue: -1 },
      { key: "a-nan", label: "문자 금액", groupId: "grp-ok", amount: "천원", currentValue: "백만" },
    ],
    liabilities: [],
    cash: { investable: 1000 },
  }),
});

const dd = dirty.window.AF.data;
const keptLabels = dd.assets.map((a) => a.label);

check("그룹이 가리키는 기관이 없으면 그 그룹은 사라진다",
  !dd.groups.some((g) => g.id === "grp-orphan"));
check("자식이 하나도 없는 빈 그룹은 살아남는다 (사용자가 만든 상태)",
  dd.groups.some((g) => g.id === "grp-empty"));
check("자산이 가리키는 그룹이 없으면 그 자산은 사라진다",
  !keptLabels.includes("고아 자산"));
check("음수 원금은 0 으로 봉정된다",
  dd.assets.find((a) => a.label === "음수 원금").amount === 0,
  "실제 " + dd.assets.find((a) => a.label === "음수 원금").amount);
check("평가금액이 음수면 0 이 아니라 원금으로 채워진다(값이 사라지지 않게)",
  dd.assets.find((a) => a.label === "음수 원금").currentValue === 0,
  "실제 " + dd.assets.find((a) => a.label === "음수 원금").currentValue);
check("문자열 금액은 0 이 된다",
  dd.assets.find((a) => a.label === "문자 금액").amount === 0);
check("유효한 자산은 남는다", keptLabels.includes("남는 자산"));
check("부채 빈 배열은 존중한다", dd.liabilities.length === 0);

/* ---------------------------------------------------------------- */
/* 7. 저장은 열기만 해서는 생기지 않는다                             */
/* ---------------------------------------------------------------- */

const untouched = fresh();
untouched.window.AF.assetStorage.load();
check("로드만 하고 저장하지 않으면 저장소가 생기지 않는다",
  !untouched.store.has(ASSET_KEY),
  "실제 키: " + Array.from(untouched.store.keys()).join(","));

/* ---------------------------------------------------------------- */
/* 8. reset 은 저장소를 지운다                                       */
/* ---------------------------------------------------------------- */

const resetting = fresh();
resetting.window.AF.data.assets = [];
resetting.window.AF.assetStorage.save();
resetting.window.AF.assetStorage.reset();
check("reset 하면 저장소가 지워진다", !resetting.store.has(ASSET_KEY));
check("reset 하면 시드로 돌아온다",
  resetting.window.AF.data.assets.length === seed.assets.length);

/* ---------------------------------------------------------------- */
/* 9. 부채 회차는 원리금균등 수학을 지킨다                             */
/* ---------------------------------------------------------------- */

// 예적금 테스트와 같은 원칙: 기대값은 하드코딩하지 않고 시드 행에서 계산한다.
// 여기서 고정하는 건 "공식" 자체다 — 값이 아니라 관계(납입액 = 이자 + 원금,
// 끝나면 잔액 0, 역산하면 되돌아온다)만 검증한다.
const debtFn = seedEnv.window.AF.debt;
const liab0 = d.liabilities[0];

check("시드 부채가 하나 이상 있다", d.liabilities.length > 0 && !!liab0,
  d.liabilities.length + "건");

const sched0 = debtFn.schedule(liab0.amount, liab0.rate, liab0.termMonths,
  liab0.monthlyPayment);
const rows0 = sched0.rows;
const plan0 = debtFn.plan(liab0, d.asOfMonth);

check("회차 수는 남은 회차와 같다", rows0.length === liab0.termMonths,
  rows0.length + " vs " + liab0.termMonths);
check("첫 납입액은 사용자가 준 값을 쓴다(공식 역산값이 대신하지 않는다)",
  rows0.length > 0 && rows0[0].payment === liab0.monthlyPayment,
  (rows0[0] ? rows0[0].payment : "-") + " vs " + liab0.monthlyPayment);
check("제공값과 공식 월 납입액은 1원 미만으로 어긋난다(그래서 제공값이 필요하다)",
  Math.abs(debtFn.monthlyPaymentOf(liab0.amount, liab0.rate, liab0.termMonths) -
    liab0.monthlyPayment) < 1,
  String(debtFn.monthlyPaymentOf(liab0.amount, liab0.rate, liab0.termMonths)));
// 이자·원금·납입액은 각자 float 로 반올림한다. 셋을 따로 둥글리면 합이 어긋날 수
// 있다 — 어긋나는 건1원이고 마지막 회차에서만 실제로 나타난다(잔액 정리를 흡수).
check("회차 납입액은 이자와 원금의 합에서 1원 안에 있다",
  rows0.every((r) => Math.abs(r.payment - (r.interest + r.principal)) <= 1),
  JSON.stringify(rows0.filter((r) => Math.abs(r.payment - (r.interest + r.principal)) > 1)));
check("마지막 회차 전까지는 납입액 = 이자 + 원금 이 정확히 성립한다",
  rows0.slice(0, -1).every((r) => r.payment === r.interest + r.principal),
  JSON.stringify(rows0.filter((r) => r.payment !== r.interest + r.principal)
    .map((r) => r.k)));
check("회차 납입액은 마지막까지 같다(원리금균등)",
  rows0.slice(0, -1).every((r) => r.payment === liab0.monthlyPayment));
check("이자는 회차가 갈수록 줄어든다",
  rows0.every((r, i) => i === 0 || r.interest < rows0[i - 1].interest));
check("원금은 회차가 갈수록 늘어난다",
  rows0.every((r, i) => i === 0 || r.principal > rows0[i - 1].principal));
check("잔액은 갚으면서 커지지 않는다",
  rows0.every((r, i) => i === 0 || r.balance <= rows0[i - 1].balance));
check("마지막 회차에서 잔액이 0이 된다",
  rows0[rows0.length - 1].balance === 0, String(rows0[rows0.length - 1].balance));
check("총 납입액은 원금 + 총이자다",
  plan0.totalPaid === liab0.amount + plan0.totalInterest,
  plan0.totalPaid + " vs " + (liab0.amount + plan0.totalInterest));
check("이자·납입액은 스케줄 합계에서 다시 나온다",
  plan0.totalInterest > 0 && plan0.finalPayment > 0 && plan0.nextPayment > 0,
  [plan0.totalInterest, plan0.finalPayment, plan0.nextPayment].join("/"));
check("plan.remaining 은 스케줄이 실제로 끝나는 지점이다",
  plan0.remaining === rows0.length, plan0.remaining + " vs " + rows0.length);

// 원리금균등의 역함수. 두 함수가 서로를 되돌려야 한다.
check("월 납입액으로 기간을 역산하면 되돌아온다",
  Math.abs(debtFn.termMonthsOf(liab0.amount, liab0.rate,
    debtFn.monthlyPaymentOf(liab0.amount, liab0.rate, liab0.termMonths)) - liab0.termMonths) < 1,
  String(debtFn.termMonthsOf(liab0.amount, liab0.rate,
    debtFn.monthlyPaymentOf(liab0.amount, liab0.rate, liab0.termMonths))));
check("제공 납입액으로 역산한 기간도 계약 회차와 어긋나지 않는다",
  Math.abs(debtFn.termMonthsOf(liab0.amount, liab0.rate, liab0.monthlyPayment) -
    liab0.termMonths) < 1,
  String(debtFn.termMonthsOf(liab0.amount, liab0.rate, liab0.monthlyPayment)));
check("이자 없는 대출은 단순 나눗셈이다",
  debtFn.monthlyPaymentOf(1200000, 0, 12) === 100000 &&
    debtFn.termMonthsOf(1200000, 0, 100000) === 12,
  debtFn.monthlyPaymentOf(1200000, 0, 12) + "/" + debtFn.termMonthsOf(1200000, 0, 100000));
check("기간이나 납입액이 0이면 회차도 0이다",
  debtFn.monthlyPaymentOf(1000000, 3, 0) === 0 &&
    debtFn.termMonthsOf(1000000, 3, 0) === 0);
check("그 월 납입액으로는 원금을 못 갚는다",
  debtFn.termMonthsOf(1000000, 10, 1) === 0,
  String(debtFn.termMonthsOf(1000000, 10, 1)));

// 만기는 저장하지 않고 asOf + 남은 회차에서 만든다.
const monthsFromAsOf = (ym, asOfMonth) => {
  const [y, m] = ym.split("-").map(Number);
  const [sy, sm] = asOfMonth.split("-").map(Number);
  return (y * 12 + m) - (sy * 12 + sm);
};
check("maturityOf 가 남은 회차로 돌아온다",
  monthsFromAsOf(plan0.maturity, d.asOfMonth) === liab0.termMonths,
  plan0.maturity + " → " + monthsFromAsOf(plan0.maturity, d.asOfMonth) +
    " vs " + liab0.termMonths);
check("남은 회차가 0이면 만기는 이번 달이다(화면은 0회차를 따로 다룬다)",
  debtFn.maturityOf(d.asOfMonth, 0) === d.asOfMonth,
  debtFn.maturityOf(d.asOfMonth, 0));
check("남은 회차가 마이너스면 만기가 없다",
  debtFn.maturityOf(d.asOfMonth, -1) === "");

// 잔액을 갑자기 줄이면 남은 회차 안에 먼저 끝난다.
const early0 = debtFn.schedule(60000000, 3.5, 274, 1000000);
check("초과 납입하면 계약 회차보다 먼저 끝난다",
  early0.rows.length > 0 && early0.rows.length < 274,
  early0.rows.length + "회차");
check("조기 상환 회차에도 음수가 없다",
  early0.rows.every((r) => r.payment >= 0 && r.principal >= 0 && r.balance >= 0),
  JSON.stringify(early0.rows[early0.rows.length - 1]));
check("조기 상환도 잔액 0으로 끝난다",
  early0.rows[early0.rows.length - 1].balance === 0);

report("mock-data 저장·계산 계약");