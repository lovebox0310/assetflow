/**
 * 이슈 #72: 라우터 의존성 없이 해시로 화면 상태를 URL 에 남긴다.
 * - 배포가 정적 호스팅(Vercel/로컬)이므로 `/assets` 같은 경로는 서버 rewrite 설정이
 *   필요하다. `#/assets` 는 rewrite 없이 동작하고, 새로고침·딥링크·뒤로가기가 모두 산다.
 * - 알 수 없는 해시는 대시보드로 떨어뜨린다(§21 보호 라우트의 기본 화면과 동일).
 */
export type AppPage = "dashboard" | "assets" | "expenses" | "settings";

export const PAGE_PATHS: Record<AppPage, string> = {
  dashboard: "#/",
  assets: "#/assets",
  expenses: "#/expenses",
  settings: "#/settings",
};

/** 화면 제목 — 탭 제목과 뒤로가기 히스토리를 식별 가능하게 한다 (#72). */
export const PAGE_TITLES: Record<AppPage, string> = {
  dashboard: "대시보드 · AssetFlow",
  assets: "자산 · AssetFlow",
  expenses: "지출 · AssetFlow",
  settings: "설정 · AssetFlow",
};

/** 로그인 화면 제목. 미인증 상태의 탭 제목으로 쓴다. */
export const LOGIN_TITLE = "로그인 · AssetFlow";

function normalize(raw: string): string {
  const withoutHash = raw.replace(/^#/, "");
  const withoutTrailingSlash = withoutHash.replace(/\/+$/, "");
  return withoutTrailingSlash.toLowerCase();
}

/** 해시 문자열(`#/assets` 등) → 화면. 빈 값·미지의 경로는 대시보드. */
export function pageFromHash(hash: string): AppPage {
  const normalized = normalize(hash);
  if (normalized === "") return "dashboard";
  const found = (Object.keys(PAGE_PATHS) as AppPage[]).find(
    (page) => normalize(PAGE_PATHS[page]) === normalized,
  );
  return found ?? "dashboard";
}

/** 화면 → 해시 경로. `history.pushState` 에 그대로 넘긴다. */
export function pathForPage(page: AppPage): string {
  return PAGE_PATHS[page];
}
