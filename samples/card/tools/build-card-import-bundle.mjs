// 프로토타입용 카드 임포트 번들 생성기.
//
// 왜 필요한가: 프로토타입(design/prototype)은 빌드·서버 없이 브라우저에서
// HTML 파일을 그대로 연다(README "보는 법"). 그런데 file:// 에서 ES 모듈은
// CORS 로 막혀 파서를 직접 import 할 수 없다. 그렇다고 파서를 UI 안에 복사하면
// "파서는 두 벌, 규격은 하나"가 깨진다.
//
// 해법: 이 저장소의 기존 패턴(생성기 + 바이트 재현성 검사)을 따른다. 진짜
// 원본(apps/frontend/src/lib/card/*.mjs 와 card-columns.json)을 읽어 ESM 문법만
// 벗겨 클래식 스크립트 하나로 묶고 window.AFCard 로 노출한다. 원본이 단일
// 출처고, test-card-ui.mjs 가 번들을 다시 만들어 바이트 단위로 같은지 검사한다.
//
//   node samples/card/tools/build-card-import-bundle.mjs
//
// 모듈은 각자 IIFE 로 감싼다. parse-samsung 과 parse-hyundai 는 같은 이름의
// 내부 함수(extractDeclaredTotals)를 가지는데, 한 스코프에 풀면 나중 선언이
// 앞 것을 덮어써 삼성 합계 추출이 조용히 현대 규칙으로 돌아간다(실제로
// 그 버그가 났다). IIFE 로 스코프를 분리하고 필요한 공용 함수만 주입한다.
//
// 번들에는 암호 관련 코드가 없다. 정책상 암호화 파일은 사용자 비밀번호로만
// 열리며, 이 프로토타입은 평문 CSV 만 읽는다.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// 저장소 절대경로를 박지 않는다. 이 생성기는 CI 에서도 돌아야 한다.
// 주의: 아래 경로 문자열(슬래시)은 번들 주석에 그대로 들어가므로 손대면
// 커밋된 card-import.js 와 바이트가 어긋나 재현성 검사가 깨진다.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const at = (p) => resolve(ROOT, ...p.split("/"));
const OUT = at("design/prototype/common/card-import.js");

// 공용 함수 주입 목록은 card-common.mjs 의 export 와 동기화해 둔다.
const COMMON_API = [
  "parseCsv", "parseAmount", "normHeader", "normalizeIsoDate", "maskCardNumber",
  "detectFileKind", "detectCompanyFromRows", "findHeaderRow",
];

/** ESM 을 클래식 스크립트 조각으로 바꾼다. import 문 제거 + export 키워드 제거. */
function toClassic(src, label) {
  let s = src;
  // import 문은 여러 줄에 걸친다(parse-hyundai.mjs). from "..." 까지 통째로 제거.
  s = s.replace(/^[ \t]*import[\s\S]*?from\s+["'][^"']+["'];[ \t]*$/gm, "");
  // export { a, b }; 형태 제거
  s = s.replace(/^[ \t]*export\s*\{[^}]*\};[ \t]*$/gm, "");
  // export function/const/... 선언에서 export 키워드만 제거
  s = s.replace(/^export\s+(?=(function|const|let|var|class|async))/gm, "");
  if (/^\s*import\s/m.test(s) || /^\s*export\s/m.test(s)) {
    throw new Error(label + ": ESM 문법이 남아 있다. 번들 변환 규칙을 고쳐야 한다.");
  }
  return s;
}

/** 모듈 본문을 독립 IIFE 로 감싸고, 공용 API 를 var 로 주입해 반환 객체를 만든다. */
function wrapModule(body, label, exports, varName) {
  const inject = COMMON_API.map((n) => "    var " + n + " = common." + n + ";").join("\n");
  const ret = "    return { " + exports.map((n) => n + ": " + n).join(", ") + " };";
  return (
    "  // ---- " + label + " (독립 스코프. 모듈 간 이름 충돌을 허용하지 않는다) ----\n" +
    "  var " + varName + " = (function (common) {\n" +
    inject + "\n" +
    body + "\n" +
    ret + "\n" +
    "  })(common);\n"
  );
}

// 번들 주석에 들어가는 원본 경로는 저장소 루트 기준 슬래시 경로 그대로다.
// (ROOT 를 절대경로로 바꿨으므로 여기서 ROOT 를 다시 붙이지 않는다.)
const strip = (s) => s;
const cardCommon = readFileSync(at("apps/frontend/src/lib/card/card-common.mjs"), "utf8");
const samsung = readFileSync(at("apps/frontend/src/lib/card/parse-samsung.mjs"), "utf8");
const hyundai = readFileSync(at("apps/frontend/src/lib/card/parse-hyundai.mjs"), "utf8");
const contract = JSON.parse(readFileSync(at("samples/card/card-columns.json"), "utf8"));

const out = `/* 자동 생성 파일 — 손으로 고치지 않는다.
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
${toClassic(cardCommon, strip("apps/frontend/src/lib/card/card-common.mjs"))}
    return { ${COMMON_API.map((n) => n + ": " + n).join(", ")} };
  })();
${wrapModule(toClassic(samsung, strip("apps/frontend/src/lib/card/parse-samsung.mjs")), "parse-samsung.mjs", ["parseSamsungCardStatement"], "samsungModule")}
${wrapModule(toClassic(hyundai, strip("apps/frontend/src/lib/card/parse-hyundai.mjs")), "parse-hyundai.mjs", ["parseHyundaiCardStatement"], "hyundaiModule")}

  // 규격(card-columns.json)은 이 파일을 만들 때 읽어 들였다. 화면은 이 사본으로
  // 판별·파싱한다. 규격을 고치면 번들을 다시 생성한다.
  global.AFCard = Object.assign({}, common, samsungModule, hyundaiModule, {
    contract: ${JSON.stringify(contract)},
  });
})(window);
`;

// 검산 1: 남아 있으면 안 되는 것
const bad = [/^\s*import\s/m, /^\s*export\s/m, /\bBuffer\./, /\brequire\(/]
  .map((re) => (re.test(out) ? String(re) : null))
  .filter(Boolean);
if (bad.length) throw new Error("번들에 남아 있으면 안 되는 것: " + bad.join(", "));

// 검산 2: 꼭 있어야 하는 것
const mustHave = [
  "parseSamsungCardStatement", "parseHyundaiCardStatement",
  "detectFileKind", "detectCompanyFromRows", "normalizeIsoDate", "maskCardNumber",
  '"samsungcard"', '"hyundaicard"',
];
const missing = mustHave.filter((k) => !out.includes(k));
if (missing.length) throw new Error("번들에 빠진 것: " + missing.join(", "));

writeFileSync(OUT, out, "utf8");

// 검산 3: 번들이 실제로 돌아가는가. 커밋된 픽스처로 파싱 + 판별을 확인한다
// (PII 미출력). 실제 파일이 있는 환경에서는 암호화 판별도 같이 본다.
import { runInNewContext } from "node:vm";
const ctx = { window: {}, TextDecoder, console };
runInNewContext(out, ctx);
const AF = ctx.window.AFCard;
const api = ["parseCsv", "parseSamsungCardStatement", "parseHyundaiCardStatement", "detectFileKind", "detectCompanyFromRows", "normalizeIsoDate", "maskCardNumber", "parseAmount"];
const lost = api.filter((k) => typeof AF[k] !== "function");
if (lost.length) throw new Error("번들 API 누락: " + lost.join(", "));

const samsungAnon = readFileSync(at("samples/card/anonymized/samsungcard-personal-anon.csv"));
const r1 = AF.parseSamsungCardStatement(samsungAnon, AF.contract);
if (r1.rows.length !== 18 || !r1.crossCheck || !r1.crossCheck.grossOk) {
  throw new Error("번들 안 삼성 파서 검증 실패: rows=" + r1.rows.length + " crossCheck=" + JSON.stringify(r1.crossCheck));
}
const hyundaiAnon = readFileSync(at("samples/card/anonymized/hyundaicard-personal-anon.csv"));
const r2 = AF.parseHyundaiCardStatement(hyundaiAnon, AF.contract);
if (r2.rows.length !== 75 || !r2.crossCheck || !r2.crossCheck.grossOk) {
  throw new Error("번들 안 현대 파서 검증 실패: rows=" + r2.rows.length);
}
const det = AF.detectCompanyFromRows(AF.parseCsv(hyundaiAnon.toString("utf8").replace(/^\uFEFF/, "")), AF.contract);
if (det.company !== "hyundaicard" || det.headerRowNumber !== 8) {
  throw new Error("번들 안 카드사 판별 실패: " + JSON.stringify(det));
}
let encNote = "암호화 판별(실제 파일 없음: 건너뜀)";
// 실제 암호화 xlsx 는 개인정보 파일이라 저장소에 없다. 있을 때만 판별한다.
const encPath = process.env.ASSETFLOW_CARD_REAL_DIR
  ? resolve(process.env.ASSETFLOW_CARD_REAL_DIR, "samsungcard_detail_202601.xlsx")
  : "";
if (encPath && existsSync(encPath)) {
  const enc = AF.detectFileKind(new Uint8Array(readFileSync(encPath)), ".xlsx");
  if (enc.kind !== "cfb") throw new Error("암호화 xlsx 판별 실패: " + JSON.stringify(enc));
  encNote = "암호화 판별(cfb) 통과";
}

console.log("생성 완료: design/prototype/common/card-import.js");
console.log("  " + out.length.toLocaleString() + "B, 규격 v" + contract.version +
  ", 스모크: 삼성 18행/현대 75행/현대 판별 통과, " + encNote);
