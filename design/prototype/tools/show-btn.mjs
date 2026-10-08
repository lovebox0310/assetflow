import { readFileSync } from "node:fs";
const s = readFileSync("D:/study/assetflow/design/prototype/assets.html", "utf8");
const p = s.indexOf('id="addLiab"');
if (p >= 0) {
  console.log(s.slice(p - 10, p + 30));
}
