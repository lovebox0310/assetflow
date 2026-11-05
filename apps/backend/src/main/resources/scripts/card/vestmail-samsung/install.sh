#!/bin/bash
# 삼성카드 VestMail 추출기 운영 설치 스크립트 (§68).
#
# Usage:
#   ./install.sh
#
# 필요 사항:
#   - Node.js 18+ (권장 20+)
#   - npm
#
# 현대카드 추출기와 Playwright Chromium 캐시(~/.cache/ms-playwright)를 공유하므로
# 브라우저 바이너리는 이미 있으면 다시 받지 않는다.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[vestmail-samsung] Node version: $(node --version)"
echo "[vestmail-samsung] npm version: $(npm --version)"

echo "[vestmail-samsung] Installing npm dependencies..."
npm install

echo "[vestmail-samsung] Installing Playwright Chromium browser..."
npx playwright install chromium

echo "[vestmail-samsung] Verifying browser launch..."
node --input-type=module <<'NODE'
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ locale: 'ko-KR' })).newPage();
await page.goto('about:blank');
await browser.close();
console.log('Browser launch OK');
NODE

echo "[vestmail-samsung] Installation completed."
echo "[vestmail-samsung] Run extraction with:"
echo "  SAMSUNG_VESTMAIL_PASSWORD=<password> node extract-samsung-vestmail.mjs <input.html> --contract=<card-columns.json>"
