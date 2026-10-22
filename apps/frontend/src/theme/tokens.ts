import type { ThemeConfig } from "antd";

/**
 * §28.2 / §28.4 — FE 디자인 토큰 모듈.
 *
 * 이 파일이 **앱의 원시 색상값(hex/rgba) 정식 보유처**다 (§28.4 개정, D4).
 * 라이트/다크 2세트를 한 곳에 모으고 `createAfTheme(mode)` 로 antd 6 토큰에 옮긴다.
 * 다른 모듈(app.css 포함)은 antd 토큰 또는 `--af-*` CSS 변수만 참조한다.
 *
 * - 구조 토큰(§28.2): FONT_FAMILY / SPACE / CONTAINER_MAX_WIDTH / GUTTER — 값 유지.
 * - 색상 토큰: 아래 AF_COLORS (라이트/다크 2세트).
 * - CSS 변수: AF_CSS_VAR_MAP 으로 `--af-*` 를 만들어 `applyAfCssVars()` 가 주입한다.
 *   CSS 에 hex 를 다시 적지 않으려면 값의 단일 보유처가 되어야 한다 (§28.4).
 */

/** §28.2 구조 토큰 — 전 화면 공통. 하드코딩 색상 대신 이 값과 antd 토큰을 참조한다. */
export const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

/**
 * D5 — 모노 스택. **숫자·코드에만** 쓴다.
 * 라벨 등 한국어 텍스트에는 쓰지 않는다(한글 글리프가 없으면 다른 폰트로 떨어져 깨진다).
 * D5: Geist 웹폰트는 비용 제약(§12) 때문에 도입하지 않고 시스템 스택을 쓴다.
 */
export const MONO_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

export const SPACE = { s1: 4, s2: 8, s3: 12, s4: 16, s6: 24, s8: 32, s12: 48 } as const;

export const CONTAINER_MAX_WIDTH = 1200;
export const GUTTER = { mobile: SPACE.s4, desktop: SPACE.s6 } as const;

/** 테마 모드 — 라이트/다크 2상태 (D1). "system" 해석은 themeStore 가 담당한다. */
export type ResolvedTheme = "light" | "dark";

type ModeColors = { readonly light: string; readonly dark: string };

/**
 * 잉크 팔레트 — fieldrank.run 실측 추출값을 라이트/다크 2세트로 상수화.
 *
 * 대비 조정 (§28.5 WCAG 2.1 AA, D2) — 원본값 → 조정값과 근거.
 * 수치는 WCAG 상대휘도 공식으로 직접 계산한 값이다 — 대조 표면을 함께 적는다.
 * | 토큰 | 원본 | 조정 | 근거(대비) |
 * |---|---|---|---|
 * | destructive(라이트) | #e40014 | #d4000f | 배경 #f1efea 위 4.24:1 → 4.80:1 (본문 4.5:1) |
 * | slate(라이트) | #4b6fae | #3f5e96 | 배경 위 4.37:1 → 5.62:1 · slate-soft #d8e3f6 위 3.88:1 → 4.99:1 |
 * | grove(라이트) | #5f8f5a | #487241 | 카드 #faf9f6 위 3.59:1 → 5.31:1 (성공 텍스트) |
 * | ring/borderStrong(라이트) | #aba69c | #807b71 | 카드 위 2.30:1 → 4.00:1 · secondary #e9e6df 위 3.38:1 (UI 3:1) |
 * | ring/borderStrong(다크) | #66625a | #7d786f | 카드 #1f1e1b 위 2.75:1 → 3.80:1 · secondary #292825 위 3.36:1 (UI 3:1) |
 * | textTertiary/Quaternary(라이트) | — | #6b675e | 3단계 텍스트 모두 4.5:1 유지 |
 * | textTertiary/Quaternary(다크) | #8f8a80 | #969186 | elevated #262523 위 4.46:1 → 4.88:1 · secondary 위 4.29:1 → 4.70:1 (본문 4.5:1) |
 * | textPlaceholder(다크) | #8f8a80 | #969186 | 같은 값(antd 도 placeholder 를 4단계 텍스트에서 가져온다) |
 *
 * `colorPrimaryBorder` 도 같은 값(#807b71 / #7d786f)이다 —
 * antd 6 의 Button 포커스 링은 `controlOutline` 이 아니라 `colorPrimaryBorder` 를 쓴다
 * (node_modules/antd/es/style/index.js `genFocusOutline` → `outline: solid ${token.colorPrimaryBorder}`).
 * 여기서 3:1 을 못 맞추면 Button 포커스 링이 §28.5 를 위반한다.
 *
 * 남은 예외(§28.6 잔여 위험으로 기록):
 * - `--af-border`(#ddd9cf / #34322d)는 장식용 구분선이라 1.4.11 3:1 미달이다.
 *   폼 컨트롤 테두리는 `--af-input`(= `--af-border-strong`, 같은 토큰의 별칭) 을 쓴다.
 * - 도넛 signal 조각(라이트 #f0a008)은 카드 위 2.05:1 이지만, 색만으로 정보를
 *   전달하지 않으므로(범례에 텍스트 라벨 존재) 1.4.1 은 충족한다.
 */
export const AF_COLORS = {
  /* ── 면(面) ─────────────────────────────────────────── */
  background: { light: "#f1efea", dark: "#161513" },
  card: { light: "#faf9f6", dark: "#1f1e1b" },
  elevated: { light: "#fdfcf9", dark: "#262523" },
  spotlight: { light: "#2c2a26", dark: "#2f2d29" },

  /* ── 잉크(글자·주 액션) ─────────────────────────────── */
  foreground: { light: "#1e1d1a", dark: "#f1efea" },
  primary: { light: "#1e1d1a", dark: "#f1efea" },
  primaryForeground: { light: "#f1efea", dark: "#161513" },
  primaryHover: { light: "#3b3934", dark: "#d9d6cf" },
  primaryActive: { light: "#121110", dark: "#c2beb6" },
  primaryBg: { light: "#e9e6df", dark: "#292825" },

  /* ── 채움·테두리 ────────────────────────────────────── */
  secondary: { light: "#e9e6df", dark: "#292825" },
  muted: { light: "#e9e6df", dark: "#292825" },
  accent: { light: "#e9e6df", dark: "#292825" },
  border: { light: "#ddd9cf", dark: "#34322d" },
  /** 폼 컨트롤 테두리 — WCAG 1.4.11 3:1 (장식용 구분선은 --af-border) */
  borderStrong: { light: "#807b71", dark: "#7d786f" },
  borderSecondary: { light: "#ddd9cf", dark: "#34322d" },
  borderDisabled: { light: "#e4e1d8", dark: "#2a2925" },
  /** 포커스 링 — UI 3:1 (antd 6 Button 포커스 링도 이 값을 colorPrimaryBorder 로 물려받는다) */
  ring: { light: "#807b71", dark: "#7d786f" },

  /* ── 텍스트 단계 (3·4단계 본문 4.5:1 이상) ───────────── */
  mutedForeground: { light: "#66635d", dark: "#a19c92" },
  textTertiary: { light: "#6b675e", dark: "#969186" },
  textQuaternary: { light: "#6b675e", dark: "#969186" },
  textPlaceholder: { light: "#6b675e", dark: "#969186" },
  textDisabled: { light: "#8a857b", dark: "#6f6b63" },
  textHeading: { light: "#1e1d1a", dark: "#f1efea" },
  textLabel: { light: "#66635d", dark: "#a19c92" },
  textDescription: { light: "#66635d", dark: "#a19c92" },
  textLightSolid: { light: "#faf9f6", dark: "#161513" },

  /* ── 채움(fills) ────────────────────────────────────── */
  fill: { light: "rgba(30, 29, 26, 0.15)", dark: "rgba(241, 239, 234, 0.15)" },
  fillSecondary: { light: "#e9e6df", dark: "#292825" },
  fillTertiary: { light: "#e9e6df", dark: "#292825" },
  fillQuaternary: { light: "rgba(30, 29, 26, 0.02)", dark: "rgba(241, 239, 234, 0.02)" },
  fillAlter: { light: "#f2f0eb", dark: "#242320" },
  fillContent: { light: "rgba(30, 29, 26, 0.06)", dark: "rgba(241, 239, 234, 0.06)" },
  fillContentHover: { light: "rgba(30, 29, 26, 0.1)", dark: "rgba(241, 239, 234, 0.1)" },
  bgTextHover: { light: "#efede8", dark: "#292825" },
  bgTextActive: { light: "#e9e6df", dark: "#33312c" },
  bgContainerDisabled: { light: "#f2f0eb", dark: "#242320" },

  /* ── 신호색 · 브랜드 강조 1색 ────────────────────────── */
  signal: { light: "#f0a008", dark: "#f5b325" },
  signalForeground: { light: "#1e1d1a", dark: "#161513" },
  grove: { light: "#487241", dark: "#8abf84" },
  groveForeground: { light: "#faf9f6", dark: "#161513" },
  slate: { light: "#3f5e96", dark: "#7c9bda" },
  slateSoft: { light: "#d8e3f6", dark: "#242e48" },
  destructive: { light: "#d4000f", dark: "#ff6568" },

  /* ── 상태색 파생 (배경·테두리·텍스트) ───────────────── */
  successBg: { light: "#e2ece0", dark: "#22301f" },
  successBorder: { light: "#b9d0b4", dark: "#3f5a3a" },
  successText: { light: "#2f5230", dark: "#8abf84" },
  successHover: { light: "#3f6a38", dark: "#9cc796" },
  successActive: { light: "#35592f", dark: "#b0d3ab" },
  warningBg: { light: "#f6e6c2", dark: "#3b2f12" },
  warningBorder: { light: "#e0c48f", dark: "#6b5320" },
  warningText: { light: "#5c3f00", dark: "#f5b325" },
  warningHover: { light: "#d69a06", dark: "#ffc043" },
  warningActive: { light: "#b88304", dark: "#ffd06a" },
  errorBg: { light: "#fbe3e4", dark: "#3a1d1e" },
  errorBorder: { light: "#eeb4b6", dark: "#6b3234" },
  errorText: { light: "#d4000f", dark: "#ff6568" },
  errorHover: { light: "#b8000b", dark: "#ff8385" },
  errorActive: { light: "#9c0009", dark: "#ffa0a2" },
  infoBg: { light: "#d8e3f6", dark: "#242e48" },
  infoBorder: { light: "#adc2e0", dark: "#3f4f70" },
  infoText: { light: "#3f5e96", dark: "#7c9bda" },
  infoHover: { light: "#355285", dark: "#93aee4" },
  infoActive: { light: "#2c466f", dark: "#a9c0ea" },
  linkHover: { light: "#355285", dark: "#93aee4" },
  linkActive: { light: "#2c466f", dark: "#a9c0ea" },

  /* ── 뱃지 파생 (높낮이+굵기+배경색만 — 한국어 라벨이라 자간/대문자 금지) ── */
  badgeSignalBg: { light: "#f6e6c2", dark: "#3b2f12" },
  badgeSignalFg: { light: "#5c3f00", dark: "#f5b325" },
  badgeGroveBg: { light: "#e2ece0", dark: "#22301f" },
  badgeGroveFg: { light: "#2f5230", dark: "#8abf84" },

  /* ── 차트 ───────────────────────────────────────────── */
  neutral: { light: "#4f4d48", dark: "#c6c4be" },
  chart1: { light: "#ddd9cf", dark: "#34322d" },
  chart2: { light: "#aba69c", dark: "#66625a" },
  chart3: { light: "#66635d", dark: "#a19c92" },
  chart4: { light: "#4f4d48", dark: "#c6c4be" },
  chart5: { light: "#1e1d1a", dark: "#f1efea" },

  /* ── 그림자 ─────────────────────────────────────────── */
  boxShadow: { light: "0 1px 2px rgba(30, 29, 26, 0.06)", dark: "0 1px 2px rgba(0, 0, 0, 0.45)" },
  boxShadowSecondary: {
    light: "0 4px 16px rgba(30, 29, 26, 0.08)",
    dark: "0 4px 16px rgba(0, 0, 0, 0.55)",
  },
  boxShadowTertiary: {
    light: "0 8px 24px rgba(30, 29, 26, 0.1)",
    dark: "0 8px 24px rgba(0, 0, 0, 0.6)",
  },
} satisfies Record<string, ModeColors>;

export type AfColorKey = keyof typeof AF_COLORS;

function colorOf(key: AfColorKey, mode: ResolvedTheme): string {
  return (AF_COLORS[key] as ModeColors)[mode];
}

/** 차트 램프 5단계 — 모드별 배열. */
export const AF_CHART_COLORS: Record<ResolvedTheme, readonly string[]> = {
  light: [colorOf("chart1", "light"), colorOf("chart2", "light"), colorOf("chart3", "light"), colorOf("chart4", "light"), colorOf("chart5", "light")],
  dark: [colorOf("chart1", "dark"), colorOf("chart2", "dark"), colorOf("chart3", "dark"), colorOf("chart4", "dark"), colorOf("chart5", "dark")],
};

/**
 * `--af-*` CSS 변수 ↔ 토큰 키 매핑.
 * app.css 는 hex 를 갖지 않고 이 변수만 참조한다(§28.4 — 원시값 보유처는 이 모듈).
 */
export const AF_CSS_VAR_MAP = {
  "--af-bg": "background",
  "--af-card": "card",
  "--af-elevated": "elevated",
  "--af-foreground": "foreground",
  "--af-primary": "primary",
  "--af-primary-foreground": "primaryForeground",
  "--af-primary-hover": "primaryHover",
  "--af-primary-active": "primaryActive",
  "--af-secondary": "secondary",
  "--af-muted": "muted",
  "--af-accent": "accent",
  "--af-muted-foreground": "mutedForeground",
  "--af-text-tertiary": "textTertiary",
  "--af-border": "border",
  "--af-border-strong": "borderStrong",
  "--af-input": "borderStrong",
  "--af-ring": "ring",
  "--af-signal": "signal",
  "--af-signal-foreground": "signalForeground",
  "--af-grove": "grove",
  "--af-grove-foreground": "groveForeground",
  "--af-slate": "slate",
  "--af-slate-soft": "slateSoft",
  "--af-destructive": "destructive",
  "--af-neutral": "neutral",
  "--af-chart-1": "chart1",
  "--af-chart-2": "chart2",
  "--af-chart-3": "chart3",
  "--af-chart-4": "chart4",
  "--af-chart-5": "chart5",
  "--af-badge-signal-bg": "badgeSignalBg",
  "--af-badge-signal-fg": "badgeSignalFg",
  "--af-badge-grove-bg": "badgeGroveBg",
  "--af-badge-grove-fg": "badgeGroveFg",
} as const satisfies Record<string, AfColorKey>;

/** 모드에 맞는 CSS 변수 값 묶음. */
export function afCssVars(mode: ResolvedTheme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [cssVar, key] of Object.entries(AF_CSS_VAR_MAP)) {
    out[cssVar] = colorOf(key, mode);
  }
  // 폰트 스택은 모드와 무관하다 — 값의 보유처는 이 모듈이다(§28.2, D5).
  // sans: 본문 전체 · mono: 숫자·코드 전용
  out["--af-font-sans"] = FONT_FAMILY;
  out["--af-font-mono"] = MONO_FAMILY;
  return out;
}

/**
 * `--af-*` 변수를 documentElement 에 주입한다.
 * 토글/시스템 변경 시 themeStore 가 이 함수를 호출한다 — 값이 바뀌면 여기만 고치면 된다.
 * (app.css 에 hex 를 복사하지 않는 이유: 원시값 보유처가 둘이 되면 §28.4 가 무너진다.)
 */
export function applyAfCssVars(mode: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [name, value] of Object.entries(afCssVars(mode))) {
    root.style.setProperty(name, value);
  }
}

/**
 * antd 6 테마 생성기.
 * `darkAlgorithm` 에 의존하지 않는다 — 다크용 토큰을 전부 명시해 알고리즘이
 * 의도치 않은 파생색(라이트 계열 fill·elevated 등)을 만들지 않게 한다.
 */
export function createAfTheme(mode: ResolvedTheme): ThemeConfig {
  const c = (key: AfColorKey): string => colorOf(key, mode);

  return {
    token: {
      /* 타이포·모서리 (§28.2, D6 — 컨테이너 1200px 는 유지) */
      fontFamily: FONT_FAMILY,
      fontFamilyCode: MONO_FAMILY,
      borderRadius: 8,
      borderRadiusLG: 10,
      borderRadiusSM: 6,

      /* 시드 — 알고리즘이 파생할 수 있는 기준값 */
      colorBgBase: c("card"),
      colorTextBase: c("foreground"),
      colorPrimary: c("primary"),
      colorInfo: c("slate"),
      colorLink: c("slate"),
      colorSuccess: c("grove"),
      colorWarning: c("signal"),
      colorError: c("destructive"),

      /* 면 */
      colorBgLayout: c("background"),
      colorBgContainer: c("card"),
      colorBgElevated: c("elevated"),
      colorBgSpotlight: c("spotlight"),
      colorBgTextHover: c("bgTextHover"),
      colorBgTextActive: c("bgTextActive"),
      colorBgContainerDisabled: c("bgContainerDisabled"),

      /* 글자 */
      colorText: c("foreground"),
      colorTextSecondary: c("mutedForeground"),
      colorTextTertiary: c("textTertiary"),
      colorTextQuaternary: c("textQuaternary"),
      colorTextPlaceholder: c("textPlaceholder"),
      colorTextDisabled: c("textDisabled"),
      colorTextHeading: c("textHeading"),
      colorTextLabel: c("textLabel"),
      colorTextDescription: c("textDescription"),
      colorTextLightSolid: c("textLightSolid"),

      /* 채움 */
      colorFill: c("fill"),
      colorFillSecondary: c("fillSecondary"),
      colorFillTertiary: c("fillTertiary"),
      colorFillQuaternary: c("fillQuaternary"),
      colorFillAlter: c("fillAlter"),
      colorFillContent: c("fillContent"),
      colorFillContentHover: c("fillContentHover"),

      /* 테두리 */
      colorBorder: c("borderStrong"),
      colorBorderSecondary: c("borderSecondary"),
      colorBorderDisabled: c("borderDisabled"),
      colorSplit: c("border"),

      /* 아이콘·컨트롤 상태 */
      colorIcon: c("textTertiary"),
      colorIconHover: c("mutedForeground"),
      controlOutline: c("ring"),
      controlTmpOutline: c("ring"),
      controlItemBgHover: c("bgTextHover"),
      controlItemBgActive: c("bgTextActive"),
      controlItemBgActiveHover: c("borderSecondary"),
      controlItemBgActiveDisabled: c("bgTextHover"),

      /* 주 액션(잉크) */
      colorPrimaryHover: c("primaryHover"),
      colorPrimaryActive: c("primaryActive"),
      colorPrimaryBg: c("primaryBg"),
      colorPrimaryBgHover: c("bgTextHover"),
      // antd 6 Button 의 포커스 링은 controlOutline 이 아니라 colorPrimaryBorder 를 쓴다
      // (antd/es/style/index.js `genFocusOutline`). 색 값은 ring 과 동일하게 맞춘다 —
      // 3:1 미달이면 Button 포커스 링이 §28.5 를 위반한다.
      colorPrimaryBorder: c("ring"),
      colorPrimaryBorderHover: c("ring"),
      colorPrimaryText: c("foreground"),
      colorPrimaryTextHover: c("foreground"),
      colorPrimaryTextActive: c("foreground"),

      /* 성공(grove) */
      colorSuccessHover: c("successHover"),
      colorSuccessActive: c("successActive"),
      colorSuccessBg: c("successBg"),
      colorSuccessBgHover: c("successBg"),
      colorSuccessBorder: c("successBorder"),
      colorSuccessBorderHover: c("successBorder"),
      colorSuccessText: c("successText"),
      colorSuccessTextHover: c("successText"),
      colorSuccessTextActive: c("successText"),

      /* 경고(signal) */
      colorWarningHover: c("warningHover"),
      colorWarningActive: c("warningActive"),
      colorWarningBg: c("warningBg"),
      colorWarningBgHover: c("warningBg"),
      colorWarningBorder: c("warningBorder"),
      colorWarningBorderHover: c("warningBorder"),
      colorWarningText: c("warningText"),
      colorWarningTextHover: c("warningText"),
      colorWarningTextActive: c("warningText"),

      /* 위험(destructive) */
      colorErrorHover: c("errorHover"),
      colorErrorActive: c("errorActive"),
      colorErrorBg: c("errorBg"),
      colorErrorBgHover: c("errorBg"),
      colorErrorBgFilledHover: c("errorBg"),
      colorErrorBgActive: c("errorBg"),
      colorErrorBorder: c("errorBorder"),
      colorErrorBorderHover: c("errorBorder"),
      colorErrorText: c("errorText"),
      colorErrorTextHover: c("errorText"),
      colorErrorTextActive: c("errorText"),

      /* 정보(slate) */
      colorInfoHover: c("infoHover"),
      colorInfoActive: c("infoActive"),
      colorInfoBg: c("infoBg"),
      colorInfoBgHover: c("infoBg"),
      colorInfoBorder: c("infoBorder"),
      colorInfoBorderHover: c("infoBorder"),
      colorInfoText: c("infoText"),
      colorInfoTextHover: c("infoText"),
      colorInfoTextActive: c("infoText"),

      /* 링크 */
      colorLinkHover: c("linkHover"),
      colorLinkActive: c("linkActive"),

      /* 그림자 */
      boxShadow: c("boxShadow"),
      boxShadowSecondary: c("boxShadowSecondary"),
      boxShadowTertiary: c("boxShadowTertiary"),
    },
  };
}
