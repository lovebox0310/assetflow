// 카드명세 합성 xlsx 픽스처 생성기.
//
// 왜 이게 필요한가:
// samples/card/anonymized/synthetic-sample.xlsx 가 저장소에 커밋돼 있었지만
// 만든 스크립트가 temp 에만 있었다. 즉 바이너리 픽스처만 있고 재현 수단이
// 없었고, '필수 필드 누락' 을 시험할 두 번째 파일은 temp 스크래치에 의존했다.
// temp 를 정리하니 그 테스트가 깨졌다. 생성기를 커밋해서 이循环을 끊는다.
//
// 외부 의존성 없다. zlib deflateRaw + 손으로 쓴 ZIP + 인라인 문자열.
// inspect.mjs 가 inlineStr 을 읽는다.
//
//   node samples/card/tools/build-synthetic-xlsx.mjs
//
// 데이터는 모두 지어낸 것이다. 실제 파일의 가맹점·금액·번호를 복사하지 않는다.

import { writeFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// 저장소 절대경로를 박지 않는다. 이 생성기는 CI 에서도 돌아야 한다.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");

/* ---------- CRC32 (ZIP 무결성용) ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------- 최소 ZIP 작성기 ---------- */
function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const [name, text] of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const raw = Buffer.from(text, "utf8");
    const comp = deflateRawSync(raw, { level: 9 });
    // 압축이 안 줄어들면 저장 방식(method 0)으로 쓴다. inspect.mjs 가 둘 다 읽는다.
    const useDeflate = comp.length < raw.length;
    const data = useDeflate ? comp : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);            // version needed
    lh.writeUInt16LE(0x0800, 6);        // flag: UTF-8 이름
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, data);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

/* ---------- 최소 xlsx ---------- */
const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const colName = (i) => {
  let s = "";
  i += 1;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
};

function sheetXml(rows) {
  const body = rows.map((cells, r) => {
    const cs = cells.map((v, c) => {
      if (v === null || v === undefined || v === "") return "";
      const ref = colName(c) + (r + 1);
      // 숫자는 그대로, 문자는 인라인 문자열로
      if (typeof v === "number" || /^-?\d+(\.\d+)?$/.test(String(v))) {
        return `<c r="${ref}"><v>${v}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join("");
    return `<row r="${r + 1}">${cs}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function buildXlsx(rows, sheetName) {
  return zip([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", sheetXml(rows)],
  ]);
}

/* ---------- 픽스처 1: 필수 필드齐全 ---------- */
// 헤더 5행, 데이터 5행, 합계성 2행 → 총 12행.
// 공급가액 + 세액 = 공급대가 를 모든 행이 지킨다. 과세행 세액은 공급가액의 10%.
const FULL_HEADER = ["승인일자", "가맹점명", "공급가액", "세액", "공급대가", "할부", "승인번호", "과세구분"];
const FULL_DATA = [
  ["2026-01-05", "합성가맹점A", 1000000, 100000, 1100000, 0, "10000001", "과세"],
  ["2026-01-08", "합성가맹점B", 500000, 50000, 550000, 3, "10000002", "과세"],
  ["2026-01-12", "합성가맹점C", 1000000, 100000, 1100000, 6, "10000003", "과세"],
  ["2026-01-15", "합성가맹점D", 200000, 0, 200000, 0, "10000004", "면세"],
  ["2026-01-18", "합성가맹점E", 320000, 0, 320000, 0, "10000005", "영세"],
];
const SUB = ["소계", 1500000, 150000, 1650000];
const GRAND = ["총 합계", 3020000, 250000, 3270000, "3건"];

function checkInvariants(rows, label) {
  for (const r of rows) {
    if (typeof r[2] === "number" && typeof r[3] === "number" && typeof r[4] === "number") {
      if (r[2] + r[3] !== r[4]) throw new Error(label + ": '" + r[1] + "' 공급가액+세액=" + (r[2] + r[3]) + " ≠ 공급대가=" + r[4]);
    }
  }
  const g = rows.reduce((a, r) => a + (typeof r[2] === "number" ? r[2] : 0), 0);
  const v = rows.reduce((a, r) => a + (typeof r[3] === "number" ? r[3] : 0), 0);
  if (g + v !== GRAND[3]) throw new Error(label + ": 행 합계 공급가액 " + g + " + 세액 " + v + " = " + (g + v) + " ≠ 총합계 공급대가 " + GRAND[3]);
  if (g !== GRAND[1]) throw new Error(label + ": 행 공급가액 합 " + g + " ≠ 총합계 " + GRAND[1]);
  if (v !== GRAND[2]) throw new Error(label + ": 행 세액 합 " + v + " ≠ 총합계 " + GRAND[2]);
}
checkInvariants(FULL_DATA, "synthetic-sample");

const full = [
  ["합성 데이터입니다. 실제 거래가 아닙니다."],
  ["카드사명", "합성카드"],
  ["회원", "홍*길"],
  ["조회기간", "2026-01-01 ~ 2026-01-31"],
  FULL_HEADER,
  ...FULL_DATA,
  SUB,
  GRAND,
];

/* ---------- 픽스처 2: 세액 컬럼이 없음 (미지원 판정용) ---------- */
// 공급가액과 세액이 둘 다 없으니 공급가액을 역산할 수 없다.
// 계약상 이런 파일은 미지원으로 명시해야 한다(총액만 있고 분해가 안 된다).
const NOVAT_HEADER = ["매출일자", "가맹점명", "공급대가", "할부", "승인번호"];
const NOVAT_DATA = [
  ["2026-01-05", "합성가맹점A", 1100000, 0, "10000001"],
  ["2026-01-08", "합성가맹점B", 550000, 3, "10000002"],
  ["2026-01-12", "합성가맹점C", 1100000, 6, "10000003"],
];
const novat = [
  ["세액 컬럼이 없는 합성 샘플입니다. 미지원 판정용."],
  ["카드사명", "합성카드"],
  ["조회기간", "2026-01-01 ~ 2026-01-31"],
  NOVAT_HEADER,
  ...NOVAT_DATA,
];

const OUT = resolve(ROOT, "samples", "card", "anonymized");
const a = buildXlsx(full, "거래내역");
writeFileSync(resolve(OUT, "synthetic-sample.xlsx"), a);
const b = buildXlsx(novat, "거래내역");
writeFileSync(resolve(OUT, "synthetic-novat.xlsx"), b);

console.log("생성 완료");
console.log("  synthetic-sample.xlsx   " + a.length + "B  " + full.length + "행 x " + FULL_HEADER.length + "열 (헤더 5행, 합계성 2행)");
console.log("  synthetic-novat.xlsx    " + b.length + "B  " + novat.length + "행 x " + NOVAT_HEADER.length + "열 (세액 컬럼 없음)");
console.log("  공급가액합 " + GRAND[1] + " / 세액합 " + GRAND[2] + " / 공급대가합 " + GRAND[3] + " (검산 통과)");
