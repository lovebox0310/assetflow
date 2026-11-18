/**
 * 기관명 판정 단일 출처.
 *
 * 기관명은 자산 화면에서 **자유 입력**이다(AssetsPage §54). 그래서 같은 증권사를
 * 사용자가 `한국투자`, `한국투자증권`, `한국투자 증권` 어느 쪽으로 적어도 KIS 전용
 * 동작(연결 설정·잔고 동기화·채권 진단·연금 진단·동기화 해제)이 보여야 한다.
 * 반면 `한국투자저축은행`·`한국투자파트너스` 는 이름만 겹치는 **다른 법인**이라
 * 부분 문자열로 잡으면 안 된다 — 그래서 값은 항상 "정확히 일치"로만 본다.
 */

/** 앞뒤 공백 제거 + 내부 연속 공백(NBSP·전각 공백 포함)을 1칸으로 접는다. */
function normalizeInstitutionName(name: string | null | undefined): string {
  if (typeof name !== "string") return "";
  return name.trim().replace(/\s+/g, " ");
}

/**
 * KIS 로 인정하는 기관명. 띄어쓰기를 지운 형태로 비교하므로 `한국투자 증권` 도
 * `한국투자증권` 과 같은 값이 된다(같은 증권사, 다른 표기일 뿐).
 */
const KIS_INSTITUTION_KEYS: ReadonlySet<string> = new Set(["한국투자", "한국투자증권"]);

/**
 * 기관명 표기 흔들림을 흡수한다. 정확히 한국투자/한국투자증권만 KIS 로 본다.
 * `null`·`undefined`·빈 문자열·공백만 있는 값은 false.
 */
export function isKisInstitution(name: string | null | undefined): boolean {
  const normalized = normalizeInstitutionName(name);
  if (!normalized) return false;
  return KIS_INSTITUTION_KEYS.has(normalized.replace(/\s+/g, ""));
}
