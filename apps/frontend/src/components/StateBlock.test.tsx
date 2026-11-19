import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StateBlock } from "./StateBlock";

/**
 * 이슈 #36 — 오류 상태의 정직성.
 *
 * - AS-01: 좁은 화면(≤430)에서 재시도를 문구 아래 별도 행으로 내린다.
 *   jsdom 은 @media 를 적용하지 않으므로, 여기서는 **CSS 가 전제하는 구조**를
 *   고정한다: 알림 루트의 `af-alert` 훅 + 액션이 문구 section **밖**에 있어야
 *   `display:contents` 그리드로 3행 배치가 가능하다. 실제 픽셀은 e2e
 *   (e2e/error-state.spec.ts)가 320/375/390 에서 잰다.
 * - AS-03: 재시도가 `size="small"` 이면 전역 히트 확장 규칙에서 제외돼 28 로
 *   남는다. 단위 테스트는 그 회귀(다시 small 로 내려가는 것)를 막는다.
 */
describe("StateBlock 오류 상태 (#36)", () => {
  afterEach(() => {
    cleanup();
  });

  it("오류 문구와 설명을 role=alert + aria-live=assertive 로 보여 준다", () => {
    render(
      <StateBlock status="error" errorText="서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.">
        <div>내용</div>
      </StateBlock>,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("데이터를 불러오지 못했습니다");
    expect(alert.textContent).toContain("서버 오류가 발생했습니다");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    // 오류일 때 내용은 렌더하지 않는다 — 낡은/빈 목록을 정상처럼 보이지 않게.
    expect(screen.queryByText("내용")).toBeNull();
  });

  it("액션은 문구 section 밖에 있다 — 좁은 화면에서 별도 행으로 내릴 수 있는 구조 (AS-01)", () => {
    render(
      <StateBlock status="error" onRetry={() => {}} errorText="설명">
        <div>내용</div>
      </StateBlock>,
    );

    const alert = screen.getByRole("alert");
    // CSS(app.css `@media (max-width: 430px) .af-alert...`)가 거는 훅
    expect(alert.classList.contains("af-alert")).toBe(true);
    expect(alert.classList.contains("ant-alert-with-description")).toBe(true);

    const section = alert.querySelector(".ant-alert-section");
    const actions = alert.querySelector(".ant-alert-actions");
    expect(section).not.toBeNull();
    expect(actions).not.toBeNull();
    // 액션이 문구 열 안에 있으면 그리드로 행을 분리할 수 없다.
    expect(section?.contains(actions as Node)).toBe(false);
    expect(actions?.parentElement).toBe(alert);
    // 설명도 문구 section 안에 남아 있어야 표/스크린리더 순서가 유지된다.
    expect(section?.querySelector(".ant-alert-description")?.textContent).toBe("설명");
  });

  it("재시도는 small 이 아니고 af-retry-btn(44) 이며 onRetry 를 부른다 (AS-03)", () => {
    const onRetry = vi.fn();
    render(
      <StateBlock status="error" onRetry={onRetry}>
        <div>내용</div>
      </StateBlock>,
    );

    const button = screen.getByRole("button", { name: "재시도" });
    // ant-btn-sm 은 히트 확장 규칙(`.ant-btn:not(.ant-btn-sm)`)에서 제외된다.
    expect(button.className).not.toMatch(/(^|\s)ant-btn-sm(\s|$)/);
    expect(button.className).toContain("af-retry-btn");

    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("onRetry 가 없으면 재시도를 렌더하지 않는다", () => {
    render(
      <StateBlock status="error" errorText="설명">
        <div>내용</div>
      </StateBlock>,
    );
    expect(screen.queryByRole("button", { name: "재시도" })).toBeNull();
    expect(screen.getByRole("alert").querySelector(".ant-alert-actions")).toBeNull();
  });
});
