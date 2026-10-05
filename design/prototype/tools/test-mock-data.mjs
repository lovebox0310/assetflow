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

report("mock-data 저장·계산 계약");