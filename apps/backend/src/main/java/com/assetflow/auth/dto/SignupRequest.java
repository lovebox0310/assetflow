package com.assetflow.auth.dto;

/**
 * 회원가입 요청 (Sprint 1.1 임시 엔드포인트, 프로덕션 미사용)
 * - 정식 회원가입 플로우는 이메일 인증 등이 필요하지만, 현재는 빠른 테스트를 위해 추가.
 */
public class SignupRequest {
    private String email;
    private String password;
    private String displayName;

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }
}
