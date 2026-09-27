// 현대카드 합성 명세서 CSV 생성기.
//
// 왜 합성인가: 실제 파일(hyundaicard_202605041336031708166977_1070(Sheet0).csv,
// 1,323행)은 PII 를 포함한다 — 성명·생년월일·전체 카드번호. 저장소에 넣지 않는다.
// 대신 구조와 엣지 케이스를 그대로 모사한 합성 데이터를 만든다.
//
// 실제 파일에서 발견된 엣지 케이스를 전부 담는다:
//   - 취소 행(상태=취소, 음수 금액). 부가세가 음수인 취소도 있다(-2,445 사례)
//   - 포인트 전액 결제(승인>0, 이용=0, 부가세>0) → 역산 공급가액이 음수
//   - 포인트 부분 결제(승인≠이용)
//   - 할부 2·3개월
//   - 내용이 완전히 같은 행 2개(동일내용 발생차수 시험용)
//   - 사업자등록번호 결측 3건
//   - 면세(부가세 0) 거래
//
// 합계행은 행에서 계산한다. 손으로 쓴 합계는 행과 어긋나는 순간 파서 시험이
// 헛수고가 된다. 모든 값은 지어낸 것이고 실제 가맹점·번호를 복사하지 않는다.
// 결정적으로 생성한다(랜덤 없음) — test-parse-hyundai.mjs 가 바이트 단위로
// 재현되는지 검사한다.

import { writeFileSync } from "node:fs";

/* ---------- 합성 데이터 ---------- */

// 카드 3장. 전체 번호 형태(4573-2110-0211-3694 처럼 4-4-4-4)라서
// 파서의 마스킹 경로가 실제로 시험된다.
const CARD_A = "4573-1111-2222-3333";
const CARD_B = "4573-1111-2222-4444";
const CARD_C = "9410-5555-6666-7777";

// 가맹점·번호는 형태만 실제와 같게 하고 값은 전부 지어낸다.
const MERCH = {
  mart: "(주)합성마트 - 합성지점",
  pc: "합성컴퓨터",
  hosp: "합성병원",
  tel: "합성통신",
  cafe: "합성카페",
  book: "합성서점",
  ham: "합성햄",
  rent: "#합성전월세1234567-1654",
  mart2: "합성마트(주)",
  furniture: "합성가구",
  appliance: "합성가전",
  pharm: "합성약국",
  gas: "합성주유소",
  travel: "합성여행사",
  soup: "합성국박(주)",
  dept: "합성백화점",
};
const GNO = {
  [MERCH.mart]: "211-511111",
  [MERCH.pc]: "870-609999",
  [MERCH.hosp]: "440-808888",
  [MERCH.tel]: "100-495555",
  [MERCH.cafe]: "302-766661",
  [MERCH.book]: "134-466661",
  [MERCH.ham]: "620-123456",
  [MERCH.rent]: "860-846666",
  [MERCH.mart2]: "310-950001",
  [MERCH.furniture]: "517-220002",
  [MERCH.appliance]: "411-860003",
  [MERCH.pharm]: "142-019004",
  [MERCH.gas]: "116-819005",
  [MERCH.travel]: "220-815506",
  [MERCH.soup]: "307-850607",
  [MERCH.dept]: "402-901408",
};
// 사업자번호 결측 3건(합성컴퓨터, 합성약국, 합성주유소). 실제 파일에도 3건 있었다.
const BNO_MISSING = new Set([MERCH.pc, MERCH.pharm, MERCH.gas]);
const bno = (name) => (BNO_MISSING.has(name) ? "" : "131-81-67" + String(100 + (name.length % 800)).padStart(3, "0"));

/** 정상 과세 행의 부가세. 이용금액/11 을 반올림(실제 파일의 다수 행 패턴). */
const vatOf = (g) => Math.round(g / 11);

const rows = [];
const add = (date, merch, approved, used, vat, relation, card, status, installment) => {
  rows.push({
    date, merch,
    approved: approved === null ? "" : approved,
    used, vat,
    relation, card,
    status: status || "정상",
    installment: installment === null || installment === undefined ? "" : installment,
  });
};

/* 매월 반복되는 기본 5행 (2025-01 ~ 2025-12) */
for (let m = 1; m <= 12; m++) {
  const mm = String(m).padStart(2, "0");
  const g1 = 55000 + 10000 * (m % 3);
  add("2025." + mm + ".05", MERCH.mart, g1, g1, vatOf(g1), "본인", CARD_A);
  add("2025." + mm + ".10", MERCH.pc, 110000, 110000, vatOf(110000), "본인", CARD_B);
  const g3 = 22000 + 2200 * (m % 4);
  add("2025." + mm + ".15", MERCH.hosp, g3, g3, 0, "가족", CARD_A);
  add("2025." + mm + ".20", MERCH.tel, 39690, 39690, 0, "본인", CARD_C);
  const g5 = 6600 + 1100 * (m % 5);
  add("2025." + mm + ".25", MERCH.cafe, g5, g5, vatOf(g5), "가족", CARD_B);
}

/* 엣지 케이스 (실제 파일의 각 사례를 그대로 옮긴 구조) */
add("2025.10.25", MERCH.book, 12800, 0, 1164, "본인", CARD_A);            // 포인트 전액 + 부가세>0
add("2025.10.25", MERCH.ham, 99900, 0, 9081, "본인", CARD_B);             // 포인트 전액 + 부가세>0
add("2025.10.20", MERCH.rent, 39690, 0, 0, "본인", CARD_C);               // 포인트 전액 + 부가세 0
add("2025.10.28", MERCH.mart2, 70000, 66650, 6364, "본인", CARD_A);       // 포인트 부분 결제
add("2025.12.26", MERCH.mart, -5270, -5270, 0, "본인", CARD_A, "취소");    // 취소
add("2025.12.15", MERCH.cafe, -24450, -24450, -2445, "본인", CARD_B, "취소"); // 부가세가 음수인 취소
add("2025.11.04", MERCH.soup, 600, 600, 0, "본인", CARD_A);               // 완전동일 중복 1
add("2025.11.04", MERCH.soup, 600, 600, 0, "본인", CARD_A);               // 완전동일 중복 2
add("2025.03.10", MERCH.furniture, 1100000, 1100000, 100000, "본인", CARD_A, "정상", 3); // 할부 3
add("2025.06.15", MERCH.appliance, 660000, 660000, 60000, "가족", CARD_B, "정상", 2);    // 할부 2
add("2025.02.14", MERCH.pharm, 13200, 13200, 1200, "가족", CARD_A);       // 사업자번호 결측
add("2025.08.08", MERCH.gas, 65000, 65000, 5909, "본인", CARD_C);         // 사업자번호 결측
add("2025.09.12", MERCH.travel, 880000, 880000, 0, "본인", CARD_A);       // 면세 큰 금액
add("2025.07.20", MERCH.dept, 5500000, 5500000, 500000, "본인", CARD_B);  // 큰 과세 금액
add("2025.05.05", MERCH.book, 12800, 12800, 1164, "본인", CARD_A);        // 일반 과세

/* 실제 파일과 같은 정렬: 날짜 내림차순 */
rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

/* ---------- 검산 ---------- */
const sum = (k) => rows.reduce((a, r) => a + (typeof r[k] === "number" ? r[k] : 0), 0);
const sumApproved = sum("approved"), sumUsed = sum("used"), sumVat = sum("vat");
const cancelCount = rows.filter((r) => r.status === "취소").length;
const negRows = rows.filter((r) => r.used < 0).length;
if (cancelCount !== negRows) throw new Error("상태=취소(" + cancelCount + ")와 음수 행(" + negRows + ")이 불일치");
const pointVatPos = rows.filter((r) => r.used === 0 && r.vat > 0).length;
if (pointVatPos !== 2) throw new Error("포인트 전액+부가세>0 행이 2건이어야 한다: " + pointVatPos);
const dupGroup = rows.filter((r) => r.date === "2025.11.04" && r.merch === MERCH.soup).length;
if (dupGroup !== 2) throw new Error("완전동일 중복이 2행이어야 한다: " + dupGroup);

/* ---------- CSV 작성 ---------- */
const q = (v) => {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
// 실제 파일처럼 천단위 콤마 금액은 따옴표로 감싼다. 감싸기는 line() 의 q() 가
// 하므로 여기서는 원시 문자열만 만든다. q() 를 여기서 또 쓰면 이중 인용이 된다.
const money = (n) => (n === "" ? "" : n.toLocaleString("en-US"));
const line = (cells) => cells.map((c) => (typeof c === "number" ? q(String(c)) : q(c))).join(",");

const header = ["이용일", "카드번호", "가맹점명", "승인 금액", "이용 금액", "부가세", "관계", "할부", "상태", "가맹점번호", "사업자등록번호"];
const dataLines = rows.map((r) => line([
  r.date,
  r.card,
  r.merch,
  money(r.approved),
  money(r.used),
  money(r.vat),
  r.relation,
  r.installment,
  r.status,
  GNO[r.merch] || "",
  bno(r.merch),
]));

const totalLine = line([
  "합 계", "",
  rows.length + "건",
  money(sumApproved), money(sumUsed), money(sumVat),
  "", "", "", "", "",
]);

const content = [
  line(["현대카드 이용내역"]),
  "",
  line(["기준 일자 : 2025년 01월 01일 ~ 2025년 12월 31일"]),
  line(["회원 정보 : 홍*길(000000-0******)"]), // 가짜 PII. 파서가 버리는지 시험하는 데 쓴다.
  "",
  line(["이용 내역"]),
  line(["(단위 : 원)"]),
  line(header),
  ...dataLines,
  "",
  totalLine,
  "",
  line(["발급 일자 : 2026년 05월 04일"]),
  line(["발급 기관 : 현대카드 (주)"]),
  "",
].join("\n");

const OUT = "D:/study/assetflow/samples/card/anonymized/hyundaicard-personal-anon.csv";
writeFileSync(OUT, "\ufeff" + content, "utf8");

console.log("생성 완료: " + OUT);
console.log("  " + rows.length + "행 x 11열 (취소 " + cancelCount + ", 포인트 전액 3, 부분 1, 할부 2, 완전동일 중복 1그룹, 사업자번호 결측 3)");
console.log("  승인합 " + sumApproved.toLocaleString() + " / 이용합 " + sumUsed.toLocaleString() + " / 부가세합 " + sumVat.toLocaleString() + " (합계행에 기록)");
