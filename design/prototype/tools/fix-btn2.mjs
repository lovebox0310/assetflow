import { readFileSync, writeFileSync } from "node:fs";
const s = readFileSync("D:/study/assetflow/design/prototype/assets.html", "utf8");
const p = s.indexOf('id="addLiab"');
if (p >= 0) {
  const e = s.indexOf("</button>", p);
  const st = s.lastIndexOf(">", p) + 1;
  if (e > st) {
    const ns = s.slice(0, st) + "항목 추가" + s.slice(e);
    writeFileSync("D:/study/assetflow/design/prototype/assets.html", ns, "utf8");
    console.log("ok");
  } else console.log("bad");
} else console.log("no");
