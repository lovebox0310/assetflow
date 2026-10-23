import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DashboardPage } from "../pages/DashboardPage";
import { AssetsPage } from "../pages/AssetsPage";
import { ExpensesPage } from "../pages/ExpensesPage";
import { SettingsPage } from "../pages/SettingsPage";
import { clearInflight } from "../api/client";
import { clearToken, saveToken } from "../auth/authStore";
import { AF_COLORS } from "../theme/tokens";

/**
 * #70 AC: 접근성 AA 정합성 (§28.5).
 *
 * - 제목 체계: 각 앱 화면 h1 정확히 1개, 섹션은 h2 (H4 강등)
 * - 현재 페이지 내비: disabled 대신 aria-current="page", 대비 4.5:1 이상
 * - 키보드: 정기 칩·행 액션은 실제 button, 접근 이름에 항목명 결합
 * - 알림: role + aria-live 로 읽힌다 / 표: 접근 가능한 이름
 * - 스킵 링크: 첫 링크로 #main 본문에 닿는다
 *
 * 대비는 토큰(hex)에서 직접 WCAG 공식으로 계산한다 — jsdom 은 렌더 색을
 * 계산하지 못하고, 계산 결과를 테스트로 고정해 두어야 회귀를 막는다.
 */

type Handler = (path: string, init?: RequestInit) => Response | Promise<Response>;

function stubFetch(handler: Handler) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function apiResponse(data: unknown, ok = true, status = 200): Response {
  const body = ok
    ? { code: "OK", message: "loaded", data }
    : { code: "INVALID_REQUEST", message: "요청을 처리하지 못했습니다", details: "", timestamp: "" };
  return { ok, status, json: async () => body } as Response;
}

/** 표(표 이름 AC)가 렌더되려면 데스크톱 뷰가 필요하다 — jsdom 기본(모바일)은 목록 카드로 대체된다. */
function setViewport(desktop: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: desktop,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }),
  });
}

/** 네 화면 공통 목업 — 구조(제목·내비·표·알림) 검증이 목적이라 값은 최소로 준다. */
function stubCommon() {
  return stubFetch((path, init) => {
    if (path.includes("/expenses/items") && init?.method === "POST") return apiResponse({}, false, 500);
    if (path.includes("/dashboard/summary")) {
      return apiResponse({ asOf: "2026-10", assets: [], liabilities: [], monthly: { income: 0, expenses: 0, essentialExpenses: 0, essentialComplete: false } });
    }
    if (path.includes("/dashboard/cashflow")) {
      return apiResponse([{ month: "2026-10", income: 8_200_000, expenses: 1_300_000 }]);
    }
    if (path.includes("/expenses/recurring")) {
      return apiResponse([
        { id: "r1", label: "월세", amount: 500_000, isEssential: true, startMonth: "2026-01", endMonth: null, purchaseVat: 0 },
      ]);
    }
    if (path.includes("/expenses/items")) {
      return apiResponse([
        { id: 1, month: "2026-10", label: "부가가치세", amount: 100_000, isEssential: true, purchaseVat: 0, recurringId: null },
      ]);
    }
    if (path.includes("/expenses/snapshots")) return apiResponse(null);
    if (path.includes("/assets/card-imports")) return apiResponse([]);
    if (path.includes("/assets/accounts")) {
      return apiResponse([
        { id: 1, accountType: "deposit", name: "통장", institutionName: "", balance: 1_000_000, isDebt: false, openedAt: null },
        { id: 2, accountType: "realty", name: "주택대출", institutionName: "", balance: 5_000_000, isDebt: true, openedAt: null },
      ]);
    }
    if (path.includes("/settings")) {
      return apiResponse({ id: 1, email: "user@example.com", displayName: "AssetFlow", targetMonths: 6 });
    }
    return apiResponse({}, false, 500);
  });
}

const renderDashboard = () =>
  render(<DashboardPage onLogout={() => {}} onOpenAssets={() => {}} onOpenExpenses={() => {}} onOpenSettings={() => {}} />);
const renderExpenses = () =>
  render(<ExpensesPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenSettings={() => {}} />);
const renderSettings = () =>
  render(<SettingsPage onOpenDashboard={() => {}} onOpenAssets={() => {}} onOpenExpenses={() => {}} />);

describe("이슈 #70 접근성 AA 정합성", () => {
  beforeEach(() => {
    clearToken();
    saveToken("tok", Date.now() + 60_000);
    setViewport(true); // 데스크톱: 표·행 액션 검증 대상
    stubCommon();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    clearInflight();
    setViewport(false); // 기본(모바일)으로 복원
  });

  /* ── 제목 체계: 각 화면 h1 정확히 1개 + 섹션 h2 ─────────────── */

  it("대시보드: h1 1개(대시보드), 섹션은 h2", async () => {
    renderDashboard();
    await screen.findByRole("heading", { level: 1, name: "대시보드" });
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "핵심 지표" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 2, name: "자산 구성비" })).toBeDefined();
  });

  it("자산: h1 1개(자산), 섹션은 h2", async () => {
    render(<AssetsPage onBack={() => {}} onOpenExpenses={() => {}} onOpenSettings={() => {}} />);
    await screen.findByRole("heading", { level: 1, name: "자산" });
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "금융자산" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 2, name: "부채" })).toBeDefined();
  });

  it("지출: h1 1개(지출), 섹션은 h2", async () => {
    renderExpenses();
    await screen.findByRole("heading", { level: 1, name: "지출" });
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "월 지출 항목" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 2, name: "정기 항목 (고정지출)" })).toBeDefined();
  });

  it("설정: h1 1개(설정), 섹션은 h2", async () => {
    renderSettings();
    await screen.findByRole("heading", { level: 1, name: "설정" });
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "프로필" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 2, name: "비상금 기준" })).toBeDefined();
  });

  /* ── 현재 페이지 내비: aria-current + 비활성 미사용 ──────────── */

  it("현재 페이지 내비는 aria-current=page 이고 disabled 가 아니다", async () => {
    renderDashboard();
    const current = await screen.findByRole("button", { name: "대시보드" });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect((current as HTMLButtonElement).disabled).toBe(false);
    expect(current.style.fontWeight).toBe("700");
    for (const name of ["자산", "지출", "설정"]) {
      const btn = screen.getByRole("button", { name });
      expect(btn.getAttribute("aria-current")).toBeNull();
      expect((btn as HTMLButtonElement).disabled).toBe(false);
    }
  });

  /* ── 대비: 토큰에서 직접 계산 (AC: 계산 결과 첨부) ───────────── */

  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const contrast = (a: string, b: string) => {
    const hi = Math.max(lum(a), lum(b));
    const lo = Math.min(lum(a), lum(b));
    return (hi + 0.05) / (lo + 0.05);
  };

  it("헤더 내비 대비 ≥ 4.5:1 — 현재 항목(잉크)과 링크(slate), 라이트/다크 모두", () => {
    // 현재 페이지: --af-foreground 를 헤더 배경(--af-card) 위에 그린다
    expect(contrast(AF_COLORS.foreground.light, AF_COLORS.card.light)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(AF_COLORS.foreground.dark, AF_COLORS.card.dark)).toBeGreaterThanOrEqual(4.5);
    // 나머지 내비: antd 링크 버튼 색(colorLink = slate)
    expect(contrast(AF_COLORS.slate.light, AF_COLORS.card.light)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(AF_COLORS.slate.dark, AF_COLORS.card.dark)).toBeGreaterThanOrEqual(4.5);
  });

  it("참고: 구 disabled 텍스트 색은 AA 미달이라 현재 표시에는 쓰지 않는다", () => {
    // 이슈 실측 3.49:1 — 미달이었기 때문에 disabled 를 없애야 했다
    expect(contrast(AF_COLORS.textDisabled.light, AF_COLORS.card.light)).toBeLessThan(4.5);
  });

  /* ── 스킵 링크 + main 랜드마크 ───────────────────────────────── */

  it("스킵 링크가 문서 첫 링크이고 #main 본문으로 간다", async () => {
    renderDashboard();
    await screen.findByRole("heading", { level: 1, name: "대시보드" });
    const firstLink = document.querySelector("a");
    expect(firstLink).not.toBeNull();
    expect(firstLink?.getAttribute("href")).toBe("#main");
    expect(firstLink?.className).toContain("af-skip-link");
    expect(firstLink?.textContent).toBe("본문으로 건너뛰기");
    const main = document.querySelector("main#main");
    expect(main).not.toBeNull();
  });

  /* ── 키보드: 정기 칩 button · 행 액션 이름 결합 ──────────────── */

  it("정기 칩은 실제 button 이고 활성화하면 편집 폼이 열리며 중첩 버튼이 없다", async () => {
    renderExpenses();
    const chip = await screen.findByRole("button", { name: "월세 정기 항목 편집" });
    expect(chip.tagName).toBe("BUTTON");
    expect(chip.getAttribute("type")).toBe("button");
    // ✕(중지) 버튼은 형제 — button 안의 button(잘못된 HTML)이 아니다
    expect(chip.querySelector("button")).toBeNull();
    // 키보드 활성화와 같은 경로(클릭)로 편집 폼이 열린다
    fireEvent.click(chip);
    expect(await screen.findByLabelText("정기 항목 이름")).toBeDefined();
  });

  it("지출 행 액션의 접근 이름에 항목명이 결합되고 편집까지 이어진다", async () => {
    renderExpenses();
    const edit = await screen.findByRole("button", { name: "부가가치세 이 달만 수정" });
    expect(edit.tagName).toBe("BUTTON");
    expect(screen.queryByRole("button", { name: "이 달만 수정" })).toBeNull(); // 중복 라벨 없음
    fireEvent.click(edit);
    const nameInput = screen.getByLabelText("항목 이름") as HTMLInputElement;
    expect(nameInput.value).toBe("부가가치세");
  });

  /* ── 알림: role + aria-live ──────────────────────────────────── */

  it("변경 알림(notice)은 role=status + aria-live=polite 로 읽힌다", async () => {
    stubCommon(); // POST /expenses/items → 500 (공통 목업 유지)
    renderExpenses();
    await screen.findByRole("heading", { level: 1, name: "지출" });

    fireEvent.change(screen.getByLabelText("항목 이름"), { target: { value: "통신비" } });
    fireEvent.change(screen.getByLabelText("월 금액"), { target: { value: "60000" } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    const notice = await screen.findByRole("status");
    expect(notice.getAttribute("aria-live")).toBe("polite");
    expect(notice.textContent?.length ?? 0).toBeGreaterThan(0);
  });

  it("오류 알림(재시도 블록)은 aria-live=assertive 로 읽힌다", async () => {
    vi.unstubAllGlobals();
    stubFetch((path) => {
      if (path.includes("/dashboard/summary")) return apiResponse({}, false, 500);
      return apiResponse([], false, 500);
    });
    renderDashboard();
    // 카드 4종이 각각 같은 오류 블록을 렌더한다 — 둘 이상이어도 모두 같은 규약이어야 한다
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) {
      expect(alert.getAttribute("aria-live")).toBe("assertive");
    }
  });

  /* ── 표: 접근 가능한 이름 ────────────────────────────────────── */

  it("지출 항목 표에 접근 가능한 이름이 있다", async () => {
    renderExpenses();
    expect(await screen.findByRole("table", { name: "월 지출 항목" })).toBeDefined();
  });

  it("설정 계정 요약 표에 접근 가능한 이름이 있다", async () => {
    renderSettings();
    expect(await screen.findByRole("table", { name: "계정 요약" })).toBeDefined();
  });

  it("자산 표(금융자산·부채)에 접근 가능한 이름이 있다", async () => {
    render(<AssetsPage onBack={() => {}} onOpenExpenses={() => {}} onOpenSettings={() => {}} />);
    expect(await screen.findByRole("table", { name: "금융자산" })).toBeDefined();
    expect(await screen.findByRole("table", { name: "부채" })).toBeDefined();
  });

  it("현금흐름 표에 접근 가능한 이름이 있다", async () => {
    renderDashboard();
    expect(await screen.findByRole("table", { name: "월별 현금흐름" })).toBeDefined();
  });
});
