import type { ThemeConfig } from "antd";

/** §28.2 구조 토큰 — 전 화면 공통. 하드코딩 색상 대신 이 값과 antd 토을 참조한다. */
export const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

export const SPACE = { s1: 4, s2: 8, s3: 12, s4: 16, s6: 24, s8: 32, s12: 48 } as const;

export const CONTAINER_MAX_WIDTH = 1200;
export const GUTTER = { mobile: SPACE.s4, desktop: SPACE.s6 } as const;

/** §28.2 antd 기본 분할: xs<576 / sm>=576 / md>=768 / lg>=992 / xl>=1200 */
export const afTheme: ThemeConfig = {
  token: {
    fontFamily: FONT_FAMILY,
    colorSuccess: "#52c41a",
    colorWarning: "#faad14",
    colorError: "#ff4d4f",
  },
};
