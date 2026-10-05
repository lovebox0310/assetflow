// 삼성카드 개인사업자용 명세서의 합성 픽스처를 만든다.
//
// 왜 합성본을 만드는가:
// 실제 명세에는 성명·주민등록번호·카드번호·가맹점별 실제 거래가 들어 있어 저장소에
// 넣을 수 없다. 대신 실제 파일에서 '파서가 맞혀야 하는 구조적 특징'만 재현한다.
//
// 재현한 특징 (실제 파일에서 관찰된 것):
//   1. 표가 19행째에 있다. 1~18행은 발행정보·회원정보·합계 요약이라 표가 아니다.
//   2. 12열이 41행 내내 일정하다.
//   3. 15행 합계행(총 합계·부가세 합계)이 20~37행의 합과 정확히 일치한다.
//   4. 이용금액이 음수인 취소 행이 있고, 같은 승인번호로 +/− 쌍을 이룬다.
//   5. 부가세 0 인 행이 다수다(비과세·면세·관리비).
//   6. 매달 같은 가맹점에서 반복되는 지출이 있다(가맹점 규칙 경로 시험용).
//   7. UTF-8 BOM 이 있다.
//
// 값을 바꾸는 기준: 합계는 반드시 행 합계와 일치해야 한다. 그래야 3번 성질이
// 파서 버그를 잡는 기준이 된다. 손으로 숫자를 쓰지 않고 여기서 계산한다.
//
// 모든 값은 이긴 지어낸 것이다. 실제 파일의 금액·가맹점·번호를 복사하지 않는다.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// 저장소 절대경로를 박지 않는다. 이 생성기는 CI 에서도 돌아야 한다.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");

const CARD = "9420-00**-****-0001";
const HOLDER = "홍*길";
const PERIOD = "2025-11-01 ~ 2026-01-31";
const ISSUED = "2026.02.10";

// 상품, 매출, 성명, 카드구분, 카드번호, 이용일, 이용금액, 부가세, 가맹점명, 승인번호, 사업자번호, 업종
const ROWS = [
  // 매달 반복되는 관리비형 지출. 부가세 0. 가맹점 규칙 시험용.
  { date: "2025-11-05", gross: 315000, vat: 0, shop: "공동주택관리비_11월", appr: "20000011", biz: "9999999901", cat: "온라인거래일반인증외" },
  { date: "2025-12-05", gross: 315000, vat: 0, shop: "공동주택관리비_12월", appr: "20000012", biz: "9999999901", cat: "온라인거래일반인증외" },
  { date: "2026-01-05", gross: 320000, vat: 0, shop: "공동주택관리비_01월", appr: "20000013", biz: "9999999901", cat: "온라인거래일반인증외" },
  // 부가세 있는 일반 merchants
  { date: "2025-11-08", gross: 36000, vat: 3273, shop: "합성한식당", appr: "20000014", biz: "9999999902", cat: "한식" },
  { date: "2025-11-19", gross: 15300, vat: 1391, shop: "합성쇼핑몰", appr: "20000015", biz: "9999999903", cat: "PG_일반인증" },
  { date: "2025-12-03", gross: 8680, vat: 789, shop: "합성쇼핑몰", appr: "20000016", biz: "9999999903", cat: "PG_일반인증" },
  { date: "2025-12-18", gross: 33000, vat: 3000, shop: "합성문구점", appr: "20000017", biz: "9999999904", cat: "인터넷쇼핑몰일반인증" },
  { date: "2026-01-09", gross: 44000, vat: 4000, shop: "합성문구점", appr: "20000018", biz: "9999999904", cat: "인터넷쇼핑몰일반인증" },
  { date: "2026-01-14", gross: 7900, vat: 718, shop: "합성쇼핑몰", appr: "20000019", biz: "9999999903", cat: "PG_일반인증" },
  // 취소/재승인 쌍 1: 같은 승인번호, 같은 날짜, 부호만 반대
  { date: "2025-11-22", gross: -88000, vat: -8000, shop: "합성쇼핑몰", appr: "20000020", biz: "9999999903", cat: "PG_일반인증" },
  { date: "2025-11-22", gross: 88000, vat: 8000, shop: "합성쇼핑몰", appr: "20000020", biz: "9999999903", cat: "PG_일반인증" },
  // 취소/재승인 쌍 2
  { date: "2025-12-26", gross: -29800, vat: -2709, shop: "합성쇼핑몰", appr: "20000021", biz: "9999999903", cat: "PG_일반인증" },
  { date: "2025-12-26", gross: 29800, vat: 2709, shop: "합성쇼핑몰", appr: "20000021", biz: "9999999903", cat: "PG_일반인증" },
  // 나머지: 부가세 0 인 온라인 지출
  { date: "2025-11-11", gross: 47210, vat: 0, shop: "합성쇼핑몰", appr: "20000022", biz: "9999999905", cat: "PG_일반인증" },
  { date: "2025-11-25", gross: 306630, vat: 0, shop: "합성공용시설", appr: "20000023", biz: "9999999906", cat: "온라인거래일반인증외" },
  { date: "2025-12-09", gross: 131620, vat: 0, shop: "합성마켓", appr: "20000024", biz: "9999999907", cat: "인터넷쇼핑몰일반인증" },
  { date: "2025-12-29", gross: 412720, vat: 0, shop: "합성공용시설", appr: "20000025", biz: "9999999906", cat: "온라인거래일반인증외" },
  { date: "2026-01-21", gross: 102400, vat: 0, shop: "합성마켓", appr: "20000026", biz: "9999999907", cat: "인터넷쇼핑몰일반인증" },
];

// 부가세 검산: 카드사는 supplyExVat = gross - vat 로 공급가액을 정하고
// vat 를 거기에 붙인다. 그러므로 역산한 공급가액에 10% 를 곱한 값이 카드사가
// 적은 세액과 1원 이내로 일치해야 한다. (1원 단위 반올림이다. 처음에 10원 단위
// 반올림이라고 가정했다가 이 검사가 잡아냈다.)
//
//   36,000 / 3,273 -> 공급가액 32,727 -> 3,272.7 -> 반올림 3,273  OK
//   15,300 / 1,391 -> 공급가액 13,909 -> 1,390.9 -> 반올림 1,391  OK
//   33,000 / 3,000 -> 공급가액 30,000 -> 3,000.0 -> 반올림 3,000  OK
//
// 이 조건이 깨지면 supplyExVat = gross - vat 규칙과 모순되므로 픽스처를
// 만들 때부터 틀린 데이터가 못 들어오게 한다.
function checkVat(row) {
  if (row.vat === 0) return null;
  const supply = row.gross - row.vat;
  const expect = supply * 0.1;
  if (Math.abs(expect - row.vat) >= 1) {
    return row.shop + " " + row.date + " 부가세 검산 실패: 공급가액 " + supply +
      " 의 10% 는 " + expect + " 인데 적힌 세액은 " + row.vat;
  }
  return null;
}
for (const r of ROWS) {
  const err = checkVat(r);
  if (err) throw new Error(err);
}

const sumGross = ROWS.reduce((a, r) => a + r.gross, 0);
const sumVat = ROWS.reduce((a, r) => a + r.vat, 0);
const fmt = (n) => n.toLocaleString("en-US"); // 1234567 -> 1,234,567

const HEADERS = ["상품", "매출", "성명", "카드구분", "카드번호", "이용일",
  "이용금액(원)", "부가세(원)", "가맹점명", "승인번호", "사업자번호", "업종"];

const cells = (arr) => arr.map((v) => {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}).join(",");

const pad12 = (arr) => { const c = arr.slice(); while (c.length < 12) c.push(""); return c; };

const lines = [];
lines.push(cells(pad12(["개인사업자용 카드이용내역서"])));                    // 1
lines.push(cells(pad12(["발행정보"])));                                        // 2
lines.push(cells(pad12([])));                                                  // 3
lines.push(cells(pad12(["", "발행일", "2026.02.10", "", "발행시간", "오후 03:05", "", "담당자", "WEB"]))); // 4
lines.push(cells(pad12(["합성 데이터입니다. 실제 거래가 아닙니다."])));           // 5
lines.push(cells(pad12([])));                                                  // 6
lines.push(cells(pad12(["회원정보"])));                                        // 7
lines.push(cells(pad12([])));                                                  // 8
lines.push(cells(pad12(["", "성명", HOLDER, "", "주민등록번호", "000000-0******"]))); // 9
lines.push(cells(pad12(["회원님의 신용정보 보호를 위해 일부 정보를 *로 표시했습니다."]))); // 10
lines.push(cells(pad12([])));                                                  // 11
lines.push(cells(pad12(["이용금액 합계"])));                                    // 12
lines.push(cells(pad12(["", "", "", "", "", "", "", "(원)"])));                  // 13
lines.push(cells(pad12(["이용기간", "총 합계", "부가세 합계", "일시불", "할부", "단기카드대출(현금서비스)", "장기카드대출(카드론)"]))); // 14
lines.push(cells(pad12([PERIOD, fmt(sumGross), fmt(sumVat), fmt(sumGross), "0", "0", "0"]))); // 15
lines.push(cells(pad12([])));                                                  // 16
lines.push(cells(pad12(["세부 이용내역"])));                                    // 17
lines.push(cells(pad12([])));                                                  // 18
lines.push(cells(HEADERS));                                                    // 19
for (const r of ROWS) {
  lines.push(cells(["신용", "일시불", HOLDER, "본인", CARD, r.date,
    fmt(r.gross), fmt(r.vat), r.shop, r.appr, r.biz, r.cat]));
}
while (lines.length < 41) lines.push(cells(pad12([]))); // 38~41 빈 행

// LF, like the hyundai fixture and like card-import.js. Emitting CRLF here
// meant the committed fixture and the generator disagreed, and the byte
// comparison only passed because core.autocrlf rewrote the checkout to
// CRLF too. The bundle is built from this text, so CRLF would also end up
// embedded inside a JavaScript string literal.
const out = "\ufeff" + lines.join("\n") + "\n";
const DEST = resolve(ROOT, "samples", "card", "anonymized", "samsungcard-personal-anon.csv");
writeFileSync(DEST, out, "utf8");

console.log("합성 픽스처 생성: " + DEST);
console.log("  총 " + lines.length + "행 x " + HEADERS.length + "열");
console.log("  거래 " + ROWS.length + "건  이용금액합 " + fmt(sumGross) + "  부가세합 " + fmt(sumVat));
console.log("  취소행 " + ROWS.filter((r) => r.gross < 0).length + "건 (동일 승인번호 ±쌍 2쌍)");
console.log("  부가세 0 인 행 " + ROWS.filter((r) => r.vat === 0).length + "건");
