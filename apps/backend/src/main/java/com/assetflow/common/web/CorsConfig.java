package com.assetflow.common.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 배포 환경 CORS (§12 배포 순서 4단계). dev 는 vite 프록시로 CORS 가 없지만,
 * 배포에서는 프론트가 백엔드 API 를 다른 출처에서 부른다.
 * ALLOWED_ORIGIN 환경변수(쉼표 구분)가 있을 때만 허용한다 — 미설정이면
 * 동일 출처만 허용하는 기본값을 유지한다.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Value("${app.allowed-origins:}")
    private String allowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (allowedOrigins.isBlank()) {
            return; // 미설정: 동일 출처만 (안전 기본값)
        }
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins.split(","))
                .allowedMethods("GET", "POST", "PUT", "DELETE", "PATCH");
    }
}
