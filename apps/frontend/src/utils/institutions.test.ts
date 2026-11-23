import { describe, expect, it } from "vitest";
import { isKisInstitution, isTossInstitution } from "./institutions";

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

// 이슈 #55 Stage 3 — 토스 메뉴는 토스증권 계좌에서만. 토스뱅크·토스페이먼츠는 다른 회사다.
describe("isTossInstitution (이슈 #55)", () => {
  it("'토스' 는 토스증권이다", () => {
    expect(isTossInstitution("토스")).toBe(true);
  });

  it("'토스증권' 은 토스증권이다", () => {
    expect(isTossInstitution("토스증권")).toBe(true);
  });

  it("앞뒤·가운데 공백은 무시한다", () => {
    expect(isTossInstitution("  토스 증권  ")).toBe(true);
  });

  it("'토스뱅크' 는 다른 회사라 아니다", () => {
    expect(isTossInstitution("토스뱅크")).toBe(false);
  });

  it("'토스페이먼츠' 는 다른 회사라 아니다", () => {
    expect(isTossInstitution("토스페이먼츠")).toBe(false);
  });

  it("'한국투자증권' 은 토스증권이 아니다", () => {
    expect(isTossInstitution("한국투자증권")).toBe(false);
  });

  it("빈 값은 토스증권이 아니다", () => {
    expect(isTossInstitution("")).toBe(false);
    expect(isTossInstitution("   ")).toBe(false);
    expect(isTossInstitution(null)).toBe(false);
    expect(isTossInstitution(undefined)).toBe(false);
  });
});
