package com.assetflow.common.web;

import com.assetflow.auth.TokenService;
import com.assetflow.common.api.AuthRequiredException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * §25 접근 제어: Authorization: Bearer <JWT> 를 실제 검증한다 — 서명·만료(TokenService).
 * 토큰이 없거나 무효·만료면 401(표준 오류 포맷). /api/v1/auth/** 는 제외(WebConfig).
 */
public class BearerTokenInterceptor implements HandlerInterceptor {

    private final TokenService tokenService;

    public BearerTokenInterceptor(TokenService tokenService) {
        this.tokenService = tokenService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ") || header.substring(7).isBlank()) {
            throw new AuthRequiredException("Missing or malformed Authorization header");
        }
        String email = tokenService.verify(header.substring(7));
        if (email == null) {
            throw new AuthRequiredException("Invalid or expired token");
        }
        return true;
    }
}
