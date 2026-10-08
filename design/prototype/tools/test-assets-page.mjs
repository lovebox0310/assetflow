// assets.html 계층 트리 + 읽기/수정 모드 + 확정/취소 회귀 검증.
//
// 이 파일이 막는 것:
//   "수정 모드에서 고친 값이 새로고침하면 사라진다", "취소했는데 값이 남아 있다",
//   "수익률이 평가금액과 어긋난다" — 사용자가 가장 자주 겪고, 가장 말하기 어려운
//   세 가지다. 전부 저장 경계를 넘는 문제라 눈으로 확인해서는 놓친다.
//
// 기대값은 시드 데이터에서 계산한다. 합계 숫자를 손으로 박지 않는다.

import { check, report, loadPage, createEnv, formatKRW, sum } from "./prototype-harness.mjs";
import { readFileSync } from "node:fs";

const KEY = "assetflow.assets.v3";
const INVEST_CLASSES = ["stock", "etf", "bond", "fund"];
const DEPOSIT_CLASSES = ["deposit", "savings", "cma", "isa", "pension", "irp"];

/** 시나리오마다 새 환경을 쓴다. 앞 시나리오의 저장이 새 시나리오로 새지 않게. */
function boot(storage) {
  const env = createEnv();
  if (storage) for (const [k, v] of Object.entries(storage)) env.store.set(k, v);
  return loadPage("assets.html", { env });
}

const text = (p, id) => p.queries.text(p.el(id));
const treeInputs = (p) => p.queries.inputsUnder(p.el("assetsTreeBody"));
const assetByLabel = (list, label) => list.filter((x) => x.label === label)[0];
const assetByKey = (list, key) => list.filter((x) => x.key === key)[0];
/** 라벨로 자산 키를 찾는다. 행 DOM 을 거치지 않고 데이터에서 뽑는다. */
const keyOf = (p, label) => {
  const a = assetByLabel(p.data.assets, label);
  if (!a) throw new Error("시드에 없는 자산 라벨: " + label);
  return a.key;
};
const fieldList = (p, label) =>
  treeInputs(p).filter((i) => i.dataset.key === keyOf(p, label)).map((i) => i.dataset.field).join(",");
const rowOf = (p, label) =>
  p.queries.rowsByClass("tree-level3").filter((r) => p.queries.text(r).indexOf(label) >= 0)[0];
const inputOf = (p, label, field) => p.queries.findInput(keyOf(p, label), field);
const type = (p, label, field, value) => p.queries.type(inputOf(p, label, field), value);
const editMode = (p) => p.el("toggleMode").click();
const savedAssets = (p) => (p.store.has(KEY) ? p.saved(KEY).assets : null);

/* ================================================================ */
/* 1. 첫 화면은 읽기 모드                                           */
/* ================================================================ */

const p1 = boot();
const d1 = p1.data;

check("시드는 읽기 모드로 열린다", text(p1, "modeState") === "읽기", text(p1, "modeState"));
check("읽기 모드에서 자산 행에 입력칸이 없다", treeInputs(p1).length === 0,
  "입력칸 " + treeInputs(p1).length + "개");
check("읽기 모드에서 전환 버튼이 보인다", p1.el("toggleMode").hidden === false);
check("읽기 모드에서 기관 추가 버튼이 숨겨진다", p1.el("addAsset").hidden === true);
check("읽기 모드에서 확정 버튼이 비활성화된다", p1.el("editConfirm").disabled === true);
check("읽기 모드에서 취소 버튼이 비활성화된다", p1.el("editCancel").disabled === true);
check("변경이 없으면 안내가 숨겨진다", p1.el("modeHint").hidden === true);
check("읽기 모드에서 자산 행에 삭제 버튼이 없다",
  p1.queries.rowsByClass("tree-level3").every((r) =>
    buttonLabels(p1, r).every((l) => l !== "×")));

check("자산 행 수는 시드 자산 수와 같다",
  p1.queries.rowsByClass("tree-level3").length === d1.assets.length,
  p1.queries.rowsByClass("tree-level3").length + "행");

/* ================================================================ */
/* 2. 트리 합계가 행에서 재계산된 값과 일치                           */
/* ================================================================ */

const principalOf = (a) =>
  INVEST_CLASSES.indexOf(a.assetClass) >= 0
    ? a.quantity * a.avgPrice
    : DEPOSIT_CLASSES.indexOf(a.assetClass) >= 0 ? a.principalDeposit : a.principal;
const currentTotal = (list) => sum(list, (a) => a.currentValue);
const principalTotal = (list) => sum(list, principalOf);

check("tfoot 평가합계가 자산 평가합계와 같다",
  text(p1, "assetsSum") === formatKRW(currentTotal(d1.assets)),
  text(p1, "assetsSum") + " vs " + formatKRW(currentTotal(d1.assets)));
check("tfoot 원금합계가 자산 원금합계와 같다",
  text(p1, "assetsPrincipalSum") === formatKRW(principalTotal(d1.assets)),
  text(p1, "assetsPrincipalSum") + " vs " + formatKRW(principalTotal(d1.assets)));

// 합계마다 "원" 이 붙거나 빠지면 사용자는 숫자를 못 믿는다.
// 요약 카드는 f.formatKRW 를 써서 "원" 이 붙는다(전 화면 공통 규약).
// 트리 tfoot 은 같은 숫자를 단위 없이 보여 준다. 두 기준이 섞이면 어긋난다.
check("tfoot 평가합계에 단위 글자가 붙지 않는다", text(p1, "assetsSum").indexOf("원") === -1,
  text(p1, "assetsSum"));
check("tfoot 원금합계에 단위 글자가 붙지 않는다", text(p1, "assetsPrincipalSum").indexOf("원") === -1,
  text(p1, "assetsPrincipalSum"));
check("부채 tfoot 도 단위 글자가 없다", text(p1, "liabSum").indexOf("원") === -1,
  text(p1, "liabSum"));
check("요약 카드 총자산은 단위까지 붙는다 (전 화면 규약)", /\d원$/.test(text(p1, "sumTotalAssets")),
  text(p1, "sumTotalAssets"));

/* ================================================================ */
/* 3. 수정 모드 전환                                                */
/* ================================================================ */

const p2 = boot();
editMode(p2);

check("수정 모드로 전환된다", text(p2, "modeState") === "수정", text(p2, "modeState"));
check("수정 모드에서 입력칸이 생긴다", treeInputs(p2).length > 0,
  "입력칸 " + treeInputs(p2).length);
check("수정 모드에서 전환 버튼이 숨겨진다", p2.el("toggleMode").hidden === true);
check("수정 모드에서 기관 추가 버튼이 보인다", p2.el("addAsset").hidden === false);
check("아직 안 바꿨으면 확정은 막힌다", p2.el("editConfirm").disabled === true);
check("아직 안 바꿨으면 취소도 막힌다", p2.el("editCancel").disabled === true);

// 열 구조는 자산 유형과 무관하게 동일하다(수량·평단가 칸이 전부 있다).
// 유형별로 달라지는 것은 "원금을 직접 고칠 수 있느냐" 하나뿐이다.
// 투자자산은 원금칸이 계산값이라 입력칸이 없고, 대신 수량·평단가가 원금의 근원이다.
check("예적금 행 입력칸 = label,principal,quantity,avgPrice,currentValue",
  fieldList(p2, "신한은행 정기예금") === "label,principal,quantity,avgPrice,currentValue",
  "실제 " + fieldList(p2, "신한은행 정기예금"));
check("투자자산 행은 원금칸이 빠진다 = label,quantity,avgPrice,currentValue",
  fieldList(p2, "미래에셋증권 삼성전자") === "label,quantity,avgPrice,currentValue",
  "실제 " + fieldList(p2, "미래에셋증권 삼성전자"));
check("예적금 원금칸은 직접 고칠 수 있다",
  p2.queries.findInput(keyOf(p2, "신한은행 정기예금"), "principal") !== null);
check("투자자산 원금칸은 입력칸이 아니다 (수량 × 평단가로 정해진다)",
  p2.queries.findInput(keyOf(p2, "미래에셋증권 삼성전자"), "principal") === null);
check("수익률 칸은 언제나 읽기 전용이다",
  p2.queries.rowsByClass("tree-level3").every((r) =>
    p2.queries.inputsUnder(r).every((i) => i.dataset.field !== "returnRate")));
check("수정 모드에서 삭제 버튼이 뜬다",
  rowOf(p2, "신한은행 정기예금") &&
  buttonLabels(p2, rowOf(p2, "신한은행 정기예금")).indexOf("×") >= 0);

/* ================================================================ */
/* 4. 수정 중에는 저장되지 않는다                                   */
/* ================================================================ */

const p3 = boot();
// 되돌아갈 시드 값을 먼저 기억한다. 하드코딩하면 시드 고칠 때 조용히 무의미해진다.
const seedDepCv3 =
  assetByKey(p3.data.assets, keyOf(p3, "신한은행 정기예금")).currentValue;
editMode(p3);
type(p3, "신한은행 정기예금", "currentValue", "60000000");

check("수정 모드에서 값이 메모리에는 반영된다",
  assetByKey(p3.data.assets, keyOf(p3, "신한은행 정기예금")).currentValue === 60000000);
check("확정 전에는 localStorage 에 아무것도 쓰지 않는다", !p3.store.has(KEY),
  "저장된 키: " + Array.from(p3.store.keys()).join(","));
check("확정 전 확정 버튼이 열린다", p3.el("editConfirm").disabled === false);
check("확정 전 취소 버튼이 열린다", p3.el("editCancel").disabled === false);
check("안내 문구가 보인다", p3.el("modeHint").hidden === false, text(p3, "modeHint"));

/* ================================================================ */
/* 5. 취소는 진입 전 값으로 되돌린다                                 */
/* ================================================================ */

p3.el("editCancel").click();
check("취소 후 읽기 모드로 돌아온다", text(p3, "modeState") === "읽기", text(p3, "modeState"));
check("취소하면 수정 전 값으로 되돌아간다",
  assetByKey(p3.data.assets, keyOf(p3, "신한은행 정기예금")).currentValue === seedDepCv3,
  "기대 " + seedDepCv3 + " 실제 " +
  assetByKey(p3.data.assets, keyOf(p3, "신한은행 정기예금")).currentValue);
check("취소 후에도 저장소는 비어 있다", !p3.store.has(KEY));
check("취소 후 다시 확정/취소가 막힌다", p3.el("editConfirm").disabled === true);
check("취소하면 입력칸이 사라진다", treeInputs(p3).length === 0);

/* ================================================================ */
/* 6. 확정은 저장하고 읽기 모드로 돌아온다                            */
/* ================================================================ */

const p4 = boot();
editMode(p4);
type(p4, "신한은행 정기예금", "currentValue", "60000000");
p4.el("editConfirm").click();

check("확정하면 읽기 모드가 된다", text(p4, "modeState") === "읽기");
check("확정하면 저장소가 생긴다", p4.store.has(KEY));
check("확정한 값이 저장소에 있다",
  savedAssets(p4).filter((a) => a.label === "신한은행 정기예금")[0].currentValue === 60000000);
check("확정 후 입력칸이 사라진다", treeInputs(p4).length === 0);
check("확정 후 합계가 새 값으로 갱신된다",
  text(p4, "assetsSum") === formatKRW(currentTotal(p4.data.assets)), text(p4, "assetsSum"));

/* ================================================================ */
/* 7. 새로고침 후에도 확정 값이 남는다 (저장 경계)                   */
/* ================================================================ */

const p5 = boot({ [KEY]: p4.store.get(KEY) });
check("새로고침 후 수정 값이 유지된다",
  assetByKey(p5.data.assets, keyOf(p5, "신한은행 정기예금")).currentValue === 60000000,
  "실제 " + assetByKey(p5.data.assets, keyOf(p5, "신한은행 정기예금")).currentValue);
check("새로고침 후 합계가 저장된 행에서 계산된다",
  text(p5, "assetsSum") === formatKRW(currentTotal(p5.data.assets)), text(p5, "assetsSum"));
check("새로고침해도 기본값은 읽기 모드다", text(p5, "modeState") === "읽기");

/* ================================================================ */
/* 8. 수익률은 원금·평가금액에서 재계산된다                          */
/* ================================================================ */

const p6 = boot();
editMode(p6);
type(p6, "삼성증권 IRP", "currentValue", "55000000");
const irp = assetByLabel(p6.data.assets, "삼성증권 IRP");
check("평가금액을 고치면 수익률이 따라간다",
  Math.abs(irp.returnRate - ((55000000 - irp.principalDeposit) / irp.principalDeposit) * 100) < 1e-9,
  "수익률 " + irp.returnRate);

/* 투자자산: 원금은 수량 × 평단가의 결과여야 한다. */
const p7 = boot();
editMode(p7);
type(p7, "미래에셋증권 삼성전자", "quantity", "2000");
const stk = assetByLabel(p7.data.assets, "미래에셋증권 삼성전자");
check("수량을 고치면 투자 원금이 수량 × 평단가로 바뀐다",
  stk.principalInvest === 2000 * stk.avgPrice,
  stk.principalInvest + " vs " + 2000 * stk.avgPrice);
check("원금이 바뀌면 수익률도 다시 계산된다",
  Math.abs(stk.returnRate - ((stk.currentValue - stk.principalInvest) / stk.principalInvest) * 100) < 1e-9,
  "수익률 " + stk.returnRate);
check("투자 원금칸은 여전히 입력칸이 아니다",
  p7.queries.findInput(stk.key, "principal") === null);
check("원금합계도 새 원금으로 다시 계산된다",
  text(p7, "assetsPrincipalSum") === formatKRW(principalTotal(p7.data.assets)),
  text(p7, "assetsPrincipalSum"));

/* ================================================================ */
/* 9. 이름은 trim 되고 동급 필드와 함께 바뀐다                       */
/* ================================================================ */

const p8 = boot();
editMode(p8);
type(p8, "NH농협은행 ISA", "label", "  ISA 이름 고침  ");
const isa = assetByLabel(p8.data.assets, "ISA 이름 고침");
check("이름 앞뒤 공백이 빠진다", isa && isa.label === "ISA 이름 고침",
  JSON.stringify(assetByLabel(p8.data.assets, "ISA 이름 고침")));
check("3단계 분류도 같은 값으로 맞춰진다", isa && isa.categoryLevel3 === "ISA 이름 고침",
  isa && isa.categoryLevel3);

const isaKey = keyOf(p8, "ISA 이름 고침");
p8.queries.type(p8.queries.findInput(isaKey, "label"), "");
check("빈 이름은 무시된다", assetByKey(p8.data.assets, isaKey).label === "ISA 이름 고침",
  JSON.stringify(assetByKey(p8.data.assets, isaKey).label));
check("빈 이름 뒤에도 행은 살아 있다", rowOf(p8, "ISA 이름 고침") !== null);

/* ================================================================ */
/* 10. 잘못된 입력은 값으로 들어가지 않는다                          */
/* ================================================================ */

const p10 = boot();
editMode(p10);
const k10 = keyOf(p10, "IBK기업은행 CMA RP");
const before10 = assetByKey(p10.data.assets, k10).currentValue;

p10.queries.type(p10.queries.findInput(k10, "currentValue"), "-5000");
check("음수 입력을 거절한다", assetByKey(p10.data.assets, k10).currentValue === before10,
  "실제 " + assetByKey(p10.data.assets, k10).currentValue);
check("거절된 입력은 aria-invalid 로 표시된다",
  p10.queries.findInput(k10, "currentValue").getAttribute("aria-invalid") === "true");

p10.queries.type(p10.queries.findInput(k10, "currentValue"), "");
check("빈 입력을 거절한다", assetByKey(p10.data.assets, k10).currentValue === before10);
p10.queries.type(p10.queries.findInput(k10, "currentValue"), "abc");
check("문자 입력을 거절한다", assetByKey(p10.data.assets, k10).currentValue === before10,
  "실제 " + assetByKey(p10.data.assets, k10).currentValue);

/* ================================================================ */
/* 11. Escape 는 취소와 같다                                        */
/* ================================================================ */

const p11 = boot();
// 되돌아갈 시드 값을 먼저 기억한다. 하드코딩하면 시드 고칠 때 조용히 무의미해진다.
const seedIrpCv = assetByLabel(p11.data.assets, "삼성증권 IRP").currentValue;
editMode(p11);
type(p11, "삼성증권 IRP", "currentValue", "60000000");
p11.answers.confirmQueue = [false];
dispatchKey(p11.document, "Escape");
check("변경이 남았는데 취소 확인에서 거절하면 수정 상태를 유지한다",
  text(p11, "modeState") === "수정", text(p11, "modeState"));
check("거절 후에도 수정 값은 남아 있다",
  assetByLabel(p11.data.assets, "삼성증권 IRP").currentValue === 60000000);

p11.answers.confirmQueue = [true];
dispatchKey(p11.document, "Escape");
check("확인하면 읽기 모드로 돌아온다", text(p11, "modeState") === "읽기");
check("Escape 취소로 값도 되돌아간다",
  assetByLabel(p11.data.assets, "삼성증권 IRP").currentValue === seedIrpCv,
  "기대 " + seedIrpCv + " 실제 " +
  assetByLabel(p11.data.assets, "삼성증권 IRP").currentValue);

const p12 = boot();
editMode(p12);
p12.answers.confirmQueue = [];
dispatchKey(p12.document, "Escape");
check("변경이 없으면 확인창 없이 조용히 취소한다",
  text(p12, "modeState") === "읽기" && p12.answers.confirmQueue.length === 0);

/* ================================================================ */
/* 12. 추가 → 확정 → 새로고침                                      */
/* ================================================================ */

const p13 = boot();
editMode(p13);
// 기관 추가 → 상품유형 추가 → 자산 추가. 버튼이 행마다 붙으므로 순서대로 눌러야 한다.
p13.answers.promptQueue = ["테스트은행"];
p13.el("addAsset").click();
check("기관이 추가된다", p13.data.institutions.some((i) => i.name === "테스트은행"));

p13.answers.promptQueue = ["테스트입출금"];
clickRowAction(p13, "tree-level1", "테스트은행", "+ 상품유형");
check("상품유형이 추가된다", p13.data.groups.some((g) => g.name === "테스트입출금"));

p13.answers.promptQueue = ["테스트예금"];
p13.answers.confirmQueue = [true]; // 예적금 계열 = 원금이 누적 납입액
clickRowAction(p13, "tree-level2", "테스트입출금", "+ 자산");
check("자산이 추가된다", p13.data.assets.some((a) => a.label === "테스트예금"));
check("추가 후에도 확정 전엔 저장되지 않는다", !p13.store.has(KEY));

const added = assetByLabel(p13.data.assets, "테스트예금");
check("추가한 자산을 예적금으로 분류했다", added.assetClass === "deposit", added.assetClass);
p13.queries.type(p13.queries.findInput(added.key, "principal"), "10000000");
p13.queries.type(p13.queries.findInput(added.key, "currentValue"), "10500000");
check("추가한 자산도 바로 편집할 수 있다",
  assetByKey(p13.data.assets, added.key).principalDeposit === 10000000);
check("예적금 유형이라 원금이 principalDeposit 에 들어간다 (principal 은 범용 필드)",
  assetByKey(p13.data.assets, added.key).principal === 0,
  "실제 " + assetByKey(p13.data.assets, added.key).principal);
check("예적금 수익률은 원금과 평가금액에서 나온다",
  assetByKey(p13.data.assets, added.key).returnRate === 5);
p13.el("editConfirm").click();

const snap13 = p13.saved(KEY);
check("추가한 기관이 저장된다", snap13.institutions.some((i) => i.name === "테스트은행"));
check("추가한 상품유형이 저장된다", snap13.groups.some((g) => g.name === "테스트입출금"));
check("추가한 자산이 저장된다", snap13.assets.some((a) => a.label === "테스트예금"));
check("저장된 자산이 실제 그룹을 가리킨다",
  snap13.assets.filter((a) => a.label === "테스트예금")[0].groupId ===
    snap13.groups.filter((g) => g.name === "테스트입출금")[0].id);

const p14 = boot({ [KEY]: p13.store.get(KEY) });
check("새로고침 후에도 기관이 복구된다", p14.data.institutions.some((i) => i.name === "테스트은행"));
check("새로고침 후에도 자산이 복구된다", p14.data.assets.some((a) => a.label === "테스트예금"));
check("새로고침 후에도 트리에 행이 보인다",
  p14.queries.rowsByClass("tree-level3").length === p14.data.assets.length,
  p14.queries.rowsByClass("tree-level3").length + "행");
check("새로고침 후 합계에 새 자산이 들어간다",
  text(p14, "assetsSum") === formatKRW(currentTotal(p14.data.assets)));

/* ================================================================ */
/* 13. 삭제는 확정해야 반영된다                                     */
/* ================================================================ */

const p15 = boot();
editMode(p15);
clickRowAction(p15, "tree-level3", "IBK기업은행 CMA RP", "×");
check("자산을 삭제하면 메모리에서 사라진다",
  !p15.data.assets.some((a) => a.label === "IBK기업은행 CMA RP"));
p15.el("editCancel").click();
check("삭제 후 취소하면 되살아난다",
  p15.data.assets.some((a) => a.label === "IBK기업은행 CMA RP"));

editMode(p15);
clickRowAction(p15, "tree-level3", "IBK기업은행 CMA RP", "×");
p15.el("editConfirm").click();
check("확정하면 삭제가 저장된다",
  !savedAssets(p15).some((a) => a.label === "IBK기업은행 CMA RP"));

const p16 = boot({ [KEY]: p15.store.get(KEY) });
check("새로고침 후에도 삭제가 유지된다",
  !p16.data.assets.some((a) => a.label === "IBK기업은행 CMA RP"));
check("삭제 후에도 트리 행 수와 자산 수가 맞는다",
  p16.queries.rowsByClass("tree-level3").length === p16.data.assets.length,
  p16.queries.rowsByClass("tree-level3").length + "행");

/* ================================================================ */
/* 14. 초기화는 수정 모드도 함께 끝낸다                              */
/* ================================================================ */

const p17 = boot();
// 시드 값을 먼저 기억한다. 초기화는 이 값으로 되돌려야 한다.
// 값을 하드코딩하면 예적금 시드를 고칠 때마다 이 검사가 조용히 의미를 잃는다.
const seedDepCv =
  assetByLabel(p17.data.assets, "신한은행 정기예금").currentValue;
editMode(p17);
type(p17, "신한은행 정기예금", "currentValue", "60000000");
p17.el("resetAll").click();
check("초기화하면 읽기 모드로 돌아온다", text(p17, "modeState") === "읽기",
  text(p17, "modeState"));
check("초기화하면 저장소가 비워진다", !p17.store.has(KEY));
check("초기화하면 값도 시드로 돌아온다",
  assetByLabel(p17.data.assets, "신한은행 정기예금").currentValue === seedDepCv,
  "기대 " + seedDepCv + " 실제 " +
  assetByLabel(p17.data.assets, "신한은행 정기예금").currentValue);

report("assets.html 계층·모드·저장 회귀");

/* ================================================================ */
/* 15. 예적금 수익률이 0 으로 무너지지 않는다 (2026-10-05 회귀)      */
/* ================================================================ */

const p18 = boot();
const dep18 = assetByLabel(p18.data.assets, "신한은행 정기예금");

check("시드 예적금의 수익률이 0 이 아니다", dep18.returnRate > 0,
  "수익률 " + dep18.returnRate);
check("시드 예적금 평가금액이 원금보다 크다",
  dep18.currentValue > dep18.principalDeposit,
  "평가 " + dep18.currentValue + " 원금 " + dep18.principalDeposit);
check("시드 예적금 수익률이 파생값과 일치한다",
  Math.abs(dep18.returnRate -
    ((dep18.currentValue - dep18.principalDeposit) / dep18.principalDeposit) * 100) < 1e-9,
  "수익률 " + dep18.returnRate);

// 이것이 사용자 보고 그 자체다. 원금을 편집하면 예전에는 수익률이 0 이 되었다.
// 편집은 확정 전 스냅샷 안에서 일어나야 하고, 값은 살아남아야 한다.
editMode(p18);
type(p18, "신한은행 정기예금", "principal", "40000000");
const dep18b = assetByLabel(p18.data.assets, "신한은행 정기예금");
check("원금을 편집해도 수익률이 0 이 아니다",
  dep18b.returnRate > 0, "수익률 " + dep18b.returnRate);
check("원금 편집 후 수익률이 파생값으로 갱신된다",
  Math.abs(dep18b.returnRate -
    ((dep18b.currentValue - dep18b.principalDeposit) / dep18b.principalDeposit) * 100) < 1e-9,
  "수익률 " + dep18b.returnRate);
check("원금 편집이 평가금액을 바꾸지는 않는다 (편집은 원금 만 건드린다)",
  dep18b.currentValue === dep18.currentValue,
  "평가 " + dep18b.currentValue + " (기대 " + dep18.currentValue + ")");
check("수정 모드에서 예적금 수익률 칸은 입력 칸이 아니다",
  p18.queries.inputsUnder(
    p18.queries.rowsByClass("tree-level3")
      .filter((r) => p18.queries.text(r).indexOf("신한은행 정기예금") >= 0)[0]
  ).every((i) => i.dataset.field !== "returnRate"));

report("assets.html 예적금 수익률 0% 회귀");

/* ================================================================ */
/* 16. 부채는 기관·유형·금리·만기와 함께 읽힌다 (읽기 모드)           */
/* ================================================================ */

/** 부채 tbody 안의 특정 태그를 찾는다. querySelector 가 없으므로 walk 로 찾는다. */
const liabTags = (p, tag) => {
  const out = [];
  p.queries.walk(p.el("liabBody"), (el) => { if (el.tagName === tag) out.push(el); });
  return out;
};
const liabRows = (p) => Array.from(p.el("liabBody").children);
const liabCell = (p, rowIdx, colIdx) => p.queries.text(liabRows(p)[rowIdx].children[colIdx]);
const liabField = (p, field) => liabTags(p, "INPUT").filter((i) => i.dataset.field === field)[0];
const setSelect = (p, field, value) => {
  const sel = liabTags(p, "SELECT").filter((s) => s.dataset.field === field)[0];
  sel.value = value;
  sel.dispatchEvent({ type: "change" });
  return sel;
};
/** 평가금액 기준 자산 합계. 트리·요약 카드가 쓰는 값과 같은 기준이다. */
const assetValueSum = (list) =>
  list.reduce((a, x) => a + (x.currentValue != null ? x.currentValue : x.amount), 0);

const p20 = boot();
const debt20 = p20.data.liabilities[0];
const instName20 = p20.data.institutions.filter((i) => i.id === debt20.institutionId)[0].name;
const maturity20 = p20.AF.debt.maturityOf(p20.data.asOfMonth, debt20.termMonths);

check("부채 표에 시드만큼 행이 있다",
  liabRows(p20).length === p20.data.liabilities.length,
  liabRows(p20).length + "행");
// 하네스는 정적 마크업을 DOM 트리로 만들지 않는다(id 요소만 뒤늦게 만든다).
// 표 머리글은 그러므로 소스에서 읽어 계약으로 삼는다 — 열 순서는 화면이 아니라
// 마크업이 정한다.
const debtHeadNames = (() => {
  const src = readFileSync(new URL("../assets.html", import.meta.url), "utf8");
  const thead = src.split('<tbody id="liabBody">')[0].split('<table class="item-table">').pop();
  return Array.from(thead.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g))
    .map((m) => m[1].replace(/<[^>]+>/g, "").trim());
})();
check("부채 표 헤더는 항목·기관·유형·금액·금리·만기·월납입액·삭제 순이다",
  debtHeadNames.join(",") === "항목,기관,유형,금액(원),금리(%),만기,월납입액(원),삭제",
  debtHeadNames.join(","));
check("부채 행이 칸을 여덟 개 쓴다", liabRows(p20)[0].children.length === 8,
  "셀 " + liabRows(p20)[0].children.length + "개");
check("부채 행이 기관 이름을 보여 준다", liabCell(p20, 0, 1) === instName20,
  liabCell(p20, 0, 1) + " vs " + instName20);
check("부채 행이 유형을 보여 준다", liabCell(p20, 0, 2) === debt20.debtType,
  liabCell(p20, 0, 2));
check("부채 행 금액은 천단위 숫자다", liabCell(p20, 0, 3) === formatKRW(debt20.amount),
  liabCell(p20, 0, 3) + " vs " + formatKRW(debt20.amount));
check("부채 행 금리는 소수 둘째 자리다", liabCell(p20, 0, 4) === debt20.rate.toFixed(2),
  liabCell(p20, 0, 4));
check("부채 행 만기는 남은 회차에서 나온다", liabCell(p20, 0, 5) === maturity20,
  liabCell(p20, 0, 5) + " vs " + maturity20);
check("부채 행 월납입액을 보여 준다",
  liabCell(p20, 0, 6) === formatKRW(debt20.monthlyPayment), liabCell(p20, 0, 6));
check("읽기 모드에서 부채 행에 입력칸이 없다",
  liabTags(p20, "INPUT").length === 0 && liabTags(p20, "SELECT").length === 0,
  "input " + liabTags(p20, "INPUT").length + " select " + liabTags(p20, "SELECT").length);
check("읽기 모드에서 부채 삭제 버튼이 없다",
  liabTags(p20, "BUTTON").length === 0,
  "button " + liabTags(p20, "BUTTON").length);
check("읽기 모드에서 부채 추가 버튼이 숨겨진다", p20.el("addLiab").hidden === true);

/* ================================================================ */
/* 17. 상환 계획은 행에서 파생된다 (저장하지 않는다)                  */
/* ================================================================ */

const plan20 = p20.AF.debt.plan(debt20, p20.data.asOfMonth);
const planText20 = p20.queries.text(p20.el("liabPlan"));
check("부채가 있으면 상환 계획이 보인다", p20.el("liabPlan").hidden === false);
check("상환 계획에 만기가 있다", planText20.indexOf("만기 " + plan20.maturity) >= 0,
  planText20);
check("상환 계획에 남은 회차가 있다",
  planText20.indexOf("남은 " + plan20.remaining + "회") >= 0, planText20);
check("상환 계획의 다음 납입액이 이자와 원금으로 갈린다",
  planText20.indexOf("이자 " + formatKRW(plan20.nextInterest) + "원") >= 0 &&
    planText20.indexOf("원금 " + formatKRW(plan20.nextPrincipal) + "원") >= 0,
  planText20);
check("상환 계획의 남은 이자가 스케줄 합계와 같다",
  planText20.indexOf("남은 이자 " + formatKRW(plan20.totalInterest) + "원") >= 0,
  planText20);
check("상환 계획의 총 납입액이 잔액과 이자의 합이다",
  planText20.indexOf("총 납입액 " + formatKRW(plan20.totalPaid) + "원") >= 0,
  planText20);
check("계약 회차 그대로 갚으면 '예상 상환 완료'가 붙지 않는다",
  planText20.indexOf("예상 상환 완료") === -1, planText20);

/* ================================================================ */
/* 18. 수정 모드에서만 부채 칸이 열린다                               */
/* ================================================================ */

const p21 = boot();
const debt21 = p21.data.liabilities[0];
editMode(p21);

check("수정 모드에서 부채 입력칸이 생긴다",
  liabTags(p21, "INPUT").length === p21.data.liabilities.length * 6,
  "입력칸 " + liabTags(p21, "INPUT").length + "개");
check("수정 모드에서 기관 선택 칸이 생긴다", liabTags(p21, "SELECT").length === 1,
  "선택 칸 " + liabTags(p21, "SELECT").length + "개");
check("부채 입력칸이 여섯 필드를 가진다",
  ["label", "debtType", "amount", "rate", "termMonths", "monthlyPayment"].every((f) =>
    liabField(p21, f) !== null));
check("만기 칸은 달 입력으로 만든다", liabField(p21, "termMonths").type === "month",
  liabField(p21, "termMonths").type);
check("만기 칸 값이 남은 회차의 만기와 같다",
  liabField(p21, "termMonths").value === maturity20,
  liabField(p21, "termMonths").value + " vs " + maturity20);
check("기관 칸은 시드 기관을 가리킨다",
  liabTags(p21, "SELECT")[0].value === debt21.institutionId,
  liabTags(p21, "SELECT")[0].value);
check("수정 모드에서 부채 추가 버튼이 보인다", p21.el("addLiab").hidden === false);
check("아직 안 바꿨으면 부채 쪽 확정도 막힌다", p21.el("editConfirm").disabled === true);

/* ================================================================ */
/* 19. 부채를 고쳐 확정하면 저장된다                                  */
/* ================================================================ */

const p22 = boot();
editMode(p22);
const key22 = p22.data.liabilities[0].key;
p22.queries.type(p22.queries.findInput(key22, "amount"), "60000000");
p22.queries.type(p22.queries.findInput(key22, "rate"), "3");
p22.queries.type(p22.queries.findInput(key22, "monthlyPayment"), "300000");

check("잔액 편집이 반영된다", p22.data.liabilities[0].amount === 60000000,
  p22.data.liabilities[0].amount);
check("금리 편집이 반영된다", p22.data.liabilities[0].rate === 3,
  p22.data.liabilities[0].rate);
check("월납입액 편집이 반영된다", p22.data.liabilities[0].monthlyPayment === 300000);
check("부채 합계 칸이 새 잔액을 보여 준다",
  text(p22, "liabSum") === formatKRW(60000000), text(p22, "liabSum"));
check("요약 카드 총부채도 새 잔액을 보여 준다",
  text(p22, "sumTotalLiab") === p22.AF.fmt.formatKRW(60000000), text(p22, "sumTotalLiab"));
check("확정 전에는 부채도 저장되지 않는다", !p22.store.has(KEY),
  "저장된 키: " + Array.from(p22.store.keys()).join(","));
check("부채를 고쳐도 확정 버튼이 열린다", p22.el("editConfirm").disabled === false);

p22.el("editConfirm").click();
check("확정하면 부채가 저장소에 들어간다",
  p22.saved(KEY).liabilities[0].amount === 60000000,
  p22.saved(KEY).liabilities[0].amount);
check("확정 후 부채 표가 읽기 모드로 돌아간다",
  liabTags(p22, "INPUT").length === 0 && liabTags(p22, "SELECT").length === 0);
check("확정 후 부채 합계 칸이 읽기 값과 같다",
  text(p22, "liabSum") === formatKRW(60000000), text(p22, "liabSum"));

const p23 = boot({ [KEY]: p22.store.get(KEY) });
check("새로고침 후에도 부채 잔액이 유지된다",
  p23.data.liabilities[0].amount === 60000000, p23.data.liabilities[0].amount);

/* ================================================================ */
/* 20. 부채를 고쳐 취소하면 표도 합계도 되돌아간다                     */
/* ================================================================ */

const p24 = boot();
const totals24 = JSON.stringify(p24.data.totals);
const seed24 = Object.assign({}, p24.data.liabilities[0]);
editMode(p24);
const key24 = p24.data.liabilities[0].key;
p24.queries.type(p24.queries.findInput(key24, "amount"), "50000000");
p24.queries.type(p24.queries.findInput(key24, "rate"), "9.5");
p24.queries.type(p24.queries.findInput(key24, "termMonths"), "2031-01");
setSelect(p24, "institutionId", "inst-other");

check("취소 전에 값이 셋 다 바뀐다",
  p24.data.liabilities[0].amount === 50000000 &&
    p24.data.liabilities[0].rate === 9.5 &&
    p24.data.liabilities[0].institutionId === "inst-other",
  JSON.stringify(p24.data.liabilities[0]));
p24.el("editCancel").click();

const after24 = p24.data.liabilities[0];
check("취소하면 잔액이 되돌아간다", after24.amount === seed24.amount,
  after24.amount + " vs " + seed24.amount);
check("취소하면 금리가 되돌아간다", after24.rate === seed24.rate,
  after24.rate + " vs " + seed24.rate);
check("취소하면 기간이 되돌아간다", after24.termMonths === seed24.termMonths,
  after24.termMonths + " vs " + seed24.termMonths);
check("취소하면 기관이 되돌아간다", after24.institutionId === seed24.institutionId,
  after24.institutionId + " vs " + seed24.institutionId);
check("취소하면 요약 수치 전체가 되돌아간다",
  JSON.stringify(p24.data.totals) === totals24,
  JSON.stringify(p24.data.totals));
check("취소 후 총자산이 복구된 행에서 다시 나온다",
  p24.data.totals.assets === assetValueSum(p24.data.assets) + p24.data.totals.totalCash,
  "합계 " + p24.data.totals.assets + " 행 " +
  (assetValueSum(p24.data.assets) + p24.data.totals.totalCash));
check("취소 후 총부채가 복구된 행과 같다",
  p24.data.totals.liabilities === p24.data.liabilities.reduce((a, l) => a + l.amount, 0),
  p24.data.totals.liabilities);
check("취소 후 부채 표가 읽기 모드로 돌아간다",
  liabTags(p24, "INPUT").length === 0 && liabTags(p24, "SELECT").length === 0);

/* ================================================================ */
/* 21. 구조를 지워도 합계가 행을 따라간다 (닫힌 배열 회귀)             */
/* ================================================================ */

const p25 = boot();
editMode(p25);
// 기본값이 승인이므로 큐를 비워 두면 바로 지워진다.
const groups25 = p25.data.groups.length;
const assets25 = p25.data.assets.length;
const liabs25 = p25.data.liabilities.length;
clickRowAction(p25, "tree-level2", "일반자산", "×");
check("그룹을 지우면 그 안의 자산도 같이 사라진다",
  p25.data.groups.length < groups25 && p25.data.assets.length < assets25,
  "그룹 " + p25.data.groups.length + "/" + groups25 +
    " 자산 " + p25.data.assets.length + "/" + assets25);
check("그룹 삭제 후에도 부채는 그대로다",
  p25.data.liabilities.length === liabs25,
  p25.data.liabilities.length + "건 (기대 " + liabs25 + ")");
check("그룹 삭제 후 총자산이 남은 행에서 다시 나온다",
  p25.data.totals.assets === assetValueSum(p25.data.assets) + p25.data.totals.totalCash,
  "합계 " + p25.data.totals.assets + " 행 " +
  (assetValueSum(p25.data.assets) + p25.data.totals.totalCash));
check("그룹 삭제 후 요약 카드가 같은 숫자를 보여 준다",
  text(p25, "sumTotalAssets") === p25.AF.fmt.formatKRW(p25.data.totals.assets),
  text(p25, "sumTotalAssets"));
check("그룹 삭제 후 트리 행과 남은 자산 수가 맞는다",
  p25.queries.rowsByClass("tree-level3").length === p25.data.assets.length,
  p25.queries.rowsByClass("tree-level3").length + "행 / " + p25.data.assets.length + "건");

/* ================================================================ */
/* 22. 만기 입력은 과거를 거절하고 빈 칸은 기간 없음이 된다             */
/* ================================================================ */

const p26 = boot();
editMode(p26);
const key26 = p26.data.liabilities[0].key;
const month26 = () => p26.queries.findInput(key26, "termMonths");
const seedTerm26 = p26.data.liabilities[0].termMonths;

p26.queries.type(month26(), "2020-01");
check("asOf 이전 만기는 거절한다",
  p26.data.liabilities[0].termMonths === seedTerm26,
  p26.data.liabilities[0].termMonths);
check("거절한 만기는 aria-invalid 로 표시된다",
  month26().getAttribute("aria-invalid") === "true");

p26.queries.type(month26(), "");
check("만기를 비우면 기간이 0이 된다", p26.data.liabilities[0].termMonths === 0,
  p26.data.liabilities[0].termMonths);
check("비운 만기 칸도 비워 있다", month26().value === "", JSON.stringify(month26().value));

p26.el("editConfirm").click();
check("기간이 없으면 읽기 만기 칸이 — 가 된다",
  liabCell(p26, 0, 5) === "—", liabCell(p26, 0, 5));

editMode(p26);
p26.queries.type(month26(), "2030-06");
check("정상 만기를 남은 회차로 받는다",
  p26.data.liabilities[0].termMonths ===
    (function (ym) {
      const [y, m] = ym.split("-").map(Number);
      const [sy, sm] = p26.data.asOfMonth.split("-").map(Number);
      return (y * 12 + m) - (sy * 12 + sm);
    })("2030-06"),
  p26.data.liabilities[0].termMonths);
check("만기를 고치면 만기 칸이 같이 바뀐다",
  month26().value === "2030-06", month26().value);
p26.el("editConfirm").click();
check("고친 만기가 읽기 모드 만기 칸에 나온다",
  liabCell(p26, 0, 5) === "2030-06", liabCell(p26, 0, 5));

/* ================================================================ */
/* 23. 기관을 바꾸면 읽기 모드에서 그 이름으로 나온다                   */
/* ================================================================ */

const p27 = boot();
editMode(p27);
setSelect(p27, "institutionId", "inst-other");
check("기관 선택이 반영된다",
  p27.data.liabilities[0].institutionId === "inst-other",
  p27.data.liabilities[0].institutionId);
p27.el("editConfirm").click();
check("읽기 모드에서 기관 칸이 — 대신 실제 이름이다",
  liabCell(p27, 0, 1) === "기타", liabCell(p27, 0, 1));

/* ================================================================ */
/* 24. 부채 추가 → 확정 → 취소                                        */
/* ================================================================ */

const p28 = boot();
const seedCount28 = p28.data.liabilities.length;
editMode(p28);
p28.answers.promptQueue = ["새카드값"];
p28.el("addLiab").click();
check("부채가 추가된다", p28.data.liabilities.length === seedCount28 + 1,
  p28.data.liabilities.length + "건");
check("추가한 부채가 빈 값이 아니라 정제된 모양을 가진다",
  p28.data.liabilities.some((l) => l.label === "새카드값" && l.amount === 0 &&
    l.rate === 0 && l.termMonths === 0 && l.institutionId === "inst-other"));
check("추가한 행도 입력칸으로 바로 편집할 수 있다",
  liabTags(p28, "INPUT").length === p28.data.liabilities.length * 6,
  "입력칸 " + liabTags(p28, "INPUT").length);
p28.el("editCancel").click();
check("추가 후 취소하면 되돌아간다",
  p28.data.liabilities.length === seedCount28,
  p28.data.liabilities.length + "건");

editMode(p28);
p28.answers.promptQueue = ["새카드값"];
p28.el("addLiab").click();
const added28 = p28.data.liabilities.filter((l) => l.label === "새카드값")[0];
p28.queries.type(p28.queries.findInput(added28.key, "amount"), "1500000");
p28.el("editConfirm").click();
check("추가를 확정하면 저장된다",
  p28.saved(KEY).liabilities.some((l) => l.label === "새카드값" && l.amount === 1500000));

const p29 = boot({ [KEY]: p28.store.get(KEY) });
check("새로고침 후에도 추가한 부채가 남는다",
  p29.data.liabilities.some((l) => l.label === "새카드값" && l.amount === 1500000));
check("부채가 둘이면 표에도 둘이다",
  liabRows(p29).length === p29.data.liabilities.length,
  liabRows(p29).length + "행");

report("assets.html 부채 읽기·수정·상환계획");

/* ---------------------------------------------------------------- */
/* 도우미                                                            */
/* ---------------------------------------------------------------- */

function dispatchKey(doc, key) {
  (doc.listeners.get("keydown") || []).forEach((fn) =>
    fn({ type: "keydown", key, preventDefault() {}, stopPropagation() {} }));
}

function buttonLabels(page, root) {
  return page.queries.buttonsUnder(root).map((b) => page.queries.text(b));
}

/** 이름이 라벨에 들어 있는 행의 액션 버튼을 누른다. */
function clickRowAction(page, cls, label, actionLabel) {
  const row = page.queries.rowsByClass(cls)
    .filter((r) => page.queries.text(r).indexOf(label) >= 0)[0];
  if (!row) throw new Error(cls + " 행을 찾지 못함: " + label);
  const btn = page.queries.buttonsUnder(row)
    .filter((b) => page.queries.text(b) === actionLabel)[0];
  if (!btn) throw new Error("버튼을 찾지 못함: " + actionLabel + " in " + label +
    " (있는 버튼: " + buttonLabels(page, row).join("|") + ")");
  btn.click();
}