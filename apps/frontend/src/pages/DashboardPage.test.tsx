import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DashboardPage } from "./DashboardPage";
import { clearToken, isAuthenticated, saveToken } from "../auth/authStore";

describe("DashboardPage 레이아웃 (Issue 3)", () => {
  afterEach(cleanup);

  beforeEach(() => {
    clearToken();
    saveToken("tok", Date.now() + 60_000);
  });

  const renderPage = () => render(<DashboardPage onLogout={() => {}} />);

  it("핵심 카드 4종을 첫 화면에 배치한다 (§22 설계 기준)", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "핵심 지표" })).toBeDefined();
    // "자산 구성비"는 카드 제목과 하위 섹션 제목에 모두 나오므로 존재 자체를 검사한다.
    for (const title of ["순자산", "월 수지", "비상금 유지 개월", "자산 구성비"]) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
  });

  it("영역 순서가 정보구조와 일치한다 (지표→구성비→현금→현금흐름)", () => {
    renderPage();
    const content = (document.querySelector(".af-container") as HTMLElement).textContent ?? "";
    const order = ["핵심 지표", "자산 구성비", "현금 3계좌", "월별 현금흐름"];
    const positions = order.map((name) => content.indexOf(name));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("헤더의 로그아웃은 토큰을 지우고 onLogout 을 부른다 (§21 승계)", () => {
    const onLogout = vi.fn();
    render(<DashboardPage onLogout={onLogout} />);
    fireEvent.click(screen.getByRole("button", { name: /로그아웃/ }));
    expect(isAuthenticated()).toBe(false);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("핵심 카드는 §35.2 분할(span 24/12/6)을 antd Col 계약대로 입힌다", () => {
    renderPage();
    // Col 은 모든 breakpoint 클래스를 렌더하고 실제 분할은 CSS 미디어쿼리가 한다.
    // 화면 크기 시뮬레이션 없이 분할 계약 자체를 검증할 수 있다.
    const cols = document.querySelectorAll(".ant-col-xs-24.ant-col-md-12.ant-col-lg-6");
    expect(cols.length).toBe(4);
  });

  it("상태 미리보기로 빈 데이터/오류 상태를 구분해 보여 준다 (§22 AC)", () => {
    renderPage();
    // 기본 ready: 카드 플레이스홀더 문구
    expect(screen.getAllByText(/Issue 4/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("empty"));
    expect(screen.getAllByText("데이터가 없습니다").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("error"));
    expect(screen.getAllByText("데이터를 불러오지 못했습니다").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /재시도/ }).length).toBeGreaterThan(0);

    const [firstRetry] = screen.getAllByRole("button", { name: /재시도/ });
    if (!firstRetry) throw new Error("재시도 버튼 없음");
    fireEvent.click(firstRetry);
    expect(screen.getAllByText(/Issue 4/).length).toBeGreaterThan(0);
  });
});
