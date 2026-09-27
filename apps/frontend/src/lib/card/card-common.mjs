// 카드 명세 파서 공용 원시 함수.
//
// 파서는 카드사별로 두 벌이지만("파서는 두 벌, 규격은 하나") CSV 파싱·헤더
// 매칭·금액 파싱 규칙은 한 벌이어야 한다. 규격(card-columns.json)이 단일 출처고,
// 이 모듈은 규격을 주입받아 쓰는 기계 부품만 둔다. 회사별 행 의미 — 합계행 위치
// (삼성은 헤더 앞, 현대는 뒤), 취소 판별(현대는 상태 컬럼), 날짜 형식(현대는
// 점 구분), 카드번호 마스킹(현대는 전체 번호) — 는 각 파서가 책임진다.

/** 셀 값에서 헤더 비교용 정규화. 공백 제거 + 괄호 내용 제거 + 소문자. */
export function normHeader(h) {
  return String(h == null ? "" : h)
    .replace(/\s+/g, "")
    .replace(/[()]/g, "")
    .toLowerCase();
}

/** '1,234' -> 1234. 파싱 불가면 null. */
export function parseAmount(s) {
  const t = String(s == null ? "" : s).replace(/[,\s원]/g, "").replace(/[()]/g, "");
  if (t === "" || t === "-") return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** RFC4180 CSV 파서. BOM 은 호출자가 제거해 둔다. */
export function parseCsv(text) {
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
export function buildAliasMap(contract) {
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
export function mapColumns(headerCells, aliasMap, contract) {
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
export function scoreHeaderRow(cells, aliasMap, contract) {
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
export function findHeaderRow(rows, contract, expectedHint) {
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
export function maskCardNumber(raw) {
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
export function normalizeIsoDate(raw) {
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
export function detectFileKind(buf, ext) {
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
export function detectCompanyFromRows(rows, contract) {
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
