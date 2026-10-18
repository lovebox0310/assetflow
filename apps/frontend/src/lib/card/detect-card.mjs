// 카드 명세서 컨테이너 판별 + 카드사 판별.
// §29.5.1: 확장자를 믿지 않는다 — 형식은 매직 바이트로 판별한다.
// §29.7: 카드사 판별은 계약(card-columns.json)의 headerSignature 가 한다 —
// 공통 컬럼은 판별 근거가 못 되고, 한쪽에만 있는 컬럼만 센다.

import { normHeader } from "./card-common.mjs";

/** 컨테이너 형식을 매직 바이트로 판별한다. */
export function inspectContainer(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u.length >= 2 && u[0] === 0x50 && u[1] === 0x4b) return "zip"; // xlsx (평문)
  if (u.length >= 4 && u[0] === 0xd0 && u[1] === 0xcf && u[2] === 0x11 && u[3] === 0xe0) {
    return "cfb"; // OLE2 — ECMA-376 암호화 패키지일 수 있다 (§29.5.1)
  }
  if (u.length >= 3 && u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf) return "csv";
  // BOM 없는 텍스트(ASCII) CSV — 첫 바이트가 출력 가능 문자면 CSV 로 본다
  if (u.length > 0 && u[0] >= 0x20 && u[0] < 0x7f) return "csv";
  return "unknown";
}

/**
 * 카드사 판별: 계약의 headerSignature 를 파일 앞쪽 셀에서 센다.
 * minScore 미만이면 null — 우연히 한 컬럼이 겹친 파일을 특정 카드사로 둔갑시키지 않는다.
 */
export function detectCardCompany(text, contract) {
  if (!contract || !contract.companies) return null;
  const rows = parseRowsForDetect(text);
  const cells = new Set();
  for (const row of rows) {
    for (const cell of row) cells.add(normHeader(cell));
  }
  for (const [company, profile] of Object.entries(contract.companies)) {
    if (!profile || !profile.detect) continue;
    const { headerSignature, minScore } = profile.detect;
    const score = (headerSignature || []).filter((h) => cells.has(normHeader(h))).length;
    if (score >= (minScore ?? 3)) return company;
  }
  return null;
}

/** 판별용 가벼운 행 분해 — 전체 RFC4180 파서는 쓰지 않는다(쉼표/개행만). */
function parseRowsForDetect(text) {
  const t = String(text).replace(/^\uFEFF/, "");
  return t.split(/\r?\n/).slice(0, 60).map((line) => line.split(","));
}

/** 회사명 → 파서 모듈. 규격이 단일 출처이고 이 맵은 프로파일 존재만 확인한다. */
export function parserFor(company) {
  if (company === "samsungcard") return "parse-samsung.mjs";
  if (company === "hyundaicard") return "parse-hyundai.mjs";
  return null;
}
