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
    try {
      decrypted = await page.evaluate(() => !document.getElementById("decForm"));
    } catch {
      // 복호화가 실제 사이트로 이동시키면 평가가 잠시 실패한다 — 다음 폴링에서 다시 본다.
      decrypted = false;
    }
    if (decrypted) break;
    await page.waitForTimeout(200);
  }
  if (dialogMessage) {
    throw new Error("VestMail 복호화 실패: " + dialogMessage);
  }
  if (!decrypted) {
    throw new Error("VestMail 복호화가 시간 안에 끝나지 않았습니다.");
  }

  // document.write() 로 문서가 교체되면 실행 컨텍스트가 한 번 더 파괴될 수 있다.
  // 정기 청구서 레이아웃에서 실제로 발생해, 평가를 재시도한다.
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(4000);
  const evaluateWithRetry = async (fn, arg) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await page.evaluate(fn, arg);
      } catch (err) {
        if (attempt >= 9) throw err;
        await page.waitForTimeout(1000);
      }
    }
  };

  let rows = [];
  try {
    rows = await evaluateWithRetry(extractSamsungRows, mapping);
  } catch (err) {
    // §72 정기 청구서('이용대금 명세서')는 12컬럼 거래 표가 없다 — 요약만 읽는다.
    if (!String(err && err.message).includes("거래 테이블 헤더")) {
      throw err;
    }
  }

  // §72 명세서 요약. 정기 청구서('이용대금 명세서')는 거래 표 대신 카드별 요약
  // 레이아웃이라 rows 가 비어 있다. 그때도 기간·총액은 읽어 월별 카드 금액에 쓴다.
  const summary = await evaluateWithRetry(() => {
    const text = document.body.innerText;
    const out = {};
    const total = text.match(/총\s*결제금액\s*([\d,]+)\s*원/);
    if (total) out.totalAmount = Number(total[1].replace(/[^0-9]/g, ""));
    // 26. 9. 3 ~ 26. 10. 2
    const dotted = text.match(/(\d{2,4})\.\s*(\d{1,2})\.\s*(\d{1,2})\s*~\s*(\d{2,4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
    if (dotted) {
      const year = (v) => (v.length === 2 ? 2000 + Number(v) : Number(v));
      out.periodStart = `${year(dotted[1])}-${String(dotted[2]).padStart(2, "0")}-${String(dotted[3]).padStart(2, "0")}`;
      out.periodEnd = `${year(dotted[4])}-${String(dotted[5]).padStart(2, "0")}-${String(dotted[6]).padStart(2, "0")}`;
    } else {
      // 2026-10-01 ~ 2026-10-10
      const iso = text.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
      if (iso) {
        out.periodStart = iso[1];
        out.periodEnd = iso[2];
      }
    }
    return out;
  });

  const hasRows = Array.isArray(rows) && rows.length > 0;
  if (!hasRows && !summary.totalAmount) {
    throw new Error("복호화된 문서에서 거래 행과 명세서 총액을 찾지 못했습니다.");
  }

  const output = {
    source: "samsungcard-email",
    extractedAt: new Date().toISOString(),
    kind: hasRows ? "detail" : "billing",
    count: hasRows ? rows.length : 0,
    summary,
    rows: hasRows ? rows : [],
  };
  writeFileSync(inputPath.replace(/\.html$/i, "_extracted.json"), JSON.stringify(output, null, 2), "utf-8");
  console.log(JSON.stringify(output));
} catch (err) {
  console.error("Extract failed:", err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
