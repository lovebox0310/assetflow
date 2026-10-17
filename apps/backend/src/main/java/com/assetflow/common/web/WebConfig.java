package com.assetflow.common.web;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 인터셉터 등록: /api/v1/auth/** 는 로그인 자체라 제외하고, 나머지 보호 API 에 Bearer 검사.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new BearerTokenInterceptor())
                .addPathPatterns("/api/v1/me", "/api/v1/dashboard/**")
                .excludePathPatterns("/api/v1/auth/**");
    }
}
