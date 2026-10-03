/* 자동 생성 파일 — 손으로 고치지 않는다.
 * 원본: apps/frontend/src/lib/card/{card-common,parse-samsung,parse-hyundai}.mjs
 *       samples/card/card-columns.json
 * 다시 만들기: node samples/card/tools/build-card-import-bundle.mjs
 * 재현성 검사: samples/card/tools/test-card-ui.mjs (바이트 단위 비교)
 *
 * 이 번들은 파서와 판별기만 담는다. 암호화 파일을 여는 코드는 없다(정책).
 * 테스트 프레임워크나 localStorage 도 없다 — 그 역할은 화면 스크립트가 한다.
 */
(function (global) {
  "use strict";
  var common = (function () {
// 카드 명세 파서 공용 원시 함수.
//
// 파서는 카드사별로 두 벌이지만("파서는 두 벌, 규격은 하나") CSV 파싱·헤더
// 매칭·금액 파싱 규칙은 한 벌이어야 한다. 규격(card-columns.json)이 단일 출처고,
// 이 모듈은 규격을 주입받아 쓰는 기계 부품만 둔다. 회사별 행 의미 — 합계행 위치
// (삼성은 헤더 앞, 현대는 뒤), 취소 판별(현대는 상태 컬럼), 날짜 형식(현대는
// 점 구분), 카드번호 마스킹(현대는 전체 번호) — 는 각 파서가 책임진다.

/** 셀 값에서 헤더 비교용 정규화. 공백 제거 + 괄호 내용 제거 + 소문자. */
function normHeader(h) {
  return String(h == null ? "" : h)
    .replace(/\s+/g, "")
    .replace(/[()]/g, "")
    .toLowerCase();
}

/** '1,234' -> 1234. 파싱 불가면 null. */
function parseAmount(s) {
  const t = String(s == null ? "" : s).replace(/[,\s원]/g, "").replace(/[()]/g, "");
  if (t === "" || t === "-") return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** RFC4180 CSV 파서. BOM 은 호출자가 제거해 둔다. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuote = false;
      } else field += c;
    } else if (c === '"') inQuote = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* CRLF: \n 이 개행을 처리한다 */ }
    else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * 계약의 fields + optionalFields 를 '정규화된 헤더 -> 필드명' 맵으로 편다.
 * required 인 필드는 없으면 파싱을 멈추게 하므로 여기선 전부 합친다.
 */
function buildAliasMap(contract) {
  const map = new Map();
  const add = (fieldName, def) => {
    for (const a of (def.headerAliases || [])) {
      const k = normHeader(a);
      if (!map.has(k)) map.set(k, fieldName);
    }
  };
  for (const [name, def] of Object.entries(contract.fields || {})) add(name, def);
  for (const [name, def] of Object.entries(contract.optionalFields || {})) add(name, def);
  return map;
}

/**
 * 필드명 -> 열 인덱스.
 * 헤더 탐색은 source === 'column' 인 필드만 요구한다.
 *   - expenseKind 는 required 인데 파일에 없는 사용자 입력값이다. 헤더를
 *     찾을 때 이걸 요구하면 어느 카드사든 영영 못 찾는다.
 *   - supplyExVat 는 컬럼이 없을 수 있다(삼성, 현대). 그래서 'columnOrDerived'
 *     이고 여기 요구하지 않는다. 대신 파싱 후에 구할 수 없으면 실패한다.
 */
function mapColumns(headerCells, aliasMap, contract) {
  const col = {};
  const cells = headerCells.map(normHeader);
  cells.forEach((h, i) => {
    const f = aliasMap.get(h);
    // 같은 필드가 두 열에 매핑되면(예: '합계' 가 두 번) 첫 번째만 쓴다.
    if (f && col[f] === undefined) col[f] = i;
  });
  const missing = [];
  for (const [name, def] of Object.entries(contract.fields || {})) {
    if (def.required && def.source === "column" && col[name] === undefined) missing.push(name);
  }
  return { col, missing };
}

/** 헤더 후보 행 점수. 필수 필드 매칭 수 + 선택 필드 매칭 수. */
function scoreHeaderRow(cells, aliasMap, contract) {
  const { col, missing } = mapColumns(cells, aliasMap, contract);
  if (missing.length > 0) return { score: -1, col, missing };
  const matched = Object.keys(col).length;
  return { score: matched, col, missing };
}

/**
 * 헤더 행을 점수로 찾는다. 동점이면 먼저 나온 행. 점수 0 은 실패로 본다.
 * 매핑된 컬럼이 하나도 없으면 헤더를 못 찾은 것이지 찾은 게 아니다.
 * 계약에서 source 를 빠뜨린 오류가 조용히 통과하면 안 된다.
 * @returns {{rowIndex:number, col:object, missing:string[]}} 못 찾으면 예외
 */
function findHeaderRow(rows, contract, expectedHint) {
  const aliasMap = buildAliasMap(contract);
  let header = null, best = 0;
  let nearest = null; // '가장 닮았지만 실패한' 행. 에러 메시지에 쓴다.
  for (let i = 0; i < rows.length; i++) {
    const s = scoreHeaderRow(rows[i], aliasMap, contract);
    if (s.score > best) { best = s.score; header = { rowIndex: i, col: s.col, missing: s.missing }; }
    // 실패한 행 중 '매칭 수가 가장 많은' 행을 기억한다.
    // (누락 필드 수가 가장 적은 행을 고르면 0개 매칭인 빈 행이 뽑힌다.
    //  빈 행을 '가장 닮은 행'이라 하는 건 디버깅을 거짓으로 이끈다.)
    if (s.missing.length > 0 && Object.keys(s.col).length > (nearest ? nearest.matched : -1)) {
      nearest = { rowNumber: i + 1, missing: s.missing, matched: Object.keys(s.col).length };
    }
  }
  if (!header || best <= 0) {
    const detail = nearest && nearest.matched > 0
      ? " 가장 닮은 행은 " + nearest.rowNumber + "행(" + nearest.matched + "개 매칭)인데 " +
        nearest.missing.join(", ") + " 이(가) 안 잡혔다."
      : " 매핑에 걸리는 컬럼이 하나도 없다(계약의 headerAliases 가 명세서와 안 맞는다).";
    throw new Error(
      "컬럼 헤더를 찾지 못했다." + detail +
      " 카드사 명세 양식이 바뀐 건지, 암호화 해제가 제대로 됐는지 확인해야 한다. " +
      "(기대 헤더 예: " + expectedHint + ")"
    );
  }
  return header;
}

/**
 * 카드번호를 마스킹한다. 카드사가 이미 마스킹해 준 값(삼성)은 그대로 두고,
 * 전체 번호로 온 값(현대)은 가운데를 가린다. 원본 번호는 어디에도 남기지 않는다.
 */
function maskCardNumber(raw) {
  const v = String(raw == null ? "" : raw).trim();
  if (!v) return null;
  if (v.includes("*")) return v;
  if (/^\d{4}-\d{4}-\d{4}-\d{4}$/.test(v)) return v.slice(0, 4) + "-****-****-" + v.slice(15);
  if (/^\d{15,19}$/.test(v)) return v.slice(0, 4) + "-****-****-" + v.slice(-4);
  // 모르는 형식은 끝 4자리만 남긴다. 원본을 그대로 내보내지 않는다.
  return v.length >= 4 ? "****" + v.slice(-4) : "****";
}

/** 날짜 정규화. YYYY-MM-DD 와 YYYY.MM.DD 를 받아 ISO 로 내보낸다. 나머지는 null.
 * 형식이 맞아 보여도 월·일이 실제 범위를 벗어나면(2025-13-40) null 이다.
 * 그런 행은 데이터로 저장되면 안 되고 파서의 '날짜 못 읽음' 경로로 가야 한다. */
function normalizeIsoDate(raw) {
  const v = String(raw == null ? "" : raw).trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) m = v.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return y + "-" + mo + "-" + d;
}

/* ---------- 파일 형식 판별 (매직 바이트) ---------- */
//
// 확장자를 믿으면 안 된다. 실제 삼성카드 파일은 .xlsx 확장자로 CFB 컨테이너
// (암호화 OOXML)를 준 적이 있다. 이 판별은 Node 도구와 FE 업로드가 둘 다 쓰므로
// 여기 한 벌로 둔다. 입력은 Uint8Array 뿐이다.
//
// 암호화 정책: 암호화 파일은 사용자가 입력한 비밀번호로만 열린다. 이 판별은
// "암호화돼 있는가"만 알려주고 파라미터를 읽거나 열려고 하지 않는다.

const ZIP_MAGIC = ["504b0304", "504b0506", "504b0708"];
const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const hexOf = (u8) => [...u8].map((c) => c.toString(16).padStart(2, "0")).join("");

/**
 * 파일 내용으로 형식을 판별한다.
 * @param {Uint8Array} buf
 * @param {string} ext 확장자(.csv 등). 결과에 extMismatch 를 붙이는 데만 쓴다.
 * @returns {{kind:string, encrypted:boolean, extMismatch:string|null}}
 *   kind: empty | zip-xlsx | cfb | csv-utf8bom | csv-utf16le | csv-utf16be |
 *         csv-text | unknown
 *
 * CFB(OLE2) 컨테이너는 여기서 "cfb" 로만 분류한다. 그 안에 암호화 문서
 * (EncryptedPackage)가 있는지는 컨테이너를 열어야 알 수 있는데, 그 리더는
 * samples/card/lib/cfb.mjs 의 것으로 apps/frontend 는 매이지 않는다.
 * FE 업로드 화면에는 "cfb" 만으로 충분하다 — 어차피 암호화든 구형 .xls 든
 * 이 화면은 읽지 못하고 CSV 로 안내한다. 정밀 판별은 tools/lib/detect.mjs 가
 * openCfb 로 한다.
 */
function detectFileKind(buf, ext) {
  if (!buf || buf.length === 0) return { kind: "empty", encrypted: false, extMismatch: null };

  const hex = hexOf(buf.subarray(0, 4));
  const normExt = String(ext || "").toLowerCase();

  if (ZIP_MAGIC.includes(hex)) {
    return {
      kind: "zip-xlsx", encrypted: false,
      extMismatch: normExt && normExt !== ".xlsx" && normExt !== ".xlsm" ? "zip 내용이 " + normExt + " 확장자로 왔다" : null,
    };
  }

  if (buf.length >= 8 && CFB_MAGIC.every((c, i) => buf[i] === c)) {
    return {
      kind: "cfb", encrypted: false,
      extMismatch: normExt === ".xlsx" ? ".xlsx 로 확장돼 있으나 실제로는 CFB 컨테이너다" : null,
    };
  }

  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { kind: "csv-utf8bom", encrypted: false, extMismatch: null };
  if (buf[0] === 0xff && buf[1] === 0xfe) return { kind: "csv-utf16le", encrypted: false, extMismatch: null };
  if (buf[0] === 0xfe && buf[1] === 0xff) return { kind: "csv-utf16be", encrypted: false, extMismatch: null };

  // 텍스트 계열로 보이면 평문 CSV 로 본다.
  const n = Math.min(1024, buf.length);
  let textual = true;
  for (let i = 0; i < n; i++) {
    const c = buf[i];
    if (c === 9 || c === 10 || c === 13 || c >= 0x80) continue;
    if (c < 32 || c === 0x7f) { textual = false; break; }
  }
  if (textual) return { kind: "csv-text", encrypted: false, extMismatch: null };

  return { kind: "unknown", encrypted: false, extMismatch: null };
}

/**
 * CSV 행들에서 어떤 카드사 명세인지 판별한다.
 * 카드사별 시그니처는 계약(card-columns.json)의 companies.*.detect 에 있다.
 * 헤더 행 위치가 카드사마다 다르므로(삼성 19행, 현대 8행) 앞쪽 60행을 훑어
 * 가장 점수가 높은 (행, 카드사)를 고른다.
 * @returns {{company:string|null, headerRowNumber:number|null, scores:Array}}
 */
function detectCompanyFromRows(rows, contract) {
  const profiles = [];
  for (const [name, profile] of Object.entries((contract && contract.companies) || {})) {
    if (!profile || typeof profile !== "object" || !profile.detect) continue;
    const sig = (profile.detect.headerSignature || []).map(normHeader);
    if (!sig.length) continue;
    profiles.push({ name, sig, min: profile.detect.minScore || 3 });
  }
  if (!profiles.length) return { company: null, headerRowNumber: null, scores: [] };

  let best = null;
  const scores = profiles.map((p) => ({ company: p.name, score: 0, min: p.min }));
  const limit = Math.min(rows.length, 60);
  for (let i = 0; i < limit; i++) {
    const cells = new Set(rows[i].map(normHeader));
    profiles.forEach((p, pi) => {
      const score = p.sig.filter((s) => cells.has(s)).length;
      if (score > scores[pi].score) scores[pi].score = score;
      // min 미만이면 그 카드사로 보지 않는다. 우연히 한 컬럼만 겹치는 파일을
      // 삼성/현대로 둔갑시키면 파서가 엉뚱한 열을 읽는다.
      if (score >= p.min && (!best || score > best.score)) {
        best = { company: p.name, score, headerRowNumber: i + 1 };
      }
    });
  }
  return {
    company: best ? best.company : null,
    headerRowNumber: best ? best.headerRowNumber : null,
    scores,
  };
}

    return { parseCsv: parseCsv, parseAmount: parseAmount, normHeader: normHeader, normalizeIsoDate: normalizeIsoDate, maskCardNumber: maskCardNumber, detectFileKind: detectFileKind, detectCompanyFromRows: detectCompanyFromRows, findHeaderRow: findHeaderRow };
  })();
  // ---- parse-samsung.mjs (독립 스코프. 모듈 간 이름 충돌을 허용하지 않는다) ----
  var samsungModule = (function (common) {
    var parseCsv = common.parseCsv;
    var parseAmount = common.parseAmount;
    var normHeader = common.normHeader;
    var normalizeIsoDate = common.normalizeIsoDate;
    var maskCardNumber = common.maskCardNumber;
    var detectFileKind = common.detectFileKind;
    var detectCompanyFromRows = common.detectCompanyFromRows;
    var findHeaderRow = common.findHeaderRow;
// 삼성카드 개인사업자용 명세서 CSV 파서.
//
// 설계 원칙:
//   1. 규격은 card-columns.json 이 단일 출처다. 이 모듈은 헤더 이름을 직접 알지
//      못하고 주입받은 계약의 headerAliases 로 매핑한다. 계약과 어긋나게 하드코딩
//      한 별칭이 있으면 어느 쪽이 진짜인지 알 수 없어진다.
//   2. 헤더 행 위치를 고정으로 박지 않는다. 실제 파일은 19행째지만 다른 발급
//      연도·다른 명세 종류는 위치가 다를 수 있다. 헤더 후보 행을 점수로 골라
//      잡고, 그래도 못 찾으면 에러를 낸다(0건 조용히 반환 금지).
//   3. 표가 아닌 행은 값으로 판별한다. '발행정보' 같은 문자열 목록에 의존하지
//      않고, 금액 컬럼이 숫자로 파싱되고 가맹점명이 비어 있지 않으면 데이터다.
//      합계행은 거래에 더하지 않고 교차검증에만 쓴다.
//   4. 파서가 쓰지 않는 값(성명·주민등록번호·사업자번호)은 읽어도 반환하지 않는다.
//
// 이 모듈은 원본 파일 bytes 와 비밀번호를 다루지 않는다. 암호화된 파일은
// 사용자가 입력한 비밀번호로 열린 평문 바이트가 이 모듈에 넘어온다.
// CSV 파싱·헤더 매칭 원시 함수는 card-common.mjs 의 한 벌을 쓴다.





/**
 * 명세서가 밝힌 총액/부가세총액. 교차검증용.
 *
 * 실제 삼성 명세는 라벨과 값이 서로 다른 행에 있다.
 *   14행: 이용기간 | 총 합계 | 부가세 합계 | 일시불 | ...
 *   15행: 2025-07-01 ~ 2025-12-31 | 2,385,860 | 8,453 | ...
 * 라벨 행에서 숫자를 뽑으면 안 된다(라벨 행에는 숫자가 없다). 라벨 행을 찾고
 * 바로 아래 행의 숫자를 쓴다.
 */
function extractDeclaredTotals(rowsBeforeHeader) {
  const flat = (r) => r.map((c) => String(c).trim()).join("").replace(/\s/g, "");
  for (let i = 0; i < rowsBeforeHeader.length; i++) {
    if (!/총합계/.test(flat(rowsBeforeHeader[i]))) continue;
    // 라벨 바로 아래 행에서 숫자를 뽑는다. 없으면 다음 1행까지 본다.
    for (let j = i + 1; j < Math.min(i + 2, rowsBeforeHeader.length); j++) {
      const nums = rowsBeforeHeader[j].map(parseAmount).filter((n) => n !== null);
      if (nums.length >= 2) return { gross: nums[0], vat: nums[1], labelRow: i + 1, valueRow: j + 1 };
    }
  }
  return null;
}

/**
 * 삼성 개인사업자용 명세서 CSV 를 정규화 행으로 바꾼다.
 * @param {Uint8Array|string} input  UTF-8 바이트(권장) 또는 문자열
 * @param {object} contract        card-columns.json 내용
 * @returns {{rows, header, declaredTotals, crossCheck, warnings}}
 */
function parseSamsungCardStatement(input, contract) {
  if (!contract) throw new Error("card-columns.json 규격이 없다. 추측으로 파싱하지 않는다.");

  let text;
  if (typeof input === "string") text = input;
  else {
    const u = input instanceof Uint8Array ? input : new Uint8Array(input);
    const hasBom = u.length >= 3 && u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf;
    text = new TextDecoder("utf-8").decode(hasBom ? u.subarray(3) : u);
  }

  const rows = parseCsv(text);
  const header = findHeaderRow(rows, contract, "이용일 / 이용금액(원) / 부가세(원) / 가맹점명");

  const col = header.col;
  const at = (r, f) => (col[f] === undefined ? "" : (r[col[f]] == null ? "" : String(r[col[f]]).trim()));
  const declaredTotals = extractDeclaredTotals(rows.slice(0, header.rowIndex));

  const out = [];
  const warnings = [];

  for (let i = header.rowIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.every((c) => String(c).trim() === "")) continue;

    const gross = parseAmount(at(r, "grossAmount"));
    const merchant = at(r, "merchantName");
    // 데이터 판별은 라벨 목록이 아니라 값으로 한다.
    if (gross === null || merchant === "") continue;

    const vatRaw = parseAmount(at(r, "vat"));
    const vat = vatRaw === null ? 0 : vatRaw;

    // 공급가액: 컬럼이 있으면 그 값을 쓰고, 없으면 역산한다.
    // 삼성 명세는 컬럼이 없으므로 역산 경로가 실제로 쓰인다.
    const supplyCol = parseAmount(at(r, "supplyExVat"));
    const supplyExVat = supplyCol === null ? gross - vat : supplyCol;
    if (supplyCol !== null && supplyCol + vat !== gross) {
      warnings.push({
        row: i + 1, code: "supplyInconsistent",
        message: "공급가액 " + supplyCol + " + 세액 " + vat + " = " + (supplyCol + vat) +
          " 인데 이용금액은 " + gross + " 다.",
      });
    }

    const approvalNo = at(r, "approvalNo");
    const approvedAt = at(r, "approvedAt");
    const cardMasked = at(r, "cardMasked");

    const row = {
      approvedAt,
      merchantName: merchant,
      grossAmount: gross,
      supplyExVat,
      vat,
      expenseKind: (contract.fields && contract.fields.expenseKind && contract.fields.expenseKind.default) || "unclassified",
      approvalNo: approvalNo || null,
      cardMasked: cardMasked || null,
      businessCategory: at(r, "businessCategory") || null,
      // 별도 취소 컬럼이 없으므로 음수 금액이 취소다.
      reversal: gross < 0 ? "매입취소" : "매입",
      _sourceRow: i + 1,
    };

    // 중복 키: 승인번호 단독으로는 잡히지 않는다(취소/재승인이 같은 번호를 쓴다).
    row.rowKey = [row.approvedAt, row.merchantName, row.grossAmount, row.vat, row.approvalNo || "", row.cardMasked || ""].join("|");

    // 세액 검산: 역산한 공급가액의 10% 가 적힌 세액과 1원 이내로 맞아야 한다.
    if (row.vat !== 0) {
      const expect = row.supplyExVat * 0.1;
      if (Math.abs(expect - row.vat) >= 1) {
        warnings.push({
          row: row._sourceRow,
          code: "vatMismatch",
          message: "공급가액 " + row.supplyExVat + " 의 10% 는 " + expect.toFixed(1) +
            " 인데 세액은 " + row.vat + " 이다. supplyExVat 역산이 맞지 않을 수 있다.",
        });
      }
    }
    // 부호 반대면 금액/세액이 어긋난 것. 취소 행은 둘 다 음수라 통과한다.
    if (row.vat !== 0 && Math.sign(row.vat) !== Math.sign(row.grossAmount)) {
      warnings.push({ row: row._sourceRow, code: "signMismatch", message: "이용금액과 세액의 부호가 반대다." });
    }

    out.push(row);
  }

  // 교차검증: 행 합계가 명세서가 밝힌 합계와 맞아야 한다.
  let crossCheck = null;
  if (declaredTotals) {
    const rowGross = out.reduce((a, r) => a + r.grossAmount, 0);
    const rowVat = out.reduce((a, r) => a + r.vat, 0);
    crossCheck = {
      rowSumGross: rowGross, declaredGross: declaredTotals.gross, grossDelta: rowGross - declaredTotals.gross,
      rowSumVat: rowVat, declaredVat: declaredTotals.vat, vatDelta: rowVat - declaredTotals.vat,
    };
    crossCheck.grossOk = crossCheck.grossDelta === 0;
    crossCheck.vatOk = crossCheck.vatDelta === 0;
  }

  return {
    rows: out,
    header: { rowNumber: header.rowIndex + 1, columnCount: rows[header.rowIndex].length, mapped: col },
    declaredTotals,
    crossCheck,
    warnings,
  };
}

    return { parseSamsungCardStatement: parseSamsungCardStatement };
  })(common);

  // ---- parse-hyundai.mjs (독립 스코프. 모듈 간 이름 충돌을 허용하지 않는다) ----
  var hyundaiModule = (function (common) {
    var parseCsv = common.parseCsv;
    var parseAmount = common.parseAmount;
    var normHeader = common.normHeader;
    var normalizeIsoDate = common.normalizeIsoDate;
    var maskCardNumber = common.maskCardNumber;
    var detectFileKind = common.detectFileKind;
    var detectCompanyFromRows = common.detectCompanyFromRows;
    var findHeaderRow = common.findHeaderRow;
// 현대카드 이용내역 CSV 파서.
//
// 삼성 파서와 다른 점은 규격(card-columns.json hyundaicard 프로파일)에 기록돼
// 있다. 코드와 규격이 어긋나면 규격을 먼저 고친다.
//   - 합계행이 데이터 뒤에 있다(삼성은 헤더 앞). 합계행 탐색은 헤더 뒤를 본다.
//   - 승인 금액과 이용 금액이 별도다. grossAmount 는 이용 금액(청구 기준)이다.
//     승인 금액은 approvedAmount 로 별도 필드다.
//   - 부가세는 가맹점이 신고한 값이라 이용금액의 순수 함수가 아니다(1,323행 중
//     838행이 이용금액/11 검산과 어긋난다). 그래서 vatMismatch 검사를 하지 않는다.
//     삼성 방식으로 검산하면 거짓 경고가 838건 나온다.
//   - 상태 컬럼(취소/정상)이 취소 판별의 1차 신호다. 부호는 교차검증에 쓴다.
//   - 카드번호가 전체 번호로 온다(삼성은 이미 마스킹돼 온다). 파서가 마스킹하고
//     원본은 어디에도 남기지 않는다.
//   - 날짜가 YYYY.MM.DD 점 구분이다. ISO 로 정규화한다.
//   - 승인번호 컬럼이 없다. 그리고 내용이 완전히 같은 행이 실제로 있다(13그룹).
//     rowKey 는 내용 + 동일내용 발생차수(#n)로 유일성을 만든다.
//
// 이 모듈은 원본 파일 bytes 와 비밀번호를 다루지 않는다. 암호화된 파일은
// 사용자가 입력한 비밀번호로 열린 평문 바이트가 이 모듈에 넘어온다.



/**
 * 합계행에서 명세가 밝힌 총액/부가세/건수를 뽑는다.
 * 실제 합계행: 합 계 | (빈칸) | 1323건 | 49,283,063 | 47,533,063 | 1,487,321
 * 승인 합계(approvedAmount 칸)도 같이 둔다. 합계행은 데이터 뒤에 있다.
 */
function extractDeclaredTotals(rowsAfterHeader, col, grandTotalPatterns) {
  const patterns = new Set((grandTotalPatterns || []).map(normHeader));
  for (let i = 0; i < rowsAfterHeader.length; i++) {
    const r = rowsAfterHeader[i];
    if (!r.some((c) => patterns.has(normHeader(c)))) continue;
    // 합계행은 날짜가 없다. 데이터 행과 구별하는 근거다.
    const dateCell = col.approvedAt === undefined ? "" : (r[col.approvedAt] || "");
    if (normalizeIsoDate(dateCell) !== null) continue;

    const at = (f) => (col[f] === undefined ? "" : String(r[col[f]] == null ? "" : r[col[f]]).trim());
    const gross = parseAmount(at("grossAmount"));
    const vat = parseAmount(at("vat"));
    if (gross === null || vat === null) continue;
    // 건수는 가맹점명 칸("1323건")에 있다. 없으면 행 전체에서 찾는다.
    const countCell = at("merchantName");
    const m = /(\d+)\s*건/.test(countCell) ? countCell.match(/(\d+)\s*건/) : r.join(" ").match(/(\d+)\s*건/);
    return {
      gross, vat,
      count: m ? Number(m[1]) : null,
      approved: parseAmount(at("approvedAmount")),
      labelRow: null, valueRow: i + 1,
    };
  }
  return null;
}

/**
 * 현대카드 이용내역 CSV 를 정규화 행으로 바꾼다.
 * @param {Uint8Array|string} input  UTF-8 바이트(권장) 또는 문자열
 * @param {object} contract        card-columns.json 내용
 * @returns {{rows, header, declaredTotals, crossCheck, warnings}}
 */
function parseHyundaiCardStatement(input, contract) {
  if (!contract) throw new Error("card-columns.json 규격이 없다. 추측으로 파싱하지 않는다.");

  let text;
  if (typeof input === "string") text = input;
  else {
    const u = input instanceof Uint8Array ? input : new Uint8Array(input);
    const hasBom = u.length >= 3 && u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf;
    text = new TextDecoder("utf-8").decode(hasBom ? u.subarray(3) : u);
  }

  const rows = parseCsv(text);
  const header = findHeaderRow(rows, contract, "이용일 / 이용 금액 / 부가세 / 가맹점명");
  const col = header.col;
  const at = (r, f) => (col[f] === undefined ? "" : (r[col[f]] == null ? "" : String(r[col[f]]).trim()));

  const out = [];
  const warnings = [];
  // 동일내용 발생차수. 내용이 완전히 같은 행이 실제로 있으므로(13그룹)
  // 내용만으로는 rowKey 가 유일하지 않다. 같은 내용끼리만 센다.
  const occurrence = new Map();

  for (let i = header.rowIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.every((c) => String(c).trim() === "")) continue;

    const gross = parseAmount(at(r, "grossAmount"));
    const merchant = at(r, "merchantName");
    // 데이터 판별은 값으로 한다.
    if (gross === null || merchant === "") continue;

    const isoDate = normalizeIsoDate(at(r, "approvedAt"));
    if (isoDate === null) {
      // 날짜 없고 건수만 있는 행은 합계행이다. 거래가 아니므로 조용히 건너뛴다.
      // (합계행은 extractDeclaredTotals 에서 따로 읽는다)
      if (/^\d+건$/.test(merchant)) continue;
      // 그 외에 가맹점과 금액이 있는데 날짜가 없으면 데이터 손실이다. 조용히 버리면 안 된다.
      warnings.push({
        row: i + 1, code: "rowSkippedNoDate",
        message: "가맹점 '" + merchant + "', 금액 " + gross + " 인 행의 날짜를 읽지 못했다(" +
          at(r, "approvedAt") + "). 이 행은 결과에 없다.",
      });
      continue;
    }

    const vatRaw = parseAmount(at(r, "vat"));
    const vat = vatRaw === null ? 0 : vatRaw;

    // 취소 판별: 상태 컬럼이 1차 신호다. 부호는 교차검증이다.
    // 공급가액 경고보다 먼저 계산한다. 취소 행은 공급가액이 음수인 게 정상이므로.
    const statusRaw = at(r, "reversal");
    let reversal;
    if (statusRaw !== "") reversal = statusRaw === "취소" ? "매입취소" : "매입";
    else reversal = gross < 0 ? "매입취소" : "매입";

    // 공급가액: 컬럼이 있으면 그 값을 쓰고, 없으면 역산한다.
    // 현대 명세는 컬럼이 없으므로 역산 경로가 실제로 쓰인다.
    const supplyCol = parseAmount(at(r, "supplyExVat"));
    const supplyExVat = supplyCol === null ? gross - vat : supplyCol;
    if (supplyCol !== null && supplyCol + vat !== gross) {
      warnings.push({
        row: i + 1, code: "supplyInconsistent",
        message: "공급가액 " + supplyCol + " + 세액 " + vat + " = " + (supplyCol + vat) +
          " 인데 이용금액은 " + gross + " 다.",
      });
    }
    // 포인트 전액 결제 행(이용=0, 부가세>0)은 역산 공급가액이 음수가 된다.
    // 값을 조용히 0으로 자르면 부가세 합계와 대조가 어긋난다. 그대로 두고 보여준다.
    // 취소 행은 음수가 정상이므로 여기서 제외한다.
    if (supplyExVat < 0 && reversal !== "매입취소") {
      warnings.push({
        row: i + 1, code: "vatExceedsGross",
        message: "이용금액 " + gross + " 보다 부가세 " + vat + " 가 크다(공급가액 역산 " + supplyExVat +
          "). 포인트 전액 결제일 가능성이 있다. 승인금액 " + at(r, "approvedAmount") + " 을 확인한다.",
      });
    }

    if ((reversal === "매입취소") !== (gross < 0)) {
      warnings.push({
        row: i + 1, code: "reversalSignMismatch",
        message: "상태 '" + statusRaw + "' 인데 이용금액이 " + (gross < 0 ? "음수" : "양수") + " 다. 둘 중 무엇이 맞은지 확인해야 한다.",
      });
    }

    const row = {
      approvedAt: isoDate,
      merchantName: merchant,
      grossAmount: gross,
      supplyExVat,
      vat,
      expenseKind: (contract.fields && contract.fields.expenseKind && contract.fields.expenseKind.default) || "unclassified",
      approvalNo: null, // 현대 명세에는 승인번호 컬럼이 없다
      cardMasked: maskCardNumber(at(r, "cardMasked")),
      businessCategory: at(r, "businessCategory") || null,
      approvedAmount: parseAmount(at(r, "approvedAmount")),
      installmentCount: parseAmount(at(r, "installmentCount")),
      memberRelation: at(r, "memberRelation") || null,
      reversal,
      _sourceRow: i + 1,
    };

    // 중복 키: 승인번호가 없으므로 내용으로 만든다. 내용이 같은 행 사이에서만
    // 발생차수를 센다. 내용이 같은 행의 순서가 바뀌어도 키 집합이 같아서
    // 재임포트 중복 제거가 유지된다.
    const base = [row.approvedAt, row.merchantName, row.grossAmount, row.vat,
      row.cardMasked || "", row.reversal, row.installmentCount === null ? "" : row.installmentCount].join("|");
    const n = (occurrence.get(base) || 0) + 1;
    occurrence.set(base, n);
    row.rowKey = base + "#" + n;

    out.push(row);
  }

  // 교차검증: 행 합계가 명세 합계행과 맞아야 한다.
  const declaredTotals = extractDeclaredTotals(rows.slice(header.rowIndex + 1), col, contract.rowRoles && contract.rowRoles.grandTotal);
  let crossCheck = null;
  if (declaredTotals) {
    const rowGross = out.reduce((a, r) => a + r.grossAmount, 0);
    const rowVat = out.reduce((a, r) => a + r.vat, 0);
    crossCheck = {
      rowSumGross: rowGross, declaredGross: declaredTotals.gross, grossDelta: rowGross - declaredTotals.gross,
      rowSumVat: rowVat, declaredVat: declaredTotals.vat, vatDelta: rowVat - declaredTotals.vat,
      rowCount: out.length, declaredCount: declaredTotals.count,
    };
    crossCheck.grossOk = crossCheck.grossDelta === 0;
    crossCheck.vatOk = crossCheck.vatDelta === 0;
    crossCheck.countOk = declaredTotals.count === null ? null : out.length === declaredTotals.count;
  }

  return {
    rows: out,
    header: { rowNumber: header.rowIndex + 1, columnCount: rows[header.rowIndex].length, mapped: col },
    declaredTotals,
    crossCheck,
    warnings,
  };
}

    return { parseHyundaiCardStatement: parseHyundaiCardStatement };
  })(common);


  // 규격(card-columns.json)은 이 파일을 만들 때 읽어 들였다. 화면은 이 사본으로
  // 판별·파싱한다. 규격을 고치면 번들을 다시 생성한다.
  global.AFCard = Object.assign({}, common, samsungModule, hyundaiModule, {
    contract: {"$comment":"카드매입 엑셀 컬럼 규격. FE(SheetJS)와 BE(Apache POI)가 같은 파일을 읽어 이 규격을 검증한다. 규격 변경 시 양쪽 파서를 같이 고친다. 카드사별 프로파일은 실제 샘플을 확인한 뒤에만 추가한다(추측 금지).","version":"1.2.1","updatedAt":"2026-09-28","sourceKinds":{"$comment":"필드마다 source 를 붙인 이유: '파싱 시 반드시 파일 컬럼이어야 하는가' 와 '저장 시 값이 있어야 하는가' 가 다르다. expenseKind 는 required 인데 파일에 없는 필드다(사용자가 정한다). 이 구분을 안 하고 required 로만 보면 헤더 탐색이 영영 실패한다.","column":"파일에 컬럼이 있어야 한다. 없으면 그 카드사는 미지원으로 명시한다.","columnOrDerived":"컬럼이 있으면 쓰고 없으면 derivation 규칙으로 구한다. 구할 수 없으면 미지원.","user":"파일에 없다. 사용자 입력이나 저장된 규칙으로 채운다. 헤더 탐색 대상이 아니다."},"fields":{"approvedAt":{"label":"승인일자","type":"date","required":true,"source":"column","granularity":"day","note":"매출 인정일자. 결제일이 아니라 승인일자를 쓴다(반품·청구 시 승인 취소가 별도 발생). 삼성 명세는 시각이 없어 일자만 준다. 시각이 필요하면 다른 카드사(일시불/할부 분리가 있는 파일)와 달리 원자료에 없으므로 만들지 않는다.","headerAliases":["승인일자","승인 일자","매출일자","거래일자","사용일자","이용일","이용일자"]},"merchantName":{"label":"가맹점명","type":"string","required":true,"source":"column","note":"비용 성분 추정에 쓴다. 업태와 실제 수입이 다를 수 있으므로 자동 분류하지 않는다.","headerAliases":["가맹점명","가맹점","가맹점명(가맹점주명)","상호"]},"supplyExVat":{"label":"공급가액","type":"currency","required":true,"source":"columnOrDerived","note":"부가세 제외 금액. 매입 규모 역산에 쓴다. 총액(공급대가)으로 대체하지 않는다. 컬럼이 없으면 아래 derivation 으로 구한다.","derivation":{"rule":"supplyExVat = grossAmount - vat","when":"카드사가 공급가액 컬럼을 주지 않고 총액과 세액만 줄 때","why":"공급가액계산세액이라 세액은 공급가액의 10% 를 1원 단위로 반올림한 값이다. 따라서 공급가액을 거꾸로 빼도 항상 성립한다. 삼성 명세 4건으로 검산했다(36,000/3,273 -> 공급가액 32,727, 10% 가 3,272.7 -> 반올림 3,273 일치. 15,300/1,391 -> 13,909, 1,390.9 -> 1,391 일치. 8,680/789 -> 7,891, 789.1 -> 789 일치. 33,000/3,000 -> 30,000, 3,000 일치).","whenVatIsZero":"vat 이 0 이면 supplyExVat = grossAmount. 비과세·면세 거래가 여기 해당한다.","never":"총액만 있고 세액도 없는 명세서는 이 규칙을 쓸 수 없다. 그런 카드사는 미지원으로 명시한다."},"headerAliases":["공급가액","공급가액(원)","과세공급가액","공급가액(부가세별도)"]},"vat":{"label":"세액","type":"currency","required":true,"source":"column","note":"과세세액. 인정 매입세액 대조에 쓴다. 일반세액과 경비율계산세액이 섞이면 taxKind로 구분한다. 컬럼 자체가 없으면 supplyExVat 도 못 구하므로 미지원 카드사로 본다.","headerAliases":["세액","세액(원)","부가세","부가세(원)","과세세액"]},"grossAmount":{"label":"공급대가","type":"currency","required":true,"source":"column","derive":"supplyExVat + vat","note":"합계로만 있고 공급가액/세액 분해가 안 되는 카드사는 쓰지 않는다. 분해가 안 되면 그 카드사는 미지원으로 명시한다. 청구 기준(이용금액)을 쓴다. 승인금액은 별도 필드(approvedAmount)로 둔다.","headerAliases":["공급대가","이용금액","이용금액(원)","결제금액","합계금액","매출금액"],"aliasNote":"이전 버전에는 '승인금액' 별칭이 있었다. 현대카드 명세는 승인 금액과 이용 금액을 둘 다 주는데, 헤더 매핑은 같은 별칭을 처음 등록한 필드에 묶으므로 grossAmount 가 승인 금액에 잘못 묶였을 것이다. 그래서 별칭을 여기서 제거하고 approvedAmount 로 옮겼다."},"expenseKind":{"label":"용도구분","type":"enum","required":true,"source":"user","default":"unclassified","values":["unclassified","business","personal"],"headerAliases":[],"note":"개인용·업무용 지출은 반드시 사용 시점에 나눠야 하므로 파서가 임의로 정하지 않는다. 기본값은 unclassified 이고, 사용자가 미리보기에서 고른다. '지금 경비로 인정한다'는 이전 결정을 기본값으로 박지 않는다.","unclassifiedHandling":"unclassified 행은 어느 합계에도 넣지 않고 분류 대기 목록으로 올린다. 조용히 business 로 보거나 버리면 둘 다 틀린다.","merchantRule":"가맹점 단위 저장 규칙을 둔다. 아파트관리비 처럼 매달 반복되는 가맹점은 행마다 손으로 누르면 안 되므로 '가맹점 -> 용도구분' 을 한 번 저장하면 다음 명세부터 자동 적용한다.","taxDisclaimer":"이 필드는 분류 입력일 뿐 세무상 비용 인정 여부를 판정하지 않는다. 사용자가 세무사와 확인한 결과를 담는 자리다."}},"optionalFields":{"installmentCount":{"label":"할부횟수","type":"integer","required":false,"note":"할부 결제의 진행 단계. 현금흐름에 반영하려면 원금/이자 분리 규칙이 추가로 필요하다.","headerAliases":["할부","할부횟수","할부선택"]},"approvalNo":{"label":"승인번호","type":"string","required":false,"unique":false,"note":"중복 적재 방지 키로 쓸 수 없다. 삼성 명세 18건에 승인번호 16종이었고 2종이 각각 +/− 쌍으로 두 번 나왔다. 같은 날짜·같은 가맹점·같은 금액인데 부호만 반대다. 08014951(R31 -88,000 / R32 +88,000), 22987831(R34 -29,800 / R35 +29,800). 취소 후 재승인 때문이다.","rule":"rowKey 로 중복을 잡는다. rowKey = approvedAt|merchantName|grossAmount|vat|approvalNo|cardMasked. 같은 명세 안에서 이 조합은 유일하다(승인번호가 거래마다 유일하되 취소·재승인 쌍은 금액 부호가 달라 구분이 된다). 같은 rowKey 가 다른 임포트에서 다시 나오면 같은 거래이므로 건너뛴다.","headerAliases":["승인번호","승인번호(일련번호)","거래번호"]},"cardMasked":{"label":"카드번호","type":"string","required":false,"sensitive":true,"note":"마스킹된 값만 저장한다. 복호화된 파일에는 실제 카드번호가 있으므로 FE 밖으로 나가지 않게 한다.","headerAliases":["카드번호","카드번호(마스킹)"]},"businessCategory":{"label":"업종","type":"string","required":false,"note":"카드사가 붙인 업태. 매출액 추정이나 자동 분류 근거로 쓰지 않는다(업태와 실제 지출이 다름). 가맹점 분류 규칙의 힌트로만 쓴다.","headerAliases":["업종","업태","업태명"]},"cardCompany":{"label":"카드사","type":"string","required":false,"note":"어느 카드사 파일인지 식별한다. 파일명이 신뢰할 수 있으면 파일명을 우선한다.","headerAliases":["카드사","카드사명","발급사"]},"taxKind":{"label":"세액구분","type":"enum","required":false,"values":["과세","영세","면세","일반세액계산","경비율계산"],"note":"영세/면세 거래는 매입세액이 0이므로 역산 매입 규모에 섞지 않는다. 경비율계산세액은 실제 지급세액과 다를 수 있다.","headerAliases":["과세구분","세액구분","부가세구분"]},"reversal":{"label":"취소구분","type":"enum","required":false,"values":["매입","매입취소","출제","출제취소"],"note":"매입취소는 공급가액·세액에서 차감한다. 무조건 합산하면 매입 규모가 부풀려진다.","derivation":"별도 취소 컬럼이 없는 카드사는 이용금액(또는 공급가액)이 음수인 행을 취소로 본다. 삼성 명세는 이 방식이며 18행 중 2행이 음수였다. 전용 컬럼이 있는 카드사(현대: 상태=취소/정상)는 컬럼을 우선하고 부호와 어긋나면 경고를 낸다.","headerAliases":["구분","취소구분","거래구분","전표구분","상태"]},"approvedAmount":{"label":"승인금액","type":"currency","required":false,"note":"승인 시점 금액. 현대카드가 이용 금액과 별도로 준다. 두 금액이 다른 행은 포인트 전액/일부 결제다(승인 12,800 / 이용 0 / 부가세 1,164 사례). 부가세는 승인금액 기준으로 적히므로 이용금액만으로는 설명이 안 되는 행이 여기서 나온다. grossAmount 의 별칭에서 승인금액을 제거한 이유다.","headerAliases":["승인금액","승인 금액"]},"memberRelation":{"label":"관계","type":"string","required":false,"note":"카드 사용자와 회원의 관계(본인/가족). 현대카드가 준다. 가족카드 사용은 사업자 비용 분류의 힌트일 뿐이고 파서가 판정하지 않는다. expenseKind 는 여전히 사용자가 정한다.","headerAliases":["관계","사용자관계"]}},"rowRoles":{"note":"한국 카드 명세서에는 표가 아닌 행이 섞인다. 파서는 행 역할을 판별해 건너뛴다.","metadata":["카드사","카드번호","회원명","조회기간","출력일시","결제기간"],"header":["승인일자","가맹점명","공급가액","세액"],"subtotal":"가맹점별 소계 행. 거래 건이 아니므로 합계에 넣지 않는다.","grandTotal":["총 합계","합계","합 계","총 건수","건수","소계","전체합계"],"dataRowNote":"가맹점명이 비어 있고 금액만 있는 행, '외국계'/'캐피탈' 같은 섹션 표시 행도 데이터가 아니다."},"validation":{"supplyExVatPlusVatEqualsGross":true,"note":"공급가액 + 세액 = 공급대가 를 행마다 검사한다. 어긋나면 해당 행을 저장하지 않고 사용자에게 보여준다. 조용히 한쪽만 믿으면 역산 매입 규모가 틀어진다.","negativeAllowed":{"reversal":true,"note":"매입취소 행만 음수를 허용한다. 그 외 음수는 오류로 본다."}},"encryption":{"$comment":"정책(사용자 결정, 기존 암호 구현은 백지화): 암호화 파일은 사용자가 입력한 정확한 비밀번호로 열리는 경우와 이미 암호가 풀린(평문) 파일만 읽는다. 그 외에는 풀어서 해결하려는 로직이나 시도를 만들지 않는다. 암호 입력만 허용한다.","expected":true,"whereToDecrypt":"FE","policy":["사용자가 입력한 비밀번호로 열 수 있을 때만 문서를 읽는다","이미 암호가 풀린 파일(평문 xlsx/CSV)은 그대로 읽는다","비밀번호가 맞지 않으면 '비밀번호가 틀렸습니다'만 알리고 끝낸다","재시도 루프, 대입, 패딩 우회 등 풀어서 해결하려는 어떤 로직도 만들지 않는다","원본 파일과 비밀번호는 서버로 보내지 않는다. FE 에서 열어 정규화된 행만 전송한다"],"seenInTheWild":{"samsungcard":{"extension":".xlsx","container":"CFB (OLE2)","scheme":"agile (ECMA-376 4.4)","note":"탐지에 필요한 사실만 기록한다. 암호 파라미터(salt·verifier·spinCount 등)는 수집하지 않는다."}}},"reconciliation":{"note":"이 규격의 목적은 §28.7 매입 대조다. 파싱 결과로 매입세액 합계가 VAT 신고서의 purchaseTax와 맞아야 한다.","expectPurchaseTaxMonthly":320000,"expectImpliedPurchaseExVatMonthly":3520000,"cardSupplyAmountMonthly":5000000,"tolerance":1,"knownGap":{"status":"unresolved","finding":"삼성 카드 6개월치(2025-07-01~2025-12-31) 부가세 합계는 8,453 원이다. 18건 중 10건이 부가세 0 이고, 6건(2,062,850 원, 86.5%)이 아파트관리비다.","implication":"expectPurchaseTaxMonthly 320,000 은 이 카드 파일에서 나오지 않는다. 매입세액은 다른 증빙(현금영수증·세금계산서)에서 나와야 하며, 카드_import 합계만으로 §28.7 대조를 완성했다고 볼 수 없다.","doNot":"이 갭을 '반올림 오차' 나 '파싱 문제' 로 덮지 않는다. 카드만으로는 안 맞는다는 사실을 그대로 둔다."},"cardStatementTotals":{"note":"실제 삼성 명세의 합계 교차검증 결과다. 합계행을 거래에 더하면 이 값이 어긋난다.","source":"2025-07-01 ~ 2025-12-31, 18건","rowSumGross":2385860,"statementTotalGross":2385860,"rowSumVat":8453,"statementTotalVat":8453,"verified":true}},"companies":{"$comment":"실제 샘플을 검사해 채운다. 형식을 추측해 미리 채우지 않는다.","samsungcard":{"status":"verified","title":"개인사업자용 카드이용내역서","detect":{"$comment":"업로드 시 어떤 카드사 명세인지 판별하는 근거. 공통 컬럼(이용일/카드번호/가맹점명/부가세)은 두 카드사가 같아서 판별에 쓰면 안 되고, 한쪽에만 있는 컬럼으로만 시그니처를 만든다. minScore 이상이면 그 카드사로 본다. 미만이면 카드사 미확인으로 거절한다 — 우연히 컬럼 하나만 겹치는 파일을 특정 카드사로 둔갑시키면 파서가 엉뚱한 열을 읽는다.","headerSignature":["상품","매출","성명","카드구분","승인번호","업종"],"minScore":3},"verifiedFrom":"2026-01 발급분. 암호화 .xlsx(CFB/Agile)와 같은 명세의 비암호화 CSV(UTF-8 BOM)로 헤더·행 패턴을 확정했다. 실제 파일은 PII 포함이라 저장소에 넣지 않는다.","fileShapes":[{"ext":".xlsx","container":"CFB (OLE2)","encrypted":true,"scheme":"agile","note":"원본 파일. 열 때 비밀번호가 필요하고 FE 에서만 해독한다."},{"ext":".csv","container":"text/csv","encrypted":false,"bom":"UTF-8 BOM","delimiter":",","quote":"\"","note":"카드사에서 함께 준 평문본. xlsx 가 안 열릴 때 유일한 대안이므로 지원한다."}],"layout":{"rowCount":41,"columnCount":12,"columnCountIsConstant":true,"headerRow":19,"headerRowIndex":18,"preambleRows":18,"dataRows":[20,37],"trailingBlankRows":[38,41],"note":"헤더가 19행째에 있다. 1~18행은 발행정보·회원정보·합계 요약이라 표가 아니다. 헤더 위치를 고정으로 박지 말고 headerAliases 로 찾되, 없으면 이 layout 을 fallback 으로 쓴다."},"columns":[{"index":0,"name":"상품","mapsTo":null,"note":"전부 신용. 제품/서비스 구분으로 보이나 값이 하나뿐이라 쓰지 않는다."},{"index":1,"name":"매출","mapsTo":null,"note":"전부 일시불. 할부/기간제 표시로 보이나 전 건 일시불이라 headerAliases 에 넣지 않는다."},{"index":2,"name":"성명","mapsTo":null,"sensitive":true,"note":"PII. 저장하지 않는다."},{"index":3,"name":"카드구분","mapsTo":null,"note":"전부 본인. 저장하지 않는다."},{"index":4,"name":"카드번호","mapsTo":"cardMasked","sensitive":true,"note":"이미 마스킹된 값(9420-83**-****-6026)이다. 복호화된 xlsx 안의 카드 메타데이터에는 실제 번호가 있으므로 그것은 저장하지 않는다."},{"index":5,"name":"이용일","mapsTo":"approvedAt"},{"index":6,"name":"이용금액(원)","mapsTo":"grossAmount"},{"index":7,"name":"부가세(원)","mapsTo":"vat","note":"행별로 존재한다. 이 덕분에 supplyExVat 를 역산할 수 있다."},{"index":8,"name":"가맹점명","mapsTo":"merchantName"},{"index":9,"name":"승인번호","mapsTo":"approvalNo","note":"중복 있다. rowKey 로 잡는다."},{"index":10,"name":"사업자번호","mapsTo":null,"sensitive":true,"note":"가맹점 사업자번호. 임포트의 기본 단위는 아니므로 저장하지 않는다."},{"index":11,"name":"업종","mapsTo":"businessCategory"}],"nonTableRows":[{"row":1,"role":"title","value":"개인사업자용 카드이용내역서"},{"row":2,"role":"section","value":"발행정보"},{"row":4,"role":"metadata","value":"발행일 2026.01.09 / 발행시간 오후 02:50 / 담당자 MOBILE"},{"row":5,"role":"notice","value":"발행 확인 안내문"},{"row":7,"role":"section","value":"회원정보"},{"row":9,"role":"metadata","sensitive":true,"value":"성명·주민등록번호. PII. 파싱해서 버린다."},{"row":10,"role":"notice","value":"마스킹 안내문"},{"row":12,"role":"section","value":"이용금액 합계"},{"row":13,"role":"unit","value":"(원)"},{"row":14,"role":"subtotalHeader","value":"이용기간 | 총 합계 | 부가세 합계 | 일시불 | 할부 | 단기카드대출(현금서비스) | 장기카드대출(카드론)"},{"row":15,"role":"grandTotal","value":"2025-07-01 ~ 2025-12-31 | 2,385,860 | 8,453 | 2,385,860 | 0 | 0 | 0"},{"row":17,"role":"section","value":"세부 이용내역"}],"reversal":{"hasDedicatedColumn":false,"rule":"이용금액(원) 이 음수인 행이 취소다. 18행 중 2행(-88,000, -29,800). 부가세도 같은 부호다.","caveat":"취소와 재승인이 같은 승인번호로 짝지어지므로 rowKey 가 아니라 rowKey+부호로 묶어 확인해야 한다. 결론적으로 순액이 맞으므로 별도 상계 없이 합산하면 된다."},"verified":true,"crossCheck":"18행 합계(2,385,860 / 8,453)가 15행 합계행과 정확히 일치한다. 이 성질로 파싱 버그를 즉시 잡는다."},"hyundaicard":{"status":"verified","title":"현대카드 이용내역","detect":{"headerSignature":["승인 금액","이용 금액","관계","상태","가맹점번호","사업자등록번호"],"minScore":3},"verifiedFrom":"2026-05-04 발급분(기준 일자 2025년 1년 전체). 비암호화 CSV(UTF-8 BOM)로 확정했다. 실제 파일은 PII 포함이라 저장소에 넣지 않는다.","fileShapes":[{"ext":".csv","container":"text/csv","encrypted":false,"bom":"UTF-8 BOM","delimiter":",","quote":"\"","note":"금액은 천단위 콤마를 따옴표로 감싼다(\"139,000\" 형태). 단순 split 으로는 열이 깨진다."}],"layout":{"rowCount":1335,"columnCount":11,"columnCountIsConstant":true,"headerRow":8,"headerRowIndex":7,"preambleRows":7,"dataRows":[9,1331],"grandTotalRow":1332,"trailingRows":[1333,1335],"note":"삼성과 반대로 합계행이 데이터 뒤에 있다. 합계행 탐색은 헤더 뒤쪽을 본다."},"columns":[{"index":0,"name":"이용일","mapsTo":"approvedAt","note":"YYYY.MM.DD 점 구분. 삼성은 하이픈이다. 파서가 ISO(YYYY-MM-DD)로 정규화한다."},{"index":1,"name":"카드번호","mapsTo":"cardMasked","sensitive":true,"note":"이 카드사는 전체 번호(4573-2110-0211-3694 형태)를 준다. 삼성과 반대다. 파서가 마스킹해야 하고 원본은 FE 밖으로 나가지 않는다."},{"index":2,"name":"가맹점명","mapsTo":"merchantName"},{"index":3,"name":"승인 금액","mapsTo":"approvedAmount"},{"index":4,"name":"이용 금액","mapsTo":"grossAmount","note":"승인 금액과 별도 컬럼이다. grossAmount 의 별칭에서 승인금액을 뺀 이유다."},{"index":5,"name":"부가세","mapsTo":"vat"},{"index":6,"name":"관계","mapsTo":"memberRelation","note":"본인 732건 / 가족 591건."},{"index":7,"name":"할부","mapsTo":"installmentCount","note":"값은 개월 수(2, 3). 6건."},{"index":8,"name":"상태","mapsTo":"reversal","note":"정상 1,300건 / 취소 23건. 전용 컬럼이 있으므로 부호 추측보다 우선한다."},{"index":9,"name":"가맹점번호","mapsTo":null,"sensitive":true,"note":"가맹점 식별번호. 결측 0건. 저장하지 않는다."},{"index":10,"name":"사업자등록번호","mapsTo":null,"sensitive":true,"note":"가맹점 사업자번호. 결측 3건. 저장하지 않는다."}],"nonTableRows":[{"row":1,"role":"title","value":"현대카드 이용내역"},{"row":3,"role":"metadata","value":"기준 일자 : 2025년 01월 01일 ~ 2025년 12월 31일"},{"row":4,"role":"metadata","sensitive":true,"value":"회원 정보(성명·생년월일). PII. 파싱해서 버린다."},{"row":6,"role":"section","value":"이용 내역"},{"row":7,"role":"unit","value":"(단위 : 원)"},{"row":1332,"role":"grandTotal","value":"합 계 | 1323건 | 49,283,063 | 47,533,063 | 1,487,321 — 첫 칸이 '합 계'(공백 포함)다"},{"row":1334,"role":"metadata","value":"발급 일자 : 2026년 05월 04일"},{"row":1335,"role":"metadata","value":"발급 기관 : 현대카드 (주)"}],"amountSemantics":{"note":"이 카드사는 금액이 세 개다. 삼성과 다른 부분이 여기서 다 나온다.","approvedAmount":"승인 시점 금액. 합계 49,283,063.","grossAmount":"청구 기준 금액(이용 금액). 합계 47,533,063. 규격의 grossAmount 는 이걸 쓴다.","vat":"부가세. 합계 1,487,321. 가맹점이 신고한 값이라 이용금액의 순수 함수가 아니다.","vatIsNotDerived":"이용금액/11 로 부가세를 검산하면 1,323행 중 838행이 어긋난다(가맹점 신고값이므로). 삼성처럼 검산 경고(vatMismatch)를 내면 거짓 경고가 된다. 현대 파서는 이 검사를 하지 않는다.","pointPayment":"승인≠이용 30건 중 28건이 이용=0(포인트 전액 결제), 2건이 부분 결제다. 이용=0인데 부가세>0 인 행이 17건 있다. 이 행은 supplyExVat = 이용금액 - 부가세 가 음수가 된다. 파서는 값을 그대로 두고 vatExceedsGross 경고를 내서 사용자가 보게 한다. 조용히 0으로 자르면 부가세 합계가 어긋난다."},"reversal":{"hasDedicatedColumn":true,"column":"상태","rule":"상태=취소 인 행이 취소다. 23건이고 이용금액<0 인 23건과 정확히 일치한다. 부가세가 -2,445 인 취소 행도 있으므로 취소 행의 음수 부가세를 허용한다.","caveat":"부호만으로 판별하는 삼성 방식과 달리 컬럼이 우선이다. 컬럼과 부호가 어긋나면 reversalSignMismatch 경고를 낸다."},"rowKey":{"note":"승인번호 컬럼이 없다. 그리고 같은 날짜·가맹점·금액·부가세·카드·상태가 전부 같은 행이 13그룹 15행 있다(2025.11.04 600원 ×2 사례). 카드사 자신도 이 행들을 구별할 수 없다.","rule":"rowKey = approvedAt|merchantName|grossAmount|vat|cardMasked|reversal|할부 + 동일내용 발생차수(#n). 발생차수는 같은 내용 행끼리만 센다. 내용이 같은 행의 순서가 바뀌어도 키 집합이 같아서 재임포트 중복 제거가 유지된다."},"period":"1년 전체(2025-01-01 ~ 2025-12-31) 1,323건. 월별로 봐야 매입 대조가 가능하다. 월별 부가세는 79,562 ~ 173,305 원 범위다.","verified":true,"crossCheck":"1,323행 합계(이용 47,533,063 / 부가세 1,487,321 / 승인 49,283,063)가 1332행 합계행과 정확히 일치한다. 건수 1,323도 일치한다."},"pending":["삼성카드 법인용/개인용(사업자번호 없는 일반 카드) 명세는 헤더가 다를 수 있다. 실제 파일을 보기 전까지 삼성 프로필을 그대로 쓰면 안 된다.","구형 .xls(BIFF) 지원은 미정. card-columns 의 headerAliases 로 커버되는지 확인 필요."]}},
  });
})(window);
