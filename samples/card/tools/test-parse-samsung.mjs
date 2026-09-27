// parse-samsung.mjs 검증.
//
// 기준은 두 가지다:
//   - 합성 픽스처(익명화)는 알려진 정답이 있다. 행 수·합계·중복 키가 기대값과
//     맞아야 한다.
//   - 변형 픽스처는 '파서가 이걸 잡아내는가' 를 본다. 합계행이 깨진 파일,
//     헤더가 다른 위치인 파일 등을 넣고 거절/경고를 받는지 확인한다.
//
// 정답 기준은 card-columns.json 과 빌더 스크립트의 계산값이다. 손으로 쓴
// 기대값이 파서와 같은 오독을 공유하지 않도록, 합계는 코드에서 다시 계산한다.

import { readFileSync } from "node:fs";
import { parseSamsungCardStatement, parseCsv } from "file:///D:/study/assetflow/apps/frontend/src/lib/card/parse-samsung.mjs";

const CONTRACT = JSON.parse(readFileSync("D:/study/assetflow/samples/card/card-columns.json", "utf8"));
const ANON = "D:/study/assetflow/samples/card/anonymized/samsungcard-personal-anon.csv";
const REAL = "C:/Users/H/Downloads/samsungcard_detail_202601(개인사업자용 카드이용내역서).csv";

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); }
}
const b = readFileSync(ANON);

/* ---- 1. 합성 픽스처 ---- */
const r = parseSamsungCardStatement(b, CONTRACT);

check("BOM 제거 후 파싱된다", r.rows.length > 0, "행 " + r.rows.length);
check("헤더가 19행에 있다", r.header.rowNumber === 19, "실제 " + r.header.rowNumber);
check("열이 12개다", r.header.columnCount === 12, "실제 " + r.header.columnCount);
check("거래 18건", r.rows.length === 18, "실제 " + r.rows.length);

// 합계 교차검증: 하드코딩 대신 픽스처의 합계행과 행 합계를 직접 비교한다.
check("총액 교차검증 통과", r.crossCheck && r.crossCheck.grossOk,
  r.crossCheck ? "행합 " + r.crossCheck.rowSumGross + " vs 명세 " + r.crossCheck.declaredGross : "합계행 못 찾음");
check("부가세 교차검증 통과", r.crossCheck && r.crossCheck.vatOk,
  r.crossCheck ? "행합 " + r.crossCheck.rowSumVat + " vs 명세 " + r.crossCheck.declaredVat : "합계행 못 찾음");

// 필수 필드 매핑. source 별로 기대가 다르다.
const REQUIRED_COLUMN = ["approvedAt", "merchantName", "vat", "grossAmount"];
REQUIRED_COLUMN.forEach((f) => check("필드 " + f + " 가 컬럼으로 매핑됨", r.header.mapped[f] !== undefined));
check("카드번호는 cardMasked 로", r.header.mapped.cardMasked !== undefined);
check("업종은 businessCategory 로", r.header.mapped.businessCategory !== undefined);
// supplyExVat 는 삼성에 컬럼이 없다. 매핑되지 않는 게 맞고 역산되어야 한다.
check("supplyExVat 는 컬럼으로 매핑되지 않는다(삼성에 컬럼 없음)", r.header.mapped.supplyExVat === undefined);
// expenseKind 는 파일에 없다. 헤더 탐색 대상이 아니다.
check("expenseKind 는 컬럼으로 매핑되지 않는다(사용자 입력값)", r.header.mapped.expenseKind === undefined);

// PII 는 반환하지 않는다
const flat = JSON.stringify(r.rows);
check("성명이 결과에 없다", !flat.includes("홍*길"), "성명이 그대로 들어갔다");
check("주민등록번호가 결과에 없다", !flat.includes("000000-0"));

// 공급가액 역산
check("역산 공급가액 = 총액 - 세액", r.rows.every((x) => x.supplyExVat === x.grossAmount - x.vat));
check("역산 공급가액이 음수가 아닌 거래와 부호가 같다",
  r.rows.filter((x) => x.grossAmount > 0).every((x) => x.supplyExVat >= 0));
check("세액 검산 경고가 없다", r.warnings.filter((w) => w.code === "vatMismatch").length === 0,
  JSON.stringify(r.warnings.filter((w) => w.code === "vatMismatch").slice(0, 3)));

// 취소 판별
const neg = r.rows.filter((x) => x.grossAmount < 0);
check("취소 2건", neg.length === 2, "실제 " + neg.length);
check("취소가 매입취소로 표시된다", neg.every((x) => x.reversal === "매입취소"));
check("양수 거래는 매입", r.rows.filter((x) => x.grossAmount > 0).every((x) => x.reversal === "매입"));

// 중복 rowKey 가 없어야 한다 (같은 승인번호 ±쌍이 잡혀야 함)
const keys = r.rows.map((x) => x.rowKey);
check("rowKey 가 모두 유일하다", new Set(keys).size === keys.length,
  "중복 " + (keys.length - new Set(keys).size) + "건");
// 같은 승인번호가 실제로 2회 등장하므로 rowKey 가 이걸 구분했는지 확인
const dupAppr = {};
r.rows.forEach((x) => { (dupAppr[x.approvalNo] = dupAppr[x.approvalNo] || []).push(x.rowKey); });
const dupGroups = Object.values(dupAppr).filter((v) => v.length > 1);
check("동일 승인번호 쌍이 실제로 있다", dupGroups.length === 2, "실제 " + dupGroups.length);
check("동일 승인번호쌍이 서로 다른 rowKey 다",
  dupGroups.every((v) => new Set(v).size === v.length));

// expenseKind 기본값
check("expenseKind 기본값이 unclassified 다", r.rows.every((x) => x.expenseKind === "unclassified"),
  r.rows.map((x) => x.expenseKind).join(","));

/* ---- 2. 헤더가 다른 위치여도 잡는지 ---- */
{
  const text = readFileSync(ANON, "utf8").replace(/^\ufeff/, "");
  const lines = text.split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === ""));
  // 앞에 쓰레기 줄 3개를 넣어서 헤더를 19행 -> 22행으로 민다.
  // (빈 줄을 재배치하는 건 실제 내용이 안 바뀌므로 시험이 안 된다)
  const moved = ["다른카드사,서식", "", "발행일자,2026.03.01", ...lines];
  const r2 = parseSamsungCardStatement(moved.join("\n"), CONTRACT);
  check("헤더 위치가 달라도 찾는다", r2.header.rowNumber === 22, "실제 " + r2.header.rowNumber);
  check("위치를 바꿔도 거래 수는 같다", r2.rows.length === r.rows.length, r2.rows.length + " vs " + r.rows.length);
  check("위치를 바꿔도 합계가 일치한다", r2.crossCheck && r2.crossCheck.grossOk,
    r2.crossCheck ? "delta " + r2.crossCheck.grossDelta : "합계행 못 찾음");
}

/* ---- 3. 합계가 깨진 파일을 조용히 넘기지 않는지 ---- */
{
  const rows = parseCsv(readFileSync(ANON, "utf8").replace(/^\ufeff/, ""));
  // 15행 합계총액을 틀리게 바꾼다.
  rows[14][1] = "9,999,999";
  const broken = rows.map((x) => x.map((y) => (/[",]/.test(y) ? '"' + y.replace(/"/g, '""') + '"' : y)).join(",")).join("\n");
  const r3 = parseSamsungCardStatement(broken, CONTRACT);
  check("깨진 총액을 감지한다", r3.crossCheck && !r3.crossCheck.grossOk,
    r3.crossCheck ? "delta " + r3.crossCheck.grossDelta : "crossCheck 없음");
}

/* ---- 4. 세액이 역산과 모순되면 경고 ---- */
{
  const rows = parseCsv(readFileSync(ANON, "utf8").replace(/^\ufeff/, ""));
  // 첫 거래의 부가세를 이상한 값으로 바꾼다.
  rows[19][7] = "9,999";
  const broken = rows.map((x) => x.map((y) => (/[",]/.test(y) ? '"' + y.replace(/"/g, '""') + '"' : y)).join(",")).join("\n");
  const r4 = parseSamsungCardStatement(broken, CONTRACT);
  check("역산 불일치 세액을 경고한다", r4.warnings.some((w) => w.code === "vatMismatch"),
    JSON.stringify(r4.warnings.slice(0, 2)));
}

/* ---- 5. 매핑되는 컬럼이 하나도 없으면 조용히 0건이 아니라 예외 ---- */
{
  // (a) 계약에 source 가 빠져서 아무 필드도 컬럼으로 요구하지 않는 경우.
  //     예전에는 점수 0 인 행을 '헤더 발견'으로 받아 0건을 반환했다.
  let threw = false;
  try {
    parseSamsungCardStatement(b, { fields: { approvedAt: { required: true, headerAliases: ["존재하지않는컬럼"] } }, optionalFields: {} });
  } catch { threw = true; }
  check("컬럼 하나도 안 잡히면 예외(조용한 0건 금지)", threw);

  // (b) 헤더는 잡혔지만 필수 필드 하나가 매칭 안 되면 실패하고, 무엇이 안
  //     잡혔는지 알려준다. 이게 FE 에러 메시지로 그대로 나간다.
  let msg = "";
  try {
    parseSamsungCardStatement(b, {
      fields: {
        merchantName: { required: true, source: "column", headerAliases: ["가맹점명"] },
        grossAmount: { required: true, source: "column", headerAliases: ["존재하지않는금액컬럼"] },
      },
      optionalFields: {},
    });
  } catch (e) { msg = e.message; }
  check("필수 필드 누락을 예외로 알린다", msg !== "", "예외가 안 남");
  check("에러가 어떤 필드가 안 잡혔는지 알려준다", /grossAmount/.test(msg), msg.slice(0, 140));
  // '가장 닮은 행'이 빈 행(0개 매칭)이면 안 된다. 실제로 매칭이 있는 행을 지목해야 한다.
  check("에러가 가장 닮은 행의 위치를 알려준다", /19행/.test(msg) && !/41행\(0개 매칭\)/.test(msg), msg.slice(0, 140));

  // (c) 매칭되는 컬럼이 하나도 없으면 '가장 닮은 행'을 지목하지 않는다(빈 행 지목은 거짓말)
  let msg2 = "";
  try {
    parseSamsungCardStatement(b, { fields: { x: { required: true, source: "column", headerAliases: ["완전히다른이름"] } }, optionalFields: {} });
  } catch (e) { msg2 = e.message; }
  check("매칭 0 이면 가장 닮은 행을 지목하지 않는다", !/가장 닮은 행/.test(msg2), msg2.slice(0, 140));
  check("매칭 0 일 땐 headerAliases 불일치를 말한다", /headerAliases/.test(msg2), msg2.slice(0, 140));
}

/* ---- 6. 실제 파일에도 같은 규칙이 통하는지 (PII 는 출력하지 않는다) ---- */
let realNote = "(파일 없음: 건너뜀)";
try {
  const rb = readFileSync(REAL);
  const r5 = parseSamsungCardStatement(rb, CONTRACT);
  const okGross = r5.crossCheck && r5.crossCheck.grossOk;
  const okVat = r5.crossCheck && r5.crossCheck.vatOk;
  const neg5 = r5.rows.filter((x) => x.grossAmount < 0).length;
  const keys5 = new Set(r5.rows.map((x) => x.rowKey));
  const unmapped = r5.header.columnCount - Object.keys(r5.header.mapped).length;
  check("실제 파일 총액 일치", !!okGross, r5.crossCheck ? "delta " + r5.crossCheck.grossDelta : "없음");
  check("실제 파일 부가세 일치", !!okVat, r5.crossCheck ? "delta " + r5.crossCheck.vatDelta : "없음");
  check("실제 파일 18행", r5.rows.length === 18, r5.rows.length);
  check("실제 파일 취소 2건", neg5 === 2, neg5);
  check("실제 파일 rowKey 유일", keys5.size === 18, keys5.size);
  check("실제 파일 세액 경고 없음", r5.warnings.filter((w) => w.code === "vatMismatch").length === 0);
  check("실제 파일에서 PII 가 안 새나온다",
    !JSON.stringify(r5.rows).includes("김*학") && !JSON.stringify(r5.rows).includes("760211"));
  realNote = "18행, 총액 " + (okGross ? "일치" : "불일치") + ", 부가세 " + (okVat ? "일치" : "불일치") +
    ", 취소 " + neg5 + "건, rowKey " + keys5.size + "/18, 미매핑 " + unmapped + "열(상품/매출/성명/카드구분/사업자번호)";
} catch (e) {
  check("실제 파일 파싱이 예외 없이 끝난다", false, e.message);
  realNote = "예외: " + e.message.slice(0, 200);
}

/* ---- 7. 픽스처 재현성 ---- */
// synthetic-sample.xlsx 가 temp 스크래치로만 만들어진 채 커밋돼 있었던 적이 있다.
// 바이너리만 있고 만드는 법이 없으면 아무도 못 고친다. 이 검사는 그 재발을 막는다.
import { execFileSync } from "node:child_process";
const ANON_DIR = "D:/study/assetflow/samples/card/anonymized/";
const GENERATORS = [
  ["build-synthetic-xlsx.mjs", ["synthetic-sample.xlsx", "synthetic-novat.xlsx"]],
  ["build-anonymized-samsung.mjs", ["samsungcard-personal-anon.csv"]],
];
for (const [gen, produced] of GENERATORS) {
  const before = produced.map((f) => readFileSync(ANON_DIR + f));
  try {
    execFileSync("node", ["D:/study/assetflow/samples/card/tools/" + gen], { encoding: "utf8" });
  } catch (e) {
    check(gen + " 실행됨", false, e.message.split("\n")[0]);
    continue;
  }
  produced.forEach((f, i) => {
    const after = readFileSync(ANON_DIR + f);
    check(f + " 가 생성기로 바이트 단위로 재현된다", Buffer.compare(before[i], after) === 0,
      before[i].length + "B → " + after.length + "B (생성기를 고치고 커밋을 안 한 상태)");
  });
}

/* ---- 출력 ---- */
console.log("총 " + (pass + fail) + "건 중 " + fail + "건 실패");
if (fail > 0) { failures.forEach((f) => console.log("  FAIL " + f)); console.log("RESULT: FAIL"); process.exitCode = 1; }
else console.log("RESULT: PASS");
console.log("실제 파일: " + realNote);
