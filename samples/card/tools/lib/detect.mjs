// 파일 형식을 확장자가 아니라 내용(매직 바이트)으로 판별한다.
//
// 실제로 삼성카드가 .xlsx 확장자로 암호화 파일을 준 적이 있다.
// 확장자를 믿으면 "zip 이 아니다" 같은 무의미한 오류만 나오고 원인을 알 수 없다.

import { readFileSync } from "node:fs";

const hex = (b) => Buffer.from(b).toString("hex");
const isZip = (buf) => ["504b0304", "504b0506", "504b0708"].includes(hex(buf.subarray(0, 4)));
const isCfb = (buf) => hex(buf.subarray(0, 8)) === "d0cf11e0a1b11ae1";

/**
 * CFB(Compound File Binary) 컨테이너를 연다.
 * 구형 .xls 와 암호화된 OOXML 이 둘 다 이 컨테이너를 쓴다.
 * 순수 JS 구현이므로 외부 의존성이 없다.
 */
function openCfb(buf) {
  if (!isCfb(buf)) throw new Error("CFB 시그니처 없음");

  const sectorSize = 1 << buf.readUInt16LE(0x1e);
  const miniSize = 1 << buf.readUInt16LE(0x20);
  const miniCutoff = buf.readUInt32LE(0x38);
  const numDifat = buf.readUInt32LE(0x48);

  // DIFAT: 헤더에 109개, 나머지는 DIFAT 섹터에 연결되어 있다
  const difat = [];
  for (let i = 0; i < 109; i++) {
    const v = buf.readUInt32LE(0x4c + i * 4);
    if (v === 0xffffffff) break;
    difat.push(v);
  }
  let ds = buf.readUInt32LE(0x44);
  for (let k = 0; k < numDifat && ds !== 0xfffffffe && ds !== 0xffffffff; k++) {
    const off = 512 + ds * sectorSize;
    const per = sectorSize / 4 - 1;
    for (let i = 0; i < per; i++) {
      const v = buf.readUInt32LE(off + i * 4);
      if (v === 0xffffffff) break;
      difat.push(v);
    }
    ds = buf.readUInt32LE(off + per * 4);
  }

  // FAT: 섹터 할당 체인
  const FAT = [];
  for (const s of difat) {
    const off = 512 + s * sectorSize;
    for (let i = 0; i < sectorSize / 4; i++) FAT.push(buf.readUInt32LE(off + i * 4));
  }
  const chain = (st) => {
    const out = [];
    let s = st, guard = 0;
    while (s !== 0xfffffffe && s !== 0xffffffff && s < FAT.length && guard++ < 1e5) { out.push(s); s = FAT[s]; }
    return out;
  };
  const readChain = (st, size) => {
    const all = Buffer.concat(chain(st).map((s) => buf.subarray(512 + s * sectorSize, 512 + (s + 1) * sectorSize)));
    return size === undefined ? all : all.subarray(0, size);
  };

  // 디렉터리 엔트리
  const dirBytes = readChain(buf.readUInt32LE(0x30));
  const entries = [];
  for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
    const type = dirBytes[o + 0x42];
    if (type === 0) continue;
    const nl = dirBytes.readUInt16LE(o + 0x40);
    entries.push({
      name: dirBytes.subarray(o, o + Math.max(0, nl - 2)).toString("utf16le"),
      type,
      start: dirBytes.readUInt32LE(o + 0x74),
      size: Number(dirBytes.readBigUInt64LE(o + 0x78)),
    });
  }

  // 작은 스트림은 루트 스트림 안의 미니 FAT 로 관리된다
  const root = entries.find((e) => e.type === 5);
  let miniStream = null, MFAT = null;
  if (root) {
    miniStream = readChain(root.start, root.size);
    const mf = readChain(buf.readUInt32LE(0x3c));
    MFAT = [];
    for (let i = 0; i < mf.length / 4; i++) MFAT.push(mf.readUInt32LE(i * 4));
  }
  const readMini = (st, size) => {
    const parts = [];
    let s = st, guard = 0;
    while (s !== 0xfffffffe && s !== 0xffffffff && s < MFAT.length && guard++ < 1e5) {
      parts.push(miniStream.subarray(s * miniSize, (s + 1) * miniSize));
      s = MFAT[s];
    }
    return Buffer.concat(parts).subarray(0, size);
  };

  return {
    entries,
    names: entries.map((e) => e.name),
    read(name) {
      const e = entries.find((x) => x.name === name);
      if (!e) return null;
      return e.size < miniCutoff ? readMini(e.start, e.size) : readChain(e.start, e.size);
    },
  };
}

/** ECMA-376 암호화 정보를 읽는다. 암호화되지 않은 파일이면 null */
function readEncryption(cfb) {
  const info = cfb.read("EncryptionInfo");
  if (!info || info.length < 8) return null;

  const major = info.readUInt16LE(0), minor = info.readUInt16LE(2);
  const out = { major, minor };

  if (major === 4 && minor === 4) {
    out.scheme = "agile";
    out.schemeLabel = "Agile Encryption (ECMA-376 4.4)";
    const xml = info.subarray(8).toString("utf8");

    // agile 은 val= 속성이 아니라 keyData 태그의 속성으로 정보를 담는다
    const tag = (name) => {
      const m = xml.match(new RegExp("<" + name + "\\b([^>]*)>"));
      return m ? m[1] : "";
    };
    const attr = (name, a) => {
      const m = name.match(new RegExp("\\b" + a + '="([^"]*)"'));
      return m ? m[1] : null;
    };
    // p: 가 붙은 버전과 안 붙은 버전이 모두 실제로 나온다
    const kd = tag("keyData") || tag("p:keyData") || "";
    const ek = tag("p:encryptedKey") || tag("encryptedKey") || "";

    out.saltSize = attr(kd, "saltSize");
    out.blockSize = attr(kd, "blockSize");
    out.keyBits = attr(kd, "keyBits");
    out.hashSize = attr(kd, "hashSize");
    out.cipher = attr(kd, "cipherAlgorithm");
    out.chaining = attr(kd, "cipherChaining");
    out.hash = attr(kd, "hashAlgorithm");
    out.spinCount = attr(ek, "spinCount");
    out.keySource = /keyEncryptor\/password/.test(xml) ? "password"
      : /keyEncryptor\/certificate/.test(xml) ? "certificate" : "unknown";
    out.hasIntegrity = /<dataIntegrity\b/.test(xml);
  } else if (major === 3 || major === 4) {
    out.scheme = "standard";
    out.schemeLabel = "Standard/Extensible Encryption (" + major + "." + minor + ")";
    const flags = info.readUInt32LE(4);
    out.encrypted = Boolean(flags & 0x100);
    out.keySource = "password";
  } else {
    out.scheme = "unknown";
    out.schemeLabel = "알 수 없는 암호화 (" + major + "." + minor + ")";
    out.keySource = "unknown";
  }
  return out;
}

/** 텍스트 계열로 보이는지 (CSV 판별용) */
function looksTextual(buf) {
  const n = Math.min(1024, buf.length);
  for (let i = 0; i < n; i++) {
    const c = buf[i];
    if (c === 9 || c === 10 || c === 13 || c >= 0x80) continue;
    if (c < 32 || c === 0x7f) return false;
  }
  return true;
}

/**
 * 확장자를 무시하고 실제 형식을 판별한다.
 * @returns {{kind:string,label:string,ext:string,size:number,encrypted:boolean,enc:object|null,note:string,actionable:string[]}}
 */
export function detect(path) {
  const buf = readFileSync(path);
  const dot = path.lastIndexOf(".");
  const ext = dot >= 0 ? path.slice(dot).toLowerCase() : "";
  const r = { ext, size: buf.length, encrypted: false, enc: null, note: "", actionable: [] };

  // 빈 파일은 어떤 형식 판별도 해낼 수 없다. 빈 CSV 로 통과시키면 안 된다
  if (buf.length === 0) {
    r.kind = "empty";
    r.label = "빈 파일 (0바이트)";
    r.note = "다운로드가 중단되었거나 빈 파일일 수 있다.";
    r.actionable = [
      "카드사에서 다시 다운로드한다",
      "엑셀에서 실제로 열리는지 먼저 확인한다",
    ];
    return r;
  }

  if (isZip(buf)) {
    r.kind = "xlsx";
    r.label = "xlsx (OOXML, 평문)";
    return r;
  }

  if (isCfb(buf)) {
    let cfb = null;
    try { cfb = openCfb(buf); } catch (e) { r.cfbError = e.message; }

    if (cfb && cfb.names.includes("EncryptedPackage")) {
      r.encrypted = true;
      r.kind = "encrypted-xlsx";
      try { r.enc = readEncryption(cfb); } catch { r.enc = null; }
      r.label = "암호화된 OOXML (CFB 컨테이너)";
      r.note = "비밀번호로 암호화되어 있어 내용을 읽을 수 없다.";
      r.actionable = [
        "엑셀에서 열고 '다른 이름으로 저장' → 암호화되지 않는 작업簿(.xlsx)로 저장한다",
        "또는 엑셀에서 CSV로 저장한다",
        "또는 카드사 사이트에서 암호화 없는 포맷으로 받는다",
      ];
      if (r.enc && r.enc.keySource === "password") {
        r.actionable.push("비밀번호를 브라우저에서 입력받아 해독하는 방식도 가능하지만 FE 구현이 추가된다");
      }
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

  if (hex(buf.subarray(0, 3)) === "efbbbf") { r.kind = "csv"; r.label = "CSV (UTF-8 BOM)"; return r; }
  if (hex(buf.subarray(0, 2)) === "fffe") { r.kind = "csv"; r.label = "CSV (UTF-16LE)"; return r; }
  if (hex(buf.subarray(0, 2)) === "feff") { r.kind = "csv"; r.label = "CSV (UTF-16BE)"; return r; }
  if (looksTextual(buf)) { r.kind = "csv"; r.label = "CSV (평문 텍스트로 보임)"; return r; }

  r.kind = "unknown";
  r.label = "알 수 없는 형식 (매직 바이트 " + hex(buf.subarray(0, 8)) + ")";
  r.note = "엑셀 파일이 아닌 것으로 보인다.";
  r.actionable = ["카드사에서 다시 다운로드하거나, 엑셀에서 xlsx/CSV 로 저장한다"];
  return r;
}

/** 사람이 읽을 한 줄 요약 */
export function describeEnc(enc) {
  if (!enc) return "암호화 정보를 읽지 못했다";
  const bits = [];
  if (enc.schemeLabel) bits.push(enc.schemeLabel);
  if (enc.keyBits && enc.cipher) bits.push(enc.cipher + "-" + enc.keyBits + (enc.chaining === "ChainingModeCBC" ? "-CBC" : ""));
  if (enc.hash) bits.push(enc.hash + (enc.spinCount ? " x" + enc.spinCount : ""));
  if (enc.keySource === "password") bits.push("비밀번호 필요");
  if (enc.hasIntegrity) bits.push("무결성 검증값 있음");
  return bits.join(" / ");
}
