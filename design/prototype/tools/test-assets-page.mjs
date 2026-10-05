// assets.html 계층 트리 + 읽기/수정 모드 + 확정/취소 회귀 검증.
//
// 이 파일이 막는 것:
//   "수정 모드에서 고친 값이 새로고침하면 사라진다", "취소했는데 값이 남아 있다",
//   "수익률이 평가금액과 어긋난다" — 사용자가 가장 자주 겪고, 가장 말하기 어려운
//   세 가지다. 전부 저장 경계를 넘는 문제라 눈으로 확인해서는 놓친다.
//
// 기대값은 시드 데이터에서 계산한다. 합계 숫자를 손으로 박지 않는다.

import { check, report, loadPage, createEnv, formatKRW, sum } from "./prototype-harness.mjs";

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
  assetByKey(p3.data.assets, keyOf(p3, "신한은행 정기예금")).currentValue === 50000000,
  "실제 " + assetByKey(p3.data.assets, keyOf(p3, "신한은행 정기예금")).currentValue);
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
  assetByLabel(p11.data.assets, "삼성증권 IRP").currentValue === 51500000,
  "실제 " + assetByLabel(p11.data.assets, "삼성증권 IRP").currentValue);

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
editMode(p17);
type(p17, "신한은행 정기예금", "currentValue", "60000000");
p17.el("resetAll").click();
check("초기화하면 읽기 모드로 돌아온다", text(p17, "modeState") === "읽기",
  text(p17, "modeState"));
check("초기화하면 저장소가 비워진다", !p17.store.has(KEY));
check("초기화하면 값도 시드로 돌아온다",
  assetByLabel(p17.data.assets, "신한은행 정기예금").currentValue === 50000000);

report("assets.html 계층·모드·저장 회귀");

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