#!/usr/bin/env node
// 카드사 엑셀 샘플을 조사한다.
//
// 이 스크립트는 파서가 아니다. "실제 파일이 어떤 모양인지"를 확인해
// card-columns.json 의 카드사 프로파일을 근거 있게 채우기 위한 도구다.
//
// 외부 의존성이 없다. pom.xml/package.json 이 없는 이 저장소 상태에서
// xlsx 를 읽으려면 zlib 내장 기능만으로 zip 을 풀어야 한다.
//
// 사용법:
//   node samples/card/tools/inspect-xlsx.mjs <파일...>
//   node samples/card/tools/inspect-xlsx.mjs --header <파일...>

import { readFileSync, existsSync, statSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const CONTRACT = fileURLToPath(new URL("../card-columns.json", import.meta.url));
const contract = JSON.parse(readFileSync(CONTRACT, "utf8"));

/* ---------- zip 읽기 (의존성 없음) ---------- */

function zipEntries(b) {
  // EOCD 는 뒤에 주석(up to 64KB)이 붙을 수 있으므로 뒤에서부터 찾는다
  let eocd = -1;
  for (let i = b.length - 22; i >= 0 && i >= b.length - 22 - 65536; i--) {
    if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("zip 이 아니다 (EOCD 없음)");

  const count = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  const out = [];

  for (let i = 0; i < count; i++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error("중앙 디렉터리 손상 @" + p);
    const method = b.readUInt16LE(p + 10);
    const compSize = b.readUInt32LE(p + 20);
    const nameLen = b.readUInt16LE(p + 28);
    const extraLen = b.readUInt16LE(p + 30);
    const cmtLen = b.readUInt16LE(p + 32);
    const lho = b.readUInt32LE(p + 42);
    out.push({ name: b.toString("utf8", p + 46, p + 46 + nameLen), method, compSize, lho });
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

function readPart(b, e) {
  if (b.readUInt32LE(e.lho) !== 0x04034b50) throw new Error("로컬 헤더 손상: " + e.name);
  const nameLen = b.readUInt16LE(e.lho + 26);
  const extraLen = b.readUInt16LE(e.lho + 28);
  const start = e.lho + 30 + nameLen + extraLen;
  const raw = b.subarray(start, start + e.compSize);
  // method 8 = deflate, 0 = 저장
  if (e.method === 0) return raw;
  if (e.method === 8) return inflateRawSync(raw);
  throw new Error("지원하지 않는 압축 방식(method=" + e.method + "): " + e.name);
}

/* ---------- xlsx 표 읽기 ---------- */

const decodeEntities = (s) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&amp;/g, "&");

function sharedStrings(b, parts) {
  const e = parts.find((p) => p.name === "xl/sharedStrings.xml");
  if (!e) return [];
  const xml = readPart(b, e).toString("utf8");
  const out = [];
  // <si> 안의 <t> 를 모두 합친다. <r><t>(run) 형태도 있어서 이어 붙여야 한다
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let text = "";
    for (const t of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += t[1];
    out.push(decodeEntities(text));
  }
  return out;
}

function sheetNames(b, parts) {
  const e = parts.find((p) => p.name === "xl/workbook.xml");
  if (!e) return [];
  const xml = readPart(b, e).toString("utf8");
  return [...xml.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*\/?>/g)].map((m) => decodeEntities(m[1]));
}

function colIndex(ref) {
  // A1 -> 0, AA1 -> 26
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readSheet(b, part, sst) {
  const xml = readPart(b, part).toString("utf8");
  const rows = [];
  let dangling = 0; // sharedStrings 범위를 벗어난 참조. 조용히 null 이 되면 안 된다
  for (const rm of xml.matchAll(/<row([^>]*)>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[2].matchAll(/<c([^>]*)\/?>(?:([\s\S]*?)<\/c>)?/g)) {
      const attrs = cm[1];
      const inner = cm[2] || "";
      const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
      const type = (attrs.match(/t="([^"]*)"/) || [])[1];
      let value = null;
      if (type === "s") {
        const idx = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (idx === undefined) value = null;
        else if (+idx >= sst.length) { dangling++; value = null; }
        else value = sst[+idx];
      } else if (type === "inlineStr") {
        let t = "";
        for (const x of inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) t += x[1];
        value = decodeEntities(t);
      } else {
        const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        value = v === undefined ? null : v;
      }
      row[ref ? colIndex(ref) : row.length] = value;
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
    rows.push(row);
  }
  return { rows, dangling };
}

/* ---------- contract 대조 ---------- */

const allFields = { ...contract.fields, ...contract.optionalFields };

function matchField(header) {
  if (header == null) return null;
  const h = String(header).replace(/\s+/g, "").trim();
  for (const [key, spec] of Object.entries(allFields)) {
    for (const alias of spec.headerAliases || []) {
      if (alias.replace(/\s+/g, "") === h) return { key, alias, exact: true };
    }
  }
  for (const [key, spec] of Object.entries(allFields)) {
    for (const alias of spec.headerAliases || []) {
      if (h.includes(alias.replace(/\s+/g, ""))) return { key, alias, exact: false };
    }
  }
  return null;
}

function looksLikeTotalRow(cells) {
  const joined = cells.filter(Boolean).join(" ");
  return (contract.rowRoles.grandTotal || []).some((t) => joined.includes(t));
}

function inspect(path) {
  const ext = extname(path).toLowerCase();
  const info = { file: basename(path), size: statSync(path).size };

  if (ext === ".csv") {
    info.kind = "csv";
    const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    info.header = lines[0] ? lines[0].split(",") : [];
    info.rowCount = Math.max(0, lines.length - 1);
    return info;
  }
  if (ext !== ".xlsx") {
    if (ext === ".xls") info.unsupported = "구형 .xls 는 이 도구가 읽지 못한다. xlsx 로 다시 저장하거나 POI 를 쓴다.";
    else info.unsupported = "지원 확장자가 아니다: " + ext;
    return info;
  }

  const b = readFileSync(path);
  const parts = zipEntries(b);
  info.kind = "xlsx";
  info.sheets = sheetNames(b, parts);
  const sst = sharedStrings(b, parts);

  const sheetParts = parts
    .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p.name))
    .sort((a, c) => (a.name.match(/\d+/) || [0])[0] - (c.name.match(/\d+/) || [0])[0]);

  info.sheetDetail = sheetParts.map((sp, i) => {
    const { rows, dangling } = readSheet(b, sp, sst);
    // 헤더 후보: 필수 필드 3개 이상 매칭되는 행
    let headerIdx = -1, headerCells = [], matches = [];
    rows.slice(0, 30).forEach((cells, ri) => {
      const m = cells.map(matchField).filter(Boolean);
      if (m.length >= 3 && m.length > matches.length) {
        headerIdx = ri; headerCells = cells; matches = m;
      }
    });
    const dataRows = rows.slice(headerIdx + 1).filter((r) => r.some((c) => c != null && String(c).trim() !== ""));
    const totalish = dataRows.filter(looksLikeTotalRow);
    return {
      sheet: info.sheets[i] || sp.name,
      totalRows: rows.length,
      headerRowNumber: headerIdx >= 0 ? headerIdx + 1 : null,
      header: headerCells,
      matched: [...new Set(matches.map((m) => m.key))],
      approximateOnly: matches.some((m) => !m.exact) || false,
      dataRowCount: dataRows.length,
      danglingRefs: dangling,
      totalLikeRowCount: totalish.length,
      totalLikeSamples: totalish.slice(0, 3).map((r) => r.filter(Boolean).join(" | ")),
    };
  });
  return info;
}

/* ---------- 출력 ---------- */

const argv = process.argv.slice(2);
const headerOnly = argv.includes("--header");
const files = argv.filter((a) => !a.startsWith("--"));

if (!files.length) {
  console.error("사용법: node samples/card/tools/inspect-xlsx.mjs [--header] <파일...>");
  process.exit(2);
}

let problems = 0;
for (const f of files) {
  if (!existsSync(f)) { console.log("\n=== " + f + " ===\n  파일 없음"); problems++; continue; }

  // 파일 하나가 깨졌다고 전체를 중단하지 않는다. 스택 트레이스도 dumping 하지 않는다
  let info;
  try { info = inspect(f); }
  catch (err) {
    console.log("\n=== " + basename(f) + " ===");
    console.log("  읽을 수 없다: " + err.message);
    console.log("  파일이 xlsx 형식이거나 손상되지 않았는지 확인한다");
    problems++;
    continue;
  }

  console.log("\n=== " + info.file + " ===");
  console.log("  형식 " + info.kind + " / " + info.size.toLocaleString() + "B");
  if (info.unsupported) { console.log("  주의: " + info.unsupported); problems++; }
  if (info.kind === "csv") {
    console.log("  헤더 " + JSON.stringify(info.header));
    console.log("  데이터 " + info.rowCount + "행");
  }
  for (const s of info.sheetDetail || []) {
    console.log("\n  [시트] " + s.sheet);
    console.log("    전체 " + s.totalRows + "행 / 헤더 " + s.headerRowNumber + "행 / 데이터 " + s.dataRowCount + "행");
    if (!headerOnly) console.log("    헤더 " + JSON.stringify(s.header));
    console.log("    매칭 필드 " + (s.matched.length ? s.matched.join(", ") : "없음"));
    if (s.approximateOnly) console.log("    (단순 포함 매칭이 있음. 정확히 일치하는지 확인 필요)");
    if (s.totalLikeRowCount) {
      console.log("    합계성 행 " + s.totalLikeRowCount + "개 (파서에서 제외해야 함)");
      if (!headerOnly) s.totalLikeSamples.forEach((x) => console.log("      " + x));
    }
    if (s.danglingRefs) {
      // 문자열 참조가 깨졌으면 헤더를 못 찾는다. 조용히 넘어가면 원인 파악이 안 된다
      console.log("    깨진 문자열 참조 " + s.danglingRefs + "건 (sharedStrings 불일치)");
      problems++;
    }
    const missing = Object.entries(contract.fields)
      .filter(([, spec]) => spec.required)
      .map(([k]) => k)
      .filter((k) => !s.matched.includes(k));
    if (missing.length) {
      console.log("    필수 필드 누락 " + missing.join(", "));
      problems++;
    } else {
      console.log("    필수 필드 충족");
    }
  }
  if (info.kind === "csv") {
    const matched = info.header.map(matchField).filter(Boolean).map((m) => m.key);
    const missing = Object.keys(contract.fields).filter((k) => !matched.includes(k));
    console.log("  매칭 필드 " + (matched.length ? matched.join(", ") : "없음"));
    if (missing.length) { console.log("  필수 필드 누락 " + missing.join(", ")); problems++; }
  }
}

console.log("\n" + (problems
  ? "확인이 필요한 항목 " + problems + "건. 아래는 사람이 판단해야 한다:"
  : "모든 파일이 필수 필드를 충족한다. 카드사 프로파일을 채울 수 있다."));
console.log("- 헤더 이름이 규격과 다르면 card-columns.json 의 headerAliases 에 추가한다.");
console.log("- 매칭이 안 되는 열이 있으면 실제 헤더 문자열을 그대로 적어 카드사 프로파일을 만든다.");
console.log("- 합계성 행 패턴이 다르면 rowRoles.grandTotal 에 추가한다.");
process.exit(problems ? 1 : 0);
