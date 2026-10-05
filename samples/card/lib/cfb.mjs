// CFB(Compound File Binary) 컨테이너 읽기 — 암호화 여부 탐지용.
//
// 구형 .xls 와 암호화된 OOXML 이 둘 다 이 컨테이너를 쓴다.
// 실제 삼성카드 파일은 .xlsx 확장자였지만 실제로는 이 컨테이너였다.
//
// 정책(사용자 결정): 암호화 파일은 사용자가 입력한 비밀번호로만 열고,
// 비밀번호가 맞지 않으면 우회·재시도 없이 실패를 알린다. 그래서 이 모듈은
// 암호 파라미터(salt·verifier·spinCount 등)를 읽지 않는다. 복호화 구현도 없다.
// 필요한 것은 "이 컨테이너가 암호화된 문서인가"를 판별하는 것뿐이다.
//
// 외부 의존성이 없다. 입력·출력은 전부 Uint8Array 다. Node 의 Buffer 는
// 쓰지 않는다 — 브라우저 번들에서 폴리필 문제를 만든다.

const SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export const isCfb = (buf) =>
  buf.length >= 8 && SIG.every((c, i) => buf[i] === c);

const dvOf = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
const u16 = (dv, off) => dv.getUint16(off, true);
const u32 = (dv, off) => dv.getUint32(off, true);

function concat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/**
 * CFB 컨테이너를 연다. 스트림 목록과 읽기만 제공한다.
 * @param {Uint8Array} buf
 * @returns {{entries:Array, names:Array, read:(name:string)=>Uint8Array|null}}
 */
export function openCfb(buf) {
  if (!isCfb(buf)) throw new Error("CFB 시그니처 없음");
  const dv = dvOf(buf);

  const sectorSize = 1 << u16(dv, 0x1e);
  const miniSize = 1 << u16(dv, 0x20);
  const miniCutoff = u32(dv, 0x38);
  const numDifat = u32(dv, 0x48);

  // FAT 섹터 위치: 헤더에 109개, 나머지는 DIFAT 섹터에 연결
  const difat = [];
  for (let i = 0; i < 109; i++) {
    const v = u32(dv, 0x4c + i * 4);
    if (v === 0xffffffff) break;
    difat.push(v);
  }
  let ds = u32(dv, 0x44);
  for (let k = 0; k < numDifat && ds !== 0xfffffffe && ds !== 0xffffffff; k++) {
    const off = 512 + ds * sectorSize;
    const per = sectorSize / 4 - 1;
    for (let i = 0; i < per; i++) {
      const v = u32(dv, off + i * 4);
      if (v === 0xffffffff) break;
      difat.push(v);
    }
    ds = u32(dv, off + per * 4);
  }

  // 섹터 할당 체인
  const FAT = [];
  for (const s of difat) {
    const off = 512 + s * sectorSize;
    for (let i = 0; i < sectorSize / 4; i++) FAT.push(u32(dv, off + i * 4));
  }
  const chain = (st) => {
    const out = [];
    let s = st, guard = 0;
    while (s !== 0xfffffffe && s !== 0xffffffff && s < FAT.length && guard++ < 1e5) { out.push(s); s = FAT[s]; }
    return out;
  };
  const readChain = (st, size) => {
    const all = concat(chain(st).map((s) => buf.subarray(512 + s * sectorSize, 512 + (s + 1) * sectorSize)));
    return size === undefined ? all : all.subarray(0, size);
  };

  // 디렉터리 엔트리
  const dirBytes = readChain(u32(dv, 0x30));
  const dirDv = dvOf(dirBytes);
  const utf16 = new TextDecoder("utf-16le");
  const entries = [];
  for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
    const type = dirBytes[o + 0x42];
    if (type === 0) continue;
    const nl = u16(dirDv, o + 0x40);
    entries.push({
      name: utf16.decode(dirBytes.subarray(o, o + Math.max(0, nl - 2))),
      type,
      start: u32(dirDv, o + 0x74),
      // size 는 64비트지만 실제 파일은 32비트 범위다. Number 로 합친다.
      size: u32(dirDv, o + 0x78) + u32(dirDv, o + 0x7c) * 0x100000000,
    });
  }

  // 작은 스트림은 루트 스트림 안의 미니 FAT 로 관리된다
  const root = entries.find((e) => e.type === 5);
  let miniStream = null, MFAT = null;
  if (root) {
    miniStream = readChain(root.start, root.size);
    const mf = readChain(u32(dv, 0x3c));
    const mfDv = dvOf(mf);
    MFAT = [];
    for (let i = 0; i < mf.length / 4; i++) MFAT.push(u32(mfDv, i * 4));
  }
  const readMini = (st, size) => {
    const parts = [];
    let s = st, guard = 0;
    while (s !== 0xfffffffe && s !== 0xffffffff && s < MFAT.length && guard++ < 1e5) {
      parts.push(miniStream.subarray(s * miniSize, (s + 1) * miniSize));
      s = MFAT[s];
    }
    return concat(parts).subarray(0, size);
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
