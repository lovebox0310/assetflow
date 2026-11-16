import { useEffect, useState } from "react";

/**
 * A-03/A-10: `(min-width: Npx)` 미디어 쿼리 구독 — 패키지 추가 없이
 * `window.matchMedia` 만 쓴다(차트 눈금 라벨을 폭에 따라 바꾸는 용도).
 *
 * - `matchMedia` 가 없는 환경(SSR, jsdom 등)에서는 구독하지 않고 **기본값 false**
 *   (= 좁은 화면)를 돌려준다. 좁은 화면 쪽이 눈금을 전부 보여 주는 규칙이라
 *   어떤 환경에서도 문서 가로 넘침이 생기지 않는다.
 * - Safari 14 미만은 `addEventListener` 가 없어 `addListener` 로 폴백한다.
 */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const sync = () => setMatches(mql.matches);
    // 구독 전에 한 번 맞춘다 — 초기 렌더와 실제 뷰포트가 어긋날 수 있다.
    sync();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", sync);
      return () => mql.removeEventListener("change", sync);
    }
    mql.addListener(sync);
    return () => mql.removeListener(sync);
  }, [query]);

  return matches;
}
