import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LoginPage } from "./LoginPage";
import { clearToken, isAuthenticated } from "../auth/authStore";

// API 계층을 모듈 채로 mock 한다. vi.spyOn 은 ESM namespace 에서
// 설정 가능 여부가 런타임마다 달라지므로 문서화된 vi.mock 경로를 쓴다.
const { loginMock } = vi.hoisted(() => ({ loginMock: vi.fn() }));
vi.mock("../api/authApi", () => ({ loginWithEmail: loginMock }));

describe("LoginPage", () => {
  // vitest globals 를 켜지 않았으므로 정리를 직접 한다. 두 번 렌더하면
  // 화면이 두 개라 "버튼이 두 개" 라며 쿼리가 실패한다.
  afterEach(cleanup);

  beforeEach(() => {
    clearToken();
    loginMock.mockReset();
  });

  const fill = (email: string, password: string) => {
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: email } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: password } });
  };

  const submit = () => {
    const form = screen.getByRole("button", { name: "로그인" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);
  };

  it("이메일·비밀번호 칸과 로그인 버튼을 보여 준다", () => {
    render(<LoginPage onSuccess={() => {}} />);
    expect(screen.getByLabelText("이메일")).toBeDefined();
    expect(screen.getByLabelText("비밀번호")).toBeDefined();
    expect(screen.getByRole("button", { name: "로그인" })).toBeDefined();
    expect(isAuthenticated()).toBe(false);
  });

  // 이슈 #74 AC: 로그인 화면에 영문 사용자 대면 문구가 남아 있지 않다.
  it("사용자 대면 문구가 전부 한국어다 (#74)", () => {
    render(<LoginPage onSuccess={() => {}} />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/Sign in|Email|Password|Login/i);
    expect(text).toContain("로그인");
    expect(text).toContain("이메일");
    expect(text).toContain("비밀번호");
  });

  // 빈 값으로 보내는 경로는 브라우저 검증이 막기 전에 화면이 막아 줘야 한다.
  // fireEvent.submit 은 브라우저 검증을 건너뛰고 onSubmit 을 직접 부른다.
  it("자격 증명이 비면 API를 부르지 않고 오류를 보여 준다", async () => {
    const onSuccess = vi.fn();
    render(<LoginPage onSuccess={onSuccess} />);
    submit();

    // 빈 값이면 두 칸 모두 오류가 나선다. findByRole 은 복수 매치 시 실패하므로 findAll 을 쓴다.
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThanOrEqual(1);
    expect(loginMock).not.toHaveBeenCalled();
    expect(isAuthenticated()).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("이메일 형식이 틀리면 필드 메시지를 보여 준다 (§21 입력값 검증)", async () => {
    const onSuccess = vi.fn();
    render(<LoginPage onSuccess={onSuccess} />);
    fill("not-an-email", "password1");
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("이메일 형식이 올바르지 않습니다.");
    expect(loginMock).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("비밀번호가 8자 미만이면 필드 메시지를 보여 준다 (§21 입력값 검증)", async () => {
    const onSuccess = vi.fn();
    render(<LoginPage onSuccess={onSuccess} />);
    fill("a@b.com", "short");
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("비밀번호는 8자 이상이어야 합니다.");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  // 이슈 #74 AC: 오류 메시지가 필드별로 구분되고 aria-describedby 로 연결된다.
  it("이메일 오류는 입력의 aria-describedby 로 연결된다 (#74)", async () => {
    render(<LoginPage onSuccess={() => {}} />);
    fill("not-an-email", "password1");
    submit();

    const input = screen.getByLabelText("이메일") as HTMLInputElement;
    await screen.findByRole("alert");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("login-email-help login-email-error");
    expect(document.getElementById("login-email-error")?.textContent).toBe(
      "이메일 형식이 올바르지 않습니다.",
    );
    // 비밀번호 칸은 오류가 없으므로 invalid 표시가 남지 않아야 한다.
    expect(screen.getByLabelText("비밀번호").getAttribute("aria-invalid")).toBeNull();
  });

  it("비밀번호 오류도 자기 입력에만 연결된다 (#74)", async () => {
    render(<LoginPage onSuccess={() => {}} />);
    fill("a@b.com", "short");
    submit();

    const input = screen.getByLabelText("비밀번호") as HTMLInputElement;
    await screen.findByRole("alert");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(
      "login-password-help login-password-error",
    );
    expect(screen.getByLabelText("이메일").getAttribute("aria-invalid")).toBeNull();
  });

  it("로그인 실패는 공통 오류 메시지를 보여 준다 (§21 실패 처리)", async () => {
    loginMock.mockRejectedValueOnce(new Error("Invalid credentials"));
    render(<LoginPage onSuccess={() => {}} />);
    fill("a@b.com", "password1");
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "이메일 또는 비밀번호를 확인해 주세요. 입력하신 정보가 맞지 않습니다.",
    );
    expect(isAuthenticated()).toBe(false);
  });

  it("정상 입력이면 토큰을 저장하고 onSuccess 를 부른다", async () => {
    loginMock.mockResolvedValueOnce({ token: "tok", expiresAt: Date.now() + 60_000 });
    const onSuccess = vi.fn();
    render(<LoginPage onSuccess={onSuccess} />);
    fill("a@b.com", "password1");
    submit();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(isAuthenticated()).toBe(true);
  });

  // S-08 후속(#38-2): 전역 오류는 제출 버튼 **뒤**(카드 안)에 있고, 슬롯 높이를 예약해
  // 카드 높이가 변하지 않는다. jsdom 에는 레이아웃이 없으므로 구조로 고정하고,
  // 실제 y·높이 불변은 e2e(login-error-layout.spec.ts)에서 측정한다.
  it("전역 오류 슬롯은 버튼 뒤에서 높이를 예약한다 (S-08)", async () => {
    render(<LoginPage onSuccess={() => {}} />);
    const form = screen.getByRole("button", { name: "로그인" }).closest("form") as HTMLFormElement;
    const submitButton = screen.getByRole("button", { name: "로그인" });

    // 오류가 버튼 위에 있으면 버튼이 밀린다 — 슬롯은 제출 버튼 바로 다음(폼의 마지막 자식).
    const slot = form.lastElementChild as HTMLElement;
    expect(slot).not.toBe(submitButton);
    expect(slot.previousElementSibling).toBe(submitButton);
    // 카드 밖으로 빼지 않는다(absolute 금지) — 흐름 안에서 높이만 예약한다.
    expect(slot.style.position).toBe("");
    // 41px = 오류 문구 2줄 × 줄 높이 20.4286px(실측)의 올림.
    expect(slot.style.minHeight).toBe("41px");
    // 폼 grid gap(16px) 중 8px 만 상쇄 → 버튼과 문구 사이 8px, 슬롯 총 점유 49px.
    expect(slot.style.marginTop).toBe("-8px");
    expect(slot.querySelector(".form-error")).toBeNull();

    loginMock.mockRejectedValueOnce(new Error("Invalid credentials"));
    fill("a@b.com", "password1");
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert.className).toBe("form-error");
    // 오류가 떠도 같은 슬롯이 감싼다 — 카드 높이가 바뀌지 않는다.
    expect(alert.parentElement).toBe(slot);
    expect(slot.style.minHeight).toBe("41px");
  });

  it("로그인 실패 알림은 role=alert 로 남는다 (§21 유지)", async () => {
    loginMock.mockRejectedValueOnce(new Error("Invalid credentials"));
    render(<LoginPage onSuccess={() => {}} />);
    fill("a@b.com", "password1");
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toBe(
      "이메일 또는 비밀번호를 확인해 주세요. 입력하신 정보가 맞지 않습니다.",
    );
  });
});
