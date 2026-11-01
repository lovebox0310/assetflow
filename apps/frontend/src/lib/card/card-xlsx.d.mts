import type { Uint8ArrayLike } from "./container-types";

/**
 * 평문 xlsx(zip)를 시트별 CSV 후보로 바꾼다.
 * 암호화 CFB 는 이 모듈에 오지 않는다 — detect-card 의 컨테이너 판별을 먼저 탄다.
 */
export declare function sheetCsvCandidates(
  bytes: Uint8ArrayLike,
): Promise<Array<{ name: string; csv: string }>>;
