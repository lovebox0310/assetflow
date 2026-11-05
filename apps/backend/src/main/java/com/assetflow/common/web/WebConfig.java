package com.assetflow.common.web;

import com.assetflow.auth.TokenService;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 인터셉터 등록: /api/v1/auth/** 는 로그인 자체라 제외하고, 나머지 보호 API 에 JWT 검사.
 *
 * <p>§65: 경로를 하나씩 나열하면 컨트롤러를 추가할 때 빠뜨리기 쉽다. 실제로
 * {@code /api/v1/card-email-import-settings} 가 목록에 없어 인터셉터가 실행되지 않았고,
 * {@code AuthEmailResolver} 가 요청 속성({@code auth.email})을 찾지 못해 유효한 토큰으로도
 * 401 을 돌려줬다. 그래서 기본은 전체 보호({@code /api/v1/**})이고 공개 경로만 제외한다.</p>
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    /** 인증이 필요한 API 경로. 새 컨트롤러도 자동으로 포함된다. */
    public static final String[] PROTECTED_PATHS = {"/api/v1/**"};

    /** 인증 없이 호출해야 하는 API 경로(로그인·회원가입). */
    public static final String[] PUBLIC_PATHS = {"/api/v1/auth/login", "/api/v1/auth/signup"};

    private final TokenService tokenService;

    public WebConfig(TokenService tokenService) {
        this.tokenService = tokenService;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new BearerTokenInterceptor(tokenService))
                .addPathPatterns(PROTECTED_PATHS)
                .excludePathPatterns(PUBLIC_PATHS);
    }
}
