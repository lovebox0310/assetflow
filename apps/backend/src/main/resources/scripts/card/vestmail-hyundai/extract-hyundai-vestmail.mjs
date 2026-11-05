/**
 * 현대카드 VestMail 이메일 명세서에서 거래 내역을 추출한다.
 *
 * 사용법:
 *   node extract-hyundai.mjs <input.html> [--password=...] [--year=2026]
 *
 * 주의: 비밀번호는 환경변수 HYUNDAI_VESTMAIL_PASSWORD 또는 --password 로 전달.
 *       코드나 로그에 평문으로 남기지 않는다.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const args = process.argv.slice(2);
const inputFile = args.find((a) => !a.startsWith("--"));
const passwordArg = args.find((a) => a.startsWith("--password="));
const yearArg = args.find((a) => a.startsWith("--year="));

if (!inputFile) {
  console.error("Usage: node extract-hyundai.mjs <input.html> [--password=...] [--year=YYYY]");
  process.exit(1);
}

let password = passwordArg ? passwordArg.split("=")[1] : process.env.HYUNDAI_VESTMAIL_PASSWORD;
const year = yearArg ? yearArg.split("=")[1] : new Date().getFullYear().toString();

if (!password) {
  // 대화형 입력
  const { createInterface } = await import("readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await new Promise((resolve) => {
    rl.question("VestMail password: ", (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const inputPath = resolve(inputFile);
const fileUrl = "file://" + inputPath;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: "ko-KR" });
const page = await context.newPage();

try {
  await page.goto(fileUrl, { waitUntil: "networkidle" });

  // VestMail 복호화
  await page.locator('input[name="p2_temp"]').click();
  await page.locator('input#password').fill(password);
  await page.locator('input[alt="보안메일 확인"]').first().click();

  // 복호화 애니메이션 대기
  await page.waitForTimeout(3000);

  // 거래 내역 테이블은 복호화 후 21개 테이블 중 마지막 몇 개 중 하나
  // 안정성을 위해 "이용일" 헤더를 가진 테이블을 동적으로 찾는다.
  const rows = await page.evaluate((targetYear) => {
    const tables = Array.from(document.querySelectorAll("table"));
    const targetTable = tables.find((t) => {
      const headerText = t.innerText.replace(/\s+/g, "");
      return headerText.includes("이용일") && headerText.includes("이용가맹점");
    });

    if (!targetTable) return [];

    const trs = Array.from(targetTable.querySelectorAll("tr")).slice(1); // skip header
    const results = [];
    for (const tr of trs) {
      const cells = Array.from(tr.querySelectorAll("td, th")).map((c) => c.innerText.trim());
      // 현대카드 명세서: 컬럼 사이에 빈 td가 삽입되어 있어 짝수 인덱스가 실제 데이터
      const data = cells.filter((_, i) => i % 2 === 0);
      if (data.length < 7) continue;

      const [rawDate, cardType, merchant, rawAmount, installment] = data;
      if (!rawDate || !merchant || !rawAmount) continue;
      if (!/^\d{1,2}\.\d{1,2}$/.test(rawDate)) continue;

      // 이용일은 MM.DD 형식. 연도는 명세서 헤더에서 가져온다.
      const [month, day] = rawDate.split(".");
      const approvedAt = `${targetYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

      const amount = parseInt(rawAmount.replace(/[^0-9-]/g, ""), 10);
      if (Number.isNaN(amount)) continue;

      results.push({
        approvedAt,
        merchantName: merchant,
        grossAmount: amount,
        vat: 0,
        supplyExVat: amount,
        installmentCount: parseInt(installment || "0", 10) || 0,
        cardMasked: cardType || undefined,
        approvalNo: undefined,
      });
    }
    return results;
  }, year);

  const output = {
    source: "hyundaicard-email",
    extractedAt: new Date().toISOString(),
    count: rows.length,
    rows,
  };

  const outPath = inputPath.replace(/\.html$/i, "_extracted.json");
  writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(JSON.stringify(output, null, 2));
} catch (err) {
  console.error("Extract failed:", err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
