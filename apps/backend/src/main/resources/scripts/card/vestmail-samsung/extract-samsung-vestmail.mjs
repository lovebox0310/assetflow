/**
 * 삼성카드 VestMail 이메일 명세서에서 거래 내역을 추출한다 (§68).
 *
 * 사용법:
 *   node extract-samsung-vestmail.mjs <input.html> --contract=<card-columns.json> [--password=...]
 *
 * 비밀번호는 --password 또는 SAMSUNG_VESTMAIL_PASSWORD 환경변수로만 받는다.
 * 틀린 비밀번호로 재시도하지 않는다 — 벤더 스크립트가 띄우는 알림을 그대로
 * 실패로 보고 즉시 종료한다(§29.5.1 암호화 파일 정책).
 *
 * 삼성카드 VestMail 은 외부 ActiveX 없이 HTML 안의 순수 JS 로 복호화된다.
 * 복호화가 끝나면 document.write() 로 문서 전체가 교체되므로 #decForm 이
 * 사라지는 것을 완료 신호로 쓴다.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { extractSamsungRows } from "./samsung-table.mjs";

const args = process.argv.slice(2);
const inputFile = args.find((a) => !a.startsWith("--"));
const arg = (name) => {
  const found = args.find((a) => a.startsWith("--" + name + "="));
  return found ? found.slice(name.length + 3) : null;
};

const password = arg("password") || process.env.SAMSUNG_VESTMAIL_PASSWORD;
// 개발 환경 기본값: 저장소의 단일 계약 파일. 운영은 Java 가 --contract 로
// classpath 에서 뽑아낸 파일 경로를 반드시 넘긴다(복사본을 두지 않는다).
const defaultContract = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../../../../samples/card/card-columns.json",
);
const contractPath = arg("contract") || defaultContract;

if (!inputFile || !password) {
  console.error("Usage: node extract-samsung-vestmail.mjs <input.html> --contract=<path> [--password=...]");
  process.exit(1);
}

let contract;
try {
  contract = JSON.parse(readFileSync(contractPath, "utf-8"));
} catch (e) {
  console.error("카드 컬럼 계약을 읽지 못했습니다: " + contractPath + " — " + e.message);
  process.exit(1);
}
const profile = contract.companies && contract.companies.samsungcard;
if (!profile || !Array.isArray(profile.columns)) {
  console.error("card-columns.json 에 companies.samsungcard.columns 가 없습니다.");
  process.exit(1);
}
const normalize = (v) => String(v).replace(/\s+/g, "").toLowerCase();
const mapping = {};
for (const column of profile.columns) {
  if (column.mapsTo) mapping[normalize(column.name)] = column.mapsTo;
}
const required = ["approvedAt", "merchantName", "grossAmount"];
if (!required.every((f) => Object.values(mapping).includes(f))) {
  console.error("카드 컬럼 계약에 필수 매핑이 없습니다: " + required.join(", "));
  process.exit(1);
}

const inputPath = resolve(inputFile);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: "ko-KR" });
const page = await context.newPage();
let dialogMessage = null;
page.on("dialog", async (dialog) => {
  dialogMessage = dialog.message();
  await dialog.dismiss();
});

try {
  await page.goto("file://" + inputPath, { waitUntil: "load" });
  if (await page.locator("#decForm").count() === 0) {
    throw new Error("삼성카드 VestMail 복호화 폼(#decForm)이 없습니다 — 다른 형식의 파일인지 확인하세요.");
  }

  await page.locator("#password").fill(password);
  await page.locator("#confirm").click();

  // 청크마다 setTimeout(10ms) 이 걸려 있어 바로 끝나지 않는다. 완료 신호는
  // document.write() 로 인한 #decForm 소멸, 실패 신호는 벤더 alert 이다.
  let decrypted = false;
  for (let i = 0; i < 100; i++) {
    if (dialogMessage) break;
    decrypted = await page.evaluate(() => !document.getElementById("decForm"));
    if (decrypted) break;
    await page.waitForTimeout(200);
  }
  if (dialogMessage) {
    throw new Error("VestMail 복호화 실패: " + dialogMessage);
  }
  if (!decrypted) {
    throw new Error("VestMail 복호화가 시간 안에 끝나지 않았습니다.");
  }

  const rows = await page.evaluate(extractSamsungRows, mapping);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("복호화된 문서에서 거래 행을 찾지 못했습니다.");
  }

  const output = {
    source: "samsungcard-email",
    extractedAt: new Date().toISOString(),
    count: rows.length,
    rows,
  };
  writeFileSync(inputPath.replace(/\.html$/i, "_extracted.json"), JSON.stringify(output, null, 2), "utf-8");
  console.log(JSON.stringify(output));
} catch (err) {
  console.error("Extract failed:", err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
