/**
 * 월(YYYY-MM) 계산 단일 출처.
 * - 지출·카드내역 화면이 같은 월 목록과 이전 달 규칙을 쓴다.
 */

/** 현재 월 (YYYY-MM). */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** 최근 N개월 (이번 달 포함, 최신 순). 과거 36개월이면 2025년 전체 카드 원장을 고를 수 있다. */
export function recentMonths(count = 36, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** 한 달 전 (YYYY-MM). */
export function previousMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * endMonth 로 끝나는 N개월(양끝 포함, 오래된 달 → 최신 달).
 * §59 비상금 평균 창: 당월을 빼려면 endMonth = previousMonth(currentMonth()).
 * 잘못된 입력은 빈 배열 — 없는 달을 0으로 메우지 않는다.
 */
export function monthsEndingAt(endMonth: string, count: number): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth) || !Number.isInteger(count) || count < 1) {
    return [];
  }
  let year = Number(endMonth.slice(0, 4));
  let month = Number(endMonth.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    out.unshift(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }
  return out;
}
