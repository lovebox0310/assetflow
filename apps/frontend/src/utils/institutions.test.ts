import { describe, expect, it } from "vitest";
import { isKisInstitution } from "./institutions";

// 기관명은 자유 입력이라 표기 흔들림이 곧 기능 소실이었다(이슈 #32).
// 같은 증권사의 다른 표기는 true, 이름만 겹치는 다른 법인은 false 로 박는다.
describe("isKisInstitution (이슈 #32)", () => {
  it("'한국투자' 는 KIS 다", () => {
    expect(isKisInstitution("한국투자")).toBe(true);
  });

  it("'한국투자증권' 은 KIS 다", () => {
    expect(isKisInstitution("한국투자증권")).toBe(true);
  });

  it("앞뒤 공백은 무시한다", () => {
    expect(isKisInstitution("  한국투자증권  ")).toBe(true);
  });

  it("가운데 띄어쓰기는 무시한다", () => {
    expect(isKisInstitution("한국투자 증권")).toBe(true);
  });

  it("NBSP·연속 공백도 1칸 접기로 흡수한다", () => {
    expect(isKisInstitution("한국투자\u00a0\u00a0증권")).toBe(true);
  });

  it("이름만 겹치는 다른 법인 '한국투자저축은행' 은 KIS 가 아니다", () => {
    expect(isKisInstitution("한국투자저축은행")).toBe(false);
  });

  it("이름만 겹치는 다른 법인 '한국투자파트너스' 는 KIS 가 아니다", () => {
    expect(isKisInstitution("한국투자파트너스")).toBe(false);
  });

  it("'업비트' 는 KIS 가 아니다", () => {
    expect(isKisInstitution("업비트")).toBe(false);
  });

  it("빈 값은 KIS 가 아니다", () => {
    expect(isKisInstitution("")).toBe(false);
    expect(isKisInstitution("   ")).toBe(false);
    expect(isKisInstitution(null)).toBe(false);
    expect(isKisInstitution(undefined)).toBe(false);
  });
});
