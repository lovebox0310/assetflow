import type { LoginInput } from "../types/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;

export interface FieldErrors {
  email?: string;
  password?: string;
}

/**
 * Issue 2 (§21) 입력값 검증: 이메일 형식과 비밀번호 최소 길이.
 * 필드별 메시지를 돌려줘 화면에 바로 띄운다. API 실패의 공통 메시지와 달리
 * 이건 사용자 입력 오류이므로 무엇을 고칠지 알려 주는 게 맞다.
 * 이슈 #74: 사용자 대면 문구이므로 한국어로 쓴다(프로토타입 login.html 과 동일 카피).
 */
export function validateLoginInput(input: LoginInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!EMAIL_RE.test(input.email.trim())) {
    errors.email = "이메일 형식이 올바르지 않습니다.";
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`;
  }
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return errors.email !== undefined || errors.password !== undefined;
}
