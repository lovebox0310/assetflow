import { readFileSync } from "node:fs";
const html = readFileSync("D:/study/assetflow/design/prototype/assets.html", "utf8");
const idx = html.indexOf('id="addLiab"');
if (idx >= 0) {
  const s = Math.max(0, idx - 220);
  const e = Math.min(html.length, idx + 90);
  process.stdout.write(html.slice(s, e));
}
