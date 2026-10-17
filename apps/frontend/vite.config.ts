import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Issue 7 FE-BE 연동: 개발 서버가 /api/* 를 백엔드(8080)로 넘겨 CORS 없이
  // 같은 출처처럼 쓴다. 배포 환경에서는 리버스 프록시가 같은 역할을 해야 한다
  // (알려진 연동 이슈 목록에 기록).
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
