package com.assetflow.common.web;

import com.assetflow.common.api.AuthRequiredException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * §25 접근 제어: Authorization: Bearer <토큰> 이 없면 401(표준 오류 포맷)로 막는다.
 * 실제 JWT 검증은 Issue 7(FE-BE 연동)에서 백엔드 유효 토큰 발급이 붙을 때 대체한다.
 * 그 전까지는 "Bearer 뒤에 토큰이 존재하는가"만 검사한다 — 모크 토큰도 통과한다.
 */
public class BearerTokenInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ") || header.substring(7).isBlank()) {
            throw new AuthRequiredException("Missing or malformed Authorization header");
        }
        return true;
    }
}
