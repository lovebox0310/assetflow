import { readFileSync, writeFileSync } from "node:fs";
const s = readFileSync("D:/study/assetflow/design/prototype/assets.html", "utf8");
const old = /<button type="button" class="btn" id="addLiab">[^<]*<\/button>/;
if (old.test(s)) {
  const fixed = s.replace(old, '<button type="button" class="btn" id="addLiab">항목 추가</button>');
  writeFileSync("D:/study/assetflow/design/prototype/assets.html", fixed, "utf8");
  console.log("fixed");
} else {
  console.log("no match");
}
