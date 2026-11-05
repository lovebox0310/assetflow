/**
 * 삼성카드 복호화 DOM → 거래 행 추출 회귀 테스트.
 *
 * 실제 명세서에는 개인정보가 있으므로 익명화 픽스처만 쓴다. Playwright 로
 * 픽스처를 setContent 한 뒤, 운영과 같은 `extractSamsungRows` 를 evaluate 한다.
 * npm install 후 `npm test` 로 실행한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { extractSamsungRows } from "./samsung-table.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(resolve(here, "fixtures/decrypted-anon.html"), "utf-8");
const contract = JSON.parse(readFileSync(
  resolve(here, "../../../../../../../../samples/card/card-columns.json"), "utf-8"));

const normalize = (v) => String(v).replace(/\s+/g, "").toLowerCase();
const mapping = {};
for (const column of contract.companies.samsungcard.columns) {
  if (column.mapsTo) mapping[normalize(column.name)] = column.mapsTo;
}

test("중첩 표에서도 거래 행만 정확히 뽑는다", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext({ locale: "ko-KR" })).newPage();
    await page.setContent(fixture);
    const rows = await page.evaluate(extractSamsungRows, mapping);

    assert.equal(rows.length, 3, "합계·안내·컨테이너 행은 걸러져야 한다");
    assert.deepEqual(rows[0], {
      approvedAt: "2026-10-06",
      merchantName: "합성카페",
      grossAmount: 11000,
      vat: 1000,
      supplyExVat: 10000,
      cardMasked: "9420-00**-****-0001",
      approvalNo: "90000001",
      businessNo: "9999999901",
      businessCategory: "가공식품",
      memberRelation: "본인",
    });
    assert.equal(rows[1].memberRelation, "가족");
    assert.equal(rows[1].businessNo, "9999999902");
    // 음수 금액(취소)도 그대로 보존한다.
    assert.equal(rows[2].grossAmount, -600);
    assert.equal(rows[2].vat, 0);
    assert.equal(rows[2].supplyExVat, -600);
  } finally {
    await browser.close();
  }
});

test("헤더가 없으면 조용히 0건이 아니라 예외를 던진다", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext()).newPage();
    await page.setContent("<html><body><table><tr><td>아무것도 없음</td></tr></table></body></html>");
    await assert.rejects(
      () => page.evaluate(extractSamsungRows, mapping),
      /헤더를 찾지 못했습니다/,
    );
  } finally {
    await browser.close();
  }
});
