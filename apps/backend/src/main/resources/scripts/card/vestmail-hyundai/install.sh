#!/bin/bash
# 현대카드 VestMail 추출기 운영 설치 스크립트 (§63).
#
# Usage:
#   ./install.sh
#
# 필요 사항:
#   - Node.js 18+ (권장 20+)
#   - npm
#
# 이 스크립트는 다음을 수행한다:
#   1. npm install
#   2. Playwright Chromium 브라우저 다운로드
#   3. 추출기가 headless 로 실행 가능한지 간단히 확인

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[vestmail-hyundai] Node version: $(node --version)"
echo "[vestmail-hyundai] npm version: $(npm --version)"

echo "[vestmail-hyundai] Installing npm dependencies..."
npm install

echo "[vestmail-hyundai] Installing Playwright Chromium browser..."
npx playwright install chromium

echo "[vestmail-hyundai] Verifying browser launch..."
node --input-type=module <<'NODE'
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'ko-KR' });
const page = await context.newPage();
await page.goto('about:blank');
await browser.close();
console.log('Browser launch OK');
NODE

echo "[vestmail-hyundai] Installation completed."
echo "[vestmail-hyundai] Run extraction with:"
echo "  HYUNDAI_VESTMAIL_PASSWORD=<password> node extract-hyundai-vestmail.mjs <input.html> --year=2026"
