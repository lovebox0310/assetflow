package com.assetflow.common.web;

import com.assetflow.auth.TokenService;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** 인터셉터 등록: /api/v1/auth/** 는 로그인 자체라 제외하고, 나머지 보호 API 에 JWT 검사. */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final TokenService tokenService;

    public WebConfig(TokenService tokenService) {
        this.tokenService = tokenService;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new BearerTokenInterceptor(tokenService))
                .addPathPatterns("/api/v1/me", "/api/v1/dashboard/**", "/api/v1/assets/**", "/api/v1/expenses/**", "/api/v1/settings/**", "/api/v1/investments/**", "/api/v1/auth/password")
                .excludePathPatterns("/api/v1/auth/login");
    }
}
