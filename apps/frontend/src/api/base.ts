/**
 * 배포 환경의 API 출처. dev 는 상대경로(vite 프록시), 배포는
 * VITE_API_BASE_URL(예: https://assetflow-api.onrender.com)을 쓴다.
 * 끝에 슬래시가 있으면 정규화한다.
 */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

/** 상대 경로를 배포 출처로 연결한다. 빈 base면 그대로 상대 경로. */
export function apiUrl(path: string): string {
  return API_BASE + path;
}
