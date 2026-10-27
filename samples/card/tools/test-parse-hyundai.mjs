// parse-hyundai.mjs 검증.
//
// 기준은 두 가지다:
//   - 합성 픽스처(익명화)는 알려진 정답이 있다. 행 수·합계·중복 키·엣지 케이스가
//     기대값과 맞아야 한다.
//   - 변형 픽스처는 '파서가 이걸 잡아내는가' 를 본다. 합계가 깨진 파일, 헤더가
//     다른 위치인 파일, 필수 컬럼이 빠진 파일을 넣고 거절/경고를 받는지 확인한다.
//
// 정답 기준은 card-columns.json 과 빌더 스크립트의 계산값이다. 손으로 쓴
// 기대값이 파서와 같은 오독을 공유하지 않도록 합계는 코드에서 다시 계산한다.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseHyundaiCardStatement, } from "../../../apps/frontend/src/lib/card/parse-hyundai.mjs";
import { parseCsv } from "../../../apps/frontend/src/lib/card/card-common.mjs";

// 저장소 절대경로를 박지 않는다. 이 파일은 로컬에서도 CI 에서도 같은 명령으로
// 돌아야 하고, 앞사람의 D:\ 경로가 그대로 박히면 다른 머신에서 전부 깨진다.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const TOOLS = resolve(ROOT, "samples", "card", "tools");
const ANON_DIR = resolve(ROOT, "samples", "card", "anonymized");

const CONTRACT = JSON.parse(readFileSync(resolve(ROOT, "samples", "card", "card-columns.json"), "utf8"));
const ANON = resolve(ANON_DIR, "hyundaicard-personal-anon.csv");

// 실제 카드 명세는 개인정보라 저장소에 넣지 않는다.
// 로컬에서만 대조하려면 ASSETFLOW_CARD_REAL_DIR 을 그 파일이 있는 폴더로 지정한다.
// 지정이 없으면 7번 검사는 "건너뜀" 으로 끝나고 CI 를 실패시키지 않는다.
const REAL = process.env.ASSETFLOW_CARD_REAL_DIR
  ? resolve(process.env.ASSETFLOW_CARD_REAL_DIR, "hyundaicard_202605041336031708166977_1070(Sheet0).csv")
  : "";

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); }
}

/* ---- 1. 합성 픽스처 ---- */
const b = readFileSync(ANON);
const r = parseHyundaiCardStatement(b, CONTRACT);

check("BOM 제거 후 파싱된다", r.rows.length > 0, "행 " + r.rows.length);
check("헤더가 8행에 있다", r.header.rowNumber === 8, "실제 " + r.header.rowNumber);
check("열이 11개다", r.header.columnCount === 11, "실제 " + r.header.columnCount);
check("거래 75건", r.rows.length === 75, "실제 " + r.rows.length);

// 합계 교차검증: 합계행은 데이터 뒤에 있으므로 그쪽을 본다.
check("총액(이용 금액) 교차검증 통과", r.crossCheck && r.crossCheck.grossOk,
  r.crossCheck ? "행합 " + r.crossCheck.rowSumGross + " vs 명세 " + r.crossCheck.declaredGross : "합계행 못 찾음");
check("부가세 교차검증 통과", r.crossCheck && r.crossCheck.vatOk,
  r.crossCheck ? "행합 " + r.crossCheck.rowSumVat + " vs 명세 " + r.crossCheck.declaredVat : "합계행 못 찾음");
check("건수 교차검증 통과", r.crossCheck && r.crossCheck.countOk === true,
  r.crossCheck ? "행수 " + r.crossCheck.rowCount + " vs 명세 " + r.crossCheck.declaredCount : "합계행 못 찾음");
check("승인 합계가 합계행과 같다",
  r.declaredTotals && r.rows.reduce((a, x) => a + (x.approvedAmount || 0), 0) === r.declaredTotals.approved,
  r.declaredTotals ? "명세 승인합 " + r.declaredTotals.approved : "없음");

// 매핑. 승인 금액/이용 금액 분리가 이 파서의 핵심이다.
check("grossAmount 는 '이용 금액' 열에 묶인다", r.header.mapped.grossAmount === 4, "실제 " + r.header.mapped.grossAmount);
check("approvedAmount 는 '승인 금액' 열에 묶인다", r.header.mapped.approvedAmount === 3, "실제 " + r.header.mapped.approvedAmount);
check("vat 는 '부가세' 열에 묶인다", r.header.mapped.vat === 5, "실제 " + r.header.mapped.vat);
check("관계가 memberRelation 로 매핑된다", r.header.mapped.memberRelation === 6, "실제 " + r.header.mapped.memberRelation);
check("할부가 installmentCount 로 매핑된다", r.header.mapped.installmentCount === 7, "실제 " + r.header.mapped.installmentCount);
check("상태가 reversal 로 매핑된다", r.header.mapped.reversal === 8, "실제 " + r.header.mapped.reversal);
check("가맹점번호(index 9)는 매핑하지 않는다",
  r.header.mapped.merchantNo === undefined && !Object.values(r.header.mapped).includes(9));
// §56: 사업자번호는 가맹점 식별·업종 조회용으로 남긴다(하이픈 제거).
check("사업자번호(index 10)는 businessNo 로 매핑된다 (§56)", r.header.mapped.businessNo === 10,
  "실제 " + r.header.mapped.businessNo);

// 날짜 정규화: 점 구분을 ISO 로.
const d25 = r.rows.find((x) => x.merchantName === "합성서점" && x.approvedAmount === 12800 && x.grossAmount === 0);
check("날짜가 YYYY.MM.DD 에서 ISO 로 정규화된다", d25 && d25.approvedAt === "2025-10-25",
  d25 ? "실제 " + d25.approvedAt : "행 못 찾음");
check("모든 approvedAt 가 ISO 형식이다", r.rows.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.approvedAt)));

// 카드번호 마스킹. 현대는 전체 번호로 주므로 파서가 가려야 한다.
const flat = JSON.stringify(r.rows);
check("전체 카드번호가 결과에 없다", !flat.includes("4573-1111-2222") && !flat.includes("9410-5555-6666"));
check("카드번호가 마스킹 형태로 저장된다", r.rows.filter((x) => x.cardMasked === "4573-****-****-3333").length > 0);
check("모든 cardMasked 에 * 이 있다", r.rows.every((x) => !x.cardMasked || x.cardMasked.includes("*")));

// PII 는 반환하지 않는다
check("회원명이 결과에 없다", !flat.includes("홍*길"));
check("주민등록번호가 결과에 없다", !flat.includes("000000-0"));
// §56: 사업자번호는 저장 대상이지만 하이픈 없는 10자리로만 남긴다.
check("사업자번호는 하이픈 없이 정규화된다",
  r.rows.filter((x) => x.businessNo).every((x) => /^\d{10}$/.test(x.businessNo)));

// 취소: 상태 컬럼이 1차 신호다.
const cancels = r.rows.filter((x) => x.reversal === "매입취소");
check("취소 2건", cancels.length === 2, "실제 " + cancels.length);
check("취소 행이 모두 음수다", cancels.every((x) => x.grossAmount < 0));
const negVat = cancels.find((x) => x.vat < 0);
check("부가세가 음수인 취소 행이 있다(실제 파일 사례)", !!negVat && negVat.vat === -2445, negVat ? String(negVat.vat) : "없음");
check("취소 행의 상태-부호 불일치 경고가 없다", r.warnings.filter((w) => w.code === "reversalSignMismatch").length === 0,
  JSON.stringify(r.warnings.filter((w) => w.code === "reversalSignMismatch").slice(0, 2)));

// 포인트 결제: 이용=0 이면 역산 공급가액이 음수다. 자르지 않고 경고만 한다.
const pointRows = r.rows.filter((x) => x.grossAmount === 0 && x.approvedAmount !== null && x.approvedAmount > 0);
check("포인트 전액 결제 3건", pointRows.length === 3, "실제 " + pointRows.length);
check("역산 공급가액이 음수인 행이 있다(값을 유지한다)", pointRows.some((x) => x.supplyExVat < 0));
check("vatExceedsGross 경고가 정확히 2건이다",
  r.warnings.filter((w) => w.code === "vatExceedsGross").length === 2,
  JSON.stringify(r.warnings.filter((w) => w.code === "vatExceedsGross").length));
const partial = r.rows.find((x) => x.approvedAmount === 70000);
check("포인트 부분 결제(승인 70,000 / 이용 66,650)", !!partial && partial.grossAmount === 66650,
  partial ? String(partial.grossAmount) : "행 못 찾음");

// 부가세 검산을 하지 않는다(가맹점 신고값이므로). 이게 없으면 거짓 경고가 나온다.
check("vatMismatch 경고를 내지 않는다", r.warnings.filter((w) => w.code === "vatMismatch").length === 0);

// 할부·관계
check("할부 3개월 행이 있다", r.rows.some((x) => x.installmentCount === 3));
check("할부 2개월 행이 있다", r.rows.some((x) => x.installmentCount === 2));
check("관계 값이 본인/가족 뿐이다", [...new Set(r.rows.map((x) => x.memberRelation))].every((v) => v === "본인" || v === "가족"));
check("expenseKind 기본값이 unclassified 다", r.rows.every((x) => x.expenseKind === "unclassified"));

// rowKey: 완전동일 중복도 구별한다.
const keys = r.rows.map((x) => x.rowKey);
check("rowKey 가 모두 유일하다", new Set(keys).size === keys.length,
  "중복 " + (keys.length - new Set(keys).size) + "건");
const soupKeys = keys.filter((k) => k.includes("합성국박"));
check("동일내용 행이 발생차수로 구별된다", soupKeys.length === 2 && soupKeys[0] !== soupKeys[1],
  soupKeys.join(" / "));

// 정상 행은 역산이 성립한다(포인트 행 제외).
check("정상 행의 supplyExVat = 이용금액 - 부가세",
  r.rows.filter((x) => x.grossAmount !== 0).every((x) => x.supplyExVat === x.grossAmount - x.vat));

/* ---- 2. 헤더가 다른 위치여도 잡는지 ---- */
{
  const text = readFileSync(ANON, "utf8").replace(/^\ufeff/, "");
  const lines = text.split(/\r?\n/);
  const moved = ["다른카드사,서식", "", "발급일자,2026.03.01", ...lines];
  const r2 = parseHyundaiCardStatement(moved.join("\n"), CONTRACT);
  check("헤더 위치가 달라도 찾는다", r2.header.rowNumber === 11, "실제 " + r2.header.rowNumber);
  check("위치를 바꿔도 거래 수는 같다", r2.rows.length === r.rows.length, r2.rows.length + " vs " + r.rows.length);
  check("위치를 바꿔도 합계가 일치한다", r2.crossCheck && r2.crossCheck.grossOk,
    r2.crossCheck ? "delta " + r2.crossCheck.grossDelta : "합계행 못 찾음");
}

/* ---- 3. 합계가 깨진 파일을 조용히 넘기지 않는지 ---- */
{
  const rows = parseCsv(readFileSync(ANON, "utf8").replace(/^\ufeff/, ""));
  // 합계행의 이용금액 칸을 틀리게 바꾼다(마지막 합계 행 찾기: '합 계' 행).
  const idx = rows.findIndex((x) => String(x[0]).replace(/\s/g, "") === "합계");
  check("합계행을 찾았다", idx > 0, "인덱스 " + idx);
  rows[idx][4] = "9,999,999";
  const broken = rows.map((x) => x.map((y) => (/[",]/.test(y) ? '"' + y.replace(/"/g, '""') + '"' : y)).join(",")).join("\n");
  const r3 = parseHyundaiCardStatement(broken, CONTRACT);
  check("깨진 총액을 감지한다", r3.crossCheck && !r3.crossCheck.grossOk,
    r3.crossCheck ? "delta " + r3.crossCheck.grossDelta : "crossCheck 없음");
}

/* ---- 4. 필수 컬럼이 빠지면 예외 ---- */
{
  const rows = parseCsv(readFileSync(ANON, "utf8").replace(/^\ufeff/, ""));
  // 부가세 열을 통째로 지운다.
  const noVat = rows.map((x) => x.filter((_, i) => i !== 5));
  const text = noVat.map((x) => x.map((y) => (/[",]/.test(y) ? '"' + y.replace(/"/g, '""') + '"' : y)).join(",")).join("\n");
  let msg = "";
  try { parseHyundaiCardStatement(text, CONTRACT); }
  catch (e) { msg = e.message; }
  check("부가세 컬럼이 없으면 예외(조용한 0건 금지)", msg !== "", "예외가 안 남");
  check("에러가 vat 가 안 잡혔다고 알려준다", /vat/.test(msg), msg.slice(0, 160));
}

/* ---- 5. 날짜를 못 읽는 데이터 행은 버리면서 경고한다 ---- */
{
  const rows = parseCsv(readFileSync(ANON, "utf8").replace(/^\ufeff/, ""));
  // 첫 데이터 행(인덱스 8)의 날짜를 이상한 값으로 바꾼다.
  rows[8][0] = "2025-13-40";
  const broken = rows.map((x) => x.map((y) => (/[",]/.test(y) ? '"' + y.replace(/"/g, '""') + '"' : y)).join(",")).join("\n");
  const r5 = parseHyundaiCardStatement(broken, CONTRACT);
  check("날짜가 깨진 데이터 행을 버린다", r5.rows.length === r.rows.length - 1,
    r5.rows.length + " vs " + r.rows.length);
  check("버린 행을 경고로 알린다", r5.warnings.some((w) => w.code === "rowSkippedNoDate"),
    JSON.stringify(r5.warnings.slice(0, 2)));
}

/* ---- 6. 건수 합계가 어긋나면 감지한다 ---- */
{
  const rows = parseCsv(readFileSync(ANON, "utf8").replace(/^\ufeff/, ""));
  const idx = rows.findIndex((x) => String(x[0]).replace(/\s/g, "") === "합계");
  rows[idx][2] = "9999건";
  const broken = rows.map((x) => x.map((y) => (/[",]/.test(y) ? '"' + y.replace(/"/g, '""') + '"' : y)).join(",")).join("\n");
  const r6 = parseHyundaiCardStatement(broken, CONTRACT);
  check("깨진 건수를 감지한다", r6.crossCheck && r6.crossCheck.countOk === false,
    r6.crossCheck ? "행수 " + r6.crossCheck.rowCount + " vs " + r6.crossCheck.declaredCount : "crossCheck 없음");
}

/* ---- 7. 실제 파일에도 같은 규칙이 통하는지 (PII 는 출력하지 않는다) ---- */
// 파일이 없는 것을 실패로 보지 않는다. 개인정보라 CI 에는 없는 게 정상이다.
// 없는 상태에서 실패로 세면 아무도 고칠 수 없는 실패가 PR 을 막는다.
let realNote = "(실제 파일 없음: 건너뜀)";
if (REAL && existsSync(REAL)) try {
  const rb = readFileSync(REAL);
  const r7 = parseHyundaiCardStatement(rb, CONTRACT);
  const flat7 = JSON.stringify(r7.rows);
  check("실제 파일 총액 일치", !!r7.crossCheck && r7.crossCheck.grossOk,
    r7.crossCheck ? "delta " + r7.crossCheck.grossDelta : "없음");
  check("실제 파일 부가세 일치", !!r7.crossCheck && r7.crossCheck.vatOk,
    r7.crossCheck ? "delta " + r7.crossCheck.vatDelta : "없음");
  check("실제 파일 건수 일치", !!r7.crossCheck && r7.crossCheck.countOk === true,
    r7.crossCheck ? "행수 " + r7.crossCheck.rowCount : "없음");
  check("실제 파일 1,323행", r7.rows.length === 1323, r7.rows.length);
  check("실제 파일 취소 23건", r7.rows.filter((x) => x.reversal === "매입취소").length === 23,
    r7.rows.filter((x) => x.reversal === "매입취소").length);
  check("실제 파일 승인≠이용 30건", r7.rows.filter((x) => x.approvedAmount !== null && x.approvedAmount !== x.grossAmount).length === 30,
    r7.rows.filter((x) => x.approvedAmount !== null && x.approvedAmount !== x.grossAmount).length);
  check("실제 파일 vatExceedsGross 17건(포인트 전액+부가세>0)",
    r7.warnings.filter((w) => w.code === "vatExceedsGross").length === 17,
    r7.warnings.filter((w) => w.code === "vatExceedsGross").length);
  check("실제 파일 rowKey 유일", new Set(r7.rows.map((x) => x.rowKey)).size === 1323,
    new Set(r7.rows.map((x) => x.rowKey)).size);
  check("실제 파일에서 카드 3장", new Set(r7.rows.map((x) => x.cardMasked)).size === 3,
    new Set(r7.rows.map((x) => x.cardMasked)).size);
  check("실제 파일에서 전체 카드번호가 안 새나온다", !/\d{4}-\d{4}-\d{4}-\d{4}/.test(flat7) && !/\d{15,19}/.test(flat7));
  check("실제 파일 상태-부호 불일치 경고 없음", r7.warnings.filter((w) => w.code === "reversalSignMismatch").length === 0,
    JSON.stringify(r7.warnings.filter((w) => w.code === "reversalSignMismatch").slice(0, 2)));
  realNote = "1,323행, 이용합 일치, 부가세 일치, 취소 23건, 포인트 행 30건, 카드 3장";
} catch (e) {
  check("실제 파일 파싱이 예외 없이 끝난다", false, e.message);
  realNote = "예외: " + e.message.slice(0, 200);
}

/* ---- 8. 픽스처 재현성 ---- */
// temp 스크래치로만 만들어진 커밋 픽스처가 있던 적이 있다. 생성기와 커밋본이
// 어긋나면 이 검사에서 걸린다.
import { execFileSync } from "node:child_process";
{
  const before = readFileSync(ANON);
  try {
    execFileSync("node", [resolve(TOOLS, "build-anonymized-hyundai.mjs")], { encoding: "utf8" });
  } catch (e) {
    check("build-anonymized-hyundai.mjs 실행됨", false, e.message.split("\n")[0]);
  }
  const after = readFileSync(ANON);
  check("hyundaicard-personal-anon.csv 가 생성기로 바이트 단위로 재현된다", Buffer.compare(before, after) === 0,
    before.length + "B → " + after.length + "B (생성기를 고치고 커밋을 안 한 상태)");
}

/* ---- 출력 ---- */
console.log("총 " + (pass + fail) + "건 중 " + fail + "건 실패");
if (fail > 0) { failures.forEach((f) => console.log("  FAIL " + f)); console.log("RESULT: FAIL"); process.exitCode = 1; }
else console.log("RESULT: PASS");
console.log("실제 파일: " + realNote);
