// 카드내역 업로드 UI 연결 검증.
//
// 검증하는 것:
//   1. 번들(common/card-import.js)이 생성기로 다시 만들어져도 바이트가 같은가
//   2. 번들에 암호 구현이 없는가(정책) + ESM 잔존이 없는가
//   3. expenses.html 이 업로드 흐름(판별→파싱→가맹점 분류→가져오기)을 담는가
//   4. mock-data.js 의 카드 저장소가 실제로 돌아가는가 — vm 으로 실행해
//      저장/로드/깨진 스냅샷/규칙/역산 재계산을 확인한다
//   5. 계약의 카드사 판별 시그니처가 실제 파일에서 맞는가
//
// PII: 실제 파일은 판별·파싱만 하고 내용은 출력하지 않는다. 실제 파일은
// 이 저장소 밖(다운로드 폴더)에 있으므로 없으면 그 검사만 건너뛴다.

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createContext, runInContext } from "node:vm";

const ROOT = "D:/study/assetflow";
let pass = 0, fail = 0;
const failures = [];
function chk(name, cond, detail) {
  if (cond) pass++;
  else { fail++; failures.push(name + (detail ? " — " + String(detail).slice(0, 160) : "")); }
}
const read = (p) => readFileSync(ROOT + "/" + p, "utf8");
const CONTRACT = JSON.parse(read("samples/card/card-columns.json"));

/* ---- 1. 번들 재현성 ---- */
const BUNDLE = "design/prototype/common/card-import.js";
const before = readFileSync(ROOT + "/" + BUNDLE);
try {
  execFileSync("node", [ROOT + "/samples/card/tools/build-card-import-bundle.mjs"], { encoding: "utf8" });
  chk("번들 생성기 실행됨", true);
} catch (e) {
  chk("번들 생성기 실행됨", false, e.message.split("\n")[0]);
}
chk("번들이 생성기로 바이트 단위로 재현된다",
  Buffer.compare(before, readFileSync(ROOT + "/" + BUNDLE)) === 0);

/* ---- 2. 번들 정책·정합성 ---- */
const bundle = read(BUNDLE);
chk("번들에 ESM import 가 없다", !/^\s*import\s/m.test(bundle));
chk("번들에 ESM export 가 없다", !/^\s*export\s/m.test(bundle));
chk("번들에 Buffer 가 없다", !/\bBuffer\./.test(bundle));
// 계약 텍스트에 'spinCount 등은 수집하지 않는다' 같은 정책 문구가 있으므로
// 코드 패턴만 금지한다. 정책: 암호화 파일은 사용자 비밀번호로만 열리고
// 여는 구현은 아직 없다.
chk("번들에 암호 구현이 없다(정책)",
  !/crypto\.subtle|SubtleCrypto|PKCS7|spinCount\s*[=:]|importAesKey|cbcDecrypt|verifierHash\s*[=:]/.test(bundle),
  "정책: 암호화 파일은 사용자 비밀번호로만 열린다. 여는 구현은 아직 없다");
chk("AFCard API 가 노출된다",
  ["parseSamsungCardStatement", "parseHyundaiCardStatement", "detectFileKind", "detectCompanyFromRows"]
    .every((k) => bundle.includes(k)));
chk("계약이 번들에 실려 있다", bundle.includes('"samsungcard"') && bundle.includes('"hyundaicard"'));

/* ---- 3. expenses.html UI 연결 ---- */
const exp = read("design/prototype/expenses.html");
chk("업로드 섹션이 있다", exp.includes("카드내역 가져오기"));
chk("파일 입력이 있다", /id="cardFile"[^>]*accept="\.csv/.test(exp));
chk("번들을 로드한다", exp.includes('src="common/card-import.js"'));
chk("형식 판별을 먼저 한다", exp.includes("detectFileKind"));
chk("카드사 판별을 한다", exp.includes("detectCompanyFromRows"));
chk("암호화(CFB) 파일은 열지 않고 안내한다",
  exp.includes('kind.kind === "cfb"') && exp.includes("암호화 없는 CSV 로 받거나"));
chk("비밀번호 입력란을 만들지 않는다(열기 구현이 없으므로)",
  !/type="password"/.test(exp));
chk("가맹점 규칙이 저장된다", exp.includes("setMerchantRule") && exp.includes("merchantRules"));
chk("rowKey 중복 건너뜀이 있다", exp.includes("keys.has(r.rowKey)"));
chk("미분류는 어느 합계에도 들어가지 않는다고 안내한다",
  exp.includes("어느 합계에도 들어가지 않는다"));
chk("가져온 내역 합계를 행에서 다시 계산한다",
  exp.includes("importSums") && exp.includes("reduce"));
chk("용도구분 3값을 모두 제공한다",
  ["unclassified", "business", "personal"].every((k) => exp.includes('"' + k + '"')));
chk("status/alert 영역이 있다", exp.includes('id="cardStatus"') && exp.includes('id="cardError"'));

/* ---- 4. mock-data.js 카드 저장소 ---- */
const mock = read("design/prototype/common/mock-data.js");
chk("카드 저장 키가 있다", mock.includes("assetflow.cardImports.v1"));
chk("로드 시 저장값을 읽는다", mock.includes("cardStorage.load()"));
chk("행에서 supplyExVat 를 다시 계산한다",
  mock.includes("Math.round(r.grossAmount) - Math.round(r.vat)"));
chk("용도구분을 검증한다", mock.includes("EXPENSE_KINDS.indexOf"));

/* ---- vm 실행: 진짜 데이터 흐름 ---- */
const sandbox = {
  window: {
    localStorage: {
      _s: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
      setItem(k, v) { this._s[k] = String(v); },
      removeItem(k) { delete this._s[k]; },
    },
  },
  TextDecoder,
  console,
  JSON,
  Math,
  Object,
  Array,
  Date,
};
createContext(sandbox);
runInContext(read(BUNDLE), sandbox, { filename: BUNDLE });
runInContext(read("design/prototype/common/mock-data.js"), sandbox, { filename: "mock-data.js" });
const w = sandbox.window;
chk("vm 실행 성공", typeof w.AFCard === "object" && typeof w.AF.data === "object");

// 4a. 현대 픽스처를 파싱해 가져오기 레코드를 만든다(UI 와 같은 절차).
//     행을 미리 문자열로 만들어 vm 안으로 넣는다.
function stripRow(r) {
  return {
    rowKey: r.rowKey, approvedAt: r.approvedAt, merchantName: r.merchantName,
    grossAmount: r.grossAmount, supplyExVat: r.supplyExVat, vat: r.vat,
    expenseKind: r.expenseKind, reversal: r.reversal, cardMasked: r.cardMasked,
    approvedAmount: r.approvedAmount, installmentCount: r.installmentCount,
    memberRelation: r.memberRelation, approvalNo: r.approvalNo
  };
}
const hyundaiAnon = readFileSync(ROOT + "/samples/card/anonymized/hyundaicard-personal-anon.csv");
const parsed = w.AFCard.parseHyundaiCardStatement(hyundaiAnon, w.AFCard.contract);
chk("vm 안 현대 파싱 75건", parsed.rows.length === 75, parsed.rows.length);
chk("vm 안 교차검증 통과", parsed.crossCheck && parsed.crossCheck.grossOk && parsed.crossCheck.vatOk);

const vmFlow = runInContext(`
  (function () {
    var d = window.AF.data;
    var rows = ${JSON.stringify(parsed.rows.map(stripRow))};
    d.card.imports.unshift({
      id: "imp-test", company: "hyundaicard", title: "현대카드 이용내역",
      importedAt: d.asOf, period: "2025-01-01 ~ 2025-12-31", crossCheck: null,
      rows: rows
    });
    d.card.merchantRules["합성마트 - 합성지점"] = "business";
    window.AF.cardStorage.save();
    return { count: d.card.imports[0].rows.length,
             saved: !!window.localStorage.getItem("assetflow.cardImports.v1") };
  })();
`, sandbox);
chk("vm 안 레코드 생성·저장", vmFlow && vmFlow.count === 75 && vmFlow.saved === true,
  JSON.stringify(vmFlow));

// 4b. 페이지 재시작 흉내: 저장 → 메모리+저장소 리셋 → 저장소에 스냅샷 복구 →
//     mock-data 가 부팅 때 하는 것과 같은 로드 → 행 복구 확인
const roundTrip = runInContext(`
  (function () {
    var d = window.AF.data;
    var before = JSON.stringify(d.card.imports);
    var snapshot = window.localStorage.getItem("assetflow.cardImports.v1");
    window.AF.cardStorage.reset();
    var emptyAfterReset = d.card.imports.length === 0 && Object.keys(d.card.merchantRules).length === 0;
    window.localStorage.setItem("assetflow.cardImports.v1", snapshot); // 재시작 시 이미 있던 값
    var loaded = window.AF.cardStorage.load();
    var after = JSON.stringify(d.card.imports);
    return { emptyAfterReset: emptyAfterReset, loaded: loaded, same: before === after,
             rule: d.card.merchantRules["합성마트 - 합성지점"] || null };
  })();
`, sandbox);
chk("vm 리셋 후 비어 있음", roundTrip.emptyAfterReset);
chk("vm 로드가 true 를 반환", roundTrip.loaded === true);
chk("vm 로드 왕복이 같은 행을 복구", roundTrip.same === true, "행 JSON 불일치");
chk("vm 가맹점 규칙 복구", roundTrip.rule === "business", String(roundTrip.rule));

// 4c. 깨진 스냅샷: load 가 false 를 반환하고 현재 상태를 유지한다(지우지 않는다).
//     부팅 시에는 현재 상태가 시드(빈값)이므로 결과적으로 시드로 돌아간 것과 같다.
const corrupt = runInContext(`
  (function () {
    window.AF.cardStorage.reset();
    window.localStorage.setItem("assetflow.cardImports.v1", "{broken");
    var ok1 = window.AF.cardStorage.load(); // false
    var empty = window.AF.data.card.imports.length === 0;
    // 구조는 맞지만 값이 이상한 스냅샷
    window.localStorage.setItem("assetflow.cardImports.v1", JSON.stringify({
      imports: [{ id: "x", company: "hyundaicard", title: "", importedAt: "", period: "",
                  rows: [{ merchantName: "가", grossAmount: 1000, vat: 91, rowKey: "k", expenseKind: "개인용", reversal: "이상한값" }] }],
      merchantRules: { "가": "업무용" }
    }));
    var ok2 = window.AF.cardStorage.load(); // true, 행 1건
    var d = window.AF.data.card;
    var r = d.imports[0].rows[0];
    return {
      ok1: ok1, empty: empty, ok2: ok2,
      kind: r.expenseKind, reversal: r.reversal,
      supply: r.supplyExVat,
      ruleDropped: d.merchantRules["가"] === undefined
    };
  })();
`, sandbox);
chk("vm 깨진 JSON 은 false 를 반환", corrupt.ok1 === false);
chk("vm 깨진 JSON 뒤 시드(빈값) 유지", corrupt.empty === true);
chk("vm 이상한 enum 은 unclassified 로", corrupt.kind === "unclassified", corrupt.kind);
chk("vm 이상한 reversal 은 매입으로", corrupt.reversal === "매입");
chk("vm supplyExVat 는 행에서 재계산된다(1000-91)", corrupt.supply === 909, String(corrupt.supply));
chk("vm 잘못된 규칙 값은 버려진다", corrupt.ruleDropped === true);

// 4d. 합계는 행에서 다시 계산된다 — 저장 스냅샷에 합계 필드가 없어야 한다
const stored = JSON.parse(sandbox.window.localStorage.getItem("assetflow.cardImports.v1"));
chk("저장 스냅샷에 합계 필드가 없다(행이 단일 출처)",
  stored.imports.every((imp) => Object.keys(imp).every((k) => !/sum|total/i.test(k))));

/* ---- 5. 카드사 판별 ---- */
const { parseCsv } = w.AFCard;
const samsungAnonText = readFileSync(ROOT + "/samples/card/anonymized/samsungcard-personal-anon.csv").toString("utf8");
const detS = w.AFCard.detectCompanyFromRows(parseCsv(samsungAnonText.replace(/^\uFEFF/, "")), CONTRACT);
chk("삼성 픽스처 판별", detS.company === "samsungcard" && detS.headerRowNumber === 19,
  JSON.stringify(detS));
const detH = w.AFCard.detectCompanyFromRows(parseCsv(hyundaiAnon.toString("utf8").replace(/^\uFEFF/, "")), CONTRACT);
chk("현대 픽스처 판별", detH.company === "hyundaicard" && detH.headerRowNumber === 8,
  JSON.stringify(detH));
const detUnknown = w.AFCard.detectCompanyFromRows(parseCsv("a,b,c\n1,2,3\n4,5,6\n"), CONTRACT);
chk("무관한 CSV 는 카드사 미확인", detUnknown.company === null, JSON.stringify(detUnknown));

// 실제 파일은 이 저장소 밖에 있다. 있을 때만 판별을 본다(PII 미출력).
const REAL_SAMSUNG = "C:/Users/H/Downloads/samsungcard_detail_202601(개인사업자용 카드이용내역서).csv";
const REAL_HYUNDAI = "C:/Users/H/Downloads/hyundaicard_202605041336031708166977_1070(Sheet0).csv";
let realNote = "실제 파일 없음: 판별 건너뜀";
if (existsSync(REAL_SAMSUNG)) {
  const t = readFileSync(REAL_SAMSUNG).toString("utf8").slice(1); // BOM 제거
  const d1 = w.AFCard.detectCompanyFromRows(parseCsv(t), CONTRACT);
  chk("실제 삼성 파일 판별", d1.company === "samsungcard", JSON.stringify(d1));
  realNote = "실제 삼성/현대 판별 통과";
}
if (existsSync(REAL_HYUNDAI)) {
  const t = readFileSync(REAL_HYUNDAI).toString("utf8").slice(1);
  const d2 = w.AFCard.detectCompanyFromRows(parseCsv(t), CONTRACT);
  chk("실제 현대 파일 판별", d2.company === "hyundaicard" && d2.headerRowNumber === 8, JSON.stringify(d2));
  realNote = "실제 삼성/현대 판별 통과";
}

/* ---- 6. UTF-8 무결성 ---- */
{
  const dec = new TextDecoder("utf-8", { fatal: true });
  const files = [
    "design/prototype/expenses.html", "design/prototype/common/mock-data.js",
    BUNDLE, "samples/card/card-columns.json",
    "samples/card/tools/build-card-import-bundle.mjs",
    "apps/frontend/src/lib/card/card-common.mjs",
    "samples/card/tools/lib/detect.mjs",
  ];
  let bad = 0;
  for (const file of files) {
    try { dec.decode(readFileSync(ROOT + "/" + file)); }
    catch (e) { console.log("  FAIL UTF-8 " + file); bad++; }
  }
  chk("수정 파일 UTF-8 무결성", bad === 0, bad + "건");
}

/* ---- 출력 ---- */
console.log("총 " + (pass + fail) + "건 중 " + fail + "건 실패");
if (fail > 0) { failures.forEach((x) => console.log("  FAIL " + x)); console.log("RESULT: FAIL"); process.exit(1); }
else console.log("RESULT: PASS");
console.log("실제 파일: " + realNote);
