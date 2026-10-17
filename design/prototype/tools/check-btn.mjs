import { readFileSync } from "node:fs";
const s = readFileSync("D:/study/assetflow/design/prototype/assets.html", "utf8");
const p = s.indexOf('addLiab');
if (p >= 0) {
  const start = s.lastIndexOf('>', p) + 1;
  const end = s.indexOf('</button>', p);
  if (start >= 0 && end >= start) {
    const btn = s.slice(start, end);
    console.log(JSON.stringify(btn));
    console.log(btn.length);
  }
}
