/**
 * §28.3 통화·숫자 포맷 단일 출처. Intl 내장만 사용(신규 의존성 없음).
 * 규칙:
 *  - 축약 경계: 1억 이상 "X.X억", 1만 이상 "X.X만", 미만은 정수 원 표기
 *  - 카드 대용량 금액은 축약, 상세 금액은 천단위 + "원"
 *  - 월 수지는 부호 포함
 *  - 개월·비율은 소수점 1자리
 */

const nf0 = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
// 축약 단위는 천단위 구분자 없는 X.X 형식 (§28.3 예시: 3800.0만)
const nf1 = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: false,
});

/** 절댓값 기준 축약 표기. 부호는 유지한다. (1.4억 / 3800.0만 / 7,160,000원) */
export function formatKrwAbbr(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${sign}${nf1.format(abs / 100_000_000)}억`;
  if (abs >= 10_000) return `${sign}${nf1.format(abs / 10_000)}만`;
  return `${sign}${nf0.format(abs)}원`;
}

/** 상세 금액: 통화 기호 없이 천단위 + 원, 소수점 0자리 (142,850,000원) */
export function formatKrwExact(value: number): string {
  return `${nf0.format(value)}원`;
}

/** 월 수지 등 부호 필수 자리: +1,240,000원 / -1,240,000원 / 0원 */
export function formatSignedKrw(value: number): string {
  if (value > 0) return `+${nf0.format(value)}원`;
  return `${nf0.format(value)}원`;
}

/** 비상금 유지 개월: 소수점 2자리, 반올림 없이 버림 (§59). 분모가 0 이하면 계산 불가 → null */
export function formatMonths(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const truncated = Math.trunc(value * 100) / 100;
  return `${truncated.toFixed(2)}개월`;
}

/** 구성비: 소수점 1자리 (32.0%) */
export function formatPercent(value: number): string {
  return `${nf1.format(value)}%`;
}
