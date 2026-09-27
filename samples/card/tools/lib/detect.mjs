// 파일 형식을 확장자가 아니라 내용(매직 바이트)으로 판별한다.
//
// 실제로 삼성카드가 .xlsx 확장자로 암호화 파일을 준 적이 있다.
// 확장자를 믿으면 "zip 이 아니다" 같은 무의미한 오류만 나오고 원인을 알 수 없다.
//
// 1차 판별(zip/CFB/CSV 계열)은 FE 와 같은 한 벌(card-common.mjs 의
// detectFileKind)을 쓴다. 이 파일은 Node 도구용 껍데기다 — 파일을 읽어
// detectFileKind 에 넘기고, 사람이 읽을 라벨과 행동 지침을 붙인다.
// CFB 안에 암호화 문서(EncryptedPackage)가 있는지는 컨테이너를 열어야
// 알 수 있으므로 여기서만(openCfb) 판별한다. FE 업로드는 "cfb" 만으로
// 충분하다 — 암호화든 구형 .xls 든 읽지 못하고 CSV 로 안내한다.

import { readFileSync } from "node:fs";
import { openCfb } from "../../lib/cfb.mjs";
import { detectFileKind } from "file:///D:/study/assetflow/apps/frontend/src/lib/card/card-common.mjs";

const hex = (b) => Buffer.from(b).toString("hex");

const CSV_LABELS = {
  "csv-utf8bom": "CSV (UTF-8 BOM)",
  "csv-utf16le": "CSV (UTF-16LE)",
  "csv-utf16be": "CSV (UTF-16BE)",
  "csv-text": "CSV (평문 텍스트로 보임)",
};

/**
 * 확장자를 무시하고 실제 형식을 판별한다.
 * @returns {{kind:string,label:string,ext:string,size:number,encrypted:boolean,enc:object|null,note:string,actionable:string[]}}
 */
export function detect(path) {
  const buf = readFileSync(path);
  const dot = path.lastIndexOf(".");
  const ext = dot >= 0 ? path.slice(dot).toLowerCase() : "";
  const r = { ext, size: buf.length, encrypted: false, enc: null, note: "", actionable: [] };

  const f = detectFileKind(buf, ext);
  if (f.kind === "empty") {
    // 빈 파일은 어떤 형식 판별도 해낼 수 없다. 빈 CSV 로 통과시키면 안 된다
    r.kind = "empty";
    r.label = "빈 파일 (0바이트)";
    r.note = "다운로드가 중단되었거나 빈 파일일 수 있다.";
    r.actionable = ["카드사에서 다시 다운로드한다", "엑셀에서 실제로 열리는지 먼저 확인한다"];
    return r;
  }

  if (f.kind === "zip-xlsx") {
    r.kind = "xlsx";
    r.label = "xlsx (OOXML, 평문)";
    return r;
  }

  if (f.kind === "cfb") {
    let cfb = null;
    try { cfb = openCfb(buf); } catch (e) { r.cfbError = e.message; }

    if (cfb && cfb.names.includes("EncryptedPackage")) {
      r.encrypted = true;
      r.kind = "encrypted-xlsx";
      r.label = "암호화된 OOXML (CFB 컨테이너)";
      r.note = "비밀번호로 잠긴 문서다. 사용자가 입력한 비밀번호로만 연다.";
      r.actionable = [
        "비밀번호를 입력받아 연다. 틀리면 우회·재시도 없이 '비밀번호가 틀렸다'고 알린다",
        "비밀번호를 모르면 카드사에서 암호화 없는 CSV 로 받거나, 엑셀에서 열어 암호화 없이 다시 저장한다",
      ];
      return r;
    }

    // 암호화 표시가 없으면 구형 바이너리 .xls 가능성이 높다
    r.kind = "xls";
    r.label = "구형 바이너리 Excel (.xls, CFB 컨테이너)";
    r.note = "이 도구는 아직 .xls 레코드(BIFF)를 읽지 못한다.";
    r.actionable = [
      "엑셀에서 xlsx 또는 CSV로 다시 저장한다",
      "구현이 필요하면 SheetJS 또는 Apache POI(HSSF)를 쓴다",
    ];
    return r;
  }

  if (CSV_LABELS[f.kind]) {
    r.kind = "csv";
    r.label = CSV_LABELS[f.kind];
    return r;
  }

  r.kind = "unknown";
  r.label = "알 수 없는 형식 (매직 바이트 " + hex(buf.subarray(0, 8)) + ")";
  r.note = "엑셀 파일이 아닌 것으로 보인다.";
  r.actionable = ["카드사에서 다시 다운로드하거나, 엑셀에서 xlsx/CSV 로 저장한다"];
  return r;
}
