package com.assetflow.auth.dto;

/**
 * 로그인 응답. expiresAt 은 서버가 보증하는 토큰 만료시(에포크 밀리초) —
 * Known Issues 3 해소: 클라이언트 로컬 TTL 대신 서버 값을 쓴다.
 */
public class LoginResponse {
    private final String token;
    private final long expiresAt;

    public LoginResponse(String token, long expiresAt) {
        this.token = token;
        this.expiresAt = expiresAt;
    }

    public String getToken() {
        return token;
    }

    public long getExpiresAt() {
        return expiresAt;
    }
}
