import { defineConfig, devices } from "@playwright/test";

/**
 * Assetflow frontend E2E 테스트 설정.
 * 
 * 2가지 모드 지원:
 * 1. 기능 테스트 (functional testing): 로그인, API 호출 등
 * 2. 디자인 검증 (visual regression testing): 스크린샷 비교, 레이아웃 검증
 * 
 * 환경변수:
 * - TEST_URL: 운영 환경 테스트용 (기본: http://localhost:5173)
 * - UPDATE_SNAPSHOTS=1: 스크린샷 베이스라인 업데이트
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html"]],
  use: {
    baseURL: process.env.TEST_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: true, // 자체 서명된 인증서 무시
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { 
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 }, // 1280x720 데스크톱
      },
    },
    {
      name: "chromium-tablet",
      use: {
        ...devices["iPad"],
        viewport: { width: 768, height: 1024 }, // 768x1024 태블릿
      },
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 393, height: 851 }, // 모바일 (유사 디바이스)
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: process.env.TEST_URL || "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
