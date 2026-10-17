import { describe, expect, it } from "vitest";
import {
  formatKrwAbbr,
  formatKrwExact,
  formatMonths,
  formatPercent,
  formatSignedKrw,
} from "./formatters";

// §28.3 의 예시 값과 경계를 그대로 계약으로 박는다.
describe("formatters (§28.3)", () => {
  it("1억 이상은 X.X억 축약", () => {
    expect(formatKrwAbbr(142_850_000)).toBe("1.4억");
  });

  it("1만 이상 1억 미만은 X.X만 축약", () => {
    expect(formatKrwAbbr(38_000_000)).toBe("3800.0만");
  });

  it("1만 미만은 정수 원 표기", () => {
    expect(formatKrwAbbr(9_999)).toBe("9,999원");
    expect(formatKrwAbbr(1_220)).toBe("1,220원");
  });

  it("축약도 음수 부호는 유지", () => {
    expect(formatKrwAbbr(-150_000_000)).toBe("-1.5억");
  });

  it("상세 금액은 천단위 + 원", () => {
    expect(formatKrwExact(142_850_000)).toBe("142,850,000원");
  });

  it("월 수지는 부호 포함", () => {
    expect(formatSignedKrw(1_240_000)).toBe("+1,240,000원");
    expect(formatSignedKrw(-1_240_000)).toBe("-1,240,000원");
    expect(formatSignedKrw(0)).toBe("0원");
  });

  it("개월 표시는 소수점 1자리, 계산 불가와 빈 값", () => {
    expect(formatMonths(7.24)).toBe("7.2개월");
    expect(formatMonths(null)).toBe("—");
    expect(formatMonths(Infinity)).toBe("—");
  });

  it("비율은 소수점 1자리", () => {
    expect(formatPercent(32)).toBe("32.0%");
  });
});
